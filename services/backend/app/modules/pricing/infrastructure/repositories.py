from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.pricing.models import PricingSimulation


class PricingSimulationRepository:
    """Bounded, tenant-aware persistence operations for simulations."""

    @staticmethod
    async def get_by_id(db: AsyncSession, simulation_id: uuid.UUID, *, organization_id: Optional[uuid.UUID], user_id: uuid.UUID) -> Optional[PricingSimulation]:
        result = await db.execute(
            select(PricingSimulation).where(
                PricingSimulation.id == simulation_id,
                or_(PricingSimulation.organization_id == organization_id, PricingSimulation.user_id == user_id),
            )
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def list_page(db: AsyncSession, *, organization_id: Optional[uuid.UUID], user_id: uuid.UUID, limit: int = 100) -> list[PricingSimulation]:
        bounded_limit = max(1, min(limit, 100))
        scope = or_(PricingSimulation.organization_id == organization_id, PricingSimulation.user_id == user_id) if organization_id else PricingSimulation.user_id == user_id
        result = await db.execute(
            select(PricingSimulation)
            .where(scope)
            .order_by(PricingSimulation.created_at.desc(), PricingSimulation.id.desc())
            .limit(bounded_limit)
        )
        return list(result.scalars().all())

    @staticmethod
    async def delete(db: AsyncSession, simulation: PricingSimulation) -> None:
        await db.delete(simulation)

