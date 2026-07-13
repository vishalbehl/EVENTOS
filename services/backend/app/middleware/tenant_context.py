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
        
        # Tenant context may only originate from a verified user or machine identity.
        token = tenant_org_id.set(org_id)
        try:
            await self.app(scope, receive, send)
        finally:
            # Always reset the ContextVar to prevent memory leaks across request worker tasks
            tenant_org_id.reset(token)
