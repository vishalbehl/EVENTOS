import uuid
import uuid
from typing import List, Set, Optional, Dict, Any
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.rbac.models.rbac import (
    Role, Permission, RolePermission, UserRoleAssignment, 
    ScopedPermission, RoleInheritanceMap, UserAccessNode
)
from app.modules.auth.models.user import User

class RBACService:
    @staticmethod
    async def get_user_permissions(
        db: AsyncSession, 
        user_id: uuid.UUID, 
        organization_id: Optional[uuid.UUID] = None,
        event_id: Optional[uuid.UUID] = None
    ) -> Set[str]:
        """
        Calculates the effective permissions for a user within a specific scope.
        Handles role assignments, inheritance, and direct scoped permissions.
        """
        # 1. Get all roles assigned to the user in this scope
        # (Include global roles if organization_id is None)
        assignment_query = select(UserRoleAssignment).options(
            selectinload(UserRoleAssignment.role).selectinload(Role.permissions).selectinload(RolePermission.permission)
        ).where(
            and_(
                UserRoleAssignment.user_id == user_id,
                or_(
                    UserRoleAssignment.organization_id == organization_id,
                    UserRoleAssignment.organization_id == None
                ),
                or_(
                    UserRoleAssignment.event_id == event_id,
                    UserRoleAssignment.event_id == None
                )
            )
        )
        assignments = (await db.execute(assignment_query)).scalars().all()
        
        effective_roles = {asgn.role for asgn in assignments}
        
        # 2. Handle Inheritance (Simple one-level for now, can be recursive)
        # In a real system, we'd use a recursive CTE or a pre-computed closure table.
        all_role_ids = {role.id for role in effective_roles}
        inheritance_query = select(RoleInheritanceMap).where(RoleInheritanceMap.child_role_id.in_(list(all_role_ids)))
        inheritances = (await db.execute(inheritance_query)).scalars().all()
        
        # Add parent roles to effective roles
        parent_role_ids = {inh.parent_role_id for inh in inheritances}
        if parent_role_ids:
            parents = (await db.execute(
                select(Role)
                .options(selectinload(Role.permissions).selectinload(RolePermission.permission))
                .where(Role.id.in_(list(parent_role_ids)))
            )).scalars().all()
            effective_roles.update(parents)

        # 3. Collect permissions from all effective roles
        permissions = set()
        for role in effective_roles:
            for rp in role.permissions:
                permissions.add(rp.permission.code)

        # 4. Apply Direct Scoped Permissions (Can override roles)
        scoped_query = select(ScopedPermission).options(selectinload(ScopedPermission.permission)).where(
            and_(
                ScopedPermission.user_id == user_id,
                ScopedPermission.scope_id.in_([organization_id, event_id])
            )
        )
        scoped = (await db.execute(scoped_query)).scalars().all()
        for sp in scoped:
            if sp.is_allowed:
                permissions.add(sp.permission.code)
            else:
                permissions.discard(sp.permission.code)

        # 5. Check UserAccessNode assignments (Hierarchical)
        # If a user has ANY assignment within the event, they should be able to view the event and relevant sections.
        access_node_query = select(UserAccessNode).where(UserAccessNode.user_id == user_id)
        
        if event_id:
            # Check for direct event assignment OR child node assignments (Room/Session)
            from app.modules.venue.models.room import Room
            from app.modules.speakers.models.session import Session

            room_subquery = select(Room.id).where(Room.event_id == event_id)
            session_subquery = select(Session.id).where(Session.event_id == event_id)

            access_node_query = access_node_query.where(
                or_(
                    and_(UserAccessNode.node_id == event_id, UserAccessNode.node_type == 'EVENT'),
                    and_(UserAccessNode.node_id.in_(room_subquery), UserAccessNode.node_type == 'ROOM'),
                    and_(UserAccessNode.node_id.in_(session_subquery), UserAccessNode.node_type == 'SESSION')
                )
            )
        
        access_nodes = (await db.execute(access_node_query)).scalars().all()
        if access_nodes:
            permissions.add("EVENTS:VIEW") 
            # Grant base VIEW permissions based on what they are assigned to
            # (Routers will perform granular filtering)
            for node in access_nodes:
                if node.node_type == 'ROOM':
                    permissions.add("ROOMS:VIEW")
                    permissions.add("SESSIONS:VIEW")
                    permissions.add("SPEAKERS:VIEW")
                    permissions.add("POSTERS:VIEW")
                    permissions.add("FILES:VIEW")
                elif node.node_type == 'SESSION':
                    permissions.add("SESSIONS:VIEW")
                    permissions.add("SPEAKERS:VIEW")
                    permissions.add("POSTERS:VIEW")
                    permissions.add("FILES:VIEW")
                elif node.node_type == 'EVENT':
                    permissions.add("ROOMS:VIEW")
                    permissions.add("SESSIONS:VIEW")
                    permissions.add("SPEAKERS:VIEW")
                    permissions.add("POSTERS:VIEW")
                    permissions.add("FILES:VIEW")

        # 6. Check Legacy UserEventAssignment
        # Only count as legacy event-wide if it doesn't have a granular node type
        from app.modules.rbac.models.user_assignment import UserEventAssignment
        legacy_query = select(UserEventAssignment).where(
            UserEventAssignment.user_id == user_id,
            or_(
                ~UserEventAssignment.permissions.has_key('node_type'),
                UserEventAssignment.permissions['node_type'].astext == 'event'
            )
        )
        if event_id:
            legacy_query = legacy_query.where(UserEventAssignment.event_id == event_id)
        
        legacy_assignments = (await db.execute(legacy_query)).scalars().all()
        if legacy_assignments:
            permissions.add("EVENTS:VIEW")
            permissions.add("ROOMS:VIEW")
            permissions.add("SESSIONS:VIEW")
            permissions.add("SPEAKERS:VIEW")
            permissions.add("POSTERS:VIEW")
            permissions.add("FILES:VIEW")

        return permissions

    @staticmethod
    async def validate_access(
        db: AsyncSession,
        user_id: uuid.UUID,
        required_permission: str,
        scope_id: Optional[uuid.UUID] = None
    ) -> bool:
        # Optimization: Super admins and Admins bypass everything
        user = await db.get(User, user_id)
        if user and user.role in ['super_admin', 'admin']:
            return True
            
        perms = await RBACService.get_user_permissions(db, user_id, event_id=scope_id)
        return required_permission in perms or "ADMIN:GLOBAL" in perms
