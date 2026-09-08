"""Transaction-owning commands for operations-planning resources."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.concurrency import raise_version_conflict
from app.core.cache import cache_service

from app.modules.events.models.event import Event
from app.modules.events.infrastructure.repositories import EventRepository
from app.modules.operations_planning.models import Milestone, Project, ProjectTask
from app.modules.operations_planning.infrastructure.repositories import (
    MilestoneRepository,
    ProjectRepository,
    ProjectTaskRepository,
)


def _date_value(value: Any) -> date | None:
    if value in (None, ""):
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Dates must use ISO YYYY-MM-DD format.") from exc


class OperationsPlanningCommandService:
    """Own tenant validation and transaction boundaries for planner writes."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _event(self, event_id: uuid.UUID, organization_id: uuid.UUID) -> Event:
        event = await EventRepository(self.db).get_for_organization(event_id, organization_id)
        if event is None:
            raise HTTPException(status_code=404, detail="Event not found.")
        return event

    async def _project(self, project_id: uuid.UUID, organization_id: uuid.UUID) -> Project:
        project = await ProjectRepository(self.db).get_by_id(
            project_id=project_id,
            organization_id=organization_id,
        )
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found.")
        return project

    async def create_project(
        self,
        *,
        event_id: uuid.UUID,
        organization_id: uuid.UUID,
        data: dict[str, Any],
    ) -> tuple[Project, ProjectTask, Milestone]:
        event = await self._event(event_id, organization_id)
        project = Project(
            organization_id=event.organization_id,
            event_id=event.id,
            name=data["name"],
            service_request_id=data.get("service_request_id"),
            start_date=data.get("start_date"),
            end_date=data.get("end_date"),
            project_manager_id=data.get("project_manager_id"),
            status="PLANNING",
            completion_percentage=0,
        )
        ProjectRepository(self.db).create(project)
        await self.db.flush()
        task = ProjectTask(project_id=project.id, title="Project setup", status="TODO", priority="NORMAL")
        milestone = Milestone(project_id=project.id, name="Project setup", status="TODO")
        MilestoneRepository(self.db).bulk_insert([milestone])
        ProjectTaskRepository(self.db).create(task)
        await self.db.commit()
        await cache_service.invalidate_domain("venue_ops_recommendations", event.organization_id, event.id)
        await self.db.refresh(project)
        return project, task, milestone

    async def update_project(
        self,
        *,
        project_id: uuid.UUID,
        organization_id: uuid.UUID,
        data: dict[str, Any],
        expected_version: int | None = None,
    ) -> Project:
        project = await ProjectRepository(self.db).get_by_id(
            project_id=project_id,
            organization_id=organization_id,
            for_update=True,
        )
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found.")
        if expected_version is not None and project.version != expected_version:
            raise_version_conflict(project.version)
        ProjectRepository(self.db).update(
            project,
            {key: value for key, value in data.items() if key != "version"},
        )
        project.version = int(project.version or 1) + 1
        await self.db.commit()
        await cache_service.invalidate_domain("venue_ops_recommendations", organization_id, project.event_id)
        await self.db.refresh(project)
        return project

    async def create_milestones(
        self,
        *,
        project_id: uuid.UUID,
        organization_id: uuid.UUID,
        items: list[dict[str, Any]],
    ) -> list[Milestone]:
        project = await self._project(project_id, organization_id)
        rows = [
            Milestone(
                project_id=project.id,
                name=str(item.get("name", "Milestone")),
                description=item.get("description"),
                start_date=_date_value(item.get("start_date")),
                due_date=_date_value(item.get("due_date")),
                status="TODO",
            )
            for item in items
        ]
        MilestoneRepository(self.db).bulk_insert(rows)
        await self.db.commit()
        await cache_service.invalidate_domain("venue_ops_recommendations", organization_id, project.event_id)
        return rows

    async def create_task(
        self,
        *,
        project_id: uuid.UUID,
        organization_id: uuid.UUID,
        title: str,
        priority: str,
        status: str,
    ) -> ProjectTask:
        project = await self._project(project_id, organization_id)
        task = ProjectTask(project_id=project.id, title=title, priority=priority, status=status)
        ProjectTaskRepository(self.db).create(task)
        await self.db.commit()
        await cache_service.invalidate_domain("venue_ops_recommendations", organization_id, project.event_id)
        await self.db.refresh(task)
        return task

    async def update_task(
        self,
        *,
        task_id: uuid.UUID,
        organization_id: uuid.UUID,
        data: dict[str, Any],
        expected_version: int | None = None,
    ) -> ProjectTask:
        task = await ProjectTaskRepository(self.db).get_by_id(
            task_id=task_id,
            organization_id=organization_id,
            for_update=True,
        )
        if task is None:
            raise HTTPException(status_code=404, detail="Task not found.")
        if expected_version is not None and task.version != expected_version:
            raise_version_conflict(task.version)
        ProjectTaskRepository(self.db).update(
            task,
            {key: value for key, value in data.items() if key in {"title", "description", "status", "priority"}},
        )
        task.version = int(task.version or 1) + 1
        await self.db.commit()
        project = await self.db.scalar(select(Project).where(Project.id == task.project_id))
        if project is not None:
            await cache_service.invalidate_domain("venue_ops_recommendations", organization_id, project.event_id)
        await self.db.refresh(task)
        return task
