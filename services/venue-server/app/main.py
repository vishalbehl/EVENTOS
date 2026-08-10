from contextlib import asynccontextmanager
import asyncio
import uuid
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from app.config import settings
from app.minio_client import ensure_bucket_exists
from app.routers import auth, cloud_sync, local_api, snapshot_api
from app.routers import devices, sessions, speakers, stations, admin_setup, workstations
from app.routers import admin_dashboard, admin_badges, admin_logs, network_discovery
from app.routers import registration_api, scanning_api
from app.routers.node_sync import admin_router as node_admin_router, node_router
from app.routers.source_sync import admin_router as source_key_admin_router, router as source_sync_router
from app.websocket.connection import router as websocket_router, start_redis_listener


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting Venue Server in {settings.ENV} mode")
    logger.info(f"PostgreSQL URL: {settings.DATABASE_URL.replace('postgres:postgres', '***:***')}")
    logger.info(f"MinIO Endpoint: {settings.MINIO_ENDPOINT}")
    
    # Initialize MinIO Bucket in background task so it doesn't block startup
    asyncio.create_task(asyncio.to_thread(ensure_bucket_exists))
    
    # Start Redis WebSocket Listener
    redis_task = asyncio.create_task(start_redis_listener())
    
    # Start background sync scheduler if active event exists & seed default rules
    app.state.scheduler = None
    try:
        from app.database import AsyncSessionLocal
        from sqlalchemy import select, distinct
        from app.models.event import Event
        from app.models.participant import Participant
        from app.models.venue_capacity_rule import VenueCapacityRule
        from app.routers.auth import ensure_bootstrap_admin
        from app.schema_bootstrap import ensure_registration_shared_schema
        
        async with AsyncSessionLocal() as db:
            await ensure_registration_shared_schema()
            await ensure_bootstrap_admin(db)

            # 1. Fetch all distinct roles dynamically from participants table
            p_roles = (await db.execute(select(distinct(Participant.role)).where(Participant.role.isnot(None)))).scalars().all()
            all_db_roles = [r.strip() for r in p_roles if r and r.strip()] or ["All"]

            # 2. Seed or Update Default Initial Check-In Point Rule
            rule_check = await db.execute(
                select(VenueCapacityRule).where(
                    (VenueCapacityRule.station_name.ilike("%initial%")) | (VenueCapacityRule.station_name.ilike("%intake%"))
                ).limit(1)
            )
            default_rule = rule_check.scalar_one_or_none()
            if not default_rule:
                logger.info(f"Seeding 'Initial Participant Check-In Point' with all participant directory roles: {all_db_roles}")
                new_rule = VenueCapacityRule(
                    id=uuid.uuid4(),
                    gate_name="Initial Participant Check-In Gate",
                    gate_type="Main Entrance Intake",
                    allowed_roles=all_db_roles,
                    max_checkins_per_delegate=1,
                    gate_capacity=5000
                )
                db.add(new_rule)
                await db.commit()
            else:
                existing_roles = default_rule.allowed_roles or []
                updated_roles = list(dict.fromkeys(existing_roles + all_db_roles))
                if set(updated_roles) != set(existing_roles):
                    logger.info(f"Synchronizing Initial Check-In Point with all DB participant roles: {updated_roles}")
                    default_rule.allowed_roles = updated_roles
                    await db.commit()

            # 3. Initialize Scheduler if event present
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
    except Exception as e:
        logger.error(f"Failed to check for active event, seed rules, or start scheduler on startup: {e}")
    
    yield
    
    if app.state.scheduler:
        logger.info("Stopping background sync scheduler")
        app.state.scheduler.stop()
        
    redis_task.cancel()
    logger.info("Shutting down Venue Server")

app_fastapi = FastAPI(
    title="Venue Server API",
    description="Local Edge Node for Conference Event Execution",
    version="1.0.0",
    lifespan=lifespan
)

app_fastapi.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Open to all on local LAN
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import socketio
from app.websocket.connection import sio

app_fastapi.include_router(auth.router)
app_fastapi.include_router(cloud_sync.router)
app_fastapi.include_router(local_api.router)
app_fastapi.include_router(snapshot_api.router)
app_fastapi.include_router(devices.router)
app_fastapi.include_router(sessions.router)
app_fastapi.include_router(speakers.router)
app_fastapi.include_router(stations.router)
app_fastapi.include_router(admin_setup.router)
app_fastapi.include_router(workstations.router)
app_fastapi.include_router(admin_dashboard.router)
app_fastapi.include_router(admin_badges.router)
app_fastapi.include_router(admin_logs.router)
app_fastapi.include_router(network_discovery.router)
app_fastapi.include_router(node_admin_router)
app_fastapi.include_router(node_router)
app_fastapi.include_router(source_sync_router)
app_fastapi.include_router(source_key_admin_router)
app_fastapi.include_router(registration_api.router)
app_fastapi.include_router(scanning_api.router)
app_fastapi.include_router(websocket_router)

# Mount Socket.IO as ASGI app wrapping FastAPI
app = socketio.ASGIApp(socketio_server=sio, other_asgi_app=app_fastapi)
