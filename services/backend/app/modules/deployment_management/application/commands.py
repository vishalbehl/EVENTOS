"""Transaction-owning deployment-management commands."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.operations_planning.models import Project
from app.modules.deployment_management.models import (
    Deployment,
    DeploymentChecklist,
    Risk,
)


class DeploymentCommandService:
    """Keep deployment mutations tenant-scoped and transaction-owned."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _project(self, project_id: uuid.UUID, organization_id: uuid.UUID) -> Project:
        row = await self.db.scalar(
            select(Project).where(
                Project.id == project_id,
                Project.organization_id == organization_id,
            )
        )
        if row is None:
            raise HTTPException(404, "Project not found.")
        return row

    async def create_deployment(
        self,
        *,
        project_id: uuid.UUID,
        organization_id: uuid.UUID,
        deployment_number: str,
        deployment_date: date,
        deployment_status: str,
    ) -> Deployment:
        await self._project(project_id, organization_id)
        row = Deployment(
            project_id=project_id,
            deployment_number=deployment_number,
            deployment_date=deployment_date,
            deployment_status=deployment_status,
        )
        self.db.add(row)
        await self.db.flush()
        self.db.add(
            DeploymentChecklist(
                deployment_id=row.id,
                title="Pre-deployment validation",
                status="PENDING",
            )
        )
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def update_checklist(
        self,
        *,
        checklist_id: uuid.UUID,
        organization_id: uuid.UUID,
        status: str,
    ) -> DeploymentChecklist:
        row = await self.db.scalar(
            select(DeploymentChecklist).where(DeploymentChecklist.id == checklist_id)
        )
        if row is None:
            raise HTTPException(404, "Checklist not found.")
        deployment = await self.db.scalar(
            select(Deployment).where(Deployment.id == row.deployment_id)
        )
        if deployment is None:
            raise HTTPException(404, "Deployment not found.")
        await self._project(deployment.project_id, organization_id)
        row.status = status
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def complete(
        self,
        *,
        deployment_id: uuid.UUID,
        organization_id: uuid.UUID,
    ) -> Deployment:
        row = await self.db.scalar(
            select(Deployment).where(Deployment.id == deployment_id)
        )
        if row is None:
            raise HTTPException(404, "Deployment not found.")
        await self._project(row.project_id, organization_id)
        row.deployment_status = "SUCCESS"
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def create_risk(
        self,
        *,
        project_id: uuid.UUID,
        organization_id: uuid.UUID,
        payload: dict[str, Any],
    ) -> Risk:
        await self._project(project_id, organization_id)
        row = Risk(
            project_id=project_id,
            title=payload["title"],
            description=payload.get("description"),
            severity=payload["severity"],
            probability=payload["probability"],
            mitigation_plan=payload.get("mitigation_plan"),
            status=payload.get("status", "IDENTIFIED"),
        )
        self.db.add(row)
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def update_risk(
        self,
        *,
        risk_id: uuid.UUID,
        organization_id: uuid.UUID,
        payload: dict[str, Any],
    ) -> Risk:
        row = await self.db.scalar(select(Risk).where(Risk.id == risk_id))
        if row is None:
            raise HTTPException(404, "Risk not found.")
        await self._project(row.project_id, organization_id)
        if "status" in payload:
            row.status = payload["status"]
        await self.db.commit()
        await self.db.refresh(row)
        return row
