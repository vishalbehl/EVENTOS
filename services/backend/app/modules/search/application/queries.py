"""Read-only search query services."""

from __future__ import annotations

import uuid

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.search.models.search import SearchJob


class SearchJobQueryService:
    """Own bounded super-admin search-job reads and preserve tenant bypass intent."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_page(
        self,
        *,
        organization_id: uuid.UUID | None,
        page: int,
        page_size: int,
    ) -> tuple[int, list[SearchJob]]:
        base = select(SearchJob).execution_options(skip_tenant_filter=True)
        count = select(func.count(SearchJob.id)).execution_options(skip_tenant_filter=True)
        if organization_id is not None:
            base = base.where(SearchJob.organization_id == organization_id)
            count = count.where(SearchJob.organization_id == organization_id)
        total = int((await self.db.scalar(count)) or 0)
        rows = list((await self.db.scalars(
            base.order_by(desc(SearchJob.created_at), desc(SearchJob.id))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )).all())
        return total, rows
