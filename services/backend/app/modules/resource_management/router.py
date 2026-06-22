import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.dependencies import get_current_user, get_db
from app.modules.identity.models.user import User
from app.modules.resource_management.services import ResourcePlanningService
from app.modules.resource_management.schemas import (
    ResourcePlanCreate, ResourcePlanOut,
    ResourceAllocationCreate, ResourceAllocationOut,
    StaffAssignmentCreate, StaffAssignmentOut,
    EquipmentAssignmentCreate, EquipmentAssignmentOut,
    TravelPlanCreate, TravelPlanUpdate, TravelPlanOut
)
from app.modules.resource_management.models import (
    ResourceAllocation, StaffAssignment, EquipmentAssignment, TravelPlan, ResourcePlan
)

router = APIRouter(prefix="/resource-management", tags=["resource-management"])

@router.post("/plans", response_model=ResourcePlanOut)
async def create_resource_plan(
    req: ResourcePlanCreate,
    project_id: uuid.UUID = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        plan = await ResourcePlanningService.create_resource_plan(
            db=db,
            project_id=project_id,
            name=req.name,
            description=req.description
        )
        await db.commit()
        return plan
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/plans", response_model=List[ResourcePlanOut])
async def list_resource_plans(
    project_id: uuid.UUID = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        stmt = select(ResourcePlan).where(ResourcePlan.project_id == project_id)
        res = await db.execute(stmt)
        return list(res.scalars().all())
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/staff-assignments", response_model=StaffAssignmentOut)
async def assign_staff(
    req: StaffAssignmentCreate,
    project_id: uuid.UUID = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        assignment = await ResourcePlanningService.allocate_staff(
            db=db,
            project_id=project_id,
            employee_id=req.employee_id,
            role_id=req.role_id,
            allocation_percentage=req.allocation_percentage,
            start_date=req.start_date,
            end_date=req.end_date
        )
        await db.commit()
        
        # Fetch detailed assignment with names if possible
        stmt = select(StaffAssignment).where(StaffAssignment.id == assignment.id)
        res = await db.execute(stmt)
        return res.scalar_one()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/staff-assignments", response_model=List[StaffAssignmentOut])
async def list_staff_assignments(
    project_id: uuid.UUID = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        stmt = select(StaffAssignment).where(StaffAssignment.project_id == project_id)
        res = await db.execute(stmt)
        return list(res.scalars().all())
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/equipment-assignments", response_model=EquipmentAssignmentOut)
async def assign_equipment(
    req: EquipmentAssignmentCreate,
    project_id: uuid.UUID = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        assignment = await ResourcePlanningService.allocate_equipment(
            db=db,
            project_id=project_id,
            hardware_id=req.hardware_id,
            quantity=req.quantity,
            start_date=req.start_date,
            end_date=req.end_date
        )
        await db.commit()
        
        stmt = select(EquipmentAssignment).where(EquipmentAssignment.id == assignment.id)
        res = await db.execute(stmt)
        return res.scalar_one()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/equipment-assignments", response_model=List[EquipmentAssignmentOut])
async def list_equipment_assignments(
    project_id: uuid.UUID = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        stmt = select(EquipmentAssignment).where(EquipmentAssignment.project_id == project_id)
        res = await db.execute(stmt)
        return list(res.scalars().all())
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/travel-plans", response_model=TravelPlanOut)
async def create_travel_plan(
    req: TravelPlanCreate,
    project_id: uuid.UUID = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        travel = await ResourcePlanningService.create_travel_plan(
            db=db,
            project_id=project_id,
            employee_id=req.employee_id,
            city=req.city,
            hotel=req.hotel,
            arrival_date=req.arrival_date,
            departure_date=req.departure_date
        )
        await db.commit()
        
        stmt = select(TravelPlan).where(TravelPlan.id == travel.id)
        res = await db.execute(stmt)
        return res.scalar_one()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/travel-plans", response_model=List[TravelPlanOut])
async def list_travel_plans(
    project_id: uuid.UUID = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        stmt = select(TravelPlan).where(TravelPlan.project_id == project_id)
        res = await db.execute(stmt)
        return list(res.scalars().all())
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.patch("/travel-plans/{id}", response_model=TravelPlanOut)
async def update_travel_plan(
    id: uuid.UUID,
    req: TravelPlanUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        stmt = select(TravelPlan).where(TravelPlan.id == id)
        res = await db.execute(stmt)
        travel = res.scalar_one_or_none()
        if not travel:
            raise HTTPException(status_code=404, detail="Travel plan not found")
            
        if req.city is not None:
            travel.city = req.city
        if req.hotel is not None:
            travel.hotel = req.hotel
        if req.arrival_date is not None:
            travel.arrival_date = req.arrival_date
        if req.departure_date is not None:
            travel.departure_date = req.departure_date
        if req.status is not None:
            travel.status = req.status
            
        await db.commit()
        return travel
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/allocations", response_model=List[ResourceAllocationOut])
async def list_allocations(
    project_id: uuid.UUID = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        stmt = select(ResourceAllocation).where(ResourceAllocation.project_id == project_id)
        res = await db.execute(stmt)
        return list(res.scalars().all())
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/conflicts/detect")
async def detect_conflicts(
    project_id: uuid.UUID = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        conflicts = await ResourcePlanningService.detect_resource_conflicts(db, project_id)
        await db.commit()
        return {"status": "success", "conflicts": conflicts}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
