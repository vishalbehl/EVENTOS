# backend/app/routers/ticket_types.py
from __future__ import annotations

from typing import Dict, Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_event, CurrentEvent
from app.modules.registration.models.ticket_type import TicketType
from app.modules.registration.services.ticket_pricing_service import TicketPricingService
from app.schemas.common import MessageResponse
from app.core.dependencies.feature_gate import require_event_operation

router = APIRouter(prefix="/events/{event_id}/pricing", tags=["pricing"], dependencies=[require_event_operation("registration.ticket_types.manage")])


# ── Tier management ───────────────────────────────────────────────────────────

class TiersSaveRequest(BaseModel):
    tiers: List[str]


@router.get("/tiers", response_model=List[str])
async def get_tiers(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> List[str]:
    """Return tier names configured for this event."""
    reg_settings = getattr(event, "registration_settings", {}) or {}
    tiers = reg_settings.get("tiers", [])
    if not tiers:
        result = await db.execute(
            select(TicketType.tier_name).where(TicketType.event_id == event.id).distinct()
        )
        tiers = [r[0] for r in result.all()]
    return tiers


@router.post("/tiers", response_model=MessageResponse)
async def save_tiers(
    payload: TiersSaveRequest,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Persist tier names in event.registration_settings.tiers."""
    await TicketPricingService.set_tiers(db, event, payload.tiers)
    await db.commit()
    return MessageResponse(message="Tiers saved successfully.")


@router.get("/schedules", response_model=Dict[str, Dict[str, Optional[str]]])
async def get_tier_schedules(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Dict[str, Optional[str]]]:
    """Return available_from (start date/time) and available_until (cutoff date/time) for each pricing tier."""
    q = select(TicketType).where(TicketType.event_id == event.id)
    result = await db.execute(q)
    tickets = result.scalars().all()

    schedules: Dict[str, Dict[str, Optional[str]]] = {}
    for t in tickets:
        if t.tier_name not in schedules:
            schedules[t.tier_name] = {
                "available_from": t.available_from.isoformat() if t.available_from else None,
                "available_until": t.available_until.isoformat() if t.available_until else None,
            }

    # Merge with event.registration_settings
    reg_settings = getattr(event, "registration_settings", {}) or {}
    setting_schedules = reg_settings.get("tier_schedules", {})
    setting_cutoffs = reg_settings.get("tier_cutoffs", {})

    for tier, sched in setting_schedules.items():
        if tier not in schedules:
            schedules[tier] = {
                "available_from": sched.get("available_from") or sched.get("start_time"),
                "available_until": sched.get("available_until") or sched.get("end_time") or sched.get("last_date"),
            }
        else:
            if not schedules[tier].get("available_from") and (sched.get("available_from") or sched.get("start_time")):
                schedules[tier]["available_from"] = sched.get("available_from") or sched.get("start_time")
            if not schedules[tier].get("available_until") and (sched.get("available_until") or sched.get("end_time") or sched.get("last_date")):
                schedules[tier]["available_until"] = sched.get("available_until") or sched.get("end_time") or sched.get("last_date")

    for tier, cutoff in setting_cutoffs.items():
        if tier not in schedules:
            schedules[tier] = {
                "available_from": None,
                "available_until": cutoff,
            }
        elif not schedules[tier].get("available_until") and cutoff:
            schedules[tier]["available_until"] = cutoff

    return schedules


# ── Pricing matrix ────────────────────────────────────────────────────────────

class PricingSaveRequest(BaseModel):
    pricingData: Dict[str, Any]
    tierSchedules: Optional[Dict[str, Dict[str, Optional[str]]]] = None


@router.get("", response_model=Dict[str, float])
async def get_pricing(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, float]:
    q = select(TicketType).where(TicketType.event_id == event.id)
    result = await db.execute(q)
    tickets = result.scalars().all()
    pricing_map = {}
    for t in tickets:
        key = f"{t.role_name}_{t.tier_name}"
        pricing_map[key] = t.price
    return pricing_map


@router.post("", response_model=MessageResponse)
async def save_pricing(
    payload: PricingSaveRequest,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    try:
        await TicketPricingService.replace_matrix(
            db, event, payload.pricingData, tier_schedules=payload.tierSchedules
        )
        await db.commit()
        return MessageResponse(message="Pricing matrix and schedules saved successfully.")

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save pricing matrix: {str(e)}"
        )
