"""Read-only query services for operations planning screens."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.operations_planning.models import Milestone, Project, ProjectTask
from app.modules.events.models.event import Event
from app.modules.operations_planning.infrastructure.repositories import (
    MilestoneRepository,
    ProjectRepository,
    ProjectTaskRepository,
)


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
        return await ProjectRepository(self.db).list_for_event(
            event_id=event_id,
            organization_id=organization_id,
            limit=limit,
        )

    async def list_tasks(
        self,
        *,
        project_id: uuid.UUID,
        organization_id: uuid.UUID,
        limit: int = 200,
    ) -> list[ProjectTask] | None:
        project = await ProjectRepository(self.db).get_by_id(
            project_id=project_id,
            organization_id=organization_id,
        )
        if project is None:
            return None
        return await ProjectTaskRepository(self.db).list_for_project(
            project_id=project_id,
            organization_id=organization_id,
            limit=limit,
        )

    async def get_project(
        self,
        *,
        project_id: uuid.UUID,
        organization_id: uuid.UUID,
    ) -> tuple[Project, list[ProjectTask], list[Milestone]] | None:
        project = await ProjectRepository(self.db).get_by_id(
            project_id=project_id,
            organization_id=organization_id,
        )
        if project is None:
            return None

        tasks = await ProjectTaskRepository(self.db).list_for_project(
            project_id=project.id,
            organization_id=organization_id,
            limit=500,
        )
        milestones = await MilestoneRepository(self.db).list_for_project(
            project_id=project.id,
            organization_id=organization_id,
            limit=200,
        )
        return project, tasks, milestones
