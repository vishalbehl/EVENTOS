import uuid
import re
from typing import Any, Optional
from starlette.types import ASGIApp
from starlette.requests import Request
from starlette.responses import JSONResponse
from loguru import logger

from app.database import AsyncSessionLocal
from app.modules.applications.models.app_registry import OrganizationApp, AppRegistry
from sqlalchemy import select

# Mapping of path patterns to application keys
APP_ROUTE_MAPPING = [
    (re.compile(r"/portal/"), "speaker-portal"),
    (re.compile(r"/registration-portal/"), "registration-portal"),
    (re.compile(r"/(venue|edge-servers|technician|signage|kiosks)"), "venue-ops"),
]

class ApplicationGuardMiddleware:
    """
    Middleware that checks if the Organization (tenant) has enabled
    the application corresponding to the request endpoint.
    """
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

        # Skip public/system/platform paths
        if path.startswith(("/auth/login", "/auth/command-center/", "/auth/signup", "/auth/refresh", "/health", "/docs", "/redoc", "/platform")):
            await self.app(scope, receive, send)
            return

        # Determine target application key
        target_app_key = "organizer-portal"  # default
        for pattern, app_key in APP_ROUTE_MAPPING:
            if pattern.search(path):
                target_app_key = app_key
                break

        # If header X-App-Key is sent, override the target app
        client_app_key = request.headers.get("X-App-Key")
        if client_app_key:
            target_app_key = client_app_key

        org_id_str = getattr(request.state, "org_id", None)
        user_id = getattr(request.state, "user_id", None)

        if not org_id_str:
            await self.app(scope, receive, send)
            return

        try:
            org_id = uuid.UUID(str(org_id_str))
        except ValueError:
            await self.app(scope, receive, send)
            return

        allow = False
        is_super = False

        async with AsyncSessionLocal() as db:
            # Super Admin bypasses app checks
            if user_id:
                from app.modules.identity.models.user import User
                user = await db.get(User, user_id)
                if user and (user.role == "super_admin" or user.platform_role == "SUPER_ADMIN"):
                    is_super = True

            if not is_super:
                # Check if organization has this app enabled
                stmt = (
                    select(OrganizationApp.is_enabled)
                    .join(AppRegistry)
                    .where(
                        OrganizationApp.organization_id == org_id,
                        AppRegistry.key == target_app_key
                    )
                )
                result = await db.execute(stmt)
                is_enabled = result.scalar_one_or_none()

                # If there is no record in organization_apps:
                if is_enabled is None:
                    # Check if the app is registered in AppRegistry.
                    app_check = await db.execute(select(AppRegistry.id).where(AppRegistry.key == target_app_key))
                    app_exists = app_check.scalar_one_or_none()
                    if not app_exists:
                        # If app is not seeded in the database at all, default to allow to prevent lockout
                        allow = True
                    else:
                        # App exists in registry, but no mapping exists for tenant.
                        # Default organizer-portal to allowed, others to blocked.
                        if target_app_key == "organizer-portal":
                            allow = True
                        else:
                            allow = False
                else:
                    allow = is_enabled
            else:
                allow = True

        if not allow:
            logger.warning(f"ApplicationGuard Denied: org={org_id} app={target_app_key} path={path}")
            response = JSONResponse(
                status_code=403,
                content={
                    "detail": f"The application '{target_app_key}' is not enabled for this organization.",
                    "code": "ERR_APPLICATION_DISABLED",
                    "application_key": target_app_key
                }
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)

