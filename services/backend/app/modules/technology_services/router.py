import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.dependencies import get_current_user, get_db
from app.modules.identity.models.user import User
from app.modules.technology_services.services import ServiceRequestService
from app.modules.technology_services.schemas import (
    ServiceRequestCreate, ServiceRequestOut, ServiceRequestUpdate
)

router = APIRouter(prefix="/service-requests", tags=["service-requests"])

@router.post("", response_model=ServiceRequestOut)
async def create_request(
    req: ServiceRequestCreate,
    event_id: uuid.UUID = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        org_id = current_user.organization_id
        if not org_id:
            raise HTTPException(status_code=400, detail="User does not belong to any organization")
            
        request = await ServiceRequestService.create_request(
            db=db,
            organization_id=org_id,
            event_id=event_id,
            requested_by=current_user.id,
            title=req.title,
            description=req.description,
            priority=req.priority,
            request_type=req.request_type,
            items_data=[item.model_dump() for item in req.items],
            requirements_data=[r.model_dump() for r in req.requirements]
        )
        await db.commit()
        full_request = await ServiceRequestService.get_request(db, request.id)
        return full_request
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("", response_model=List[ServiceRequestOut])
async def list_requests(
    event_id: uuid.UUID = Query(...),
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        requests = await ServiceRequestService.list_requests(
            db=db,
            event_id=event_id,
            status=status,
            limit=limit,
            offset=offset
        )
        return requests
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/{id}", response_model=ServiceRequestOut)
async def get_request(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    request = await ServiceRequestService.get_request(db, id)
    if not request:
        raise HTTPException(status_code=404, detail="Service request not found")
    return request

@router.patch("/{id}", response_model=ServiceRequestOut)
async def update_request(
    id: uuid.UUID,
    req: ServiceRequestUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    request = await ServiceRequestService.get_request(db, id)
    if not request:
        raise HTTPException(status_code=404, detail="Service request not found")
        
    try:
        if req.title is not None:
            request.title = req.title
        if req.description is not None:
            request.description = req.description
        if req.priority is not None:
            request.priority = req.priority
        if req.status is not None:
            request.status = req.status
            
        await db.commit()
        full_request = await ServiceRequestService.get_request(db, id)
        return full_request
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{id}/submit", response_model=ServiceRequestOut)
async def submit_request(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        request = await ServiceRequestService.submit_request(db, id, current_user.id)
        if not request:
            raise HTTPException(status_code=400, detail="Cannot submit request (must be in DRAFT status)")
        await db.commit()
        full_request = await ServiceRequestService.get_request(db, id)
        return full_request
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{id}/approve", response_model=ServiceRequestOut)
async def approve_request(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        request = await ServiceRequestService.approve_request(db, id, current_user.id)
        if not request:
            raise HTTPException(status_code=400, detail="Cannot approve request (must be in SUBMITTED, UNDER_REVIEW, or QUOTED status)")
        await db.commit()
        full_request = await ServiceRequestService.get_request(db, id)
        return full_request
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
