# app/modules/platform/departments/dependencies.py
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.dependencies import get_db
from app.modules.platform.departments.service import DepartmentService


async def get_department_service(db: AsyncSession = Depends(get_db)) -> DepartmentService:
    return DepartmentService(db)
