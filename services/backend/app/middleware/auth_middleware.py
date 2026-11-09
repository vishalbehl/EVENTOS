# =============================================================
# Conference Platform — Auth Middleware
# backend/app/middleware/auth_middleware.py
#
# Optional ASGI middleware layer for request-level authentication
# concerns that sit ABOVE the FastAPI dependency injection system.
#
# Responsibilities:
#   1. Attach decoded token data to request.state so it is
#      accessible in middleware without DI (e.g. in audit log).
#   2. Enforce global token blocklist checks (future Redis-backed).
#   3. Add security response headers to every response.
#   4. Log suspicious auth patterns (e.g. repeated 401s per IP).
#
# NOTE: This middleware does NOT replace the `dependencies.py`
# DI-based auth. Route-level auth still goes through
# get_token_data / require_active_user. This middleware is the
# complementary infrastructure layer.
# =============================================================

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Optional, Any

from starlette.datastructures import MutableHeaders
from jose import JWTError, jwt
from loguru import logger
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from app.config import settings
from app.core.distributed_rate_limit import identity_key
from app.core.client_ip import resolve_client_ip
from app.core.rate_policy import request_operation


# ── Public paths (never require auth at middleware level) ─────
_PUBLIC_PATH_PREFIXES = (
    "/health",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/ws",
    "/auth/login",
    "/auth/command-center/login",
    "/auth/command-center/refresh",
    "/auth/command-center/logout",
    "/auth/signup",
    "/auth/check-slug",
    "/auth/accept-invite",
    "/auth/refresh",
    "/upload/",           # speaker upload portal token paths
    "/srr/checkin/",      # kiosk QR scan endpoint
)


# ── Expiring shared 401 anomaly diagnostics ──────────────────
# Diagnostics only; ingress/account admission policies enforce abuse limits.
_AUTH_FAIL_ALERT_THRESHOLD = 10


# ── Security headers ──────────────────────────────────────────
# Added to every response — defence-in-depth regardless of route.
_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    # Content-Security-Policy is intentionally omitted here — configure
    # it at the reverse proxy (Nginx) level for production.
}


# ── AuthMiddleware ────────────────────────────────────────────

class AuthMiddleware:
    """
    Pure ASGI middleware for request-level auth.
    Avoids BaseHTTPMiddleware to prevent interference with WebSockets/Streaming.
    """
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Request-level state initialization
        request = Request(scope)
        await self._attach_token_state(request)

        async def send_wrapper(message: dict) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for header, value in _SECURITY_HEADERS.items():
                    headers.append(header, value)
                
                # Track 401 anomalies
                status = message.get("status")
                if status == 401:
                    ip = self._get_ip(request)
                    from app.redis import coordination_client
                    try:
                        async with coordination_client.pipeline(transaction=True) as pipe:
                            key = f"access-rate:auth-failures:{identity_key(ip)}"
                            pipe.incr(key)
                            pipe.expire(key, 900)
                            count, _ = await pipe.execute()
                        if count >= _AUTH_FAIL_ALERT_THRESHOLD and count % _AUTH_FAIL_ALERT_THRESHOLD == 0:
                            logger.warning("Authentication failures: count={} identity={} operation={}",
                                count, identity_key(ip), request_operation(request).operation_id)
                    except Exception as exc:
                        # Diagnostic counters are not admission or adaptive
                        # account challenges. Admission already fails closed.
                        logger.warning("Authentication telemetry unavailable: {}", type(exc).__name__)

            await send(message)

        await self.app(scope, receive, send_wrapper)

    async def _attach_token_state(self, request: Request) -> None:
        """
        Attempt to decode the Bearer token or API key and attach claims to request.state.

        Sets:
            request.state.user_id       → UUID | None
            request.state.user_role     → str | None
            request.state.org_id        → UUID | None
            request.state.token_valid   → bool
        """
        request.state.user_id = None
        request.state.user_role = None
        request.state.org_id = None
        request.state.token_valid = False
        request.state.credential_digest = None
        request.state.api_usage_accounted = False

        # 1. API Key authentication via custom header
        api_key = request.headers.get("X-API-Key")

        # 2. Bearer token check
        auth_header: Optional[str] = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:]
            if token.startswith("evx_live_"):
                api_key = token
            else:
                # Regular Bearer token, attempt JWT decoding first
                try:
                    payload = jwt.decode(
                        token,
                        settings.JWT_SECRET_KEY,
                        algorithms=[settings.JWT_ALGORITHM],
                        options={"verify_exp": True},
                    )
                    import uuid as _uuid
                    sub = payload.get("sub")
                    org = payload.get("org")
                    request.state.user_id = _uuid.UUID(sub) if sub else None
                    request.state.user_role = payload.get("role")
                    request.state.org_id = _uuid.UUID(org) if org else None
                    request.state.token_valid = True
                    request.state.credential_digest = identity_key(token)
                    return
                except (JWTError, ValueError):
                    # If JWT fails, check if it's a developer OAuth2 access token in the database
                    from app.database import AsyncSessionLocal
                    from sqlalchemy import select, and_
                    from app.modules.developer.models.developer_domain_tables import DeveloperOAuthToken
                    from app.modules.identity.models.user import User

                    async with AsyncSessionLocal() as db:
                        stmt = (
                            select(DeveloperOAuthToken, User.organization_id)
                            .join(User, User.id == DeveloperOAuthToken.user_id)
                            .where(
                                and_(
                                    DeveloperOAuthToken.access_token == token,
                                    DeveloperOAuthToken.expires_at > datetime.now(timezone.utc)
                                )
                            )
                        )
                        res = await db.execute(stmt)
                        row = res.first()
                        if row:
                            oauth_token, org_id = row
                            request.state.org_id = org_id
                            request.state.user_id = oauth_token.user_id
                            request.state.user_role = "developer"
                            request.state.token_valid = True
                            request.state.credential_digest = identity_key(token)
                            return

        # 3. Handle API Key validation if one was specified
        if api_key:
            from app.database import AsyncSessionLocal
            from app.modules.developer.services.developer_service import DeveloperService
            from app.core.rate_policy import request_operation
            async with AsyncSessionLocal() as db:
                resolved_org_id = await DeveloperService.validate_api_key(
                    db, api_key, endpoint=request_operation(request).operation_id
                )
                if resolved_org_id:
                    # API-key admission already commits its reservation/usage.
                    # Do not meter that same request again after its response.
                    request.state.api_usage_accounted = True
                    request.state.org_id = resolved_org_id
                    request.state.user_id = None
                    request.state.user_role = "developer"
                    request.state.token_valid = True
                    request.state.credential_digest = identity_key(api_key)
                    return

    @staticmethod
    def _get_ip(request: Request) -> str:
        return resolve_client_ip(request) or "unknown"
