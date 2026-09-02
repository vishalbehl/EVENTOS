# app/modules/platform/permissions/service.py
import uuid
from typing import List, Set, Optional, Dict, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.platform.permissions.models import PlatformPermission, PlatformRolePermission
from app.modules.platform.departments.models import Department
from app.modules.platform.teams.models import Team
from app.modules.platform.permissions.repository import PermissionRepository
from app.modules.platform.permissions.constants import DEFAULT_PERMISSIONS
from app.modules.platform.roles.models import DepartmentRole, UserAssignment
from app.modules.audit.models.audit_log import AuditLog


class PermissionService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repository = PermissionRepository(db)

    async def seed_permissions(self) -> int:
        count = 0
        for p in DEFAULT_PERMISSIONS:
            existing = await self.repository.get_permission_by_code(p["code"])
            if not existing:
                await self.repository.create_permission(
                    code=p["code"],
                    name=p["name"],
                    module=p["module"],
                    description=p["description"]
                )
                count += 1
        if count > 0:
            await self.db.commit()
        return count

    async def list_permissions(self) -> List[PlatformPermission]:
        return await self.repository.get_all_permissions()

    async def get_role_permissions(self, role_id: uuid.UUID) -> List[str]:
        perms = await self.repository.get_permissions_for_role(role_id)
        return [p.code for p in perms]

    async def toggle_role_permission(
        self,
        org_id: uuid.UUID,
        actor_id: uuid.UUID,
        role_id: uuid.UUID,
        permission_id: uuid.UUID,
        reason: str,
    ) -> str:
        from fastapi import HTTPException

        role = await self.db.get(DepartmentRole, role_id)
        if not role or role.organization_id != org_id or role.deleted_at is not None:
            raise HTTPException(status_code=404, detail="Role not found.")

        perm = await self.repository.get_permission_by_id(permission_id)
        if not perm:
            raise HTTPException(status_code=404, detail="Permission not found.")

        existing = await self.repository.get_role_permission(role_id, permission_id)
        if existing:
            await self.repository.remove_role_permission(role_id, permission_id)
            action_type = "ROLE_PERMISSION_REMOVED"
            msg = "Permission removed from role"
        else:
            await self.repository.add_role_permission(role_id, permission_id)
            action_type = "ROLE_PERMISSION_ADDED"
            msg = "Permission added to role"
        self.db.add(AuditLog(
            organization_id=org_id,
            actor_user_id=actor_id,
            resource_type="platform_role_permission",
            resource_id=role_id,
            action_type=action_type,
            old_state={
                "role_id": str(role_id),
                "role_code": role.code,
                "permission_id": str(permission_id),
                "permission_code": perm.code,
                "was_assigned": bool(existing),
            },
            new_state={
                "role_id": str(role_id),
                "role_code": role.code,
                "permission_id": str(permission_id),
                "permission_code": perm.code,
                "is_assigned": not bool(existing),
            },
            change_diff={"reason": reason},
            is_sensitive=True,
        ))
        await self.db.commit()
        return msg

    # =====================================================================
    # ERP AUTHORIZATION CHECKING ENGINE
    # =====================================================================

    async def get_user_erp_context(self, user_id: uuid.UUID, org_id: uuid.UUID) -> List[Dict[str, Any]]:
        """
        Gathers all department/team assignments for a user in one read.

        The permission join replaces one permission query per assignment while
        retaining the same organization boundary and output contract.
        """
        stmt = (
            select(
                UserAssignment.id,
                UserAssignment.department_id,
                UserAssignment.team_id,
                Department.code.label("department_code"),
                Team.code.label("team_code"),
                DepartmentRole.id.label("role_id"),
                DepartmentRole.code.label("role_code"),
                DepartmentRole.access_level,
                PlatformPermission.code.label("permission_code"),
            )
            .join(Department, Department.id == UserAssignment.department_id)
            .outerjoin(Team, Team.id == UserAssignment.team_id)
            .join(DepartmentRole, DepartmentRole.id == UserAssignment.role_id)
            .outerjoin(
                PlatformRolePermission,
                PlatformRolePermission.role_id == DepartmentRole.id,
            )
            .outerjoin(
                PlatformPermission,
                PlatformPermission.id == PlatformRolePermission.permission_id,
            )
            .where(
                UserAssignment.user_id == user_id,
                UserAssignment.organization_id == org_id,
                UserAssignment.deleted_at.is_(None),
            )
            .order_by(
                UserAssignment.id,
                PlatformPermission.code,
            )
        )
        result = await self.db.execute(stmt)
        grouped: dict[uuid.UUID, dict[str, Any]] = {}
        for row in result:
            context = grouped.setdefault(
                row.id,
                {
                    "assignment_id": row.id,
                    "department_id": row.department_id,
                    "department_code": row.department_code,
                    "team_id": row.team_id,
                    "team_code": row.team_code,
                    "role_id": row.role_id,
                    "role_code": row.role_code,
                    "access_level": row.access_level,
                    "permissions": set(),
                },
            )
            if row.permission_code:
                context["permissions"].add(row.permission_code)
        user_context = list(grouped.values())
        return user_context

    async def check_user_permission(
        self,
        user_id: uuid.UUID,
        org_id: uuid.UUID,
        required_permission: str,
        resource_dept_id: Optional[uuid.UUID] = None,
        resource_team_id: Optional[uuid.UUID] = None,
        resource_owner_id: Optional[uuid.UUID] = None
    ) -> bool:
        """
        Evaluates whether a user can perform an action based on data access levels.
        """
        # Bypass for Super Admins
        from app.modules.identity.models.user import User
        user = await self.db.get(User, user_id)
        if user and user.role == "super_admin":
            return True

        user_context = await self.get_user_erp_context(user_id, org_id)

        for ctx in user_context:
            # 1. Check if the role grants the permission code
            if required_permission not in ctx["permissions"]:
                continue

            access_level = ctx["access_level"]

            # 2. Check access level constraints
            if access_level == "GLOBAL":
                return True

            elif access_level == "DEPARTMENT":
                # Matches if resource belongs to user's assigned department
                if resource_dept_id and ctx["department_id"] == resource_dept_id:
                    return True

            elif access_level == "TEAM":
                # Matches if resource belongs to user's assigned team
                if resource_team_id and ctx["team_id"] == resource_team_id:
                    return True

            elif access_level == "SELF":
                # Matches if user owns the resource
                if resource_owner_id and user_id == resource_owner_id:
                    return True

        return False
