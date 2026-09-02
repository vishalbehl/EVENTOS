from __future__ import annotations

import uuid
from datetime import date
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import OrganizerOrAbove, get_db
from app.modules.events.models.event import Event
from app.modules.operations_planning.models import Milestone, Project, ProjectTask
from app.modules.operations_planning.application.queries import ProjectQueryService
from app.modules.operations_planning.application.commands import OperationsPlanningCommandService
from app.core.concurrency import require_if_match

router = APIRouter(prefix="/operations", tags=["operations-planning"])


def _date_value(value: Any) -> date | None:
    if value in (None, ""):
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Dates must use ISO YYYY-MM-DD format.") from exc


class ProjectCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    service_request_id: Optional[uuid.UUID] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    project_manager_id: Optional[uuid.UUID] = None


class ProjectPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    status: Optional[str] = Field(default=None, max_length=50)
    completion_percentage: Optional[float] = Field(default=None, ge=0, le=100)


def _project_out(
    row: Project,
    tasks: list[ProjectTask] | None = None,
    milestones: list[Milestone] | None = None,
    *,
    completion_percentage: float | None = None,
) -> dict[str, Any]:
    tasks = tasks or []
    milestones = milestones or []
    return {"id": str(row.id), "organization_id": str(row.organization_id), "event_id": str(row.event_id), "service_request_id": str(row.service_request_id) if row.service_request_id else None, "name": row.name, "status": row.status, "start_date": row.start_date, "end_date": row.end_date, "project_manager_id": str(row.project_manager_id) if row.project_manager_id else None, "completion_percentage": row.completion_percentage if completion_percentage is None else completion_percentage, "milestones": [{"id": str(milestone.id), "name": milestone.name, "description": milestone.description, "status": milestone.status, "start_date": milestone.start_date, "due_date": milestone.due_date} for milestone in milestones], "tasks": [{"id": str(task.id), "title": task.title, "status": task.status, "priority": task.priority} for task in tasks]}


async def _event_for_user(db: AsyncSession, event_id: uuid.UUID, user: OrganizerOrAbove) -> Event:
    event = await ProjectQueryService(db).get_event_for_scope(
        event_id=event_id,
        organization_id=user.organization_id,
        is_super_admin=getattr(user, "role", None) == "super_admin",
    )
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found.")
    return event


@router.post("/projects")
async def create_project(event_id: uuid.UUID, payload: ProjectCreate, db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    row, task, milestone = await OperationsPlanningCommandService(db).create_project(
        event_id=event_id,
        organization_id=user.organization_id,
        data=payload.model_dump(),
    )
    return _project_out(row, [task], [milestone])


@router.get("/projects")
async def list_projects(event_id: uuid.UUID, limit: int = Query(100, ge=1, le=200), db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    event = await _event_for_user(db, event_id, user)
    rows = await ProjectQueryService(db).list_projects(
        event_id=event.id,
        organization_id=event.organization_id,
        limit=limit,
    )
    return [_project_out(row) for row in rows]


@router.get("/projects/{project_id}")
async def get_project(project_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    result = await ProjectQueryService(db).get_project(
        project_id=project_id,
        organization_id=user.organization_id,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    row, tasks, milestones = result
    completed = sum(task.status == "COMPLETED" for task in tasks)
    completion_percentage = round(completed * 100 / len(tasks), 2) if tasks else 0
    return _project_out(row, tasks, milestones, completion_percentage=completion_percentage)


@router.patch("/projects/{project_id}")
async def patch_project(project_id: uuid.UUID, payload: ProjectPatch, if_match: Optional[str] = Header(None, alias="If-Match"), db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    row = await OperationsPlanningCommandService(db).update_project(
        project_id=project_id,
        organization_id=user.organization_id,
        data=payload.model_dump(exclude_unset=True),
        expected_version=require_if_match(if_match) if if_match is not None else None,
    )
    return _project_out(row)


@router.post("/projects/{project_id}/milestones")
async def create_milestones(project_id: uuid.UUID, payload: list[dict[str, Any]] = Body(..., max_items=50), db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    result = await OperationsPlanningCommandService(db).create_milestones(
        project_id=project_id,
        organization_id=user.organization_id,
        items=payload,
    )
    return [{"id": str(item.id), "project_id": str(item.project_id), "name": item.name, "description": item.description, "start_date": item.start_date, "due_date": item.due_date, "status": item.status} for item in result]


@router.post("/tasks")
async def create_task(project_id: uuid.UUID, title: str = Query(..., min_length=2, max_length=255), priority: str = Query("NORMAL", max_length=20), status: str = Query("TODO", max_length=50), db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    task = await OperationsPlanningCommandService(db).create_task(
        project_id=project_id,
        organization_id=user.organization_id,
        title=title,
        priority=priority,
        status=status,
    )
    return {"id": str(task.id), "project_id": str(task.project_id), "title": task.title, "status": task.status, "priority": task.priority}


@router.get("/tasks")
async def list_tasks(project_id: uuid.UUID, limit: int = Query(200, ge=1, le=500), db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    rows = await ProjectQueryService(db).list_tasks(
        project_id=project_id,
        organization_id=user.organization_id,
        limit=limit,
    )
    if rows is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    return [{"id": str(row.id), "project_id": str(row.project_id), "title": row.title, "status": row.status, "priority": row.priority} for row in rows]


@router.patch("/tasks/{task_id}")
async def patch_task(task_id: uuid.UUID, payload: dict[str, Any] = Body(...), if_match: Optional[str] = Header(None, alias="If-Match"), db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    task = await OperationsPlanningCommandService(db).update_task(
        task_id=task_id,
        organization_id=user.organization_id,
        data=payload,
        expected_version=require_if_match(if_match) if if_match is not None else None,
    )
    return {"id": str(task.id), "project_id": str(task.project_id), "title": task.title, "status": task.status, "priority": task.priority}
