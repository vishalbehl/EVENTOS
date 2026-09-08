"""Explicit transaction-neutral repositories for registration records."""

from __future__ import annotations

import uuid

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.repositories import Repository
from app.modules.events.models.event import Event
from app.modules.registration.models.badge_models import Badge, BadgeHistory, BadgePrintJob
from app.modules.registration.models.import_job import ImportJob
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_registration import ParticipantRegistration


class ParticipantRepository(Repository[Participant]):
    """Tenant-aware persistence methods for event participants."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, Participant)

    async def get_for_event(
        self,
        participant_id: uuid.UUID,
        event_id: uuid.UUID,
        *,
        organization_id: uuid.UUID | None = None,
    ) -> Participant | None:
        return await super().get_for_event(
            participant_id, event_id, organization_id=organization_id
        )

    def scoped_statement(
        self,
        event_id: uuid.UUID,
        *,
        organization_id: uuid.UUID | None = None,
    ) -> Select:
        statement = select(Participant).where(
            Participant.event_id == event_id,
            Participant.deleted_at.is_(None),
        )
        return self._apply_tenant_scope(statement, organization_id=organization_id)


class ParticipantRegistrationRepository(Repository[ParticipantRegistration]):
    """Tenant-aware persistence methods for submitted registrations."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, ParticipantRegistration)

    async def get_for_event(
        self,
        registration_id: uuid.UUID,
        event_id: uuid.UUID,
        *,
        organization_id: uuid.UUID | None = None,
    ) -> ParticipantRegistration | None:
        return await super().get_for_event(
            registration_id, event_id, organization_id=organization_id
        )

    def scoped_statement(
        self,
        event_id: uuid.UUID,
        *,
        organization_id: uuid.UUID | None = None,
    ) -> Select:
        statement = select(ParticipantRegistration).where(
            ParticipantRegistration.event_id == event_id,
            ParticipantRegistration.deleted_at.is_(None),
        )
        return self._apply_tenant_scope(statement, organization_id=organization_id)


class BadgeRepository(Repository[Badge]):
    """Tenant-aware persistence boundary for participant badges."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, Badge)

    async def get_for_event(
        self, badge_id: uuid.UUID, event_id: uuid.UUID, *, organization_id: uuid.UUID
    ) -> Badge | None:
        statement = self.scoped_statement(event_id, organization_id=organization_id).where(
            Badge.id == badge_id
        )
        return await self.db.scalar(statement)

    def scoped_statement(self, event_id: uuid.UUID, *, organization_id: uuid.UUID) -> Select:
        return (
            select(Badge)
            .join(Participant, Participant.id == Badge.participant_id)
            .join(Event, Event.id == Participant.event_id)
            .where(Event.organization_id == organization_id, Participant.event_id == event_id)
        )


class BadgeHistoryRepository(Repository[BadgeHistory]):
    """Tenant-aware persistence boundary for badge history."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, BadgeHistory)

    async def get_for_event(
        self,
        history_id: uuid.UUID,
        event_id: uuid.UUID,
        *,
        organization_id: uuid.UUID,
    ) -> BadgeHistory | None:
        statement = self.scoped_statement(event_id, organization_id=organization_id).where(
            BadgeHistory.id == history_id
        )
        return await self.db.scalar(statement)

    def scoped_statement(self, event_id: uuid.UUID, *, organization_id: uuid.UUID) -> Select:
        return (
            select(BadgeHistory)
            .join(Badge, Badge.id == BadgeHistory.badge_id)
            .join(Participant, Participant.id == Badge.participant_id)
            .join(Event, Event.id == Participant.event_id)
            .where(Event.organization_id == organization_id, Participant.event_id == event_id)
        )


class BadgePrintJobRepository(Repository[BadgePrintJob]):
    """Tenant-aware persistence boundary for badge print jobs."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, BadgePrintJob)

    async def get_for_event(
        self,
        job_id: uuid.UUID,
        event_id: uuid.UUID,
        *,
        organization_id: uuid.UUID,
    ) -> BadgePrintJob | None:
        statement = self.scoped_statement(event_id, organization_id=organization_id).where(
            BadgePrintJob.id == job_id
        )
        return await self.db.scalar(statement)

    def scoped_statement(self, event_id: uuid.UUID, *, organization_id: uuid.UUID) -> Select:
        return (
            select(BadgePrintJob)
            .join(Badge, Badge.id == BadgePrintJob.badge_id)
            .join(Participant, Participant.id == Badge.participant_id)
            .join(Event, Event.id == Participant.event_id)
            .where(Event.organization_id == organization_id, Participant.event_id == event_id)
        )


class ImportJobRepository(Repository[ImportJob]):
    """Tenant-aware persistence methods for import jobs."""

    def __init__(self, db: AsyncSession):
        super().__init__(db, ImportJob)

    async def get_for_event(
        self,
        job_id: uuid.UUID,
        event_id: uuid.UUID,
        *,
        organization_id: uuid.UUID,
    ) -> ImportJob | None:
        statement = self.scoped_statement(event_id, organization_id=organization_id).where(
            ImportJob.id == job_id
        )
        return await self.db.scalar(statement)

    def scoped_statement(self, event_id: uuid.UUID, *, organization_id: uuid.UUID) -> Select:
        return (
            select(ImportJob)
            .join(Event, Event.id == ImportJob.event_id)
            .where(Event.organization_id == organization_id, ImportJob.event_id == event_id)
        )
