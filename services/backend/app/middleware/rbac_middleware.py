import uuid
import re
from typing import Any, Optional, Dict
from starlette.types import ASGIApp
from starlette.requests import Request
from starlette.responses import JSONResponse
from loguru import logger

from app.database import AsyncSessionLocal
from app.modules.rbac.services.rbac_service import RBACService
from app.modules.audit.models.audit_log import AuditLog
from app.modules.audit.models.audit_domain_tables import PermissionAuditLog
from datetime import datetime, timezone

PERMISSION_MAPPING = [
    # ── Granular Registration & Participant Permissions ────────
    (re.compile(r"/participants/import-excel"), {"POST": "PARTICIPANTS:IMPORT"}),
    (re.compile(r"/participants/import"), {"POST": "PARTICIPANTS:IMPORT"}),
    (re.compile(r"/participants/import-template"), {"GET": "PARTICIPANTS:VIEW"}),
    (re.compile(r"/participants/export"), {"GET": "PARTICIPANTS:EXPORT"}),
    (re.compile(r"/participants/stats"), {"GET": "PARTICIPANTS:VIEW"}),
    (re.compile(r"/participants/analytics-dashboard"), {"GET": "ANALYTICS:REG_DASHBOARD"}),
    (re.compile(r"/participants/[^/]+/checkin"), {"POST": "CHECKIN:MANUAL", "DELETE": "CHECKIN:UNDO"}),
    (re.compile(r"/participants/[^/]+/checkins"), {"GET": "CHECKIN:LOGS"}),
    (re.compile(r"/participants/bulk-delete"), {"POST": "PARTICIPANTS:DELETE"}),
    (re.compile(r"/participants/bulk"), {"POST": "PARTICIPANTS:CREATE"}),
    (re.compile(r"/participants/fetch-from-speakers"), {"POST": "PARTICIPANTS:CREATE"}),
    (re.compile(r"/participants"), {
        "GET": "PARTICIPANTS:VIEW", 
        "POST": "PARTICIPANTS:CREATE", 
        "PATCH": "PARTICIPANTS:EDIT", 
        "PUT": "PARTICIPANTS:EDIT", 
        "DELETE": "PARTICIPANTS:DELETE"
    }),
    
    (re.compile(r"/registrations(?!/submit)/[^/]+/approve"), {"PATCH": "REGISTRATION:APPROVE"}),
    (re.compile(r"/registrations(?!/submit)/[^/]+/reject"), {"PATCH": "REGISTRATION:REJECT"}),
    (re.compile(r"/registrations(?!/submit)/[^/]+/waitlist"), {"PATCH": "REGISTRATION:WAITLIST"}),
    (re.compile(r"/registrations(?!/submit)/[^/]+/promote"), {"PATCH": "REGISTRATION:OVERRIDE"}),
    (re.compile(r"/registrations(?!/submit)"), {
        "GET": "REGISTRATION:VIEW_QUEUE"
    }),

    (re.compile(r"/badges/generate"), {"POST": "BADGES:GENERATE"}),
    (re.compile(r"/badges/reprint"), {"POST": "BADGES:REPRINT"}),
    (re.compile(r"/badges/print-jobs"), {"GET": "BADGES:QUEUE", "PATCH": "BADGES:QUEUE"}),
    (re.compile(r"/badges/[^/]+/print"), {"POST": "BADGES:PRINT"}),
    (re.compile(r"/badges"), {
        "GET": "BADGES:VIEW",
        "POST": "BADGES:GENERATE"
    }),

    (re.compile(r"/payments/config"), {"GET": "REG_CONFIG:VIEW", "POST": "REG_CONFIG:EDIT"}),
    (re.compile(r"/payments/promos"), {
        "GET": "PAYMENTS:VIEW",
        "POST": "PAYMENTS:PRICING",
        "PATCH": "PAYMENTS:PRICING",
        "DELETE": "PAYMENTS:PRICING"
    }),
    (re.compile(r"/payments/transactions"), {"GET": "PAYMENTS:VIEW"}),
    
    (re.compile(r"/ticket-types"), {
        "GET": "REG_CONFIG:VIEW",
        "POST": "REG_CONFIG:EDIT"
    }),
    (re.compile(r"/participant-roles"), {
        "GET": "REG_CONFIG:VIEW",
        "POST": "REG_CONFIG:EDIT",
        "PATCH": "REG_CONFIG:EDIT",
        "DELETE": "REG_CONFIG:EDIT"
    }),

    (re.compile(r"/print-templates"), {
        "GET": "BADGES:VIEW",
        "POST": "BADGES:TEMPLATES",
        "PATCH": "BADGES:TEMPLATES",
        "DELETE": "BADGES:TEMPLATES"
    }),
    (re.compile(r"/printers"), {
        "GET": "BADGES:VIEW",
        "POST": "BADGES:TEMPLATES",
        "PATCH": "BADGES:TEMPLATES",
        "DELETE": "BADGES:TEMPLATES"
    }),
    
    # ── Core Conference Platform Mappings ───────────────
    (re.compile(r"/sessions"), {"GET": "SESSIONS:VIEW", "POST": "SESSIONS:CREATE", "PUT": "SESSIONS:EDIT", "DELETE": "SESSIONS:DELETE"}),
    (re.compile(r"/speakers"), {"GET": "SPEAKERS:VIEW", "POST": "SPEAKERS:CREATE", "PUT": "SPEAKERS:EDIT", "DELETE": "SPEAKERS:DELETE"}),
    (re.compile(r"/rooms"), {"GET": "ROOMS:VIEW", "POST": "ROOMS:CREATE", "PUT": "ROOMS:EDIT", "DELETE": "ROOMS:DELETE"}),
    (re.compile(r"/capacity"), {"GET": "EVENTS:VIEW", "POST": "EVENTS:EDIT", "PATCH": "EVENTS:EDIT", "DELETE": "EVENTS:EDIT"}),
    (re.compile(r"/events"), {"GET": "EVENTS:VIEW", "POST": "EVENTS:CREATE", "PUT": "EVENTS:EDIT", "DELETE": "EVENTS:DELETE"}),
    (re.compile(r"/users"), {"GET": "USERS:VIEW", "POST": "USERS:CREATE", "PUT": "USERS:EDIT", "DELETE": "USERS:DELETE"}),
    (re.compile(r"/posters"), {"GET": "POSTERS:VIEW", "POST": "POSTERS:CREATE", "PUT": "POSTERS:EDIT", "DELETE": "POSTERS:DELETE"}),
    (re.compile(r"/files"), {"GET": "FILES:VIEW", "POST": "FILES:CREATE", "PUT": "FILES:EDIT", "DELETE": "FILES:DELETE"}),
]

