"""Customer permissions resolved from accepted, tenant-scoped authority only."""
from __future__ import annotations

import uuid
from typing import Optional
from sqlalchemy import and_, or_, select, literal
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import tenant_org_id
from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.rbac.models.rbac import Permission, Role, RolePermission, UserRoleAssignment, ScopedPermission, UserAccessNode, RoleInheritanceMap
from app.modules.rbac.models.access_foundation import OperationalWorkspace, WorkspaceRoleBinding
from app.modules.rbac.services.permission_catalogue import canonical_action, organization_defaults, WORKSPACE_ROLES, OPERATIONAL_ACTIONS


def resolve_overrides(grants: set[str], overrides: list[tuple[str, bool]]) -> set[str]:
    """Denials win independently of query/row order."""
    def _norm(c: str) -> str | None:
        if c == "*":
            return None
        can = canonical_action(c)
        return can if can is not None else c

    grants = {c for code in grants if (c := _norm(code)) is not None}
    allowed = {c for code, value in overrides if value and (c := _norm(code)) is not None}
    denied = {c for code, value in overrides if not value and (c := _norm(code)) is not None}
    return (grants | allowed) - denied


async def get_user_permissions(db: AsyncSession, user_id: uuid.UUID, event_id: Optional[uuid.UUID] = None,
                               organization_id: Optional[uuid.UUID] = None,
                               workspace_id: Optional[uuid.UUID] = None) -> list[str]:
    org = organization_id or tenant_org_id.get()
    if org is None:
        # Missing request context is not repaired from an identity's home tenant.
        return []
    active = await db.scalar(select(Organization.organization_kind).where(Organization.id == org,
        Organization.is_active.is_(True), Organization.suspended_at.is_(None), Organization.is_platform_org.is_(False)))
    if active is None:
        return []
    # A global role label, an unaccepted invite and an old JWT cannot substitute
    # for live membership. Missing legacy proof is a reconciliation failure.
    member = await db.scalar(select(OrganizationMember).where(
        OrganizationMember.user_id == user_id, OrganizationMember.organization_id == org,
        OrganizationMember.is_active.is_(True), OrganizationMember.accepted_at.is_not(None),
    ).execution_options(populate_existing=True))
    if member is None:
        return []
    identity = User.__table__
    if await db.scalar(select(identity.c.id).where(identity.c.id == user_id,
            identity.c.is_active.is_(True), identity.c.deleted_at.is_(None))) is None:
        return []
    if event_id is not None:
        from app.modules.rbac.services.event_scope import visible_event_predicate
        owned = (await db.execute(select(Event.id, Event.operational_workspace_id).where(Event.id == event_id,
            visible_event_predicate(user_id, org), Event.deleted_at.is_(None)))
        ).first()
        if owned is None or (workspace_id is not None and owned.operational_workspace_id != workspace_id):
            return []
        workspace_id = owned.operational_workspace_id
    workspace_grants = frozenset()
    if workspace_id is not None:
        workspace = await db.scalar(select(OperationalWorkspace.id).where(
            OperationalWorkspace.id == workspace_id, OperationalWorkspace.organization_id == org,
            OperationalWorkspace.status == "ACTIVE"))
        if workspace is None:
            return []
        binding = await db.scalar(select(WorkspaceRoleBinding.role).where(
            WorkspaceRoleBinding.organization_id == org, WorkspaceRoleBinding.workspace_id == workspace_id,
            WorkspaceRoleBinding.member_id == member.id, WorkspaceRoleBinding.is_active.is_(True)))
        workspace_grants = WORKSPACE_ROLES.get(binding, frozenset())

    role, assignment, inheritance = Role.__table__.c, UserRoleAssignment.__table__.c, RoleInheritanceMap.__table__.c
    context = assignment.event_id.is_(None)
    if event_id is not None:
        context = or_(context, assignment.event_id == event_id)
    explicit_org = assignment.organization_id == org
    if event_id is not None:
        # Legacy null-org event assignments are admissible only after proving
        # the requested event belongs to this accepted member's organisation.
        explicit_org = or_(explicit_org, and_(assignment.organization_id.is_(None), assignment.event_id == event_id))
    # Core projections allow explicitly validated global system templates without
    # disabling the ORM tenant filter for a customer query.
    roots = select(role.id, assignment.event_id.is_not(None).label("event_scoped")).select_from(Role.__table__.join(UserRoleAssignment.__table__, assignment.role_id == role.id)).where(
        assignment.user_id == user_id, assignment.revoked_at.is_(None), explicit_org, context,
        role.deleted_at.is_(None), or_(role.organization_id == org, and_(role.organization_id.is_(None), role.is_system_role.is_(True))),
    ).cte("scoped_roles", recursive=True)
    inherited = select(role.id, roots.c.event_scoped).select_from(Role.__table__.join(RoleInheritanceMap.__table__, inheritance.parent_role_id == role.id).join(
        roots, roots.c.id == inheritance.child_role_id
    )).where(role.deleted_at.is_(None), or_(role.organization_id == org, and_(role.organization_id.is_(None), role.is_system_role.is_(True))))
    # UNION (not UNION ALL) deduplicates and terminates even on legacy cycles;
    # no one-query-per-role traversal or unbounded recursion in Python.
    roles = roots.union(inherited)
    grants = set((await db.scalars(select(Permission.code).join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(roles, roles.c.id == RolePermission.role_id)
        .where(or_(roles.c.event_scoped == literal(False), Permission.code.in_(OPERATIONAL_ACTIONS))))).all())
    org_defaults = organization_defaults(member.org_role, active)
    if event_id is not None:
        grants = {g for g in grants if g in OPERATIONAL_ACTIONS}
        grants.update(g for g in org_defaults if g in OPERATIONAL_ACTIONS)
        # A verified workspace binding inherits only operational actions into
        # events owned by that workspace, never organisation administration.
        grants.update(g for g in workspace_grants if g in OPERATIONAL_ACTIONS)
    else:
        grants.update(org_defaults)
        grants.update(workspace_grants)

    scope = and_(ScopedPermission.scope_type == "ORGANIZATION", ScopedPermission.scope_id == org)
    nodes = and_(UserAccessNode.node_type == "ORGANIZATION", UserAccessNode.node_id == org)
    if workspace_id is not None:
        scope = or_(scope, and_(ScopedPermission.scope_type == "WORKSPACE", ScopedPermission.scope_id == workspace_id))
        nodes = or_(nodes, and_(UserAccessNode.node_type == "WORKSPACE", UserAccessNode.node_id == workspace_id))
    if event_id is not None:
        scope = or_(scope, and_(ScopedPermission.scope_type == "EVENT", ScopedPermission.scope_id == event_id))
        nodes = or_(nodes, and_(UserAccessNode.node_type == "EVENT", UserAccessNode.node_id == event_id))
    override_rows = (await db.execute(select(Permission.code, ScopedPermission.is_allowed, ScopedPermission.scope_type).join(
        Permission, Permission.id == ScopedPermission.permission_id).where(ScopedPermission.user_id == user_id, scope))).all()
    overrides = [(code, allowed) for code, allowed, scope_type in override_rows
                 if not allowed or scope_type == "ORGANIZATION" or canonical_action(code) in OPERATIONAL_ACTIONS]
    if event_id is not None:
        from fastapi import HTTPException
        from app.modules.rbac.models.user_assignment import UserEventAssignment
        event_values = await db.scalar(select(UserEventAssignment.permissions).where(
            UserEventAssignment.user_id == user_id, UserEventAssignment.event_id == event_id))
        if event_values is not None:
            if (not isinstance(event_values, dict) or len(event_values) > 32
                    or any(code not in OPERATIONAL_ACTIONS or type(value) is not bool for code, value in event_values.items())):
                raise HTTPException(503, detail={"code": "EVENT_ACCESS_RECONCILIATION_REQUIRED"})
            overrides.extend(event_values.items())
    if event_id is not None:
        from app.modules.rbac.services.team_access import team_event_overrides
        overrides.extend(await team_event_overrides(db, member.id, org, event_id))
    node_rows = (await db.execute(select(UserAccessNode.permissions, UserAccessNode.node_type).where(UserAccessNode.user_id == user_id, nodes))).all()
    for values, node_type in node_rows:
        if not isinstance(values, dict) or any(not isinstance(value, bool) for value in values.values()):
            return []  # malformed access configuration cannot manufacture allows
        overrides.extend((code, allowed) for code, allowed in values.items()
                         if not allowed or node_type == "ORGANIZATION" or canonical_action(code) in OPERATIONAL_ACTIONS)
    return sorted(resolve_overrides(grants, overrides))
