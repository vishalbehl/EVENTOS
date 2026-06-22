import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.modules.identity.models.user import User
from app.modules.pricing.services import PricingService, SimulationService
from app.modules.pricing.models import PricingSimulation, RevenueForecast
from app.modules.pricing.schemas import (
    PriceCalculateRequest, PriceCalculateResponse,
    PricingSimulationCreate, PricingSimulationOut,
    RevenueForecastOut
)

router = APIRouter(prefix="/pricing", tags=["pricing"])

@router.post("/calculate", response_model=PriceCalculateResponse)
async def calculate_price(
    req: PriceCalculateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id
    try:
        res = await PricingService.calculate_price(
            db=db,
            organization_id=org_id,
            service_id=req.service_id,
            region=req.region,
            currency=req.currency,
            quantity=req.quantity,
            input_data=req.input_data
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/simulate", response_model=PricingSimulationOut)
async def simulate_pricing(
    req: PricingSimulationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id
    try:
        sim = await SimulationService.simulate_pricing(
            db=db,
            organization_id=org_id,
            user_id=current_user.id,
            name=req.name,
            input_data=req.input_data
        )
        await db.commit()
        return sim
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/simulations", response_model=List[PricingSimulationOut])
async def get_simulations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id
    stmt = select(PricingSimulation)
    if org_id:
        stmt = stmt.where(or_(PricingSimulation.organization_id == org_id, PricingSimulation.user_id == current_user.id))
    else:
        stmt = stmt.where(PricingSimulation.user_id == current_user.id)
    
    stmt = stmt.order_by(desc(PricingSimulation.created_at))
    res = await db.execute(stmt)
    return list(res.scalars().all())

@router.get("/forecast", response_model=List[RevenueForecastOut])
async def get_forecast(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id
    if not org_id:
        return []
    
    stmt = select(RevenueForecast).where(RevenueForecast.organization_id == org_id).order_by(desc(RevenueForecast.month))
    res = await db.execute(stmt)
    return list(res.scalars().all())
