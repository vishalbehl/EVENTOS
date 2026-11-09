"""Live delegated authority, never inferred from an EMC commercial link."""
from contextlib import asynccontextmanager
from dataclasses import dataclass
import uuid

from fastapi import HTTPException
from sqlalchemy import select, and_, or_

from app.core.tenant_context import TenantContextGuard
from app.modules.events.models.event import Event
from app.modules.platform.models.organization import Organization
from app.modules.identity.models.user import User
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.rbac.models.access_foundation import ClientRelationship, ClientDelegation, OperationalWorkspace
from app.modules.rbac.models.rbac import Permission, ScopedPermission, UserAccessNode
from app.modules.rbac.schemas.client_relationships import DELEGATABLE_ACTIONS
from app.modules.rbac.services.access_contexts import verify_direct_context
from app.modules.rbac.services.access_foundation import accepted_member
from app.modules.rbac.services.client_relationships import party_locks
from app.modules.rbac.services.permission_service import get_user_permissions


@dataclass(frozen=True, slots=True)
class DelegatedRequestContext:
    actor_id: uuid.UUID
    acting_organization_id: uuid.UUID
    organization_id: uuid.UUID
    workspace_id: uuid.UUID
    event_id: uuid.UUID | None
    relationship_id: uuid.UUID
    actions: frozenset[str]
    policy_revisions: tuple[int, int, int]


def concealed():
    raise HTTPException(404, detail={"code": "CONTEXT_NOT_FOUND"})


