"""Common browser access-administration admission for canonical and legacy routes."""
import uuid
from contextvars import ContextVar

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.dependencies import get_db, TokenDep, require_active_user, require_step_up
from app.modules.identity.models.user import User
from app.modules.rbac.routers.access_foundation import browser_context_audience
from app.modules.rbac.services.access_contexts import selected_request_context


_administration_organization: ContextVar[uuid.UUID | None] = ContextVar(
    "administration_organization", default=None
)


def current_administration_organization() -> uuid.UUID:
    organization_id = _administration_organization.get()
    if organization_id is None:
        raise HTTPException(503, detail={"code": "ADMINISTRATION_CONTEXT_REQUIRED"})
    return organization_id


def scoped_administration(read_action: str, write_action: str):
    async def admission(request: Request, response: Response, token: TokenDep,
        user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)):
        await browser_context_audience(token)
        write = request.method not in {"GET", "HEAD", "OPTIONS"}
        response.headers["Cache-Control"] = "no-store"
        if write:
            await require_step_up(token)
        if token.access_mode != "DIRECT":
            raise HTTPException(403, detail={"code": "DIRECT_MEMBERSHIP_REQUIRED"})
        async with selected_request_context(db, user, token, write=write) as context:
            if (write_action if write else read_action) not in context.actions:
                raise HTTPException(403, detail={"code": "PERMISSION_DENIED"})
            selected = _administration_organization.set(token.active_organization_id)
            try:
                yield context
            finally:
                _administration_organization.reset(selected)
    return admission


scoped_role_administration = scoped_administration("roles:view", "roles:manage")
scoped_team_administration = scoped_administration("teams:view", "teams:manage")
scoped_member_administration = scoped_administration("members:manage", "members:manage")
scoped_organization_profile = scoped_administration("workspace:view", "workspace:edit")
scoped_branding_administration = scoped_administration(
    "workspace:view", "organization:branding:manage"
)
scoped_billing_reader = scoped_administration("billing:view", "billing:view")
