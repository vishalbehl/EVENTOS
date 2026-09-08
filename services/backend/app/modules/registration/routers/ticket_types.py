# backend/app/routers/ticket_types.py
from __future__ import annotations

from typing import Dict, Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Header
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_event, CurrentEvent, get_current_user
from app.modules.identity.models.user import User
from app.modules.registration.application.commands import PricingCommandService
from app.modules.registration.application.queries import PricingQueryService
from app.schemas.common import MessageResponse
from app.core.dependencies.feature_gate import require_event_operation
from app.core.cache import cache_service
from app.core.cache_keys import TenantCacheKey
from app.core.cache_policy import CacheTTL, ttl

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
        tiers = await PricingQueryService(db).list_distinct_tiers(event_id=event.id)
    return tiers


@router.post("/tiers", response_model=MessageResponse)
async def save_tiers(
    payload: TiersSaveRequest,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    if_match: Optional[str] = Header(None, alias="If-Match"),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
) -> MessageResponse:
    """Persist tier names in event.registration_settings.tiers."""
    await PricingCommandService.save_tiers(db, event=event, tiers=payload.tiers, actor=current_user, if_match=if_match, idempotency_key=idempotency_key)
    return MessageResponse(message="Tiers saved successfully.")


@router.get("/schedules", response_model=Dict[str, Dict[str, Optional[str]]])
async def get_tier_schedules(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Dict[str, Optional[str]]]:
    """Return available_from (start date/time) and available_until (cutoff date/time) for each pricing tier."""
    reg_settings = getattr(event, "registration_settings", {}) or {}
    return await PricingQueryService(db).schedules(
        event_id=event.id,
        registration_settings=reg_settings,
    )


# ── Pricing matrix ────────────────────────────────────────────────────────────

class PricingSaveRequest(BaseModel):
    pricingData: Dict[str, Any]
    tierSchedules: Optional[Dict[str, Dict[str, Optional[str]]]] = None


@router.get("", response_model=Dict[str, float])
async def get_pricing(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, float]:
    key = TenantCacheKey.event(
        event.id,
        "registration-pricing-map-v1",
        organization_id=event.organization_id,
    )

    async def load_pricing() -> Dict[str, float]:
        return await PricingQueryService(db).pricing_map(event_id=event.id)

    cached = await cache_service.get_or_set(
        key,
        load_pricing,
        ttl(CacheTTL.PRICING),
    )
    return {str(name): float(price) for name, price in (cached or {}).items()}


@router.post("", response_model=MessageResponse)
async def save_pricing(
    payload: PricingSaveRequest,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    if_match: Optional[str] = Header(None, alias="If-Match"),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
) -> MessageResponse:
    await PricingCommandService.save_matrix(
        db,
        event=event,
        pricing_data=payload.pricingData,
        tier_schedules=payload.tierSchedules,
        actor=current_user,
        if_match=if_match,
        idempotency_key=idempotency_key,
    )
    return MessageResponse(message="Pricing matrix and schedules saved successfully.")
