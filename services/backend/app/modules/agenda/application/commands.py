"""Application-owned agenda/session mutations."""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache_service
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.modules.events.models.event import Event
from app.modules.events.services.event_resource_mutation_service import EventResourceMutationService
from app.modules.speakers.schemas.session import SessionUpdate
from app.modules.agenda.models import Room
from app.modules.agenda.models import Agenda, AgendaDay
from app.modules.agenda.services.agenda_service import AgendaService
from app.modules.agenda.schemas.agenda_schemas import AgendaCreate, AgendaDayCreate, AgendaDayResponse, AgendaDayUpdate, AgendaResponse
from app.core.concurrency import raise_version_conflict
from app.modules.speakers.schemas.session_builder import TrackResponse, TrackUpsertRequest
from app.modules.venue.schemas.room import RoomCreate, RoomUpdate
from app.modules.analytics.services.projection_dispatch import (
    enqueue_event_speaker_projection_refresh,
)


class SessionCommandService:
    """Own schedule mutation transactions; callers resolve HTTP authorization."""

    @staticmethod
    async def update(
        db: AsyncSession,
        *,
        event: Event,
        session_id: uuid.UUID,
        payload: SessionUpdate,
        actor_user_id: uuid.UUID,
        expected_version: int | None = None,
        idempotency_key: str | None = None,
    ) -> uuid.UUID:
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(
                    db,
                    organization_id=event.organization_id,
                    actor_id=actor_user_id,
                    operation="sessions.update",
                    key=idempotency_key,
                    payload={
                        "event_id": str(event.id),
                        "session_id": str(session_id),
                        "payload": payload.model_dump(mode="json"),
                        "expected_version": expected_version,
                    },
                )
                replay = replay_response(idem)
                if replay is not None:
                    await db.commit()
                    return idem.resource_id or session_id

            session, _, _ = await EventResourceMutationService.update_session(
                db,
                event=event,
                session_id=session_id,
                payload=payload,
                actor_user_id=actor_user_id,
                expected_version=expected_version,
            )
            if idem is not None:
                await complete_idempotent(
                    db,
                    idem,
                    response_status=200,
                    response_body={"resource_id": str(session.id), "version": session.version},
                    resource_id=session.id,
                )
            await db.commit()
            await cache_service.invalidate_event(event.organization_id, event.id)
            enqueue_event_speaker_projection_refresh(
                organization_id=event.organization_id, event_id=event.id
            )
            return session.id
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def archive(
        db: AsyncSession,
        *,
        event: Event,
        session_id: uuid.UUID,
        actor_user_id: uuid.UUID,
        expected_version: int | None = None,
        idempotency_key: str | None = None,
    ) -> None:
        """Archive a session with one replayable application command."""
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(
                    db,
                    organization_id=event.organization_id,
                    actor_id=actor_user_id,
                    operation="sessions.archive",
                    key=idempotency_key,
                    payload={
                        "event_id": str(event.id),
                        "session_id": str(session_id),
                        "expected_version": expected_version,
                    },
                )
                replay = replay_response(idem)
                if replay is not None:
                    await db.commit()
                    return

            session, outcome = await EventResourceMutationService.archive_session(
                db,
                event=event,
                session_id=session_id,
                actor_user_id=actor_user_id,
                source="organizer_portal",
                expected_version=expected_version,
            )
            if idem is not None:
                await complete_idempotent(
                    db,
                    idem,
                    response_status=200,
                    response_body={"resource_id": str(session.id), "outcome": outcome},
                    resource_id=session.id,
                )
            await db.commit()
            await cache_service.invalidate_event(event.organization_id, event.id)
            enqueue_event_speaker_projection_refresh(
                organization_id=event.organization_id, event_id=event.id
            )
        except Exception:
            await db.rollback()
            raise

