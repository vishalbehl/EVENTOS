import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.modules.identity.models.user import User
from app.modules.inventory.services import InventoryService
from app.modules.inventory.schemas import (
    HardwareItemCreate, HardwareItemOut,
    AllocateHardwareRequest, ReturnHardwareRequest,
    HardwareCategoryCreate, HardwareCategoryOut
)

router = APIRouter(prefix="/inventory", tags=["inventory"])

@router.post("/categories", response_model=HardwareCategoryOut)
async def create_category(
    req: HardwareCategoryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        cat = await InventoryService.create_category(
            db=db,
            name=req.name,
            description=req.description
        )
        await db.commit()
        return cat
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/hardware", response_model=HardwareItemOut)
async def create_hardware(
    req: HardwareItemCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id
    try:
        item = await InventoryService.create_hardware_item(
            db=db,
            organization_id=org_id,
            category_id=req.category_id,
            asset_code=req.asset_code,
            name=req.name,
            brand=req.brand,
            model=req.model,
            serial_number=req.serial_number,
            purchase_date=req.purchase_date,
            purchase_cost=req.purchase_cost,
            replacement_cost=req.replacement_cost,
            status=req.status,
            condition=req.condition,
            location=req.location,
            notes=req.notes
        )
        await db.commit()
        return item
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/hardware", response_model=List[HardwareItemOut])
async def get_hardware(
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id
    items = await InventoryService.get_hardware_items(
        db=db,
        organization_id=org_id,
        status=status,
        limit=limit,
        offset=offset
    )
    return items

@router.post("/allocate", response_model=HardwareItemOut)
async def allocate_hardware(
    req: AllocateHardwareRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id
    try:
        item = await InventoryService.allocate_hardware(
            db=db,
            organization_id=org_id,
            hardware_id=req.hardware_id,
            to_location=req.to_location,
            notes=req.notes
        )
        if not item:
            raise HTTPException(status_code=400, detail="Hardware not available for allocation")
        await db.commit()
        return item
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/return", response_model=HardwareItemOut)
async def return_hardware(
    req: ReturnHardwareRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id
    try:
        item = await InventoryService.return_hardware(
            db=db,
            organization_id=org_id,
            hardware_id=req.hardware_id,
            return_location=req.return_location,
            condition=req.condition,
            notes=req.notes
        )
        if not item:
            raise HTTPException(status_code=404, detail="Hardware item not found")
        await db.commit()
        return item
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
