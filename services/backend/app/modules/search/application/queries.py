"""Read-only search query services."""

from __future__ import annotations

import uuid

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.search.models.search import SearchJob
from app.schemas.cursor_pagination import CursorPage, decode_cursor, encode_cursor


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

    async def cursor_page(
        self,
        *,
        organization_id: uuid.UUID | None,
        cursor: str | None = None,
        limit: int = 20,
    ) -> CursorPage[SearchJob]:
        bounded_limit = max(1, min(limit, 100))
        statement = select(SearchJob).execution_options(skip_tenant_filter=True)
        if organization_id is not None:
            statement = statement.where(SearchJob.organization_id == organization_id)
        if cursor:
            position = decode_cursor(cursor)
            statement = statement.where(
                (SearchJob.created_at < position.occurred_at)
                | ((SearchJob.created_at == position.occurred_at) & (SearchJob.id < position.record_id))
            )
        rows = list((await self.db.scalars(
            statement.order_by(desc(SearchJob.created_at), desc(SearchJob.id))
            .limit(bounded_limit + 1)
        )).all())
        page_rows = rows[:bounded_limit]
        has_next = len(rows) > bounded_limit
        next_cursor = (
            encode_cursor(page_rows[-1].created_at, page_rows[-1].id)
            if has_next and page_rows else None
        )
        return CursorPage(items=page_rows, next_cursor=next_cursor, has_next=has_next)
