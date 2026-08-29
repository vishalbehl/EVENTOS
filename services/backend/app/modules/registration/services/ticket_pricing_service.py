from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from dateutil.parser import isoparse
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.events.models.event import Event
from app.modules.registration.models.ticket_type import TicketType


def _parse_dt(val: Any) -> Optional[datetime]:
    if not val:
        return None
    if isinstance(val, datetime):
        return val
    if isinstance(val, str) and val.strip():
        try:
            return isoparse(val.strip())
        except Exception:
            return None
    return None


class TicketPricingService:
    """Canonical ticket-tier pricing validation and persistence."""

    @staticmethod
    async def replace_matrix(
        db: AsyncSession,
        event: Event,
        pricing_data: dict[str, Any],
        tier_schedules: Optional[dict[str, dict[str, Any]]] = None,
    ) -> dict[str, float]:
        normalized: dict[tuple[str, str], float] = {}
        for key, raw_price in pricing_data.items():
            if "_" not in key or raw_price in (None, ""):
                continue
            role_name, tier_name = key.split("_", 1)
            role_name, tier_name = role_name.strip(), tier_name.strip()
            if not role_name or not tier_name:
                raise HTTPException(status_code=422, detail=f"Invalid pricing key: {key}")
            try:
                price = float(raw_price)
            except (ValueError, TypeError) as exc:
                raise HTTPException(status_code=422, detail=f"Invalid price for {key}") from exc
            if price < 0:
                raise HTTPException(status_code=422, detail="Ticket prices cannot be negative")
            normalized[(role_name, tier_name)] = price

        schedules = tier_schedules or {}
        # Also check existing event registration_settings if not explicitly provided
        existing_schedules = (event.registration_settings or {}).get("tier_schedules", {})
        existing_cutoffs = (event.registration_settings or {}).get("tier_cutoffs", {})

        current = (await db.scalars(select(TicketType).where(TicketType.event_id == event.id).with_for_update())).all()
        by_key = {(row.role_name, row.tier_name): row for row in current}
        
        for key, row in by_key.items():
            if key not in normalized:
                await db.delete(row)
                
        for (role, tier), price in normalized.items():
            tier_sched = schedules.get(tier) or existing_schedules.get(tier) or {}
            avail_from = _parse_dt(tier_sched.get("available_from") or tier_sched.get("start_time"))
            avail_until = _parse_dt(
                tier_sched.get("available_until")
                or tier_sched.get("end_time")
                or tier_sched.get("last_date")
                or existing_cutoffs.get(tier)
            )

            if (role, tier) in by_key:
                row = by_key[(role, tier)]
                row.price = price
                row.available_from = avail_from
                row.available_until = avail_until
            else:
                new_row = TicketType(
                    event_id=event.id,
                    role_name=role,
                    tier_name=tier,
                    price=price,
                    available_from=avail_from,
                    available_until=avail_until,
                )
                db.add(new_row)

        # Update event.registration_settings with tier_schedules and tier_cutoffs
        settings = dict(event.registration_settings or {})
        combined_schedules = dict(settings.get("tier_schedules", {}))
        combined_cutoffs = dict(settings.get("tier_cutoffs", {}))

        for tier, sched in schedules.items():
            combined_schedules[tier] = {
                "available_from": sched.get("available_from") or sched.get("start_time"),
                "available_until": sched.get("available_until") or sched.get("end_time") or sched.get("last_date"),
            }
            if sched.get("available_until") or sched.get("end_time") or sched.get("last_date"):
                combined_cutoffs[tier] = sched.get("available_until") or sched.get("end_time") or sched.get("last_date")

        settings["tier_schedules"] = combined_schedules
        settings["tier_cutoffs"] = combined_cutoffs
        event.registration_settings = settings

        await db.flush()
        return {f"{role}_{tier}": price for (role, tier), price in normalized.items()}

    @staticmethod
    async def set_tiers(db: AsyncSession, event: Event, tiers: list[str]) -> list[str]:
        cleaned = list(dict.fromkeys(value.strip() for value in tiers if value.strip()))
        if len(cleaned) > 100:
            raise HTTPException(status_code=422, detail="At most 100 ticket tiers are allowed")
        settings = dict(event.registration_settings or {})
        settings["tiers"] = cleaned
        event.registration_settings = settings
        await db.flush()
        return cleaned
