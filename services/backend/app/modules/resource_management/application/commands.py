"""Transaction-owning commands for resource-management mutations."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.operations_planning.models import Project
from app.modules.resource_management.models import (
    EquipmentAssignment,
    ResourcePlan,
    StaffAssignment,
    TravelPlan,
)


class ResourceCommandService:
    """Own resource-management validation and transaction boundaries."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _project(self, project_id: uuid.UUID, organization_id: uuid.UUID) -> Project:
        project = await self.db.scalar(
            select(Project).where(
                Project.id == project_id,
                Project.organization_id == organization_id,
            )
        )
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found.")
        return project

    async def create_plan(self, *, project_id: uuid.UUID, organization_id: uuid.UUID, data: dict[str, Any]) -> ResourcePlan:
        await self._project(project_id, organization_id)
        row = ResourcePlan(project_id=project_id, **data)
        self.db.add(row)
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def create_staff(self, *, project_id: uuid.UUID, organization_id: uuid.UUID, data: dict[str, Any]) -> StaffAssignment:
        await self._project(project_id, organization_id)
        row = StaffAssignment(project_id=project_id, **data)
        self.db.add(row)
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def create_equipment(self, *, project_id: uuid.UUID, organization_id: uuid.UUID, data: dict[str, Any]) -> EquipmentAssignment:
        await self._project(project_id, organization_id)
        row = EquipmentAssignment(project_id=project_id, **data)
        self.db.add(row)
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def create_travel(self, *, project_id: uuid.UUID, organization_id: uuid.UUID, data: dict[str, Any]) -> TravelPlan:
        await self._project(project_id, organization_id)
        row = TravelPlan(project_id=project_id, **data)
        self.db.add(row)
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def update_travel(
        self,
        *,
        plan_id: uuid.UUID,
        organization_id: uuid.UUID,
        data: dict[str, Any],
    ) -> TravelPlan:
        row = await self.db.scalar(select(TravelPlan).where(TravelPlan.id == plan_id))
        if row is None:
            raise HTTPException(status_code=404, detail="Travel plan not found.")
        await self._project(row.project_id, organization_id)
        if "status" in data:
            row.status = data["status"]
        await self.db.commit()
        await self.db.refresh(row)
        return row
