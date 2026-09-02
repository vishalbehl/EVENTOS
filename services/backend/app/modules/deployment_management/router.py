from datetime import date
import uuid
from typing import Any
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.dependencies import OrganizerOrAbove, get_db
from .models import Deployment, DeploymentChecklist, ReadinessScore, Risk
from .application.commands import DeploymentCommandService
from .application.queries import DeploymentQueryService
router = APIRouter(prefix="/deployments", tags=["deployment-management"])
async def project(db, project_id, user):
    row = await DeploymentQueryService(db).get_project(
        project_id=project_id,
        organization_id=user.organization_id,
    )
    if row is None: raise HTTPException(404, "Project not found.")
    return row
class DeploymentIn(BaseModel):
    deployment_number: str; deployment_date: date; deployment_status: str
@router.post("")
async def create_deployment(project_id: uuid.UUID, payload: DeploymentIn, db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    row = await DeploymentCommandService(db).create_deployment(
        project_id=project_id,
        organization_id=user.organization_id,
        **payload.model_dump(),
    )
    return {"id": str(row.id), "deployment_number": row.deployment_number, "deployment_status": row.deployment_status}
@router.get("/{deployment_id}/checklists")
async def checklists(
    deployment_id: uuid.UUID,
    limit: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: OrganizerOrAbove = None,
):
    row = await DeploymentQueryService(db).get_deployment_for_organization(
        deployment_id=deployment_id,
        organization_id=user.organization_id,
    )
    if row is None: raise HTTPException(404, "Deployment not found.")
    rows = await DeploymentQueryService(db).list_checklists(
        deployment_id=deployment_id,
        organization_id=user.organization_id,
        limit=limit,
    )
    return [{"id": str(item.id), "title": item.title, "status": item.status} for item in rows]
@router.patch("/checklists/{checklist_id}")
async def update_checklist(checklist_id: uuid.UUID, status: str = Query(...), db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    row = await DeploymentCommandService(db).update_checklist(
        checklist_id=checklist_id,
        organization_id=user.organization_id,
        status=status,
    )
    return {"id": str(row.id), "status": row.status}
@router.get("/projects/{project_id}/readiness")
async def readiness(project_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    await project(db, project_id, user); return {"technology_score": 0, "staff_score": 0, "equipment_score": 0, "network_score": 0, "overall_score": 0}
@router.post("/{deployment_id}/complete")
async def complete(deployment_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    row = await DeploymentCommandService(db).complete(
        deployment_id=deployment_id,
        organization_id=user.organization_id,
    )
    return {"id": str(row.id), "deployment_status": row.deployment_status}
@router.post("/projects/{project_id}/risks")
async def create_risk(project_id: uuid.UUID, payload: dict[str, Any] = Body(...), db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    row = await DeploymentCommandService(db).create_risk(
        project_id=project_id,
        organization_id=user.organization_id,
        payload=payload,
    )
    return {"id": str(row.id), "status": row.status, "title": row.title}
@router.get("/projects/{project_id}/risks")
async def list_risks(
    project_id: uuid.UUID,
    limit: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: OrganizerOrAbove = None,
):
    rows = await DeploymentQueryService(db).list_risks(
        project_id=project_id,
        organization_id=user.organization_id,
        limit=limit,
    )
    return [{"id": str(row.id), "status": row.status, "title": row.title} for row in rows]
@router.patch("/risks/{risk_id}")
async def update_risk(risk_id: uuid.UUID, payload: dict[str, Any] = Body(...), db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    row = await DeploymentCommandService(db).update_risk(
        risk_id=risk_id,
        organization_id=user.organization_id,
        payload=payload,
    )
    return {"id": str(row.id), "status": row.status, "title": row.title}
