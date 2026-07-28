from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.events.models.event import Event
from app.modules.registration.models.ticket_type import TicketType


class TicketPricingService:
    """Canonical ticket-tier pricing validation and persistence."""

    @staticmethod
    async def replace_matrix(db: AsyncSession, event: Event, pricing_data: dict[str, Any]) -> dict[str, float]:
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

        current = (await db.scalars(select(TicketType).where(TicketType.event_id == event.id).with_for_update())).all()
        by_key = {(row.role_name, row.tier_name): row for row in current}
        for key, row in by_key.items():
            if key not in normalized:
                await db.delete(row)
        for key, price in normalized.items():
            if key in by_key:
                by_key[key].price = price
            else:
                db.add(TicketType(event_id=event.id, role_name=key[0], tier_name=key[1], price=price))
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
