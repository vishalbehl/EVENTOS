"""Bounded, projection-oriented platform permission reads."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.platform.permissions.models import PlatformPermission, PlatformRolePermission
from app.modules.platform.roles.models import DepartmentRole


class PermissionQueryService:
    """Read-only permission queries with explicit columns and no commits."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_permissions(self) -> list[dict]:
        rows = (
            await self.db.execute(
                select(
                    PlatformPermission.id,
                    PlatformPermission.code,
                    PlatformPermission.name,
                    PlatformPermission.module,
                    PlatformPermission.description,
                ).order_by(PlatformPermission.module, PlatformPermission.code)
            )
        ).mappings().all()
        return [dict(row) for row in rows]

    async def get_role_permissions(self, role_id: uuid.UUID) -> list[str]:
        rows = (
            await self.db.execute(
                select(PlatformPermission.code)
                .join(PlatformRolePermission, PlatformRolePermission.permission_id == PlatformPermission.id)
                .where(PlatformRolePermission.role_id == role_id)
                .order_by(PlatformPermission.module, PlatformPermission.code)
            )
        ).scalars().all()
        return list(rows)

    async def role_exists_for_organization(
        self, *, organization_id: uuid.UUID, role_id: uuid.UUID
    ) -> bool:
        """Check role ownership without loading a cross-tenant ORM object."""
        role = await self.db.scalar(
            select(DepartmentRole.id).where(
                DepartmentRole.id == role_id,
                DepartmentRole.organization_id == organization_id,
                DepartmentRole.deleted_at.is_(None),
            )
        )
        return role is not None
