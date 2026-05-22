import uuid
from typing import List, Set, Optional
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.rbac.models.rbac import Role, Permission, RolePermission, UserRoleAssignment, ScopedPermission, UserAccessNode, RoleInheritanceMap
from app.modules.auth.models.user import User

async def get_user_permissions(
    db: AsyncSession, 
    user_id: uuid.UUID, 
    event_id: Optional[uuid.UUID] = None
) -> List[str]:
    """
    Resolves the full set of permission codes for a user in a given context.
    
    Resolution Logic:
    1. Global Roles: Get all roles assigned to user without an event_id.
    2. Event Roles: Get all roles assigned to user for the specific event_id.
    3. Inherited Roles: Expand the role set by traversing the RoleInheritanceMap.
    4. Permission codes: Fetch all codes from Permissions linked to these roles.
    5. Scoped Permissions: Add/Remove permissions explicitly granted for this scope.
    6. Access Nodes: Incorporate permissions defined in UserAccessNode (JSONB).
    """
    
    # 1. Fetch assigned roles (Global + Event-specific)
    user_res = await db.execute(select(User.role).where(User.id == user_id))
    user_system_role = user_res.scalar_one_or_none()

    # ── Super Admin Bypass ─────────────────────────────────────
    if user_system_role == "super_admin":
        return ["*"]

    role_stmt = select(UserRoleAssignment.role_id).where(UserRoleAssignment.user_id == user_id)
    if event_id:
        role_stmt = role_stmt.where(
            or_(
                UserRoleAssignment.event_id == event_id,
                UserRoleAssignment.event_id == None
            )
        )
    else:
        role_stmt = role_stmt.where(UserRoleAssignment.event_id == None)
        
    res = await db.execute(role_stmt)
    role_ids = set(res.scalars().all())
    
    if not role_ids and user_system_role:
        # Match system role name to Role model
        system_role_res = await db.execute(select(Role.id).where(Role.name == user_system_role))
        system_role_id = system_role_res.scalar_one_or_none()
        if system_role_id:
            role_ids.add(system_role_id)
        
        # If still no roles and they are 'organiser' or 'admin', provide basic defaults
        # to prevent complete lockout during migration
        if not role_ids and user_system_role in ["admin", "organiser"]:
            return [
                "EVENTS:VIEW", "EVENTS:EDIT", "SESSIONS:VIEW", "SPEAKERS:VIEW", "FILES:VIEW", 
                "ROOMS:MANAGE", "FILES:APPROVE", "FILES:REJECT", "FILES:DOWNLOAD",
                "ANALYTICS:VIEW", "POSTERS:VIEW", "USERS:VIEW", "SETTINGS:EDIT"
            ]

    # 2. Expand Inherited Roles
    expanded_roles = set(role_ids)
    to_process = list(role_ids)
    while to_process:
        current_id = to_process.pop()
        inherit_stmt = select(RoleInheritanceMap.child_role_id).where(RoleInheritanceMap.parent_role_id == current_id)
        i_res = await db.execute(inherit_stmt)
        children = i_res.scalars().all()
        for child_id in children:
            if child_id not in expanded_roles:
                expanded_roles.add(child_id)
                to_process.append(child_id)

    # 3. Get Permission Codes from Roles
    perm_codes: Set[str] = set()
    if expanded_roles:
        perm_stmt = (
            select(Permission.code)
            .join(RolePermission)
            .where(RolePermission.role_id.in_(list(expanded_roles)))
        )
        p_res = await db.execute(perm_stmt)
        perm_codes.update(p_res.scalars().all())

    # 4. Scoped Permissions (Explicit Overrides)
    if event_id:
        scoped_stmt = (
            select(Permission.code, ScopedPermission.is_allowed)
            .join(Permission)
            .where(
                ScopedPermission.user_id == user_id,
                ScopedPermission.scope_type == 'EVENT',
                ScopedPermission.scope_id == event_id
            )
        )
        s_res = await db.execute(scoped_stmt)
        for code, allowed in s_res.all():
            if allowed:
                perm_codes.add(code)
            else:
                perm_codes.discard(code)

    # 5. Access Nodes (JSONB overrides)
    node_stmt = select(UserAccessNode.permissions).where(
        UserAccessNode.user_id == user_id
    )
    if event_id:
        node_stmt = node_stmt.where(
            or_(
                and_(UserAccessNode.node_type == 'EVENT', UserAccessNode.node_id == event_id),
                # Add checks for rooms/sessions in event if needed, but start simple
            )
        )
    
    n_res = await db.execute(node_stmt)
    for node_perms in n_res.scalars().all():
        # Expecting dict like {"FILES:APPROVE": True, "EVENTS:VIEW": False}
        for code, allowed in node_perms.items():
            if allowed:
                perm_codes.add(code)
            else:
                perm_codes.discard(code)

    return sorted(list(perm_codes))
