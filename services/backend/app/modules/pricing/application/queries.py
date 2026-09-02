from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.pricing.infrastructure.repositories import PricingSimulationRepository


class PricingQueryService:
    @staticmethod
    async def list_simulations(db: AsyncSession, *, organization_id: Optional[uuid.UUID], user_id: uuid.UUID, limit: int = 100):
        return await PricingSimulationRepository.list_page(db, organization_id=organization_id, user_id=user_id, limit=limit)

