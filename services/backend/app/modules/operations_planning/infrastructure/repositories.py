"""Tenant-aware, transaction-neutral repositories for planning records."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.operations_planning.models import Milestone, Project, ProjectTask


class ProjectRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    def scoped_statement(self, *, organization_id: uuid.UUID, event_id: uuid.UUID | None = None):
        statement = select(Project).where(Project.organization_id == organization_id)
        if event_id is not None:
            statement = statement.where(Project.event_id == event_id)
        return statement

    async def get_by_id(
        self, *, project_id: uuid.UUID, organization_id: uuid.UUID, for_update: bool = False
    ) -> Project | None:
        statement = self.scoped_statement(organization_id=organization_id).where(Project.id == project_id)
        if for_update:
            statement = statement.with_for_update()
        return await self.db.scalar(statement)

    def create(self, entity: Project) -> Project:
        self.db.add(entity)
        return entity

    def update(self, entity: Project, values: dict) -> Project:
        for name, value in values.items():
            if name.startswith("_") or name in {"id", "organization_id", "event_id"}:
                raise ValueError(f"Unsupported project update field: {name}")
            if not hasattr(Project, name):
                raise ValueError(f"Unsupported project update field: {name}")
            setattr(entity, name, value)
        return entity

    async def delete(self, entity: Project) -> None:
        await self.db.delete(entity)

    async def list_for_event(
        self, *, event_id: uuid.UUID, organization_id: uuid.UUID, limit: int
    ) -> list[Project]:
        bounded_limit = max(1, min(limit, 200))
        result = await self.db.scalars(
            self.scoped_statement(organization_id=organization_id, event_id=event_id)
            .order_by(Project.id.desc())
            .limit(bounded_limit)
        )
        return list(result.all())


class ProjectTaskRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    def scoped_statement(self, *, project_id: uuid.UUID, organization_id: uuid.UUID):
        return (
            select(ProjectTask)
            .join(Project, Project.id == ProjectTask.project_id)
            .where(
                ProjectTask.project_id == project_id,
                Project.organization_id == organization_id,
            )
        )

    async def list_for_project(
        self, *, project_id: uuid.UUID, organization_id: uuid.UUID, limit: int = 500
    ) -> list[ProjectTask] | None:
        bounded_limit = max(1, min(limit, 500))
        result = await self.db.scalars(
            self.scoped_statement(project_id=project_id, organization_id=organization_id)
            .order_by(ProjectTask.id)
            .limit(bounded_limit)
        )
        return list(result.all())

    async def get_by_id(
        self, *, task_id: uuid.UUID, organization_id: uuid.UUID, for_update: bool = False
    ) -> ProjectTask | None:
        statement = (
            select(ProjectTask)
            .join(Project, Project.id == ProjectTask.project_id)
            .where(
                ProjectTask.id == task_id,
                Project.organization_id == organization_id,
            )
        )
        if for_update:
            statement = statement.with_for_update()
        return await self.db.scalar(statement)

    def create(self, entity: ProjectTask) -> ProjectTask:
        self.db.add(entity)
        return entity

    def update(self, entity: ProjectTask, values: dict) -> ProjectTask:
        allowed = {"title", "description", "status", "priority", "start_date", "due_date", "assigned_to"}
        for name, value in values.items():
            if name not in allowed:
                raise ValueError(f"Unsupported task update field: {name}")
            setattr(entity, name, value)
        return entity

    async def delete(self, entity: ProjectTask) -> None:
        await self.db.delete(entity)


class MilestoneRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    def scoped_statement(self, *, project_id: uuid.UUID, organization_id: uuid.UUID):
        return (
            select(Milestone)
            .join(Project, Project.id == Milestone.project_id)
            .where(
                Milestone.project_id == project_id,
                Project.organization_id == organization_id,
            )
        )

    async def list_for_project(
        self, *, project_id: uuid.UUID, organization_id: uuid.UUID, limit: int = 200
    ) -> list[Milestone] | None:
        bounded_limit = max(1, min(limit, 200))
        result = await self.db.scalars(
            self.scoped_statement(project_id=project_id, organization_id=organization_id)
            .order_by(Milestone.id)
            .limit(bounded_limit)
        )
        return list(result.all())

    def bulk_insert(self, entities: list[Milestone]) -> list[Milestone]:
        if len(entities) > 1000:
            raise ValueError("milestone bulk insert is limited to 1000 records")
        self.db.add_all(entities)
        return entities
