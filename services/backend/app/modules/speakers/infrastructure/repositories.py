"""Explicit transaction-neutral repositories for speaker workspace data."""

from __future__ import annotations

import uuid

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.repositories import Repository
from app.modules.agenda.models import Session
from app.modules.events.models.speaker import Speaker


class SpeakerRepository(Repository[Speaker]):
    """Tenant-aware persistence methods for event speakers."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, Speaker)

    async def get_for_event(
        self,
        speaker_id: uuid.UUID,
        event_id: uuid.UUID,
        *,
        organization_id: uuid.UUID | None = None,
    ) -> Speaker | None:
        return await super().get_for_event(
            speaker_id, event_id, organization_id=organization_id
        )

    def scoped_statement(
        self,
        event_id: uuid.UUID,
        *,
        organization_id: uuid.UUID | None = None,
    ) -> Select:
        statement = select(Speaker).where(
            Speaker.event_id == event_id,
            Speaker.deleted_at.is_(None),
        )
        return self._apply_tenant_scope(statement, organization_id=organization_id)


class SessionRepository(Repository[Session]):
    """Tenant-aware persistence methods for event sessions."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, Session)

    async def get_for_event(
        self,
        session_id: uuid.UUID,
        event_id: uuid.UUID,
        *,
        organization_id: uuid.UUID | None = None,
    ) -> Session | None:
        return await super().get_for_event(
            session_id, event_id, organization_id=organization_id
        )

    def scoped_statement(
        self,
        event_id: uuid.UUID,
        *,
        organization_id: uuid.UUID | None = None,
    ) -> Select:
        statement = select(Session).where(Session.event_id == event_id)
        return self._apply_tenant_scope(statement, organization_id=organization_id)
