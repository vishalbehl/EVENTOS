# app/modules/platform/permissions/dependencies.py
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.dependencies import get_db
from app.modules.platform.permissions.service import PermissionService
from app.modules.platform.permissions.application.commands import PermissionCommandService
from app.modules.platform.permissions.application.queries import PermissionQueryService


async def get_permission_service(db: AsyncSession = Depends(get_db)) -> PermissionService:
    return PermissionService(db)


async def get_permission_query_service(db: AsyncSession = Depends(get_db)) -> PermissionQueryService:
    return PermissionQueryService(db)


async def get_permission_command_service(db: AsyncSession = Depends(get_db)) -> PermissionCommandService:
    return PermissionCommandService(db)
