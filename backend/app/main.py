import sys
import asyncio
from contextlib import asynccontextmanager 

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastapi import FastAPI

from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded

from app.routers import api_router
from app.middleware.audit_log import AuditLogMiddleware
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
    await ensure_admin_user()
    yield
    # Shutdown logic (none needed yet)

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

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    logger.error(f"Request validation failed: {exc.errors()}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
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

app.add_middleware(AuditLogMiddleware)
app.add_middleware(RBACMiddleware)
app.add_middleware(AuthMiddleware)
app.add_middleware(RateLimitMiddleware)
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
from app.services.websocket_service import socket_app  # noqa: E402

app.mount("/socket.io", socket_app)


# ── Health check ──────────────────────────────────────────────
@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
