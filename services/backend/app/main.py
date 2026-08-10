import sys  # reload trigger - DB restarted
import asyncio
import uuid
from contextlib import asynccontextmanager

# Compatibility patch for passlib and modern bcrypt versions
try:
    import bcrypt
    if not hasattr(bcrypt, "__about__"):
        class MockAbout:
            __version__ = getattr(bcrypt, "__version__", "4.0.0")
        bcrypt.__about__ = MockAbout
except ImportError:
    pass

if sys.platform == 'win32':
    from app.config import settings
    if settings.environment != "testing":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastapi import FastAPI, WebSocket
import app.models

from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded

from app.routers import api_router
from app.middleware.audit_middleware import AuditMiddleware
from app.middleware.auth_middleware import AuthMiddleware
from app.middleware.rate_limit import limiter, rate_limit_exceeded_handler
from app.middleware.rate_limiter import RateLimiterMiddleware
from app.services.init_service import ensure_admin_user

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    from app.config import settings
    if settings.environment != "testing":
        if settings.REQUIRE_RLS_SAFE_RUNTIME_ROLE:
            from app.core.database_security import enforce_runtime_database_security
            from app.database import AsyncSessionLocal

            async with AsyncSessionLocal() as security_session:
                await enforce_runtime_database_security(security_session)
        await ensure_admin_user()

        # Keep catalogue data aligned with the immutable code-owned
        # route/operation manifest. An active unknown key could otherwise be
        # sold without any backend enforcement destination.
        from app.database import AsyncSessionLocal
        from app.modules.billing.services.capability_service import CapabilityService
        async with AsyncSessionLocal() as capability_session:
            catalogue_result = await CapabilityService.sync_catalogue(capability_session)
            if catalogue_result["unknown_active"]:
                raise RuntimeError(
                    "Active feature catalogue keys are missing enforcement bindings: "
                    + ", ".join(catalogue_result["unknown_active"])
                )
            await capability_session.commit()
            logger.info(
                "Capability catalogue validated: {} registered, {} created, {} updated",
                catalogue_result["registered"],
                len(catalogue_result["created"]),
                len(catalogue_result["updated"]),
            )
        
        # ── Initialize System Timezone Cache ───────────────────
        from app.database import AsyncSessionLocal
        from app.services.timezone_service import fetch_system_timezone_async
        try:
            async with AsyncSessionLocal() as db:
                await fetch_system_timezone_async(db)
        except Exception as exc:
            logger.warning(f"System timezone initialization failed: {exc}")

        # ── Ensure state column in speaker_profiles ────────────
    # ── OTP cleanup scheduler ────────────────────────────────
    # Purge portal OTP tokens that are used or expired and older than 24h.
    # Runs every 6 hours. APScheduler is already a project dependency.
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.interval import IntervalTrigger

    async def _cleanup_otp_tokens() -> None:
        try:
            from app.database import AsyncSessionLocal
            from sqlalchemy import text
            async with AsyncSessionLocal() as session:
                await session.execute(
                    text(
                        "DELETE FROM identity.otp_tokens "
                        "WHERE (used = true OR expires_at < now()) "
                        "AND created_at < now() - interval '24 hours'"
                    )
                )
                await session.commit()
        except Exception as exc:
            logger.exception(f"OTP cleanup failed: {exc}")

    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        _cleanup_otp_tokens,
        trigger=IntervalTrigger(hours=6),
        id="otp_token_cleanup",
        replace_existing=True,
    )
    if settings.environment != "testing":
        scheduler.start()

    yield
    # Shutdown
    if scheduler.running:
        scheduler.shutdown(wait=False)