@asynccontextmanager
async def delegated_request_context(db, user, *, emc_organization_id, client_organization_id,
    relationship_id, workspace_id, event_id=None, action=None,
    selector_prevalidated=False):
    """Hold shared revision locks through the caller's read or privileged write.

    Revocation commands acquire the same rows exclusively. No cached allow,
    signed selector or old relationship object substitutes for the fresh query.
    Callers must commit protected writes inside this context, before releasing
    locks; jobs must invoke it again before publishing their results.
    """
    if not selector_prevalidated:
        await verify_direct_context(db, user, emc_organization_id)
        async with TenantContextGuard.scoped(db, emc_organization_id):
            proof = await db.scalar(select(ClientRelationship.id).where(ClientRelationship.id == relationship_id,
                ClientRelationship.emc_organization_id == emc_organization_id,
                ClientRelationship.client_organization_id == client_organization_id,
                ClientRelationship.status == "ACTIVE", ClientRelationship.approved_at.is_not(None)))
            if proof is None:
                concealed()
    async with party_locks(db, (emc_organization_id, client_organization_id), write=False) as revisions:
        async with TenantContextGuard.scoped(db, emc_organization_id):
            admission = (await db.execute(
                select(OrganizationMember, ClientRelationship)
                .join(User, User.id == OrganizationMember.user_id)
                .join(Organization, Organization.id == OrganizationMember.organization_id)
                .join(ClientRelationship, and_(
                    ClientRelationship.id == relationship_id,
                    ClientRelationship.emc_organization_id == OrganizationMember.organization_id,
                    ClientRelationship.client_organization_id == client_organization_id,
                ))
                .where(
                    OrganizationMember.user_id == user.id,
                    OrganizationMember.organization_id == emc_organization_id,
                    OrganizationMember.is_active.is_(True),
                    OrganizationMember.accepted_at.is_not(None),
                    User.is_active.is_(True),
                    User.deleted_at.is_(None),
                    Organization.organization_kind == "EMC",
                    Organization.is_active.is_(True),
                    Organization.suspended_at.is_(None),
                    Organization.is_platform_org.is_(False),
                    ClientRelationship.status == "ACTIVE",
                    ClientRelationship.approved_at.is_not(None),
                )
                .execution_options(populate_existing=True)
            )).first()
            if admission is None:
                concealed()
            member, relationship = admission
            grant_scope = ClientDelegation.event_id.is_(None)
            if event_id is not None:
                grant_scope = or_(grant_scope, ClientDelegation.event_id == event_id)
            rows = (await db.scalars(select(ClientDelegation.actions).where(
                ClientDelegation.relationship_id == relationship_id, ClientDelegation.emc_organization_id == emc_organization_id,
                ClientDelegation.client_organization_id == client_organization_id, ClientDelegation.member_id == member.id,
                ClientDelegation.workspace_id == workspace_id, grant_scope).limit(101))).all()
            if not rows or len(rows) > 100:
                concealed()
            if any(not isinstance(value, list) or not value or len(value) > 32 or
                   any(not isinstance(code, str) or code not in DELEGATABLE_ACTIONS for code in value) for value in rows):
                raise HTTPException(503, detail={"code": "ACCESS_RECONCILIATION_REQUIRED"})
            requester = (member if relationship.requested_by == user.id else
                await accepted_member(db, relationship.requested_by, emc_organization_id))
            if requester.org_role not in {"owner", "admin"}:
                concealed()
            staff_actions = set(await get_user_permissions(db, user.id, organization_id=emc_organization_id))
            proposer_actions = (staff_actions if requester.user_id == user.id else
                set(await get_user_permissions(db, requester.user_id, organization_id=emc_organization_id)))
            granted = frozenset(code for value in rows for code in value) & proposer_actions & staff_actions
        async with TenantContextGuard.scoped(db, client_organization_id):
            client_scope = select(Organization.id, OperationalWorkspace.id).join(
                OperationalWorkspace,
                and_(
                    OperationalWorkspace.id == workspace_id,
                    OperationalWorkspace.organization_id == Organization.id,
                    OperationalWorkspace.status == "ACTIVE",
                ),
            ).where(
                Organization.id == client_organization_id,
                Organization.organization_kind == "CLIENT",
                Organization.is_active.is_(True),
                Organization.suspended_at.is_(None),
                Organization.is_platform_org.is_(False),
            )
            if event_id is not None:
                client_scope = client_scope.join(
                    Event,
                    and_(
                        Event.id == event_id,
                        Event.organization_id == Organization.id,
                        Event.operational_workspace_id == OperationalWorkspace.id,
                        Event.deleted_at.is_(None),
                    ),
                )
            if (await db.execute(client_scope.limit(1))).first() is None:
                concealed()
            scope = or_(and_(ScopedPermission.scope_type == "ORGANIZATION", ScopedPermission.scope_id == client_organization_id),
                        and_(ScopedPermission.scope_type == "WORKSPACE", ScopedPermission.scope_id == workspace_id))
            nodes = or_(and_(UserAccessNode.node_type == "ORGANIZATION", UserAccessNode.node_id == client_organization_id),
                        and_(UserAccessNode.node_type == "WORKSPACE", UserAccessNode.node_id == workspace_id))
            if event_id is not None:
                scope = or_(scope, and_(ScopedPermission.scope_type == "EVENT", ScopedPermission.scope_id == event_id))
                nodes = or_(nodes, and_(UserAccessNode.node_type == "EVENT", UserAccessNode.node_id == event_id))
            denied = set((await db.scalars(select(Permission.code).join(ScopedPermission,
                ScopedPermission.permission_id == Permission.id).where(ScopedPermission.user_id == user.id,
                    ScopedPermission.is_allowed.is_(False), scope))).all())
            node_values = (await db.scalars(select(UserAccessNode.permissions).where(UserAccessNode.user_id == user.id, nodes))).all()
            for values in node_values:
                if not isinstance(values, dict) or any(not isinstance(value, bool) for value in values.values()):
                    raise HTTPException(503, detail={"code": "ACCESS_RECONCILIATION_REQUIRED"})
                denied.update(code for code, allow in values.items() if not allow)
            actions = frozenset(granted - denied)
            if action is not None and action not in actions:
                raise HTTPException(403, detail={"code": "PERMISSION_DENIED"})
            yield DelegatedRequestContext(user.id, emc_organization_id, client_organization_id, workspace_id,
                event_id, relationship_id, actions, (revisions[emc_organization_id].revision,
                    revisions[client_organization_id].revision, relationship.policy_revision))
