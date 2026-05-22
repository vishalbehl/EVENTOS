from contextlib import asynccontextmanager
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from app.config import settings
from app.minio_client import ensure_bucket_exists
from app.routers import auth, cloud_sync, local_api, snapshot_api
from app.routers import devices, sessions, speakers, stations
from app.websocket.connection import router as websocket_router, start_redis_listener


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting Venue Server in {settings.ENV} mode")
    logger.info(f"PostgreSQL URL: {settings.DATABASE_URL.replace('postgres:postgres', '***:***')}")
    logger.info(f"MinIO Endpoint: {settings.MINIO_ENDPOINT}")
    
    # Initialize MinIO Bucket
    ensure_bucket_exists()
    
    # Start Redis WebSocket Listener
    redis_task = asyncio.create_task(start_redis_listener())
    
    # Start background sync scheduler if active event exists
    app.state.scheduler = None
    try:
        from app.database import AsyncSessionLocal
        from sqlalchemy import select
        from app.models.event import Event
        
        async with AsyncSessionLocal() as db:
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
        logger.error(f"Failed to check for active event or start scheduler on startup: {e}")
    
    yield
    
    if app.state.scheduler:
        logger.info("Stopping background sync scheduler")
        app.state.scheduler.stop()
        
    redis_task.cancel()
    logger.info("Shutting down Venue Server")

app = FastAPI(
    title="Venue Server API",
    description="Local Edge Node for Conference Event Execution",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Open to all on local LAN
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(cloud_sync.router)
app.include_router(local_api.router)
app.include_router(snapshot_api.router)
app.include_router(devices.router)
app.include_router(sessions.router)
app.include_router(speakers.router)
app.include_router(stations.router)
app.include_router(websocket_router)


@app.get("/health", tags=["system"])
async def health_check():
    return {"status": "ok", "service": "venue-server"}
