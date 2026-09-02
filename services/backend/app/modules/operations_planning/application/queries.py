"""Read-only query services for operations planning screens."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.operations_planning.models import Milestone, Project, ProjectTask
from app.modules.events.models.event import Event


class ProjectQueryService:
    """Own bounded project reads without transaction or permission side effects."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_event_for_scope(
        self,
        *,
        event_id: uuid.UUID,
        organization_id: uuid.UUID,
        is_super_admin: bool = False,
    ) -> Event | None:
        statement = select(Event).where(
            Event.id == event_id,
            Event.deleted_at.is_(None),
        )
        if not is_super_admin:
            statement = statement.where(Event.organization_id == organization_id)
        return await self.db.scalar(statement)

    async def list_projects(
        self,
        *,
        event_id: uuid.UUID,
        organization_id: uuid.UUID,
        limit: int = 100,
    ) -> list[Project]:
        bounded_limit = max(1, min(limit, 200))
        return list(
            (
                await self.db.scalars(
                    select(Project)
                    .where(
                        Project.event_id == event_id,
                        Project.organization_id == organization_id,
                    )
                    .order_by(Project.id.desc())
                    .limit(bounded_limit)
                )
            ).all()
        )

    async def list_tasks(
        self,
        *,
        project_id: uuid.UUID,
        organization_id: uuid.UUID,
        limit: int = 200,
    ) -> list[ProjectTask] | None:
        project = await self.db.scalar(
            select(Project.id).where(
                Project.id == project_id,
                Project.organization_id == organization_id,
            )
        )
        if project is None:
            return None
        bounded_limit = max(1, min(limit, 500))
        return list(
            (
                await self.db.scalars(
                    select(ProjectTask)
                    .where(ProjectTask.project_id == project_id)
                    .order_by(ProjectTask.id)
                    .limit(bounded_limit)
                )
            ).all()
        )

    async def get_project(
        self,
        *,
        project_id: uuid.UUID,
        organization_id: uuid.UUID,
    ) -> tuple[Project, list[ProjectTask], list[Milestone]] | None:
        project = await self.db.scalar(
            select(Project).where(
                Project.id == project_id,
                Project.organization_id == organization_id,
            )
        )
        if project is None:
            return None

        tasks = list(
            (
                await self.db.scalars(
                    select(ProjectTask)
                    .where(ProjectTask.project_id == project.id)
                    .order_by(ProjectTask.id)
                    .limit(500)
                )
            ).all()
        )
        milestones = list(
            (
                await self.db.scalars(
                    select(Milestone)
                    .where(Milestone.project_id == project.id)
                    .order_by(Milestone.id)
                    .limit(200)
                )
            ).all()
        )
        return project, tasks, milestones
