import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.dependencies import get_current_user, get_db
from app.modules.identity.models.user import User
from app.modules.deployment_management.services import ReadinessService, DeploymentService
from app.modules.deployment_management.schemas import (
    DeploymentCreate, DeploymentOut,
    DeploymentChecklistCreate, DeploymentChecklistOut,
    DeploymentLogOut, ReadinessScoreOut,
    RiskCreate, RiskUpdate, RiskOut
)
from app.modules.deployment_management.models import (
    Deployment, DeploymentChecklist, DeploymentLog, ReadinessScore, Risk
)

router = APIRouter(prefix="/deployments", tags=["deployments"])

@router.post("", response_model=DeploymentOut)
async def create_deployment(
    req: DeploymentCreate,
    project_id: uuid.UUID = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        deployment = await DeploymentService.create_deployment(
            db=db,
            project_id=project_id,
            deployment_number=req.deployment_number,
            deployment_date=req.deployment_date
        )
        await db.commit()
        return deployment
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("", response_model=List[DeploymentOut])
async def list_deployments(
    project_id: uuid.UUID = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        stmt = select(Deployment).where(Deployment.project_id == project_id)
        res = await db.execute(stmt)
        return list(res.scalars().all())
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/{id}", response_model=DeploymentOut)
async def get_deployment(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Deployment).where(Deployment.id == id)
    res = await db.execute(stmt)
    deployment = res.scalar_one_or_none()
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    return deployment

@router.post("/{id}/complete", response_model=DeploymentOut)
async def complete_deployment(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        deployment = await DeploymentService.complete_deployment(db, id, current_user.id)
        if not deployment:
            raise HTTPException(status_code=404, detail="Deployment not found")
        await db.commit()
        return deployment
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

# Checklist Items
@router.get("/{id}/checklists", response_model=List[DeploymentChecklistOut])
async def list_checklists(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        stmt = select(DeploymentChecklist).where(DeploymentChecklist.deployment_id == id)
        res = await db.execute(stmt)
        return list(res.scalars().all())
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.patch("/checklists/{checklist_id}", response_model=DeploymentChecklistOut)
async def update_checklist_status(
    checklist_id: uuid.UUID,
    status: str = Query(...), # PENDING, COMPLETED
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        stmt = select(DeploymentChecklist).where(DeploymentChecklist.id == checklist_id)
        res = await db.execute(stmt)
        item = res.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Checklist item not found")
            
        item.status = status
        await db.commit()
        return item
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

# Readiness Scores
@router.get("/projects/{project_id}/readiness", response_model=ReadinessScoreOut)
async def get_readiness_score(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        score = await ReadinessService.calculate_readiness(db, project_id)
        await db.commit()
        return score
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

# Risks
@router.post("/projects/{project_id}/risks", response_model=RiskOut)
async def create_risk(
    project_id: uuid.UUID,
    req: RiskCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        risk = await ReadinessService.create_risk(
            db=db,
            project_id=project_id,
            title=req.title,
            description=req.description,
            severity=req.severity,
            probability=req.probability,
            mitigation_plan=req.mitigation_plan
        )
        await db.commit()
        return risk
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/projects/{project_id}/risks", response_model=List[RiskOut])
async def list_risks(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        stmt = select(Risk).where(Risk.project_id == project_id)
        res = await db.execute(stmt)
        return list(res.scalars().all())
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.patch("/risks/{risk_id}", response_model=RiskOut)
async def update_risk(
    risk_id: uuid.UUID,
    req: RiskUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        stmt = select(Risk).where(Risk.id == risk_id)
        res = await db.execute(stmt)
        risk = res.scalar_one_or_none()
        if not risk:
            raise HTTPException(status_code=404, detail="Risk not found")
            
        if req.title is not None:
            risk.title = req.title
        if req.description is not None:
            risk.description = req.description
        if req.severity is not None:
            risk.severity = req.severity
        if req.probability is not None:
            risk.probability = req.probability
        if req.mitigation_plan is not None:
            risk.mitigation_plan = req.mitigation_plan
        if req.status is not None:
            risk.status = req.status
            
        await db.commit()
        return risk
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
