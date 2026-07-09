import uuid
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.dependencies import get_current_user, get_db
from app.modules.identity.models.user import User
from app.modules.operations_planning.services import ProjectService
from app.modules.operations_planning.schemas import (
    ProjectCreate, ProjectUpdate, ProjectOut,
    ProjectTaskCreate, ProjectTaskUpdate, ProjectTaskOut,
    MilestoneCreate, MilestoneOut
)
from app.modules.operations_planning.models import ProjectTask, Milestone

router = APIRouter(prefix="/operations", tags=["operations"])

@router.post("/projects", response_model=ProjectOut)
async def create_project(
    req: ProjectCreate,
    event_id: uuid.UUID = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        org_id = current_user.organization_id
        if not org_id:
            raise HTTPException(status_code=400, detail="User does not belong to any organization")
            
        project = await ProjectService.create_project(
            db=db,
            organization_id=org_id,
            event_id=event_id,
            name=req.name,
            start_date=req.start_date,
            end_date=req.end_date,
            project_manager_id=req.project_manager_id or current_user.id
        )
        await ProjectService.generate_project_plan(db, project.id)
        await db.commit()
        
        # Reload project with relationships
        full_project = await ProjectService.get_project(db, project.id)
        return full_project
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/projects", response_model=List[ProjectOut])
async def list_projects(
    event_id: uuid.UUID = Query(...),
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    projects = await ProjectService.list_projects(db, event_id, limit, offset)
    return projects

@router.get("/projects/{id}", response_model=ProjectOut)
async def get_project(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    project = await ProjectService.get_project(db, id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@router.patch("/projects/{id}", response_model=ProjectOut)
async def update_project(
    id: uuid.UUID,
    req: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    project = await ProjectService.get_project(db, id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    try:
        if req.name is not None:
            project.name = req.name
        if req.status is not None:
            project.status = req.status
        if req.start_date is not None:
            project.start_date = req.start_date
        if req.end_date is not None:
            project.end_date = req.end_date
        if req.project_manager_id is not None:
            project.project_manager_id = req.project_manager_id
        if req.completion_percentage is not None:
            project.completion_percentage = req.completion_percentage
            
        await db.commit()
        full_project = await ProjectService.get_project(db, id)
        return full_project
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/projects/{id}/milestones", response_model=List[MilestoneOut])
async def create_project_milestones(
    id: uuid.UUID,
    milestones: List[MilestoneCreate],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        data = [m.model_dump() for m in milestones]
        created = await ProjectService.create_milestones(db, id, data)
        await db.commit()
        return created
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

# Project Tasks
@router.post("/tasks", response_model=ProjectTaskOut)
async def create_task(
    project_id: uuid.UUID = Query(...),
    req: ProjectTaskCreate = Depends(),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        task_data = req.model_dump()
        tasks = await ProjectService.create_tasks(db, project_id, [task_data])
        await ProjectService.recalculate_completion(db, project_id)
        await db.commit()
        return tasks[0]
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/tasks", response_model=List[ProjectTaskOut])
async def list_tasks(
    project_id: uuid.UUID = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy import select
    stmt = select(ProjectTask).where(ProjectTask.project_id == project_id).order_by(ProjectTask.created_at.desc())
    res = await db.execute(stmt)
    return list(res.scalars().all())

@router.patch("/tasks/{id}", response_model=ProjectTaskOut)
async def update_task(
    id: uuid.UUID,
    req: ProjectTaskUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy import select
    stmt = select(ProjectTask).where(ProjectTask.id == id)
    res = await db.execute(stmt)
    task = res.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    try:
        if req.milestone_id is not None:
            task.milestone_id = req.milestone_id
        if req.assigned_to is not None:
            task.assigned_to = req.assigned_to
        if req.title is not None:
            task.title = req.title
        if req.description is not None:
            task.description = req.description
        if req.status is not None:
            task.status = req.status
            if req.status == "COMPLETED" and not task.completed_at:
                task.completed_at = datetime.now(timezone.utc)
        if req.priority is not None:
            task.priority = req.priority
        if req.start_date is not None:
            task.start_date = req.start_date
        if req.due_date is not None:
            task.due_date = req.due_date
            
        await ProjectService.recalculate_completion(db, task.project_id)
        await db.commit()
        return task
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
