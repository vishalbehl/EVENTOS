"""Read-only deployment-management query services."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.deployment_management.models import Deployment, DeploymentChecklist, Risk
from app.modules.operations_planning.models import Project


class DeploymentQueryService:
    """Keep deployment reads tenant-scoped, bounded, and free of writes."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_project(self, *, project_id: uuid.UUID, organization_id: uuid.UUID) -> Project | None:
        return await self.db.scalar(
            select(Project).where(
                Project.id == project_id,
                Project.organization_id == organization_id,
            )
        )

    async def get_deployment_for_organization(
        self, *, deployment_id: uuid.UUID, organization_id: uuid.UUID
    ) -> Deployment | None:
        return await self.db.scalar(
            select(Deployment)
            .join(Project, Project.id == Deployment.project_id)
            .where(
                Deployment.id == deployment_id,
                Project.organization_id == organization_id,
            )
        )

    async def list_checklists(
        self,
        *,
        deployment_id: uuid.UUID,
        organization_id: uuid.UUID,
        limit: int,
    ) -> list[DeploymentChecklist]:
        statement = (
            select(DeploymentChecklist)
            .join(Deployment, Deployment.id == DeploymentChecklist.deployment_id)
            .join(Project, Project.id == Deployment.project_id)
            .where(
                DeploymentChecklist.deployment_id == deployment_id,
                Project.organization_id == organization_id,
            )
            .order_by(DeploymentChecklist.id)
            .limit(limit)
        )
        return list((await self.db.scalars(statement)).all())

    async def list_risks(
        self,
        *,
        project_id: uuid.UUID,
        organization_id: uuid.UUID,
        limit: int,
    ) -> list[Risk]:
        statement = (
            select(Risk)
            .join(Project, Project.id == Risk.project_id)
            .where(
                Risk.project_id == project_id,
                Project.organization_id == organization_id,
            )
            .order_by(Risk.id)
            .limit(limit)
        )
        return list((await self.db.scalars(statement)).all())
