"""Commercial links do not create operational relationships or access."""
from contextlib import asynccontextmanager

from fastapi import HTTPException
from sqlalchemy import select

from app.core.tenant_context import TenantContextGuard
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.rbac.models.access_foundation import ClientRelationship
from app.modules.rbac.services.client_relationships import party_locks
from app.modules.rbac.services.permission_service import get_user_permissions
from app.modules.rbac.services.platform_permissions import platform_permission_authority


@asynccontextmanager
async def approved_attachment(db, emc_id, client_id, actor_id, auth_revision):
    if actor_id is None or type(auth_revision) is not int or auth_revision < 1:
        raise HTTPException(401, detail={"code": "CURRENT_SESSION_REQUIRED"})
    u = User.__table__.c
    actor_query = select(u.organization_id, u.auth_revision).where(u.id == actor_id,
        u.is_active.is_(True), u.deleted_at.is_(None))
    actor = (await db.execute(actor_query)).first()
    if actor is None or actor.auth_revision != auth_revision:
        raise HTTPException(401, detail={"code": "SESSION_REVOKED"})
    if emc_id == client_id:
        raise HTTPException(404, detail={"code": "RESOURCE_NOT_FOUND"})
    selector = db.info.get("customer_request_selector")
    if selector is not None:
        if (db.info.get("customer_request_identity") != actor_id or
                selector.access_mode != "DIRECT" or selector.active_organization_id != emc_id):
            raise HTTPException(404, detail={"code": "RESOURCE_NOT_FOUND"})
        from types import SimpleNamespace
        from app.modules.rbac.services.access_contexts import validate_request_selector
        await validate_request_selector(db, SimpleNamespace(id=actor_id,
            organization_id=actor.organization_id), selector)
    async def authority():
        async with TenantContextGuard.scoped(db, emc_id):
            actions = await get_user_permissions(db, actor_id, organization_id=emc_id,
                workspace_id=selector.active_workspace_id if selector is not None else None)
        if "billing:allocate" not in actions:
            # Customer authority is explicit membership, not identity home.
            # A platform caller must independently prove the finite action.
            await platform_permission_authority(db, actor_id, "platform:billing:manage")
    await authority()
    async with party_locks(db, (actor.organization_id, emc_id, client_id), write=False):
        current = (await db.execute(actor_query)).first()
        if current != actor:
            raise HTTPException(401, detail={"code": "SESSION_REVOKED"})
        await authority()
        async with TenantContextGuard.scoped(db, emc_id):
            emc = await db.scalar(select(Organization.id).where(Organization.id == emc_id,
                Organization.organization_kind == "EMC", Organization.is_active.is_(True),
                Organization.suspended_at.is_(None), Organization.is_platform_org.is_(False)))
            relationship = await db.scalar(select(ClientRelationship.id).where(
                ClientRelationship.emc_organization_id == emc_id, ClientRelationship.client_organization_id == client_id,
                ClientRelationship.status == "ACTIVE", ClientRelationship.approved_at.is_not(None),
                ClientRelationship.approved_by.is_not(None)))
        async with TenantContextGuard.scoped(db, client_id):
            client = await db.scalar(select(Organization.id).where(Organization.id == client_id,
                Organization.organization_kind == "CLIENT", Organization.is_active.is_(True),
                Organization.suspended_at.is_(None), Organization.is_platform_org.is_(False)))
        if not emc or not client or not relationship:
            raise HTTPException(404, detail={"code": "APPROVED_RELATIONSHIP_NOT_FOUND"})
        async with TenantContextGuard.scoped(db, emc_id):
            yield
