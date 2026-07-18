import uuid
import re
from typing import Any, Optional, Dict, List
from starlette.types import ASGIApp
from starlette.requests import Request
from starlette.responses import JSONResponse
from loguru import logger

from app.database import AsyncSessionLocal
from app.modules.billing.models.subscription import OrganizationSubscription
from app.modules.rbac.services.entitlement_service import EntitlementService
from sqlalchemy import select

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
            # 4. Super Admin Bypass
            from app.modules.identity.models.user import User
            user = await db.get(User, user_id)
            if user and (user.role == "super_admin" or user.platform_role == "SUPER_ADMIN"):
                await self.app(scope, receive, send)
                return

            # 5. Check Subscription Status
            active_sub_stmt = select(OrganizationSubscription.id).where(
                OrganizationSubscription.organization_id == org_id,
                OrganizationSubscription.status.in_(["ACTIVE", "TRIAL"])
            ).limit(1)
            active_sub_id = await db.scalar(active_sub_stmt)
            if not active_sub_id:
                sub_stmt = (
                    select(OrganizationSubscription.status)
                    .where(OrganizationSubscription.organization_id == org_id)
                    .order_by(OrganizationSubscription.created_at.desc())
                    .limit(1)
                )
                status = await db.scalar(sub_stmt)
            else:
                status = None

            if status in ["SUSPENDED", "EXPIRED", "CANCELLED", "ARCHIVED"]:
                response = JSONResponse(
                    status_code=402,
                    content={"detail": f"Subscription {status.lower()}. Please update your billing information.", "code": "ERR_SUBSCRIPTION_INACTIVE"}
                )
                await response(scope, receive, send)
                return

            # 6. EntitlementService Check
            has_access = await EntitlementService.has_feature(db, org_id, required_entitlement)
            
            if not has_access:
                logger.warning(f"PlanGuard Denied: org={org_id} required={required_entitlement} path={path}")
                response = JSONResponse(
                    status_code=403,
                    content={
                        "detail": f"This feature requires a higher subscription plan or a specific add-on.",
                        "code": "ERR_ENTITLEMENT_REQUIRED",
                        "required_entitlement": required_entitlement
                    }
                )
                await response(scope, receive, send)
                return

        await self.app(scope, receive, send)
