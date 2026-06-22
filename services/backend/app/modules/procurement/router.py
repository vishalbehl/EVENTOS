import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.modules.identity.models.user import User
from app.modules.procurement.services import VendorService
from app.modules.procurement.schemas import (
    VendorCreate, VendorOut, VendorServiceCreate, VendorServiceOut, VendorCompareItem
)

router = APIRouter(prefix="/vendors", tags=["procurement"])

@router.post("", response_model=VendorOut)
async def create_vendor(
    req: VendorCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        vendor = await VendorService.create_vendor(
            db=db,
            name=req.name,
            type=req.type,
            country=req.country,
            city=req.city,
            email=req.email,
            contact_person=req.contact_person,
            phone=req.phone,
            gst_number=req.gst_number,
            rating=req.rating,
            status=req.status
        )
        await db.commit()
        return vendor
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("", response_model=List[VendorOut])
async def get_vendors(
    type: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    vendors = await VendorService.get_vendors(
        db=db,
        type=type,
        status=status,
        limit=limit,
        offset=offset
    )
    return vendors

@router.post("/assign", response_model=VendorServiceOut)
async def assign_vendor_service(
    req: VendorServiceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        vs = await VendorService.assign_vendor(
            db=db,
            vendor_id=req.vendor_id,
            service_id=req.service_id,
            cost=req.cost
        )
        await db.commit()
        return vs
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/compare/{service_id}", response_model=List[VendorCompareItem])
async def compare_vendors(
    service_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        results = await VendorService.compare_vendors(db=db, service_id=service_id)
        return results
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
