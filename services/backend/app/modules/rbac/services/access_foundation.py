"""Scoped operational workspace services. No global-role or billing-type grants."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models.audit_log import AuditLog
from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.rbac.models.access_foundation import OperationalWorkspace, WorkspaceRoleBinding, OrganizationAccessRevision


WORKSPACE_ROLES = {
    "owner": frozenset({"workspace:view", "workspace:create", "workspace:edit", "workspace:archive", "members:manage", "relationships:manage", "clients:provision"}),
    "admin": frozenset({"workspace:view", "workspace:create", "workspace:edit", "workspace:archive", "members:manage", "relationships:manage"}),
    "member": frozenset({"workspace:view"}),
    "billing_only": frozenset(),
    "viewer": frozenset({"workspace:view"}),
}


def member_actions(role: str) -> frozenset[str]:
    return WORKSPACE_ROLES.get(role, frozenset())


def check_version(actual: int, expected: int) -> None:
    if actual != expected:
        raise HTTPException(412, detail={"code": "STALE_VERSION", "message": "This record changed. Reload before saving."})


async def accepted_member(db: AsyncSession, user_id: uuid.UUID, organization_id: uuid.UUID) -> OrganizationMember:
    member = await db.scalar(select(OrganizationMember).where(
        OrganizationMember.user_id == user_id,
        OrganizationMember.organization_id == organization_id,
        OrganizationMember.is_active.is_(True),
        OrganizationMember.accepted_at.is_not(None),
    ).execution_options(populate_existing=True))
    if member is None:
        raise HTTPException(404, detail={"code": "CONTEXT_NOT_FOUND"})
    organization = await db.scalar(select(Organization).where(Organization.id == organization_id).execution_options(populate_existing=True))
    if organization is None or not organization.is_active or organization.suspended_at is not None:
        raise HTTPException(403, detail={"code": "ORGANIZATION_SUSPENDED"})
    return member


async def lock_revision(db: AsyncSession, organization_id: uuid.UUID, *, write: bool) -> OrganizationAccessRevision:
    row = await db.scalar(select(OrganizationAccessRevision).where(
        OrganizationAccessRevision.organization_id == organization_id
    ).with_for_update(read=not write).execution_options(populate_existing=True))
    if row is None:
        # Missing backfill is not repaired implicitly by a read or permission check.
        raise HTTPException(503, detail={"code": "ACCESS_RECONCILIATION_REQUIRED"})
    return row


def audit(db, user, organization_id, action, resource_id, state):
    db.add(AuditLog(organization_id=organization_id, actor_user_id=user.id,
        correlation_id=uuid.uuid4(), is_sensitive=True,
        actor_role=user.role, resource_type="operational_workspace", resource_id=resource_id,
        action_type=action, new_state={**state, "acting_organization_id": str(organization_id),
            "target_organization_id": str(organization_id), "workspace_id": str(resource_id)},
        occurred_at=datetime.now(timezone.utc)))


async def list_workspaces(db: AsyncSession, user: User, organization_id: uuid.UUID, after: uuid.UUID | None, limit: int):
    if not 1 <= limit <= 100:
        raise HTTPException(422, detail={"code": "INVALID_PAGE_SIZE"})
    member = await accepted_member(db, user.id, organization_id)
    from app.modules.rbac.services.permission_service import get_user_permissions
    if "workspace:view" not in await get_user_permissions(db, user.id, organization_id=organization_id):
        raise HTTPException(403, detail={"code": "PERMISSION_DENIED"})
    query = select(OperationalWorkspace).where(OperationalWorkspace.organization_id == organization_id)
    if member.org_role not in {"owner", "admin"}:
        query = query.join(WorkspaceRoleBinding, WorkspaceRoleBinding.workspace_id == OperationalWorkspace.id).where(
            WorkspaceRoleBinding.organization_id == organization_id, WorkspaceRoleBinding.member_id == member.id,
            WorkspaceRoleBinding.is_active.is_(True))
    if after:
        query = query.where(OperationalWorkspace.id > after)
    rows = (await db.scalars(query.order_by(OperationalWorkspace.id).limit(limit + 1))).all()
    return rows[:limit], str(rows[limit - 1].id) if len(rows) > limit else None


async def mutate_workspace(db, user, organization_id, *, name=None, workspace_id=None, status=None, expected=None, reason=""):
    revision = await lock_revision(db, organization_id, write=True)
    member = await accepted_member(db, user.id, organization_id)
    action = "workspace:create" if workspace_id is None else ("workspace:archive" if status == "ARCHIVED" else "workspace:edit")
    from app.modules.rbac.services.permission_service import get_user_permissions
    if action not in await get_user_permissions(db, user.id, organization_id=organization_id):
        raise HTTPException(403, detail={"code": "PERMISSION_DENIED"})
    if workspace_id is None:
        row = OperationalWorkspace(organization_id=organization_id, name=name)
        db.add(row)
        await db.flush()
    else:
        row = await db.scalar(select(OperationalWorkspace).where(
            OperationalWorkspace.id == workspace_id, OperationalWorkspace.organization_id == organization_id
        ).with_for_update())
        if row is None:
            raise HTTPException(404, detail={"code": "WORKSPACE_NOT_FOUND"})
        check_version(row.version, expected)
        if status == "ARCHIVED":
            if row.is_default:
                raise HTTPException(409, detail={"code": "DEFAULT_WORKSPACE_CANNOT_BE_ARCHIVED"})
            active_event = await db.scalar(select(Event.id).where(
                Event.organization_id == organization_id, Event.operational_workspace_id == row.id,
                Event.deleted_at.is_(None),
            ).limit(1))
            if active_event:
                raise HTTPException(409, detail={"code": "WORKSPACE_HAS_EVENTS"})
            row.status = status
        if name is not None:
            row.name = name
        row.version += 1
    revision.revision += 1
    audit(db, user, organization_id, "OPERATIONAL_WORKSPACE_CHANGED", row.id,
          {"name": row.name, "status": row.status, "version": row.version, "reason": reason})
    await db.flush()
    return row
