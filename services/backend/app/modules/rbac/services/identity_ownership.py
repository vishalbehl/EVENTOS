"""Narrow platform ownership check; caller must hold the target identity row lock."""
from fastapi import HTTPException
from sqlalchemy import select
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.rbac.services.access_contexts import discovery_identity
from app.modules.rbac.services.platform_permissions import platform_permission_authority


async def require_transferred_ownership_before_deactivation(db, actor, target):
    await platform_permission_authority(db, actor.id, "platform:administration:manage")
    # Explicit platform inspection of a resolved identity, never a customer
    # context switch or a claim that the operator is that customer's member.
    async with discovery_identity(db, target.id):
        table = OrganizationMember.__table__.c
        owner = await db.scalar(select(table.id).where(table.user_id == target.id,
            table.org_role == "owner", table.is_active.is_(True), table.accepted_at.is_not(None)).limit(1))
    if owner is not None:
        raise HTTPException(409, detail={"code": "OWNERSHIP_TRANSFER_REQUIRED",
            "message": "Transfer the user's accepted organisation ownership before disabling their identity."})
