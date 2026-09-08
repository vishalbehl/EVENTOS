from contextlib import asynccontextmanager
import asyncio
import uuid
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from loguru import logger
from sqlalchemy.engine import make_url

from app.config import settings
from app.minio_client import ensure_bucket_exists
from app.routers import auth, cloud_sync, local_api, snapshot_api, srr, setup, operational_control, workstations, room_runtime, distribution, runtime_sync
from app.routers import admin_dashboard, admin_logs, network_discovery, admin_setup, command_center
from app.routers.node_sync import admin_router as node_admin_router, node_router
from app.routers.source_sync import admin_router as source_key_admin_router, global_admin_router as source_key_global_admin_router, router as source_sync_router
from app.websocket.connection import router as websocket_router, start_redis_listener


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.database import get_effective_db_url
    from app.config import reload_settings
    current_settings = reload_settings()
    logger.info(f"Starting Venue Server in {current_settings.ENV} mode")
    try:
        database_url = make_url(get_effective_db_url(current_settings.DATABASE_URL))
        logger.info(f"PostgreSQL URL: {database_url.set(password='***')}")
    except Exception:
        logger.info(f"PostgreSQL URL: {get_effective_db_url(current_settings.DATABASE_URL)}")
    logger.info(f"MinIO Endpoint: {current_settings.MINIO_ENDPOINT}")
    
    # MinIO is optional; production appliances default to the atomic filesystem store.
    if settings.CONTENT_STORAGE_BACKEND == "minio":
        asyncio.create_task(asyncio.to_thread(ensure_bucket_exists))
    
    # Start Redis WebSocket Listener
    redis_task = asyncio.create_task(start_redis_listener()) if settings.REDIS_URL else None
    
    # Start background sync scheduler if active event exists & seed default rules
    app.state.scheduler = None
    app.state.backup_worker = None
    app.state.delivery_worker = None
    try:
        from app.database import async_engine, AsyncSessionLocal, Base
        from sqlalchemy import select, distinct, text
        from app import models as _app_models
        from app.models.event import Event

        # Development can bootstrap an empty appliance. Staging/production
        # must use Alembic so schema drift cannot be hidden by create_all().
        async with async_engine.begin() as conn:
            if current_settings.DEPLOYMENT_PROFILE == "local":
                schemas = ["identity", "events", "agenda", "design", "presentations", "registration", "speaker", "sponsors", "venue"]
                for s in schemas:
                    await conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {s};"))
                await conn.run_sync(Base.metadata.create_all)
            else:
                revision = (await conn.execute(text("SELECT version_num FROM alembic_version ORDER BY version_num DESC LIMIT 1"))).scalar_one_or_none()
                if revision != current_settings.VENUE_REQUIRED_SCHEMA_REVISION:
                    raise RuntimeError(f"Venue database migration required: expected {current_settings.VENUE_REQUIRED_SCHEMA_REVISION}, found {revision or 'none'}")

        async with AsyncSessionLocal() as db:
            from app.routers.auth import ensure_bootstrap_admin
            await ensure_bootstrap_admin(db)

            # Initialize Scheduler if event present
            result = await db.execute(select(Event).limit(1))
            event = result.scalar_one_or_none()
            if event:
                event_id = str(event.id)
                logger.info(f"Found active local event: {event_id}. Initializing background sync scheduler.")
                from app.sync.scheduler import SyncScheduler
                scheduler = SyncScheduler(event_id=event_id)
                scheduler.start()
                app.state.scheduler = scheduler
            else:
                logger.warning("No active local event found in database on startup. Background sync scheduler will not be started.")
            from app.workers.backup_worker import run_backup_worker
            app.state.backup_worker = asyncio.create_task(run_backup_worker())
            from app.workers.delivery_worker import run_delivery_worker
            app.state.delivery_worker = asyncio.create_task(run_delivery_worker())
    except Exception as e:
        logger.error(f"Failed to check for active event, seed rules, or start scheduler on startup: {e}")
        # A staged or production appliance must never serve traffic against an
        # unknown schema or a partially initialized control plane. Local mode
        # intentionally remains permissive so an empty developer database can
        # be bootstrapped without a deployment migration.
        if current_settings.DEPLOYMENT_PROFILE != "local":
            raise
    
    yield
    
    if getattr(app.state, "scheduler", None):
        logger.info("Stopping background sync scheduler")
        app.state.scheduler.stop()
    if getattr(app.state, "backup_worker", None):
        app.state.backup_worker.cancel()
        try:
            await app.state.backup_worker
        except asyncio.CancelledError:
            pass
    if getattr(app.state, "delivery_worker", None):
        app.state.delivery_worker.cancel()
        try:
            await app.state.delivery_worker
        except asyncio.CancelledError:
            pass
        
    if redis_task:
        redis_task.cancel()
        try:
            await redis_task
        except asyncio.CancelledError:
            pass
        except Exception:
            pass

    try:
        from app.websocket.connection import manager
        await manager.close()
    except Exception as e:
        logger.warning(f"Error closing redis connection on shutdown: {e}")

    logger.info("Shutting down Venue Server")

