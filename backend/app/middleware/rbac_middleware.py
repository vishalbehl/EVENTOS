import uuid
import re
from typing import Any, Optional, Dict
from starlette.types import ASGIApp
from starlette.requests import Request
from starlette.responses import JSONResponse
from loguru import logger

from app.database import AsyncSessionLocal
from app.services.rbac_service import RBACService
from app.models.audit_log import AuditLog
from app.models.rbac import PermissionAuditLog
from datetime import datetime, timezone

# Mapping of paths to required permissions
# (This is a simplified version, usually this would be dynamic or based on route decorators)
PERMISSION_MAPPING = [
    (re.compile(r"/sessions"), {"GET": "SESSIONS:VIEW", "POST": "SESSIONS:CREATE", "PUT": "SESSIONS:EDIT", "DELETE": "SESSIONS:DELETE"}),
    (re.compile(r"/speakers"), {"GET": "SPEAKERS:VIEW", "POST": "SPEAKERS:CREATE", "PUT": "SPEAKERS:EDIT", "DELETE": "SPEAKERS:DELETE"}),
    (re.compile(r"/rooms"), {"GET": "ROOMS:VIEW", "POST": "ROOMS:CREATE", "PUT": "ROOMS:EDIT", "DELETE": "ROOMS:DELETE"}),
    (re.compile(r"/capacity"), {"GET": "EVENTS:VIEW", "POST": "EVENTS:EDIT", "PATCH": "EVENTS:EDIT", "DELETE": "EVENTS:EDIT"}),
    (re.compile(r"/registrations(?!/submit)"), {"GET": "EVENTS:VIEW", "POST": "EVENTS:EDIT", "PATCH": "EVENTS:EDIT", "DELETE": "EVENTS:EDIT"}),
    (re.compile(r"/badges"), {"GET": "EVENTS:VIEW", "POST": "EVENTS:EDIT", "PATCH": "EVENTS:EDIT", "DELETE": "EVENTS:EDIT"}),
    (re.compile(r"/printers"), {"GET": "EVENTS:VIEW", "POST": "EVENTS:EDIT", "PATCH": "EVENTS:EDIT", "DELETE": "EVENTS:EDIT"}),
    (re.compile(r"/attendance"), {"GET": "EVENTS:VIEW", "POST": "EVENTS:EDIT", "PATCH": "EVENTS:EDIT", "DELETE": "EVENTS:EDIT"}),
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

        request = Request(scope)
        path = request.url.path
        method = request.method

        # Skip public paths
        if path.startswith(("/auth/login", "/auth/refresh", "/health", "/docs", "/redoc", "/openapi.json")):
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

        async with AsyncSessionLocal() as db:
            is_allowed = await RBACService.validate_access(db, user_id, required_perm, scope_id)
            
            if not is_allowed:
                logger.warning(f"RBAC Denied: user={user_id} perm={required_perm} scope={scope_id} path={path}")
                # Audit the failure
                fail_log = AuditLog(
                    acting_user_id=user_id,
                    action="PERMISSION_DENIED",
                    entity_type="rbac",
                    entity_id=user_id,
                    new_values={"required_permission": required_perm, "path": path},
                    severity="WARNING",
                    ip_address=self._get_ip(request),
                    occurred_at=datetime.now(timezone.utc)
                )
                db.add(fail_log)
                await db.commit()
                
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
