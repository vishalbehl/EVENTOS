from contextlib import asynccontextmanager
import asyncio
import uuid
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from app.config import settings
from app.routers import auth, admin_setup, workstations
from app.routers import admin_dashboard, admin_badges, admin_logs, network_discovery
from app.routers import registration_api, scanning_api
from app.routers.node_sync import admin_router as node_admin_router, node_router
from app.websocket.connection import router as websocket_router, start_redis_listener


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting Registration Server in {settings.ENV} mode")
    logger.info(f"PostgreSQL URL: {settings.DATABASE_URL.replace('postgres:postgres', '***:***')}")
    
    # Start Redis WebSocket Listener
    redis_task = asyncio.create_task(start_redis_listener()) if settings.REDIS_URL else None
    
    # Start background sync scheduler if active event exists & seed default rules
    app.state.scheduler = None
    try:
        from app.database import async_engine, AsyncSessionLocal, Base
        from app import models as _app_models
        from sqlalchemy import select, distinct, text, func
        from app.models.event import Event
        from app.models.participant import Participant
        from app.models.participant_role import ParticipantRole
        from app.models.venue_capacity_rule import VenueCapacityRule
        from app.routers.auth import ensure_bootstrap_admin

        # Auto-create schemas & tables if starting on a new database
        schemas = ["identity", "events", "agenda", "design", "presentations", "registration", "speaker", "sponsors", "venue"]
        async with async_engine.begin() as conn:
            for s in schemas:
                await conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{s}";'))
            await conn.run_sync(Base.metadata.create_all)
        
        async with AsyncSessionLocal() as db:
            await ensure_bootstrap_admin(db)

            # Check for active event
            result = await db.execute(select(Event).limit(1))
            event = result.scalar_one_or_none()

            if event:
                # Seed default participant roles if none exist for this event
                role_count = (await db.execute(select(func.count(ParticipantRole.id)).where(ParticipantRole.event_id == event.id))).scalar() or 0
                if role_count == 0:
                    logger.info(f"Seeding default participant roles for venue registration event: {event.id}")
                    default_venue_roles = [
                        {"category": "General Attendees", "name": "Delegate", "role_code": "DEL", "is_default": True, "sort_order": 1},
                        {"category": "General Attendees", "name": "Student Delegate", "role_code": "STU", "is_default": True, "sort_order": 2},
                        {"category": "General Attendees", "name": "Organizer", "role_code": "ORG", "is_default": True, "sort_order": 3},
                        {"category": "Presentation Related", "name": "Speaker", "role_code": "SPK", "is_default": True, "sort_order": 20},
                        {"category": "Presentation Related", "name": "Keynote Speaker", "role_code": "KEY", "is_default": True, "sort_order": 22},
                        {"category": "Presentation Related", "name": "Moderator", "role_code": "MOD", "is_default": True, "sort_order": 26},
                        {"category": "Business & Partners", "name": "Sponsor Representative", "role_code": "SPO", "is_default": True, "sort_order": 30},
                        {"category": "Business & Partners", "name": "Exhibitor", "role_code": "EXH", "is_default": True, "sort_order": 31},
                        {"category": "Media & Public Relations", "name": "Media", "role_code": "MED", "is_default": True, "sort_order": 40},
                        {"category": "Event Operations", "name": "Volunteer", "role_code": "VOL", "is_default": True, "sort_order": 50},
                        {"category": "Event Operations", "name": "Technical Staff", "role_code": "TEC", "is_default": True, "sort_order": 51},
                        {"category": "Special Access", "name": "VIP Guest", "role_code": "VIP", "is_default": True, "sort_order": 60},
                        {"category": "Session Specific", "name": "Workshop Participant", "role_code": "WOR", "is_default": True, "sort_order": 70},
                        {"category": "Session Specific", "name": "Poster Presenter", "role_code": "POS", "is_default": True, "sort_order": 73},
                    ]
                    for vr in default_venue_roles:
                        db.add(ParticipantRole(
                            id=uuid.uuid4(),
                            event_id=event.id,
                            category=vr["category"],
                            name=vr["name"],
                            role_code=vr["role_code"],
                            is_default=True,
                            is_active=True,
                            sort_order=vr["sort_order"]
                        ))
                    await db.commit()

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
                logger.info(f"Found active registration event: {event_id}. Initializing background sync scheduler.")
                from app.sync.scheduler import SyncScheduler
                scheduler = SyncScheduler(event_id=event_id)
                scheduler.start()
                app.state.scheduler = scheduler
            else:
                logger.warning("No active registration event found in database on startup. Background sync scheduler will not be started.")
    except Exception as e:
        logger.error(f"Failed to check for active registration event, seed gates, or start scheduler on startup: {e}")
    
    yield
    
    if app.state.scheduler:
        logger.info("Stopping background sync scheduler")
        app.state.scheduler.stop()
        
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

    logger.info("Shutting down Registration Server")

app_fastapi = FastAPI(
    title="Registration Server API",
    description="Dedicated local backend for Registration Software execution",
    version="1.0.0",
    lifespan=lifespan
)

app_fastapi.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$" if settings.DEPLOYMENT_PROFILE == "local" else None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import socketio
from app.websocket.connection import sio

app_fastapi.include_router(auth.router)
app_fastapi.include_router(admin_setup.router)
app_fastapi.include_router(workstations.router)
app_fastapi.include_router(admin_dashboard.router)
app_fastapi.include_router(admin_badges.router)
app_fastapi.include_router(admin_logs.router)
app_fastapi.include_router(network_discovery.router)
app_fastapi.include_router(node_admin_router)
app_fastapi.include_router(node_router)
app_fastapi.include_router(registration_api.router)
app_fastapi.include_router(scanning_api.router)
app_fastapi.include_router(websocket_router)

# Mount Socket.IO as ASGI app wrapping FastAPI
app = socketio.ASGIApp(socketio_server=sio, other_asgi_app=app_fastapi)

