from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.workflow.models.workflow import (
    Workflow,
    WorkflowInstance,
    WorkflowTask,
)


class WorkflowRepository:
    """Tenant-scoped workflow reads; transaction ownership stays with commands."""

    @staticmethod
    async def list_page(db: AsyncSession, organization_id: uuid.UUID, *, limit: int = 100) -> list[Workflow]:
        bounded_limit = max(1, min(limit, 100))
        result = await db.execute(
            select(Workflow)
            .where(Workflow.organization_id == organization_id)
            .options(selectinload(Workflow.steps))
            .order_by(Workflow.created_at.desc(), Workflow.id.desc())
            .limit(bounded_limit)
        )
        return list(result.scalars().all())

    @staticmethod
    async def get_by_id(db: AsyncSession, organization_id: uuid.UUID, workflow_id: uuid.UUID) -> Optional[Workflow]:
        result = await db.execute(
            select(Workflow)
            .where(Workflow.organization_id == organization_id, Workflow.id == workflow_id)
            .options(selectinload(Workflow.steps))
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_instance(db: AsyncSession, organization_id: uuid.UUID, instance_id: uuid.UUID) -> Optional[WorkflowInstance]:
        result = await db.execute(
            select(WorkflowInstance)
            .where(WorkflowInstance.organization_id == organization_id, WorkflowInstance.id == instance_id)
            .options(
                selectinload(WorkflowInstance.workflow).selectinload(Workflow.steps),
                selectinload(WorkflowInstance.history),
                selectinload(WorkflowInstance.tasks).selectinload(WorkflowTask.step),
                selectinload(WorkflowInstance.tasks).selectinload(WorkflowTask.assignments),
            )
        )
        return result.scalar_one_or_none()
