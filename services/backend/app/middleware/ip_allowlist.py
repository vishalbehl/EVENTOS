import ipaddress
import re
from typing import Any
from starlette.types import ASGIApp
from starlette.requests import Request
from starlette.responses import JSONResponse
from loguru import logger

from app.database import AsyncSessionLocal
from app.modules.identity.models.user import User

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

        # 3. Retrieve user allowed_ips from DB
        async with AsyncSessionLocal() as db:
            user = await db.get(User, user_id)
            if not user or not user.allowed_ips:
                await self.app(scope, receive, send)
                return

            allowed_ips_str = user.allowed_ips.strip()
            if not allowed_ips_str:
                await self.app(scope, receive, send)
                return

            # 4. Get request client IP
            forwarded = request.headers.get("X-Forwarded-For")
            if forwarded:
                client_ip = forwarded.split(",")[0].strip()
            else:
                client_ip = request.client.host if request.client else None

            if not client_ip:
                logger.warning(f"IPAllowlist Denied: Could not resolve client IP for user={user_id}")
                response = JSONResponse(
                    status_code=403,
                    content={"detail": "IP address access denied."}
                )
                await response(scope, receive, send)
                return

            # 5. Verify IP is in allowlist (supports CIDR and single IPs)
            is_allowed = False
            try:
                client_addr = ipaddress.ip_address(client_ip)
            except ValueError:
                logger.warning(f"IPAllowlist Denied: Invalid client IP={client_ip} for user={user_id}")
                response = JSONResponse(
                    status_code=403,
                    content={"detail": "IP address access denied."}
                )
                await response(scope, receive, send)
                return

            # Split allowed_ips by comma or whitespace
            allowed_list = [ip.strip() for ip in re.split(r'[,\s]+', allowed_ips_str) if ip.strip()]
            for allowed in allowed_list:
                try:
                    if "/" in allowed:
                        net = ipaddress.ip_network(allowed, strict=False)
                        if client_addr in net:
                            is_allowed = True
                            break
                    else:
                        addr = ipaddress.ip_address(allowed)
                        if client_addr == addr:
                            is_allowed = True
                            break
                except ValueError:
                    continue

            if not is_allowed:
                logger.warning(f"IPAllowlist Denied: client_ip={client_ip} not in allowlist={allowed_ips_str} for user={user_id}")
                response = JSONResponse(
                    status_code=403,
                    content={"detail": "IP address access denied."}
                )
                await response(scope, receive, send)
                return

        await self.app(scope, receive, send)
