import uuid
import re
from typing import Any, Optional, Dict, List
from starlette.types import ASGIApp
from starlette.requests import Request
from starlette.responses import JSONResponse
from loguru import logger

from app.database import AsyncSessionLocal
from app.modules.billing.services.capability_service import CapabilityService

# Regex-based URL path matching mapped to feature keys.
FEATURE_URL_MAP = {
    "FEAT_REGISTRATION_PORTAL": [r"^/registrations"],
    "FEAT_QR_BADGE": [r"^/badges"],
    "FEAT_FILE_UPLOADS": [r"^/files"],
    "FEAT_EPOSTER_MGMT": [r"^/posters"],
    "FEAT_SESSION_QUEUE": [r"^/sessions"],
    "FEAT_REGISTRATION_ANALYTICS": [r"^/reporting"],
    "FEAT_API_ACCESS": [r"^/platform/api"],
    "FEAT_CUSTOM_LOGIN_PAGE": [r"^/auth/sso"],
    "FEAT_THIRD_PARTY_INTEGRATIONS": [r"^/sponsors", r"^/ai-tools"],
    "FEAT_VENUE_SYNC": [r"^/venue", r"^/edge-servers", r"^/technician", r"^/signage", r"^/kiosks", r"^/sync/push"],
}

class PlanGuardMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: dict, receive: Any, send: Any):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        from app.config import settings
        if settings.environment == "testing":
            await self.app(scope, receive, send)
            return

        request = Request(scope)
        path = request.url.path
        method = request.method

        # 1. Skip public and platform-admin paths
        if path.startswith(("/auth/login", "/auth/command-center/", "/auth/signup", "/auth/refresh", "/health", "/docs", "/redoc", "/platform")):
            await self.app(scope, receive, send)
            return

        # 2. Determine Required Entitlement
        required_entitlement = None
        for entitlement, patterns in FEATURE_URL_MAP.items():
            if any(re.search(pattern, path) for pattern in patterns):
                if entitlement == "FEAT_SESSION_QUEUE" and method == "GET":
                    continue
                if entitlement == "FEAT_REGISTRATION_PORTAL":
                    if "/submit" in path or not any(x in path for x in ["approve", "reject", "waitlist", "promote"]):
                        continue
                required_entitlement = entitlement
                break
        
        if not required_entitlement:
            await self.app(scope, receive, send)
            return

        # 3. Extract Organization ID from Request State
        org_id = getattr(request.state, "organization_id", None)
        user_id = getattr(request.state, "user_id", None)
        
        if not org_id or not user_id:
            await self.app(scope, receive, send)
            return

        async with AsyncSessionLocal() as db:
            # This middleware is defense in depth. Explicit operation
            # dependencies remain authoritative, but both paths must use the
            # same resolver and denial vocabulary. Platform actors do not
            # bypass organizer-domain commercial or security controls.
            try:
                resolved = await CapabilityService.resolve_organization(
                    db, uuid.UUID(str(org_id)), user_id=uuid.UUID(str(user_id))
                )
                feature = resolved["features"].get(required_entitlement)
            except Exception as exc:
                logger.exception(f"PlanGuard resolution failed: org={org_id} path={path}: {exc}")
                feature = None

            if not feature or not feature.get("enabled"):
                reason_code = (feature or {}).get("reason_code") or "RESOLUTION_UNAVAILABLE"
                logger.warning(f"PlanGuard Denied: org={org_id} required={required_entitlement} path={path}")
                response = JSONResponse(
                    status_code=403,
                    content={
                        "detail": "This operation is not available for the resolved organization capability.",
                        "code": "ERR_ENTITLEMENT_REQUIRED",
                        "reason_code": reason_code,
                        "required_entitlement": required_entitlement,
                    }
                )
                await response(scope, receive, send)
                return

        await self.app(scope, receive, send)
