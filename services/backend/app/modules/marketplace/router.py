import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.dependencies import get_current_user, get_db
from app.modules.identity.models.user import User
from app.modules.marketplace.services.marketplace_service import MarketplaceService
from app.modules.templates.models import MarketplaceListing
from app.modules.templates.schemas import TemplateInstallationOut, TemplateInstallationCreate

router = APIRouter(prefix="/marketplace", tags=["Template Marketplace"])

@router.get("")
async def list_marketplace_listings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Returns all active listings
    result = await db.execute(select(MarketplaceListing).filter_by(status="ACTIVE"))
    listings = result.scalars().all()
    # Serialize listing info
    return [
        {
            "id": l.id,
            "template_id": l.template_id,
            "price": float(l.price),
            "status": l.status,
            "created_at": l.created_at
        }
        for l in listings
    ]

@router.post("/install", response_model=TemplateInstallationOut)
async def install_marketplace_listing(
    payload: TemplateInstallationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        # Resolve listing by template_id (or if listing_id is provided)
        result_listing = await db.execute(
            select(MarketplaceListing).filter_by(template_id=payload.template_id, status="ACTIVE")
        )
        listing = result_listing.scalars().first()
        if not listing:
            raise HTTPException(status_code=404, detail="Active template marketplace listing not found")

        purchase = await MarketplaceService.install_marketplace_template(db, current_user.organization_id, payload.event_id, listing.id)
        
        # Get installation record created in TemplateService
        from app.modules.templates.models import TemplateInstallation
        result_inst = await db.execute(
            select(TemplateInstallation).filter_by(event_id=payload.event_id, template_id=payload.template_id)
        )
        inst = result_inst.scalars().first()


        if not inst:
            raise HTTPException(status_code=500, detail="Failed to create installation record")

        return inst
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

