import uuid
from datetime import datetime, timezone
from typing import Optional, Dict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.rbac.models.event import Event
from app.modules.registration.models.ticket_type import TicketType


def get_active_tier(event: Event) -> str:
    """
    Determines the active pricing tier for the event based on current datetime and cutoffs.
    """
    settings = event.registration_settings or {}
    cutoffs = settings.get("tier_cutoffs", {})
    tiers = settings.get("tiers", ["Early Bird", "Standard"])

    if not tiers:
        return "Standard"

    if not cutoffs:
        return tiers[0]

    now = datetime.now(timezone.utc)

    # Get tiers with valid cutoff dates
    tier_cutoffs_list = []
    for tier in tiers:
        cutoff_str = cutoffs.get(tier)
        if cutoff_str:
            try:
                cutoff_dt = datetime.fromisoformat(cutoff_str.replace("Z", "+00:00"))
                if cutoff_dt.tzinfo is None:
                    cutoff_dt = cutoff_dt.replace(tzinfo=timezone.utc)
                tier_cutoffs_list.append((tier, cutoff_dt))
            except Exception:
                pass

    # Sort by cutoff date ascending
    tier_cutoffs_list.sort(key=lambda x: x[1])

    # The active tier is the first one that hasn't expired yet
    for tier, cutoff_dt in tier_cutoffs_list:
        if cutoff_dt > now:
            return tier

    # Fallback to the first tier that doesn't have a cutoff (fallback)
    for tier in tiers:
        if tier not in cutoffs:
            return tier

    # If all have cutoffs and all are in the past, return the last tier
    return tiers[-1]


async def get_ticket_price(db: AsyncSession, event_id: uuid.UUID, role_name: str, tier_name: str) -> Optional[float]:
    """
    Get price for a specific category and tier.
    """
    stmt = select(TicketType.price).where(
        TicketType.event_id == event_id,
        TicketType.role_name == role_name,
        TicketType.tier_name == tier_name
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_active_prices_for_event(db: AsyncSession, event: Event) -> Dict[str, float]:
    """
    Get the price mapping for all active categories under the active tier.
    """
    active_tier = get_active_tier(event)
    stmt = select(TicketType).where(
        TicketType.event_id == event.id,
        TicketType.tier_name == active_tier
    )
    result = await db.execute(stmt)
    tickets = result.scalars().all()
    
    # Also fallback to default seed roles if there's no configured pricing
    pricing_map = {t.role_name: t.price for t in tickets}
    return pricing_map