app_fastapi = FastAPI(
    title="Venue Server API",
    description="Local Edge Node for Conference Event Execution",
    version="1.0.0",
    lifespan=lifespan
)


@app_fastapi.get("/health", tags=["system"])
async def health() -> dict[str, str]:
    """Liveness probe: the process is accepting requests."""
    return {"status": "ok"}


@app_fastapi.get("/readyz", tags=["system"])
async def readiness() -> dict[str, str]:
    """Readiness probe used by the Windows installer and service supervisor."""
    from sqlalchemy import text
    from app.database import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
            if settings.DEPLOYMENT_PROFILE != "local":
                revision = (await db.execute(text("SELECT version_num FROM alembic_version ORDER BY version_num DESC LIMIT 1"))).scalar_one_or_none()
                if revision != settings.VENUE_REQUIRED_SCHEMA_REVISION:
                    raise RuntimeError("database migration is required")
    except Exception as exc:
        logger.warning(f"Venue Server readiness check failed: {exc}")
        raise HTTPException(status_code=503, detail="database unavailable") from exc
    if settings.DEPLOYMENT_PROFILE == "local":
        return {"status": "ready"}
    workers = {
        "delivery": getattr(app_fastapi.state, "delivery_worker", None),
        "backup": getattr(app_fastapi.state, "backup_worker", None),
    }
    worker_status = {name: "running" if task and not task.done() else "failed" for name, task in workers.items()}
    if any(status != "running" for status in worker_status.values()):
        logger.warning(f"Venue Server readiness check failed: background workers are not healthy ({worker_status})")
        raise HTTPException(status_code=503, detail={"status": "degraded", "workers": worker_status})
    return {"status": "ready", "workers": worker_status}

app_fastapi.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$" if settings.DEPLOYMENT_PROFILE == "local" else None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app_fastapi.add_middleware(GZipMiddleware, minimum_size=1024)

import socketio
from app.websocket.connection import sio

app_fastapi.include_router(auth.router)
app_fastapi.include_router(cloud_sync.router)
app_fastapi.include_router(local_api.router)
app_fastapi.include_router(admin_dashboard.router)
app_fastapi.include_router(admin_logs.router)
app_fastapi.include_router(network_discovery.router)
app_fastapi.include_router(admin_setup.router)
app_fastapi.include_router(command_center.router)
app_fastapi.include_router(node_admin_router)
app_fastapi.include_router(node_router)
app_fastapi.include_router(source_sync_router)
app_fastapi.include_router(source_key_admin_router)
app_fastapi.include_router(source_key_global_admin_router)
app_fastapi.include_router(srr.router)
app_fastapi.include_router(snapshot_api.router)
app_fastapi.include_router(setup.router)
app_fastapi.include_router(operational_control.router)
app_fastapi.include_router(operational_control.agent_router)
app_fastapi.include_router(workstations.router)
app_fastapi.include_router(room_runtime.router)
app_fastapi.include_router(distribution.router)
app_fastapi.include_router(runtime_sync.router)
app_fastapi.include_router(websocket_router)

# Mount Socket.IO as ASGI app wrapping FastAPI
app = socketio.ASGIApp(socketio_server=sio, other_asgi_app=app_fastapi)