UUID_PATTERN = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE)

class RBACMiddleware:
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

        # Skip public paths
        if path.startswith(("/auth/login", "/auth/command-center/", "/auth/signup", "/auth/check-slug", "/auth/accept-invite", "/auth/refresh", "/health", "/docs", "/redoc", "/openapi.json")):
            await self.app(scope, receive, send)
            return

        # 1. Determine Required Permission
        required_perm = None
        for pattern, method_map in PERMISSION_MAPPING:
            if pattern.search(path):
                required_perm = method_map.get(method)
                break
        
        if not required_perm:
            # If no mapping, continue (might be handled by route dependencies)
            await self.app(scope, receive, send)
            return

        # 2. Extract Scope (e.g. event_id from path)
        scope_id = None
        uuids = UUID_PATTERN.findall(path)
        if uuids:
            scope_id = uuid.UUID(uuids[0])

        # 3. Validate Permission
        user_id = request.state.user_id if hasattr(request.state, "user_id") else None
        if not user_id:
            # AuthMiddleware should have run first
            await self.app(scope, receive, send)
            return

        user_exists = False
        is_allowed = False
        
        async with AsyncSessionLocal() as db:
            # Check if user exists in DB first to handle stale tokens/JWTs (e.g. after DB wipe/reset)
            from app.modules.identity.models.user import User
            user = await db.get(User, user_id)
            if user:
                user_exists = True
                is_allowed = await RBACService.validate_access(db, user_id, required_perm, scope_id)
                
                if not is_allowed:
                    logger.warning(f"RBAC Denied: user={user_id} perm={required_perm} scope={scope_id} path={path}")
                    # Audit the failure
                    fail_log = AuditLog(
                        actor_user_id=user_id,
                        action_type="PERMISSION_DENIED",
                        resource_type="rbac",
                        resource_id=user_id,
                        new_state={"required_permission": required_perm, "path": path},
                        actor_ip=self._get_ip(request),
                        is_sensitive=True,
                        occurred_at=datetime.now(timezone.utc)
                    )
                    db.add(fail_log)
                    await db.commit()

        if not user_exists:
            # User does not exist, let route-level auth dependencies return a proper 401
            await self.app(scope, receive, send)
            return

        if not is_allowed:
            response = JSONResponse(
                status_code=403,
                content={"detail": f"Missing required permission: {required_perm}"}
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)

    def _get_ip(self, request: Request) -> str:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"
