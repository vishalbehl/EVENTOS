from typing import Any
from starlette.types import ASGIApp
from starlette.requests import Request
from starlette.responses import JSONResponse
from loguru import logger

from app.database import AsyncSessionLocal
from app.modules.identity.models.user import User
from app.core.client_ip import ip_is_allowed, resolve_client_ip

# List of paths/prefixes that do NOT require authentication or IP checks
_PUBLIC_PATH_PREFIXES = (
    "/health",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/ws",
    "/auth/login",
    "/auth/signup",
    "/auth/check-slug",
    "/auth/accept-invite",
    "/auth/refresh",
    "/auth/command-center/",
    "/upload/",           # speaker upload portal token paths
    "/srr/checkin/",      # kiosk QR scan endpoint
)

class IPAllowlistMiddleware:
    """
    Middleware that enforces IP allowlisting for authenticated users.
    If the user has allowed_ips configured, blocks the request (returns 403)
    if the request IP is not in the allowlist.
    """
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope)
        path = request.url.path

        # 1. Skip check for public paths
        if any(path.startswith(prefix) for prefix in _PUBLIC_PATH_PREFIXES):
            await self.app(scope, receive, send)
            return

        # 2. Skip check if user is not authenticated (unauthenticated routes)
        user_id = getattr(request.state, "user_id", None)
        if not user_id:
            await self.app(scope, receive, send)
            return

        user_allowed_ips_str = None
        
        # 3. Retrieve user allowed_ips from DB
        async with AsyncSessionLocal() as db:
            user = await db.get(User, user_id)
            if user and user.allowed_ips:
                user_allowed_ips_str = user.allowed_ips.strip()

        if not user_allowed_ips_str:
            await self.app(scope, receive, send)
            return

        # 4. Resolve the client through the canonical trusted-proxy policy.
        client_ip = resolve_client_ip(request)

        if not client_ip:
            logger.warning(f"IPAllowlist Denied: Could not resolve client IP for user={user_id}")
            response = JSONResponse(
                status_code=403,
                content={"detail": "IP address access denied."}
            )
            await response(scope, receive, send)
            return

        # 5. Verify IP is in allowlist (supports CIDR and single IPs)
        if not ip_is_allowed(client_ip, user_allowed_ips_str):
            logger.warning(f"IPAllowlist Denied: client_ip={client_ip} not in allowlist={user_allowed_ips_str} for user={user_id}")
            response = JSONResponse(
                status_code=403,
                content={"detail": "IP address access denied."}
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)
