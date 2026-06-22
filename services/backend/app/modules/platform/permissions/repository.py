# app/modules/platform/permissions/repository.py
import uuid
from typing import List, Optional
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.platform.permissions.models import PlatformPermission, PlatformRolePermission


class PermissionRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_all_permissions(self) -> List[PlatformPermission]:
        stmt = select(PlatformPermission).order_by(PlatformPermission.module, PlatformPermission.code)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_permission_by_id(self, id: uuid.UUID) -> Optional[PlatformPermission]:
        stmt = select(PlatformPermission).where(PlatformPermission.id == id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_permission_by_code(self, code: str) -> Optional[PlatformPermission]:
        stmt = select(PlatformPermission).where(PlatformPermission.code == code)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create_permission(self, code: str, name: str, module: str, description: Optional[str]) -> PlatformPermission:
        perm = PlatformPermission(
            code=code,
            name=name,
            module=module,
            description=description
        )
        self.db.add(perm)
        await self.db.flush()
        return perm

    # Role Permissions mappings
    async def get_role_permission(self, role_id: uuid.UUID, permission_id: uuid.UUID) -> Optional[PlatformRolePermission]:
        stmt = select(PlatformRolePermission).where(
            PlatformRolePermission.role_id == role_id,
            PlatformRolePermission.permission_id == permission_id
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def add_role_permission(self, role_id: uuid.UUID, permission_id: uuid.UUID) -> PlatformRolePermission:
        rp = PlatformRolePermission(role_id=role_id, permission_id=permission_id)
        self.db.add(rp)
        await self.db.flush()
        return rp

    async def remove_role_permission(self, role_id: uuid.UUID, permission_id: uuid.UUID) -> None:
        stmt = delete(PlatformRolePermission).where(
            PlatformRolePermission.role_id == role_id,
            PlatformRolePermission.permission_id == permission_id
        )
        await self.db.execute(stmt)

    async def get_permissions_for_role(self, role_id: uuid.UUID) -> List[PlatformPermission]:
        stmt = (
            select(PlatformPermission)
            .join(PlatformRolePermission, PlatformRolePermission.permission_id == PlatformPermission.id)
            .where(PlatformRolePermission.role_id == role_id)
            .order_by(PlatformPermission.module, PlatformPermission.code)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