class TrackCommandService:
    """Own track mutations and keep them replayable."""

    @staticmethod
    async def create(db: AsyncSession, *, event: Event, payload: TrackUpsertRequest, actor_user_id: uuid.UUID, idempotency_key: str) -> TrackResponse:
        try:
            idem = await begin_idempotent(db, organization_id=event.organization_id, actor_id=actor_user_id, operation="tracks.create", key=idempotency_key, payload={"event_id": str(event.id), "payload": payload.model_dump(mode="json")})
            replay = replay_response(idem)
            if replay is not None:
                await db.commit()
                return TrackResponse.model_validate(replay[1])
            track = await EventResourceMutationService.create_track(db, event=event, payload=payload, actor_user_id=actor_user_id)
            response = TrackResponse.model_validate(track)
            await complete_idempotent(db, idem, response_status=201, response_body=response.model_dump(mode="json"), resource_id=track.id)
            await db.commit()
            await cache_service.invalidate_event(event.organization_id, event.id)
            return response
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def update(db: AsyncSession, *, event: Event, track_id: uuid.UUID, payload: TrackUpsertRequest, actor_user_id: uuid.UUID, expected_version: int | None = None, idempotency_key: str | None = None) -> TrackResponse:
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(db, organization_id=event.organization_id, actor_id=actor_user_id, operation="tracks.update", key=idempotency_key, payload={"event_id": str(event.id), "track_id": str(track_id), "payload": payload.model_dump(mode="json"), "expected_version": expected_version})
                replay = replay_response(idem)
                if replay is not None:
                    await db.commit()
                    return TrackResponse.model_validate(replay[1])
            track = await EventResourceMutationService.update_track(db, event=event, track_id=track_id, payload=payload, actor_user_id=actor_user_id, expected_version=expected_version)
            response = TrackResponse.model_validate(track)
            if idem is not None:
                await complete_idempotent(db, idem, response_status=200, response_body=response.model_dump(mode="json"), resource_id=track.id)
            await db.commit()
            await cache_service.invalidate_event(event.organization_id, event.id)
            return response
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def delete(db: AsyncSession, *, event: Event, track_id: uuid.UUID, actor_user_id: uuid.UUID, expected_version: int | None = None, idempotency_key: str | None = None) -> None:
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(db, organization_id=event.organization_id, actor_id=actor_user_id, operation="tracks.delete", key=idempotency_key, payload={"event_id": str(event.id), "track_id": str(track_id), "expected_version": expected_version})
                replay = replay_response(idem)
                if replay is not None:
                    await db.commit()
                    return
            await EventResourceMutationService.archive_track(db, event=event, track_id=track_id, actor_user_id=actor_user_id, expected_version=expected_version)
            if idem is not None:
                await complete_idempotent(db, idem, response_status=204, response_body={}, resource_id=track_id)
            await db.commit()
            await cache_service.invalidate_event(event.organization_id, event.id)
        except Exception:
            await db.rollback()
            raise


