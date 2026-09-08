"""Explicit transaction-neutral repositories for event records."""

from __future__ import annotations

import uuid

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.repositories import Repository
from app.modules.events.models.event import Event


class EventRepository(Repository[Event]):
    """Organization-scoped persistence methods for events."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, Event)

    async def get_for_organization(
        self, event_id: uuid.UUID, organization_id: uuid.UUID
    ) -> Event | None:
        statement = select(Event).where(
            Event.id == event_id,
            Event.deleted_at.is_(None),
            Event.organization_id == organization_id,
        )
        return await self.db.scalar(statement)

    def scoped_statement(self, organization_id: uuid.UUID) -> Select:
        return select(Event).where(Event.organization_id == organization_id)
