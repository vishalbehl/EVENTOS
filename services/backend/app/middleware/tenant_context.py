import uuid
from typing import Any
from starlette.types import ASGIApp
from starlette.requests import Request
from app.database import tenant_org_id

class TenantContextMiddleware:
    """
    Middleware that captures the active organization_id context for the request lifetime.
    Binds the ID to a thread-safe / task-safe ContextVar.
    """
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope)
        
        # 1. Resolve tenant ID from state (populated by AuthMiddleware JWT parse)
        org_id = getattr(request.state, "org_id", None)
        
        # Super admins bypass tenant filtering globally to allow cross-tenant management
        role = getattr(request.state, "user_role", None)
        if role == "super_admin":
            org_id = None
        
        # 2. Fallback to custom API header for service calls or kiosk stations
        if not org_id and role != "super_admin":
            x_org_id = request.headers.get("X-Organization-ID")
            if x_org_id:
                try:
                    org_id = uuid.UUID(x_org_id)
                except ValueError:
                    pass

        # 3. Set the context variable
        token = tenant_org_id.set(org_id)
        try:
            await self.app(scope, receive, send)
        finally:
            # Always reset the ContextVar to prevent memory leaks across request worker tasks
            tenant_org_id.reset(token)
