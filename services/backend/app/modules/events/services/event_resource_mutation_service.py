from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies.feature_gate import enforce_event_operation
from app.core.concurrency import raise_version_conflict
from app.modules.billing.services.usage_reservation_service import (
    UsageReservationService,
)
from app.modules.events.models.event import Event
from app.modules.agenda.models import Room
from app.modules.agenda.models import Session
from app.modules.agenda.models import Track
from app.modules.agenda.models import SessionPerson as SessionSpeaker
from app.modules.events.models.speaker import Speaker
from app.modules.identity.models.user import User
from app.modules.platform.services.metering_service import MeteringService
from app.modules.speakers.schemas.session import SessionCreate, SessionUpdate
from app.modules.speakers.schemas.speaker import SpeakerCreate, SpeakerUpdate
from app.modules.venue.schemas.room import ROOM_TYPES, RoomCreate, RoomUpdate
from app.modules.speakers.schemas.session_builder import TrackUpsertRequest


class EventResourceMutationService:
    """Canonical writes for event resources shared by both administrative portals.

    Methods deliberately do not commit. The caller owns the transaction so it can
    append the appropriate customer or privileged audit record atomically.
    """

    @staticmethod
    async def create_track(db: AsyncSession, *, event: Event, payload: TrackUpsertRequest, actor_user_id: uuid.UUID) -> Track:
        await enforce_event_operation(db, event.organization_id, event.id, "sessions.manage", user_id=actor_user_id)
        track = Track(event_id=event.id, **payload.model_dump())
        db.add(track)
        await db.flush()
        return track

    @staticmethod
    async def update_track(db: AsyncSession, *, event: Event, track_id: uuid.UUID, payload: TrackUpsertRequest, actor_user_id: uuid.UUID, expected_version: int | None = None) -> Track:
        await enforce_event_operation(db, event.organization_id, event.id, "sessions.manage", user_id=actor_user_id)
        track = await EventResourceMutationService._track(db, event.id, track_id, lock=True)
        current_version = int(track.version or 1)
        if expected_version is not None and current_version != expected_version:
            raise_version_conflict(current_version)
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(track, field, value)
        track.version = current_version + 1
        await db.flush()
        return track

    @staticmethod
    async def archive_track(db: AsyncSession, *, event: Event, track_id: uuid.UUID, actor_user_id: uuid.UUID, expected_version: int | None = None) -> None:
        await enforce_event_operation(db, event.organization_id, event.id, "sessions.manage", user_id=actor_user_id)
        track = await EventResourceMutationService._track(db, event.id, track_id, lock=True)
        current_version = int(track.version or 1)
        if expected_version is not None and current_version != expected_version:
            raise_version_conflict(current_version)
        await db.delete(track)
        await db.flush()

    @staticmethod
    async def create_speaker(
        db: AsyncSession,
        *,
        event: Event,
        payload: SpeakerCreate,
        actor_user_id: uuid.UUID,
        idempotency_key: str,
        source: str,
    ) -> Speaker:
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "speakers.manage",
            user_id=actor_user_id,
        )
        email = str(payload.email).strip().lower()
        duplicate = await db.scalar(
            select(Speaker.id).where(
                Speaker.event_id == event.id,
                func.lower(Speaker.email) == email,
                Speaker.deleted_at.is_(None),
            )
        )
        if duplicate:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A speaker with this email already exists in the event",
            )
        reservation = await UsageReservationService.reserve(
            db,
            organization_id=event.organization_id,
            event_id=event.id,
            limit_key="max_speakers",
            quantity=1,
            unit="speaker",
            idempotency_key=f"speaker-create:{idempotency_key}",
            metadata={"source": source},
        )
        values = payload.model_dump()
        values["email"] = email
        speaker = Speaker(
            event_id=event.id,
            upload_token=secrets.token_urlsafe(48),
            speaker_code=secrets.token_hex(5).upper(),
            token_expires_at=datetime.now(timezone.utc) + timedelta(days=365),
            **values,
        )
        db.add(speaker)
        await db.flush()
        await UsageReservationService.consume(
            db,
            reservation.id,
            source=f"{source}.speakers.create",
            actor_user_id=actor_user_id,
        )
        return speaker

    @staticmethod
    async def update_speaker(
        db: AsyncSession,
        *,
        event: Event,
        speaker_id: uuid.UUID,
        payload: SpeakerUpdate,
        actor_user_id: uuid.UUID,
        expected_version: int | None = None,
    ) -> tuple[Speaker, dict[str, Any], dict[str, Any]]:
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "speakers.profiles.manage",
            user_id=actor_user_id,
        )
        speaker = await EventResourceMutationService._speaker(
            db, event.id, speaker_id, include_archived=False, lock=True
        )
        current_version = int(speaker.version or 1)
        if expected_version is not None and current_version != expected_version:
            raise_version_conflict(current_version)
        changes = payload.model_dump(exclude_unset=True)
        if changes.get("email"):
            email = str(changes["email"]).strip().lower()
            duplicate = await db.scalar(
                select(Speaker.id).where(
                    Speaker.event_id == event.id,
                    Speaker.id != speaker.id,
                    func.lower(Speaker.email) == email,
                    Speaker.deleted_at.is_(None),
                )
            )
            if duplicate:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A speaker with this email already exists in the event",
                )
            changes["email"] = email
        old = {field: getattr(speaker, field, None) for field in changes}
        for field, value in changes.items():
            setattr(speaker, field, value)
        speaker.version = current_version + 1
        await db.flush()
        return speaker, changes, old

    @staticmethod
    async def archive_speaker(
        db: AsyncSession,
        *,
        event: Event,
        speaker_id: uuid.UUID,
        actor_user_id: uuid.UUID,
        source: str,
        expected_version: int | None = None,
    ) -> tuple[Speaker, str]:
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "speakers.manage",
            user_id=actor_user_id,
        )
        speaker = await EventResourceMutationService._speaker(
            db, event.id, speaker_id, include_archived=True, lock=True
        )
        current_version = int(speaker.version or 1)
        if expected_version is not None and current_version != expected_version:
            raise_version_conflict(current_version)
        if speaker.deleted_at is not None:
            return speaker, "ALREADY_ARCHIVED"
        speaker.deleted_at = datetime.now(timezone.utc)
        speaker.deleted_by = actor_user_id
        speaker.version = current_version + 1
        await MeteringService.record(
            db,
            organization_id=event.organization_id,
            event_id=event.id,
            metric_key="speakers",
            quantity=-1,
            unit="count",
            source=f"{source}.speakers.archive",
            idempotency_key=f"speaker-archive:{speaker.id}:{speaker.deleted_at.isoformat()}",
            actor_user_id=actor_user_id,
            metadata={"resource_id": str(speaker.id)},
        )
        return speaker, "SOFT_DELETED"

    @staticmethod
    async def restore_speaker(
        db: AsyncSession,
        *,
        event: Event,
        speaker_id: uuid.UUID,
        actor_user_id: uuid.UUID,
        idempotency_key: str,
        source: str,
    ) -> tuple[Speaker, str]:
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "speakers.manage",
            user_id=actor_user_id,
        )
        speaker = await EventResourceMutationService._speaker(
            db, event.id, speaker_id, include_archived=True, lock=True
        )
        if speaker.deleted_at is None:
            return speaker, "ALREADY_ACTIVE"
        reservation = await UsageReservationService.reserve(
            db,
            organization_id=event.organization_id,
            event_id=event.id,
            limit_key="max_speakers",
            quantity=1,
            unit="speaker",
            idempotency_key=f"speaker-restore:{idempotency_key}",
            metadata={"resource_id": str(speaker.id), "source": source},
        )
        speaker.deleted_at = None
        speaker.deleted_by = None
        await UsageReservationService.consume(
            db,
            reservation.id,
            source=f"{source}.speakers.restore",
            actor_user_id=actor_user_id,
        )
        return speaker, "RESTORED"

    @staticmethod
    async def create_session(
        db: AsyncSession,
        *,
        event: Event,
        payload: SessionCreate,
        actor_user_id: uuid.UUID,
        idempotency_key: str,
        source: str,
    ) -> Session:
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "sessions.manage",
            user_id=actor_user_id,
        )
        await EventResourceMutationService._validate_session_references(
            db, event, payload.room_id, payload.moderator_id
        )
        duplicate = await db.scalar(
            select(Session.id).where(
                Session.event_id == event.id,
                Session.session_code == payload.session_code,
                Session.deleted_at.is_(None),
            )
        )
        if duplicate:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Session code '{payload.session_code}' is already used in this event",
            )
        speaker_slots = payload.speakers or []
        if speaker_slots:
            requested = {slot.speaker_id for slot in speaker_slots}
            valid = set(
                (
                    await db.scalars(
                        select(Speaker.id).where(
                            Speaker.event_id == event.id,
                            Speaker.id.in_(requested),
                            Speaker.deleted_at.is_(None),
                        )
                    )
                ).all()
            )
            if valid != requested:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="One or more session speakers do not belong to this event",
                )
        reservation = await UsageReservationService.reserve(
            db,
            organization_id=event.organization_id,
            event_id=event.id,
            limit_key="max_sessions",
            quantity=1,
            unit="session",
            idempotency_key=f"session-create:{idempotency_key}",
            metadata={"session_code": payload.session_code, "source": source},
        )
        session = Session(
            event_id=event.id,
            **payload.model_dump(exclude={"speakers"}),
        )
        db.add(session)
        await db.flush()
        for slot in speaker_slots:
            db.add(SessionSpeaker(session_id=session.id, **slot.model_dump()))
        await UsageReservationService.consume(
            db,
            reservation.id,
            source=f"{source}.sessions.create",
            actor_user_id=actor_user_id,
        )
        return session

    @staticmethod
    async def update_session(
        db: AsyncSession,
        *,
        event: Event,
        session_id: uuid.UUID,
        payload: SessionUpdate,
        actor_user_id: uuid.UUID,
        expected_version: int | None = None,
    ) -> tuple[Session, dict[str, Any], dict[str, Any]]:
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "sessions.manage",
            user_id=actor_user_id,
        )
        session = await EventResourceMutationService._session(
            db, event.id, session_id, include_archived=False, lock=True
        )
        current_version = int(session.version or 1)
        if expected_version is not None and current_version != expected_version:
            raise_version_conflict(current_version)
        changes = payload.model_dump(exclude_unset=True)
        start_time = changes.get("start_time", session.start_time)
        end_time = changes.get("end_time", session.end_time)
        if end_time <= start_time:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="end_time must be after start_time",
            )
        await EventResourceMutationService._validate_session_references(
            db,
            event,
            changes.get("room_id", session.room_id),
            changes.get("moderator_id", session.moderator_id),
        )
        if changes.get("session_code"):
            duplicate = await db.scalar(
                select(Session.id).where(
                    Session.event_id == event.id,
                    Session.id != session.id,
                    Session.session_code == changes["session_code"],
                    Session.deleted_at.is_(None),
                )
            )
            if duplicate:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Session code is already used in this event",
                )
        old = {field: getattr(session, field, None) for field in changes}
        for field, value in changes.items():
            setattr(session, field, value)
        session.version = current_version + 1
        await db.flush()
        return session, changes, old

    @staticmethod
    async def archive_session(
        db: AsyncSession,
        *,
        event: Event,
        session_id: uuid.UUID,
        actor_user_id: uuid.UUID,
        source: str,
        expected_version: int | None = None,
    ) -> tuple[Session, str]:
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "sessions.manage",
            user_id=actor_user_id,
        )
        session = await EventResourceMutationService._session(
            db, event.id, session_id, include_archived=True, lock=True
        )
        current_version = int(session.version or 1)
        if expected_version is not None and current_version != expected_version:
            raise_version_conflict(current_version)
        if session.deleted_at is not None:
            return session, "ALREADY_ARCHIVED"
        if session.status == "in_progress":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An in-progress session cannot be archived",
            )
        session.deleted_at = datetime.now(timezone.utc)
        session.deleted_by = actor_user_id
        session.version = current_version + 1
        await MeteringService.record(
            db,
            organization_id=event.organization_id,
            event_id=event.id,
            metric_key="sessions",
            quantity=-1,
            unit="count",
            source=f"{source}.sessions.archive",
            idempotency_key=f"session-archive:{session.id}:{session.deleted_at.isoformat()}",
            actor_user_id=actor_user_id,
            metadata={"resource_id": str(session.id)},
        )
        return session, "SOFT_DELETED"

    @staticmethod
    async def restore_session(
        db: AsyncSession,
        *,
        event: Event,
        session_id: uuid.UUID,
        actor_user_id: uuid.UUID,
        idempotency_key: str,
        source: str,
    ) -> tuple[Session, str]:
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "sessions.manage",
            user_id=actor_user_id,
        )
        session = await EventResourceMutationService._session(
            db, event.id, session_id, include_archived=True, lock=True
        )
        if session.deleted_at is None:
            return session, "ALREADY_ACTIVE"
        reservation = await UsageReservationService.reserve(
            db,
            organization_id=event.organization_id,
            event_id=event.id,
            limit_key="max_sessions",
            quantity=1,
            unit="session",
            idempotency_key=f"session-restore:{idempotency_key}",
            metadata={"resource_id": str(session.id), "source": source},
        )
        session.deleted_at = None
        session.deleted_by = None
        await UsageReservationService.consume(
            db,
            reservation.id,
            source=f"{source}.sessions.restore",
            actor_user_id=actor_user_id,
        )
        return session, "RESTORED"

    @staticmethod
    async def create_room(
        db: AsyncSession,
        *,
        event: Event,
        payload: RoomCreate,
        actor_user_id: uuid.UUID,
        idempotency_key: str,
        source: str,
    ) -> Room:
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "venue.rooms.manage",
            user_id=actor_user_id,
        )
        EventResourceMutationService._validate_room_type(payload.room_type)
        reservation = await UsageReservationService.reserve(
            db,
            organization_id=event.organization_id,
            event_id=event.id,
            limit_key="max_rooms",
            quantity=1,
            unit="room",
            idempotency_key=f"room-create:{idempotency_key}",
            metadata={"name": payload.name, "source": source},
        )
        room = Room(event_id=event.id, **payload.model_dump())
        db.add(room)
        await db.flush()
        await UsageReservationService.consume(
            db,
            reservation.id,
            source=f"{source}.rooms.create",
            actor_user_id=actor_user_id,
        )
        return room

    @staticmethod
    async def update_room(
        db: AsyncSession,
        *,
        event: Event,
        room_id: uuid.UUID,
        payload: RoomUpdate,
        actor_user_id: uuid.UUID,
        expected_version: int | None = None,
    ) -> tuple[Room, dict[str, Any], dict[str, Any]]:
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "venue.rooms.manage",
            user_id=actor_user_id,
        )
        room = await EventResourceMutationService._room(
            db, event.id, room_id, include_archived=True, lock=True
        )
        current_version = int(room.version or 1)
        if expected_version is not None and current_version != expected_version:
            raise_version_conflict(current_version)
        changes = payload.model_dump(exclude_unset=True)
        if changes.get("room_type"):
            EventResourceMutationService._validate_room_type(changes["room_type"])
        old = {field: getattr(room, field, None) for field in changes}
        for field, value in changes.items():
            setattr(room, field, value)
        room.version = current_version + 1
        await db.flush()
        return room, changes, old

    @staticmethod
    async def archive_room(
        db: AsyncSession,
        *,
        event: Event,
        room_id: uuid.UUID,
        actor_user_id: uuid.UUID,
        source: str,
        expected_version: int | None = None,
    ) -> tuple[Room, str]:
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "venue.rooms.manage",
            user_id=actor_user_id,
        )
        room = await EventResourceMutationService._room(
            db, event.id, room_id, include_archived=True, lock=True
        )
        current_version = int(room.version or 1)
        if expected_version is not None and current_version != expected_version:
            raise_version_conflict(current_version)
        if not room.is_active:
            return room, "ALREADY_ARCHIVED"
        room.is_active = False
        room.version = current_version + 1
        await MeteringService.record(
            db,
            organization_id=event.organization_id,
            event_id=event.id,
            metric_key="rooms",
            quantity=-1,
            unit="count",
            source=f"{source}.rooms.archive",
            idempotency_key=f"room-archive:{room.id}",
            actor_user_id=actor_user_id,
            metadata={"resource_id": str(room.id)},
        )
        return room, "DEACTIVATED"

    @staticmethod
    async def restore_room(
        db: AsyncSession,
        *,
        event: Event,
        room_id: uuid.UUID,
        actor_user_id: uuid.UUID,
        idempotency_key: str,
        source: str,
    ) -> tuple[Room, str]:
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "venue.rooms.manage",
            user_id=actor_user_id,
        )
        room = await EventResourceMutationService._room(
            db, event.id, room_id, include_archived=True, lock=True
        )
        if room.is_active:
            return room, "ALREADY_ACTIVE"
        reservation = await UsageReservationService.reserve(
            db,
            organization_id=event.organization_id,
            event_id=event.id,
            limit_key="max_rooms",
            quantity=1,
            unit="room",
            idempotency_key=f"room-restore:{idempotency_key}",
            metadata={"resource_id": str(room.id), "source": source},
        )
        room.is_active = True
        await UsageReservationService.consume(
            db,
            reservation.id,
            source=f"{source}.rooms.restore",
            actor_user_id=actor_user_id,
        )
        return room, "RESTORED"

    @staticmethod
    async def _validate_session_references(
        db: AsyncSession,
        event: Event,
        room_id: uuid.UUID | None,
        moderator_id: uuid.UUID | None,
    ) -> None:
        if room_id and not await db.scalar(
            select(Room.id).where(
                Room.id == room_id,
                Room.event_id == event.id,
                Room.is_active.is_(True),
            )
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Room not found in this event",
            )
        if moderator_id:
            moderator = await db.get(User, moderator_id)
            if not moderator or moderator.organization_id != event.organization_id:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Moderator not found in this organization",
                )

    @staticmethod
    def _validate_room_type(room_type: str) -> None:
        if not room_type or not room_type.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="room_type cannot be empty",
            )

    @staticmethod
    async def _speaker(
        db: AsyncSession,
        event_id: uuid.UUID,
        resource_id: uuid.UUID,
        *,
        include_archived: bool,
        lock: bool,
    ) -> Speaker:
        query = select(Speaker).where(
            Speaker.id == resource_id, Speaker.event_id == event_id
        )
        if not include_archived:
            query = query.where(Speaker.deleted_at.is_(None))
        if lock:
            query = query.with_for_update()
        row = await db.scalar(query)
        if row is None:
            raise HTTPException(status_code=404, detail="Speaker not found")
        return row

    @staticmethod
    async def _session(
        db: AsyncSession,
        event_id: uuid.UUID,
        resource_id: uuid.UUID,
        *,
        include_archived: bool,
        lock: bool,
    ) -> Session:
        query = select(Session).where(
            Session.id == resource_id, Session.event_id == event_id
        )
        if not include_archived:
            query = query.where(Session.deleted_at.is_(None))
        if lock:
            query = query.with_for_update()
        row = await db.scalar(query)
        if row is None:
            raise HTTPException(status_code=404, detail="Session not found")
        return row

    @staticmethod
    async def _room(
        db: AsyncSession,
        event_id: uuid.UUID,
        resource_id: uuid.UUID,
        *,
        include_archived: bool,
        lock: bool,
    ) -> Room:
        query = select(Room).where(Room.id == resource_id, Room.event_id == event_id)
        if not include_archived:
            query = query.where(Room.is_active.is_(True))
        if lock:
            query = query.with_for_update()
        row = await db.scalar(query)
        if row is None:
            raise HTTPException(status_code=404, detail="Room not found")
        return row

    @staticmethod
    async def _track(db: AsyncSession, event_id: uuid.UUID, track_id: uuid.UUID, *, lock: bool) -> Track:
        query = select(Track).where(Track.id == track_id, Track.event_id == event_id)
        if lock:
            query = query.with_for_update()
        row = await db.scalar(query)
        if row is None:
            raise HTTPException(status_code=404, detail="Track not found")
        return row
