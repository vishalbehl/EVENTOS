"""Read-only event query services for bounded, tenant-scoped screens."""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.infrastructure.repositories import Repository
from app.modules.events.models.event import Event
from app.schemas.cursor_pagination import CursorPage, bounded_page_size


class EventQueryService:
    """Fetch event summaries without owning a transaction or authorization."""

    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _summary_columns() -> tuple:
        """Columns and JSON settings required by the legacy summary contract."""
        return (
            Event.id,
            Event.organization_id,
            Event.name,
            Event.short_code,
            Event.location,
            Event.venue_name,
            Event.country,
            Event.state,
            Event.organizer_name,
            Event.start_date,
            Event.end_date,
            Event.timezone,
            Event.upload_deadline,
            Event.max_file_size_mb,
            Event.allowed_formats,
            Event.currency,
            Event.status,
            Event.is_maintenance,
            Event.is_read_only,
            Event.created_at,
            Event.updated_at,
        )

    async def list_offset(
        self,
        *,
        organization_id: uuid.UUID,
        page: int = 1,
        page_size: int = 20,
        status: str | None = None,
        search: str | None = None,
        allowed_event_ids: Any | None = None,
    ) -> list[Event]:
        """Compatibility list for the legacy route using the shared read boundary."""
        bounded_page = max(1, page)
        bounded_size = bounded_page_size(page_size, default=20, maximum=100)
        statement = (
            select(Event)
            .options(load_only(*self._summary_columns()))
            .where(Event.organization_id == organization_id)
        )
        if allowed_event_ids is not None:
            statement = statement.where(Event.id.in_(allowed_event_ids))
        if status:
            statement = statement.where(Event.status == status)
        if search:
            statement = statement.where(Event.name.ilike(f"%{search}%"))
        statement = statement.order_by(Event.start_date.desc(), Event.id.desc()).offset(
            (bounded_page - 1) * bounded_size
        )
        return await Repository(self.db, Event).list_page(statement, limit=bounded_size)

    async def list_page(
        self,
        *,
        organization_id: uuid.UUID,
        page_size: int = 20,
        cursor: str | None = None,
        status: str | None = None,
        search: str | None = None,
        allowed_event_ids: Any | None = None,
    ) -> CursorPage[Event]:
        """Return a stable page; ``allowed_event_ids`` is a verified scope."""
        statement: Select = select(Event).where(Event.organization_id == organization_id)
        if allowed_event_ids is not None:
            statement = statement.where(Event.id.in_(allowed_event_ids))
        if status:
            statement = statement.where(Event.status == status)
        if search:
            statement = statement.where(Event.name.ilike(f"%{search}%"))
        return await Repository(self.db, Event).cursor_page(
            statement,
            limit=bounded_page_size(page_size, default=20, maximum=100),
            cursor=cursor,
            cursor_column=("created_at", "id"),
            descending=True,
        )