app = FastAPI(
    title="Conference Platform API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── Attach SlowAPI limiter to app state ───────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

from fastapi.exceptions import RequestValidationError, ResponseValidationError
from fastapi.responses import JSONResponse
from loguru import logger
from app.core.dependencies.feature_gate import EntitlementRequiredException

@app.exception_handler(EntitlementRequiredException)
async def entitlement_required_exception_handler(request, exc):
    if settings.environment != "testing":
        from app.modules.billing.services.capability_diagnostics_service import CapabilityDiagnosticsService
        reason_code = str(exc.detail.get("code") or "NOT_ENTITLED")
        await CapabilityDiagnosticsService.record_isolated(
            event_type="RESOLUTION_FAILURE" if reason_code == "RESOLUTION_UNAVAILABLE" else "GATE_DENIAL",
            source="fastapi.entitlement_required_handler",
            organization_id=exc.organization_id,
            event_id=exc.event_id,
            actor_user_id=exc.actor_user_id,
            severity="ERROR" if reason_code == "RESOLUTION_UNAVAILABLE" else "WARNING",
            reason_code=reason_code,
            capability_key=str(exc.detail.get("feature") or ""),
            operation_key=exc.operation,
            request_id=request.headers.get("X-Request-ID"),
            correlation_id=request.headers.get("X-Correlation-ID"),
            metadata={"method": request.method, "path": request.url.path},
        )
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.detail
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    logger.error(f"Request validation failed: {exc.errors()}")
    from fastapi.encoders import jsonable_encoder
    return JSONResponse(
        status_code=422,
        content={"detail": jsonable_encoder(exc.errors())},
    )

@app.exception_handler(ResponseValidationError)
async def response_validation_exception_handler(request, exc):
    logger.error(f"Response validation failed: {exc.errors()}")
    return JSONResponse(
        status_code=500,
        detail="Internal Server Error: Response validation failed."
    )

# ── Middleware stack (order matters — outermost is registered last) ──
#
# Request flow (top → bottom):
#   RateLimitMiddleware  → blocks DoS before any auth or routing
#   CORSMiddleware       → handles preflight OPTIONS
#   AuthMiddleware       → attaches token state + security headers
#   AuditLogMiddleware   → writes audit log after response
#
# Starlette processes middleware in reverse registration order,
# so we add them in reverse of the intended flow.

from app.middleware.rbac_middleware import RBACMiddleware
from app.middleware.tenant_context import TenantContextMiddleware
from app.middleware.plan_guard import PlanGuardMiddleware
from app.middleware.application_guard import ApplicationGuardMiddleware
from app.middleware.ip_allowlist import IPAllowlistMiddleware
from app.middleware.request_logging import RequestLoggingMiddleware
from app.middleware.security_middleware import SecurityMiddleware

app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(SecurityMiddleware)
app.add_middleware(AuditMiddleware)

app.add_middleware(PlanGuardMiddleware)
app.add_middleware(RBACMiddleware)
app.add_middleware(ApplicationGuardMiddleware)
app.add_middleware(TenantContextMiddleware)
app.add_middleware(RateLimiterMiddleware)
app.add_middleware(IPAllowlistMiddleware)
app.add_middleware(AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=r"^https?://.*" if not settings.is_production else None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.config import settings

app.include_router(api_router, prefix=settings.api_v1_prefix)


# ── Mount Socket.IO at /socket.io ─────────────────────────────
# Socket.io is wrapped at the bottom of this file.


# ── Health check ──────────────────────────────────────────────
@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready", tags=["health"])
async def readiness() -> JSONResponse:
    checks: dict[str, str] = {}
    status_code = 200

    try:
        from sqlalchemy import text
        from app.database import AsyncSessionLocal

        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:
        logger.warning(f"Readiness database check failed: {exc}")
        checks["database"] = "failed"
        status_code = 503

    try:
        import redis.asyncio as redis

        client = redis.from_url(settings.REDIS_URL, socket_connect_timeout=1, socket_timeout=1)
        try:
            await client.ping()
            checks["redis"] = "ok"
        finally:
            await client.aclose()
    except Exception as exc:
        logger.warning(f"Readiness Redis check failed: {exc}")
        checks["redis"] = "failed"
        status_code = 503

    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ready" if status_code == 200 else "not_ready",
            "checks": checks,
        },
    )


# ── Native WebSocket Fallback for Dashboard ───────────────────
@app.websocket("/ws/dashboard/{event_id}")
async def ws_dashboard_fallback(websocket: WebSocket, event_id: uuid.UUID):
    """Authenticated fallback WebSocket for dashboard event updates."""
    from app.websocket.events import handle_monitor_connection
    await handle_monitor_connection(websocket, event_id)


# ── Socket.IO wrapper (instead of mounting at /socket.io) ────────
from app.modules.venue.services.websocket_service import sio
import socketio

fastapi_app = app
app = socketio.ASGIApp(sio, other_asgi_app=fastapi_app)
