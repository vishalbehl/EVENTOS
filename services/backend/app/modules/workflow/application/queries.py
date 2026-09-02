from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.workflow.infrastructure.repositories import WorkflowRepository
from app.modules.workflow.models.workflow import Workflow, WorkflowInstance


class WorkflowQueryService:
    """Read-only screen queries with explicit tenant context."""

    @staticmethod
    async def list_workflows(db: AsyncSession, organization_id: uuid.UUID, *, limit: int = 100) -> list[Workflow]:
        return await WorkflowRepository.list_page(db, organization_id, limit=limit)

    @staticmethod
    async def get_workflow(db: AsyncSession, organization_id: uuid.UUID, workflow_id: uuid.UUID) -> Optional[Workflow]:
        return await WorkflowRepository.get_by_id(db, organization_id, workflow_id)

    @staticmethod
    async def get_instance(db: AsyncSession, organization_id: uuid.UUID, instance_id: uuid.UUID) -> Optional[WorkflowInstance]:
        return await WorkflowRepository.get_instance(db, organization_id, instance_id)

