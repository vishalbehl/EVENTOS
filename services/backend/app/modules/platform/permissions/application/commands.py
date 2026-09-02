"""Transaction-owning platform permission commands."""

from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.permissions.models import PlatformPermission, PlatformRolePermission
from app.modules.platform.roles.models import DepartmentRole


class PermissionCommandService:
    """Mutations for role permissions; callers do not manage partial commits."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def toggle_role_permission(
        self,
        *,
        organization_id: uuid.UUID,
        actor_id: uuid.UUID,
        role_id: uuid.UUID,
        permission_id: uuid.UUID,
        reason: str,
    ) -> str:
        try:
            role = await self.db.scalar(
                select(DepartmentRole)
                .where(
                    DepartmentRole.id == role_id,
                    DepartmentRole.organization_id == organization_id,
                    DepartmentRole.deleted_at.is_(None),
                )
                .with_for_update()
            )
            if role is None:
                raise HTTPException(status_code=404, detail="Role not found.")

            permission = await self.db.scalar(
                select(PlatformPermission)
                .where(PlatformPermission.id == permission_id)
                .with_for_update()
            )
            if permission is None:
                raise HTTPException(status_code=404, detail="Permission not found.")

            existing = await self.db.scalar(
                select(PlatformRolePermission)
                .where(
                    PlatformRolePermission.role_id == role_id,
                    PlatformRolePermission.permission_id == permission_id,
                )
                .with_for_update()
            )
            if existing:
                await self.db.delete(existing)
                action_type = "ROLE_PERMISSION_REMOVED"
                message = "Permission removed from role"
                assigned = False
            else:
                self.db.add(PlatformRolePermission(role_id=role_id, permission_id=permission_id))
                action_type = "ROLE_PERMISSION_ADDED"
                message = "Permission added to role"
                assigned = True

            self.db.add(AuditLog(
                organization_id=organization_id,
                actor_user_id=actor_id,
                resource_type="platform_role_permission",
                resource_id=role_id,
                action_type=action_type,
                old_state={
                    "role_id": str(role_id),
                    "role_code": role.code,
                    "permission_id": str(permission_id),
                    "permission_code": permission.code,
                    "was_assigned": not assigned,
                },
                new_state={
                    "role_id": str(role_id),
                    "role_code": role.code,
                    "permission_id": str(permission_id),
                    "permission_code": permission.code,
                    "is_assigned": assigned,
                },
                change_diff={"reason": reason},
                is_sensitive=True,
            ))
            await self.db.commit()
            await invalidate_organization(organization_id)
            return message
        except Exception:
            await self.db.rollback()
            raise
