# backend/app/routers/ticket_types.py
from __future__ import annotations

from typing import Dict, Any, List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_event, CurrentEvent
from app.models.ticket_type import TicketType
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/events/{event_id}/pricing", tags=["pricing"])


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
    reg_settings = dict(getattr(event, "registration_settings", {}) or {})
    reg_settings["tiers"] = payload.tiers
    event.registration_settings = reg_settings
    await db.commit()
    return MessageResponse(message="Tiers saved successfully.")


# ── Pricing matrix ────────────────────────────────────────────────────────────

class PricingSaveRequest(BaseModel):
    pricingData: Dict[str, Any]


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
        submitted_keys = set()
        for key, price in payload.pricingData.items():
            if "_" in key and price is not None and price != "":
                submitted_keys.add(key)

        current_q = select(TicketType).where(TicketType.event_id == event.id)
        current_res = await db.execute(current_q)
        current_tickets = current_res.scalars().all()

        for t in current_tickets:
            composite_key = f"{t.role_name}_{t.tier_name}"
            if composite_key not in submitted_keys:
                await db.delete(t)

        for key, price in payload.pricingData.items():
            if "_" not in key or price is None or price == "":
                continue
            role_name, tier_name = key.split("_", 1)
            try:
                price_val = float(price)
            except (ValueError, TypeError):
                continue

            exist_q = select(TicketType).where(
                TicketType.event_id == event.id,
                TicketType.role_name == role_name,
                TicketType.tier_name == tier_name
            )
            exist_res = await db.execute(exist_q)
            existing_t = exist_res.scalar_one_or_none()

            if existing_t:
                existing_t.price = price_val
            else:
                new_t = TicketType(
                    event_id=event.id,
                    role_name=role_name,
                    tier_name=tier_name,
                    price=price_val
                )
                db.add(new_t)

        await db.commit()
        return MessageResponse(message="Pricing matrix saved successfully.")

    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save pricing matrix: {str(e)}"
        )
