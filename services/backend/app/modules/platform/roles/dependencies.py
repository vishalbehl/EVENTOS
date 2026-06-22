# app/modules/platform/roles/dependencies.py
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.dependencies import get_db
from app.modules.platform.roles.service import RoleService


async def get_role_service(db: AsyncSession = Depends(get_db)) -> RoleService:
    return RoleService(db)
