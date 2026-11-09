"""Authoritative bounded platform permissions, separate from customer membership."""
from types import MappingProxyType
from fastapi import Depends, HTTPException, Response, Request
from sqlalchemy import select
from app.dependencies import get_db, require_active_user, TokenDep
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.rbac.services.permission_catalogue import OPERATIONAL_ACTIONS

PLATFORM_ROLES = MappingProxyType({
    "SUPER_ADMIN": frozenset({"platform:teams:view", "platform:teams:manage", "platform:teams:grant",
        "platform:staff:view", "platform:crm:view", "platform:billing:view", "platform:billing:manage", "platform:administration:manage",
        "platform:organizations:view", "platform:organizations:manage", "platform:organizations:provision",
        "platform:members:view", "platform:members:manage", "platform:members:grant"}),
    "SUPPORT_ADMIN": frozenset({"platform:staff:view", "platform:crm:view"}),
    "FINANCE_ADMIN": frozenset({"platform:staff:view", "platform:billing:view"}),
})
PLATFORM_ACTIONS = frozenset(action for actions in PLATFORM_ROLES.values() for action in actions)
# Compatibility import; no independent role system or global wildcard.
PLATFORM_TEAM_ROLES = PLATFORM_ROLES


async def platform_permission_authority(db, user_id, action: str):
    if action not in PLATFORM_ACTIONS:
        raise ValueError("Unknown platform permission")
    identity, organization = User.__table__.c, Organization.__table__.c
    role = await db.scalar(select(identity.platform_role).select_from(User.__table__.join(
        Organization.__table__, organization.id == identity.organization_id)).where(
        identity.id == user_id, identity.is_active.is_(True), identity.deleted_at.is_(None),
        organization.is_platform_org.is_(True), organization.is_active.is_(True),
        organization.suspended_at.is_(None), organization.archived_at.is_(None)))
    if action not in PLATFORM_ROLES.get(role, frozenset()):
        # Legacy global role/boolean labels never substitute for platform proof.
        raise HTTPException(403, detail={"code": "PLATFORM_PERMISSION_DENIED"})
    return role


async def lock_platform_permission(db, user_id, action: str):
    """Fence a privileged transaction against canonical role/lifecycle changes.

    Call before receipts, catalogue locks or resource-row locks. Read admission
    alone is not a write fence; revalidate after acquiring the revision lock.
    """
    from app.core.tenant_context import TenantContextGuard
    from app.modules.rbac.services.access_foundation import lock_revision
    await platform_permission_authority(db, user_id, action)
    identity = User.__table__.c
    owner = await db.scalar(select(identity.organization_id).where(identity.id == user_id))
    if owner is None:
        raise HTTPException(403, detail={"code": "PLATFORM_PERMISSION_DENIED"})
    async with TenantContextGuard.scoped(db, owner):
        await lock_revision(db, owner, write=False)
    await platform_permission_authority(db, user_id, action)
    current = await db.scalar(select(identity.organization_id).where(identity.id == user_id))
    if current != owner:
        raise HTTPException(403, detail={"code": "PLATFORM_PERMISSION_DENIED"})
    return owner


async def platform_team_authority(db, user_id, action: str) -> frozenset[str]:
    if action not in {"platform:teams:view", "platform:teams:manage", "platform:teams:grant"}:
        raise ValueError("Unknown platform team permission")
    await platform_permission_authority(db, user_id, action)
    return OPERATIONAL_ACTIONS if action == "platform:teams:grant" else frozenset()


def require_platform_permission(action: str):
    if action not in PLATFORM_ACTIONS:
        raise ValueError("Unknown platform permission")
    async def admission(request: Request, response: Response, token: TokenDep, user: User = Depends(require_active_user), db=Depends(get_db)):
        from app.modules.rbac.routers.access_foundation import browser_context_audience
        await browser_context_audience(token)
        response.headers["Cache-Control"] = "no-store"
        await platform_permission_authority(db, user.id, action)
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            from app.dependencies import require_step_up
            await require_step_up(token)
        return user
    return admission


def require_platform_team_permission(action: str):
    if action not in {"platform:teams:view", "platform:teams:manage", "platform:teams:grant"}:
        raise ValueError("Unknown platform team permission")
    return require_platform_permission(action)


platform_team_reader = require_platform_team_permission("platform:teams:view")
platform_team_manager = require_platform_team_permission("platform:teams:manage")
platform_organization_reader = require_platform_permission("platform:organizations:view")
platform_organization_manager = require_platform_permission("platform:organizations:manage")
platform_organization_provisioner = require_platform_permission("platform:organizations:provision")
platform_member_reader = require_platform_permission("platform:members:view")
platform_member_manager = require_platform_permission("platform:members:manage")
platform_member_grantor = require_platform_permission("platform:members:grant")
