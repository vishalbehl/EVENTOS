import uuid
from datetime import datetime, timezone
from typing import Optional, Dict
from dateutil.parser import isoparse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.events.models.event import Event
from app.modules.registration.models.ticket_type import TicketType
from app.core.cache import get_json, set_json
from app.core.cache_keys import TenantCacheKey
from app.core.cache_policy import CacheTTL, ttl


def _parse_utc_dt(val: Optional[str]) -> Optional[datetime]:
    if not val or not isinstance(val, str) or not val.strip():
        return None
    try:
        dt = isoparse(val.strip())
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def get_active_tier(event: Event) -> str:
    """
    Determines the active pricing tier for the event based on current datetime and schedule window (start_time & end_time).
    """
    settings = event.registration_settings or {}
    schedules = settings.get("tier_schedules", {})
    cutoffs = settings.get("tier_cutoffs", {})
    tiers = settings.get("tiers", ["Early Bird", "Standard"])

    if not tiers:
        return "Standard"

    now = datetime.now(timezone.utc)

    # 1. Find currently open tiers (where start <= now and now <= end)
    for tier in tiers:
        sched = schedules.get(tier, {})
        start_str = sched.get("available_from") or sched.get("start_time")
        end_str = sched.get("available_until") or sched.get("end_time") or sched.get("last_date") or cutoffs.get(tier)

        start_dt = _parse_utc_dt(start_str)
        end_dt = _parse_utc_dt(end_str)

        is_started = (start_dt is None) or (now >= start_dt)
        is_not_expired = (end_dt is None) or (now <= end_dt)

        if is_started and is_not_expired:
            return tier

    # 2. If no tier is currently open, find next upcoming tier
    upcoming = []
    for tier in tiers:
        sched = schedules.get(tier, {})
        start_str = sched.get("available_from") or sched.get("start_time")
        start_dt = _parse_utc_dt(start_str)
        if start_dt and start_dt > now:
            upcoming.append((tier, start_dt))
    if upcoming:
        upcoming.sort(key=lambda x: x[1])
        return upcoming[0][0]

    # 3. Fallback to first tier
    return tiers[0]


from sqlalchemy import func


async def get_ticket_price(db: AsyncSession, event_id: uuid.UUID, role_name: str, tier_name: str) -> Optional[float]:
    """
    Get price for a specific category and tier with robust case-insensitive matching.
    Strictly scoped to the requested tier; returns 0.0 if not configured/free.
    """
    if not role_name:
        return 0.0

    clean_role = role_name.strip().lower()
    clean_tier = (tier_name or "").strip().lower()

    stmt = select(TicketType.price).where(
        TicketType.event_id == event_id,
        func.lower(TicketType.role_name) == clean_role,
        func.lower(TicketType.tier_name) == clean_tier
    )
    result = await db.execute(stmt)
    price = result.scalar_one_or_none()
    if price is not None:
        return float(price)

    return 0.0


async def get_active_prices_for_event(db: AsyncSession, event: Event) -> Dict[str, float]:
    """
    Get the price mapping strictly for all categories under the active tier.
    No cross-tier fallback is performed so that tiers (e.g. Free Standard) are respected.
    """
    active_tier = get_active_tier(event)
    cache_key = TenantCacheKey.event_prices(event.id, active_tier, event.organization_id)
    cached = await get_json(cache_key)
    if isinstance(cached, dict):
        return {str(name): float(price) for name, price in cached.items()}
    stmt = select(TicketType.role_name, TicketType.price).where(
        TicketType.event_id == event.id,
        func.lower(TicketType.tier_name) == active_tier.lower()
    )
    result = await db.execute(stmt)
    pricing_map = {row.role_name: float(row.price) for row in result}
    await set_json(cache_key, pricing_map, ttl(CacheTTL.PRICING))
    return pricing_map
