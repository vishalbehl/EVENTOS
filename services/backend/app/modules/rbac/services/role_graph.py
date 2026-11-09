"""Cycle-safe, tenant-bounded role graph operations; no query-per-parent traversal."""
from fastapi import HTTPException
from sqlalchemy import and_, delete, or_, select
from app.modules.rbac.models.rbac import Role, Permission, RolePermission, RoleInheritanceMap
from app.modules.rbac.services.permission_catalogue import canonical_action


def graph(db_role_id, organization_id):
    role, edge = Role.__table__.c, RoleInheritanceMap.__table__.c
    allowed = and_(role.deleted_at.is_(None), or_(role.organization_id == organization_id,
        and_(role.organization_id.is_(None), role.is_system_role.is_(True), role.name != "Super Admin")))
    roots = select(role.id).where(role.id == db_role_id, allowed).cte("bounded_role_graph", recursive=True)
    parents = select(role.id).select_from(Role.__table__.join(RoleInheritanceMap.__table__,
        edge.parent_role_id == role.id).join(roots, roots.c.id == edge.child_role_id)).where(allowed)
    return roots.union(parents)


async def effective_role_actions(db, role_id, organization_id):
    roles = graph(role_id, organization_id)
    codes = (await db.scalars(select(Permission.code).join(RolePermission,
        RolePermission.permission_id == Permission.id).where(RolePermission.role_id.in_(select(roles.c.id))))).all()
    actions = {canonical_action(code) for code in codes}
    if None in actions:
        raise HTTPException(503, detail={"code": "ROLE_POLICY_RECONCILIATION_REQUIRED"})
    return frozenset(actions)


async def replace_parents(db, organization_id, role_id, parent_ids):
    """Caller holds the organisation's exclusive policy revision lock.

    Parents must be local editable roles or immutable global templates. Global
    child mutation is never allowed. The same lock serializes competing edge
    edits, preventing two individually acyclic requests from forming a cycle.
    """
    if len(parent_ids) > 100 or len(set(parent_ids)) != len(parent_ids):
        raise HTTPException(422, detail={"code": "INVALID_ROLE_PARENTS"})
    child = await db.scalar(select(Role.id).where(Role.id == role_id,
        Role.organization_id == organization_id, Role.is_system_role.is_(False), Role.deleted_at.is_(None)))
    if child is None:
        raise HTTPException(404, detail={"code": "ROLE_NOT_FOUND"})
    role = Role.__table__.c
    found = set((await db.scalars(select(role.id).where(role.id.in_(parent_ids), role.deleted_at.is_(None),
        or_(role.organization_id == organization_id, and_(role.organization_id.is_(None), role.is_system_role.is_(True), role.name != "Super Admin"))))).all())
    if found != set(parent_ids):
        raise HTTPException(404, detail={"code": "ROLE_NOT_FOUND"})
    # One recursive query for the entire proposed parent frontier. UNION
    # terminates legacy cycles too; the new child must never be reachable.
    edge = RoleInheritanceMap.__table__.c
    reachable = select(role.id).where(role.id.in_(parent_ids)).cte("proposed_parent_graph", recursive=True)
    reachable = reachable.union(select(role.id).select_from(Role.__table__.join(RoleInheritanceMap.__table__,
        edge.parent_role_id == role.id).join(reachable, reachable.c.id == edge.child_role_id)).where(
            role.deleted_at.is_(None), or_(role.organization_id == organization_id,
                and_(role.organization_id.is_(None), role.is_system_role.is_(True), role.name != "Super Admin"))))
    if await db.scalar(select(reachable.c.id).where(reachable.c.id == role_id).limit(1)) is not None:
        raise HTTPException(409, detail={"code": "ROLE_INHERITANCE_CYCLE"})
    await db.execute(delete(RoleInheritanceMap).where(RoleInheritanceMap.child_role_id == role_id))
    db.add_all([RoleInheritanceMap(child_role_id=role_id, parent_role_id=parent_id) for parent_id in parent_ids])
