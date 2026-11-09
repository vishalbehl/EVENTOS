# backend/app/routers/ticket_types.py
from __future__ import annotations

from typing import Dict, Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Header, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_event, CurrentEvent, get_current_user, require_active_user, require_step_up
from app.modules.events.models.event import Event
from app.modules.registration.schemas.pricing_configuration import PricingConfigurationUpdate, PricingConfigurationResponse
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
    model_config = ConfigDict(extra="forbid")
    tiers: List[str] = Field(min_length=1, max_length=100)


@router.get("/configuration", response_model=PricingConfigurationResponse)
async def get_pricing_configuration(event: CurrentEvent, response: Response,
                                    db: AsyncSession = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    owned = await db.scalar(select(Event).where(Event.id == event.id,
        Event.organization_id == event.organization_id, Event.deleted_at.is_(None))
        .with_for_update(read=True).execution_options(populate_existing=True))
    if owned is None:
        raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"})
    result = await PricingCommandService.snapshot(db, event=owned)
    await db.commit()
    return result


@router.post("/configuration", response_model=PricingConfigurationResponse, dependencies=[Depends(require_step_up)])
async def save_pricing_configuration(payload: PricingConfigurationUpdate, event: CurrentEvent,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(require_active_user),
    if_match: str | None = Header(None, alias="If-Match"),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key")):
    return await PricingCommandService.configure(db, event=event,
        changes=payload.model_dump(mode="json"), actor=current_user,
        if_match=if_match, idempotency_key=idempotency_key)


@router.get("/tiers", response_model=List[str])
async def get_tiers(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> List[str]:
    """Return tier names configured for this event."""
    reg_settings = getattr(event, "registration_settings", {}) or {}
    setting_tiers = reg_settings.get("tiers", []) or []
    db_tiers = await PricingQueryService(db).list_distinct_tiers(event_id=event.id)
    combined = list(dict.fromkeys([t.strip() for t in setting_tiers if t and t.strip()] + [t.strip() for t in db_tiers if t and t.strip()]))
    return combined


@router.post("/tiers", response_model=MessageResponse, dependencies=[Depends(require_step_up)])
async def save_tiers(
    payload: TiersSaveRequest,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_active_user),
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
    model_config = ConfigDict(extra="forbid")
    pricingData: Dict[str, Any] = Field(max_length=10000)
    tierSchedules: Optional[Dict[str, Dict[str, Optional[str]]]] = Field(default=None, max_length=100)


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


@router.post("", response_model=MessageResponse, dependencies=[Depends(require_step_up)])
async def save_pricing(
    payload: PricingSaveRequest,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_active_user),
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
