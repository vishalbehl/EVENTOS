"""Read-only query services for resource-management screens."""

from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.operations_planning.models import Project
from app.modules.resource_management.models import EquipmentAssignment, StaffAssignment


class ResourceQueryService:
    """Return bounded allocation projections for a verified tenant project."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def project_exists_for_scope(
        self,
        *,
        project_id: uuid.UUID,
        organization_id: uuid.UUID,
    ) -> bool:
        """Check project ownership without materializing the project row."""
        project = await self.db.scalar(
            select(Project.id).where(
                Project.id == project_id,
                Project.organization_id == organization_id,
            )
        )
        return project is not None

    async def list_allocations(
        self,
        *,
        project_id: uuid.UUID,
        organization_id: uuid.UUID,
        limit: int = 500,
    ) -> list[dict[str, str]]:
        project = await self.db.scalar(
            select(Project.id).where(
                Project.id == project_id,
                Project.organization_id == organization_id,
            )
        )
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found.")
        bounded_limit = max(1, min(limit, 500))
        staff = (
            await self.db.execute(
                select(StaffAssignment.id, StaffAssignment.employee_id)
                .where(StaffAssignment.project_id == project_id)
                .order_by(StaffAssignment.id)
                .limit(bounded_limit)
            )
        ).all()
        equipment = (
            await self.db.execute(
                select(EquipmentAssignment.id, EquipmentAssignment.hardware_id)
                .where(EquipmentAssignment.project_id == project_id)
                .order_by(EquipmentAssignment.id)
                .limit(bounded_limit)
            )
        ).all()
        return [
            {"id": str(row.id), "type": "staff", "employee_id": str(row.employee_id)}
            for row in staff
        ] + [
            {"id": str(row.id), "type": "equipment", "hardware_id": str(row.hardware_id)}
            for row in equipment
        ]
