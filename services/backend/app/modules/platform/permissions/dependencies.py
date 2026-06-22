# app/modules/platform/permissions/dependencies.py
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.dependencies import get_db
from app.modules.platform.permissions.service import PermissionService


async def get_permission_service(db: AsyncSession = Depends(get_db)) -> PermissionService:
    return PermissionService(db)
