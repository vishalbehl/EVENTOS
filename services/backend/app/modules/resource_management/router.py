from datetime import date
from typing import Any
import uuid
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from app.dependencies import OrganizerOrAbove, get_db
from .application.commands import ResourceCommandService
from .application.queries import ResourceQueryService
router = APIRouter(prefix="/resource-management", tags=["resource-management"])

class PlanIn(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    description: str | None = None
class StaffIn(BaseModel):
    employee_id: uuid.UUID; role_id: uuid.UUID; allocation_percentage: float = Field(ge=0, le=100); start_date: date; end_date: date
class EquipmentIn(BaseModel):
    hardware_id: uuid.UUID; quantity: int = Field(ge=1); start_date: date; end_date: date
class TravelIn(BaseModel):
    employee_id: uuid.UUID; city: str; hotel: str | None = None; arrival_date: date; departure_date: date
@router.post("/plans")
async def create_plan(project_id: uuid.UUID, payload: PlanIn, db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    row = await ResourceCommandService(db).create_plan(project_id=project_id, organization_id=user.organization_id, data=payload.model_dump()); return {"id": str(row.id), "project_id": str(row.project_id), "name": row.name, "description": row.description}
@router.post("/staff-assignments")
async def create_staff(project_id: uuid.UUID, payload: StaffIn, db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    row = await ResourceCommandService(db).create_staff(project_id=project_id, organization_id=user.organization_id, data=payload.model_dump()); return {"id": str(row.id), **{k: str(getattr(row, k)) for k in ("employee_id", "role_id")}, "allocation_percentage": float(row.allocation_percentage)}
@router.post("/equipment-assignments")
async def create_equipment(project_id: uuid.UUID, payload: EquipmentIn, db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    row = await ResourceCommandService(db).create_equipment(project_id=project_id, organization_id=user.organization_id, data=payload.model_dump()); return {"id": str(row.id), "hardware_id": str(row.hardware_id), "quantity": row.quantity}
@router.post("/travel-plans")
async def create_travel(project_id: uuid.UUID, payload: TravelIn, db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    row = await ResourceCommandService(db).create_travel(project_id=project_id, organization_id=user.organization_id, data=payload.model_dump()); return {"id": str(row.id), "employee_id": str(row.employee_id), "city": row.city, "status": row.status}
@router.patch("/travel-plans/{plan_id}")
async def update_travel(plan_id: uuid.UUID, payload: dict[str, Any] = Body(...), db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    row = await ResourceCommandService(db).update_travel(plan_id=plan_id, organization_id=user.organization_id, data=payload); return {"id": str(row.id), "status": row.status, "city": row.city}
@router.get("/allocations")
async def allocations(project_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    return await ResourceQueryService(db).list_allocations(
        project_id=project_id,
        organization_id=user.organization_id,
    )
@router.post("/conflicts/detect")
async def detect_conflicts(project_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: OrganizerOrAbove = None):
    project_exists = await ResourceQueryService(db).project_exists_for_scope(
        project_id=project_id,
        organization_id=user.organization_id,
    )
    if not project_exists:
        raise HTTPException(404, "Project not found.")
    return {"status": "success", "conflicts": []}
