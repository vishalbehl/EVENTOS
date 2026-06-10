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

# DEPRECATED: This URL prefix mapping is deprecated.
# New routes must use the `@require_feature` dependency decorator directly.
FEATURE_MAP = {
    "ADV_REG_APPROVALS": ["/registrations"],
    "ADV_BADGE_PRINTING": ["/badges"],
    "ADV_PRESENTATION_WORKFLOW": ["/files"],
    "ADV_POSTERS": ["/posters"],
    "ADV_SCIENTIFIC_PROGRAM": ["/sessions"],
    "ADV_REPORTING": ["/reporting"],
    "ENT_API_ACCESS": ["/platform/api"],
    "ENT_SSO": ["/auth/sso"],
    "ENT_SPONSOR_MGMT": ["/sponsors"],
    "ENT_INCIDENT_MGMT": ["/incidents"],
    "ENT_AI_TOOLS": ["/ai-tools"],
    "ADDON_VENUE_OPERATIONS": ["/venue", "/edge-servers", "/technician", "/signage", "/kiosks", "/sync/push"],
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
        if path.startswith(("/auth/login", "/auth/signup", "/auth/refresh", "/health", "/docs", "/redoc", "/platform")):
            await self.app(scope, receive, send)
            return

        # 2. Determine Required Entitlement
        required_entitlement = None
        for entitlement, prefixes in FEATURE_MAP.items():
            if any(path.startswith(prefix) for prefix in prefixes):
                if entitlement == "ADV_SCIENTIFIC_PROGRAM" and method == "GET":
                    continue
                if entitlement == "ADV_REG_APPROVALS":
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
            sub_stmt = select(OrganizationSubscription.status).where(OrganizationSubscription.organization_id == org_id)
            status = await db.scalar(sub_stmt)
            
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
