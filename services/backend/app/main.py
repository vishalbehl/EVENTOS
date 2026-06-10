import sys  # reload trigger - DB restarted
import asyncio
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

from fastapi import FastAPI
import app.models

from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded

from app.routers import api_router
from app.middleware.audit_middleware import AuditMiddleware
from app.middleware.auth_middleware import AuthMiddleware
from app.middleware.rate_limit import (
    RateLimitMiddleware,
    limiter,
    rate_limit_exceeded_handler,
)
from app.services.init_service import ensure_admin_user

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    from app.config import settings
    if settings.environment != "testing":
        await ensure_admin_user()
        
        # ── Initialize System Timezone Cache ───────────────────
        from app.database import AsyncSessionLocal
        from app.services.timezone_service import fetch_system_timezone_async
        try:
            async with AsyncSessionLocal() as db:
                await fetch_system_timezone_async(db)
        except Exception:
            pass  # DB might not be ready yet (e.g. initial boot before migrations)

        # ── Ensure state column in speaker_profiles ────────────
        try:
            from sqlalchemy import text
            async with AsyncSessionLocal() as session:
                await session.execute(
                    text("ALTER TABLE events.speaker_profiles ADD COLUMN IF NOT EXISTS state VARCHAR(100);")
                )
                await session.commit()
        except Exception as e:
            from loguru import logger
            logger.warning(f"Failed to automatically add state column to speaker_profiles: {e}")

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
        except Exception:
            pass  # Non-critical housekeeping — swallow errors

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
from app.middleware.rate_limiter import RateLimiterMiddleware

app.add_middleware(AuditMiddleware)
app.add_middleware(PlanGuardMiddleware)
app.add_middleware(RBACMiddleware)
app.add_middleware(ApplicationGuardMiddleware)
app.add_middleware(TenantContextMiddleware)
app.add_middleware(RateLimiterMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(IPAllowlistMiddleware)
app.add_middleware(AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://0.0.0.0:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://0.0.0.0:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
        "http://0.0.0.0:3002",
        "http://localhost:3003",
        "http://127.0.0.1:3003",
        "http://0.0.0.0:3003",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.config import settings

app.include_router(api_router, prefix=settings.api_v1_prefix)


# ── Mount Socket.IO at /socket.io ─────────────────────────────
from app.modules.venue.services.websocket_service import socket_app  # noqa: E402

app.mount("/socket.io", socket_app)


# ── Health check ──────────────────────────────────────────────
@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