class AgendaCommandService:
    """Own agenda/day writes and validate event ownership before mutation."""

    @staticmethod
    async def create_agenda(db: AsyncSession, *, event: Event, payload: AgendaCreate, actor_user_id: uuid.UUID, idempotency_key: str) -> AgendaResponse:
        try:
            idem = await begin_idempotent(db, organization_id=event.organization_id, actor_id=actor_user_id, operation="agendas.create", key=idempotency_key, payload={"event_id": str(event.id), "payload": payload.model_dump(mode="json")})
            replay = replay_response(idem)
            if replay is not None:
                await db.commit()
                return AgendaResponse.model_validate(replay[1])
            agenda = Agenda(event_id=event.id, name=payload.name, code=payload.code or f"AGENDA-{str(event.id)[:4].upper()}", description=payload.description, timezone=payload.timezone or event.timezone or "UTC", status=payload.status)
            db.add(agenda)
            await db.flush()
            response = AgendaResponse.model_validate(agenda)
            await complete_idempotent(db, idem, response_status=201, response_body=response.model_dump(mode="json"), resource_id=agenda.id)
            await db.commit()
            await cache_service.invalidate_event(event.organization_id, event.id)
            return response
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def create_day(db: AsyncSession, *, event: Event, payload: AgendaDayCreate, actor_user_id: uuid.UUID, idempotency_key: str) -> AgendaDayResponse:
        try:
            idem = await begin_idempotent(db, organization_id=event.organization_id, actor_id=actor_user_id, operation="agenda_days.create", key=idempotency_key, payload={"event_id": str(event.id), "payload": payload.model_dump(mode="json")})
            replay = replay_response(idem)
            if replay is not None:
                await db.commit()
                return AgendaDayResponse.model_validate(replay[1])
            agenda = await AgendaService.get_or_create_default_agenda(db, event)
            agenda_id = payload.agenda_id or agenda.id
            owned = await db.scalar(select(Agenda.id).where(Agenda.id == agenda_id, Agenda.event_id == event.id))
            if owned is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agenda not found in this event")
            day = AgendaDay(agenda_id=agenda_id, **payload.model_dump(exclude={"agenda_id"}))
            db.add(day)
            await db.flush()
            response = AgendaDayResponse.model_validate(day)
            await complete_idempotent(db, idem, response_status=201, response_body=response.model_dump(mode="json"), resource_id=day.id)
            await db.commit()
            await cache_service.invalidate_event(event.organization_id, event.id)
            return response
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def update_day(db: AsyncSession, *, event: Event, day_id: uuid.UUID, payload: AgendaDayUpdate, actor_user_id: uuid.UUID, expected_version: int | None = None, idempotency_key: str | None = None) -> AgendaDayResponse:
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(db, organization_id=event.organization_id, actor_id=actor_user_id, operation="agenda_days.update", key=idempotency_key, payload={"event_id": str(event.id), "day_id": str(day_id), "payload": payload.model_dump(mode="json"), "expected_version": expected_version})
                replay = replay_response(idem)
                if replay is not None:
                    await db.commit()
                    return AgendaDayResponse.model_validate(replay[1])
            day = await db.scalar(select(AgendaDay).join(Agenda, Agenda.id == AgendaDay.agenda_id).where(AgendaDay.id == day_id, Agenda.event_id == event.id).with_for_update())
            if day is None:
                raise HTTPException(status_code=404, detail="Agenda day not found.")
            current_version = int(day.version or 1)
            if expected_version is not None and current_version != expected_version:
                raise_version_conflict(current_version)
            for field, value in payload.model_dump(exclude_unset=True).items():
                setattr(day, field, value)
            day.version = current_version + 1
            await db.flush()
            response = AgendaDayResponse.model_validate(day)
            if idem is not None:
                await complete_idempotent(db, idem, response_status=200, response_body=response.model_dump(mode="json"), resource_id=day.id)
            await db.commit()
            await cache_service.invalidate_event(event.organization_id, event.id)
            return response
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def delete_day(db: AsyncSession, *, event: Event, day_id: uuid.UUID, actor_user_id: uuid.UUID, expected_version: int | None = None, idempotency_key: str | None = None) -> None:
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(db, organization_id=event.organization_id, actor_id=actor_user_id, operation="agenda_days.delete", key=idempotency_key, payload={"event_id": str(event.id), "day_id": str(day_id), "expected_version": expected_version})
                replay = replay_response(idem)
                if replay is not None:
                    await db.commit()
                    return
            day = await db.scalar(select(AgendaDay).join(Agenda, Agenda.id == AgendaDay.agenda_id).where(AgendaDay.id == day_id, Agenda.event_id == event.id).with_for_update())
            if day is None:
                raise HTTPException(status_code=404, detail="Agenda day not found.")
            current_version = int(day.version or 1)
            if expected_version is not None and current_version != expected_version:
                raise_version_conflict(current_version)
            await db.delete(day)
            await db.flush()
            if idem is not None:
                await complete_idempotent(db, idem, response_status=204, response_body={}, resource_id=day_id)
            await db.commit()
            await cache_service.invalidate_event(event.organization_id, event.id)
        except Exception:
            await db.rollback()
            raise


class RoomCommandService:
    """Own room configuration transactions."""

    @staticmethod
    async def create_room(
        db: AsyncSession,
        *,
        event: Event,
        payload: RoomCreate,
        actor_user_id: uuid.UUID,
        idempotency_key: str,
    ) -> uuid.UUID:
        """Create a room with durable replay protection and cache invalidation."""
        try:
            idem = await begin_idempotent(
                db,
                organization_id=event.organization_id,
                actor_id=actor_user_id,
                operation="rooms.create",
                key=idempotency_key,
                payload={"event_id": str(event.id), "payload": payload.model_dump(mode="json")},
            )
            replay = replay_response(idem)
            if replay is not None:
                await db.commit()
                return idem.resource_id

            room = await EventResourceMutationService.create_room(
                db,
                event=event,
                payload=payload,
                actor_user_id=actor_user_id,
                idempotency_key=idempotency_key,
                source="organizer_portal",
            )
            await complete_idempotent(
                db,
                idem,
                response_status=201,
                response_body={"resource_id": str(room.id), "version": room.version},
                resource_id=room.id,
            )
            await db.commit()
            await cache_service.invalidate_event(event.organization_id, event.id)
            return room.id
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def update_room(
        db: AsyncSession,
        *,
        event: Event,
        room_id: uuid.UUID,
        payload: RoomUpdate,
        actor_user_id: uuid.UUID,
        expected_version: int | None = None,
        idempotency_key: str | None = None,
    ) -> uuid.UUID:
        """Update room configuration with a durable command boundary."""
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(
                    db,
                    organization_id=event.organization_id,
                    actor_id=actor_user_id,
                    operation="rooms.update",
                    key=idempotency_key,
                    payload={
                        "event_id": str(event.id),
                        "room_id": str(room_id),
                        "payload": payload.model_dump(mode="json"),
                        "expected_version": expected_version,
                    },
                )
                replay = replay_response(idem)
                if replay is not None:
                    await db.commit()
                    return idem.resource_id or room_id

            room, _, _ = await EventResourceMutationService.update_room(
                db,
                event=event,
                room_id=room_id,
                payload=payload,
                actor_user_id=actor_user_id,
                expected_version=expected_version,
            )
            if idem is not None:
                await complete_idempotent(
                    db,
                    idem,
                    response_status=200,
                    response_body={"resource_id": str(room.id), "version": room.version},
                    resource_id=room.id,
                )
            await db.commit()
            await cache_service.invalidate_event(event.organization_id, event.id)
            return room.id
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def archive_room(
        db: AsyncSession,
        *,
        event: Event,
        room_id: uuid.UUID,
        actor_user_id: uuid.UUID,
        expected_version: int | None = None,
        idempotency_key: str | None = None,
    ) -> None:
        """Deactivate a room with replay protection and cache invalidation."""
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(
                    db,
                    organization_id=event.organization_id,
                    actor_id=actor_user_id,
                    operation="rooms.archive",
                    key=idempotency_key,
                    payload={
                        "event_id": str(event.id),
                        "room_id": str(room_id),
                        "expected_version": expected_version,
                    },
                )
                replay = replay_response(idem)
                if replay is not None:
                    await db.commit()
                    return

            room, outcome = await EventResourceMutationService.archive_room(
                db,
                event=event,
                room_id=room_id,
                actor_user_id=actor_user_id,
                source="organizer_portal",
                expected_version=expected_version,
            )
            if idem is not None:
                await complete_idempotent(
                    db,
                    idem,
                    response_status=200,
                    response_body={"resource_id": str(room.id), "outcome": outcome},
                    resource_id=room.id,
                )
            await db.commit()
            await cache_service.invalidate_event(event.organization_id, event.id)
        except Exception:
            await db.rollback()
            raise
