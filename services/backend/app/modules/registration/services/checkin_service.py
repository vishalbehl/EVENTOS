from __future__ import annotations

import hashlib
import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.events.models.event import Event
from app.modules.events.models.capacity_rule import CapacityRule
from app.modules.agenda.models import Room
from app.modules.agenda.models import Session
from app.modules.registration.models.check_in import AttendanceMutation, CheckIn
from app.modules.registration.models.participant import Participant


class CheckInService:
    """Shared attendee check-in rules for organizer and privileged administration."""

    @staticmethod
    async def acquire_mutation(
        db: AsyncSession,
        *,
        event: Event,
        operation_type: str,
        idempotency_key: str,
        request_hash: str,
    ) -> AttendanceMutation | None:
        lock_material = f"{event.id}:{operation_type}:{idempotency_key}".encode("utf-8")
        lock_id = int.from_bytes(hashlib.sha256(lock_material).digest()[:8], "big", signed=True)
        await db.execute(text("SELECT pg_advisory_xact_lock(:lock_id)"), {"lock_id": lock_id})
        existing = await db.scalar(select(AttendanceMutation).where(
            AttendanceMutation.event_id == event.id,
            AttendanceMutation.operation_type == operation_type,
            AttendanceMutation.idempotency_key == idempotency_key,
        ))
        if existing and existing.request_hash != request_hash:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "IDEMPOTENCY_CONFLICT",
                    "message": "Idempotency key was reused with different attendance parameters.",
                },
            )
        return existing

    @staticmethod
    async def create(db: AsyncSession, event: Event, participant_id: uuid.UUID, session_id: uuid.UUID) -> tuple[CheckIn, bool]:
        participant = await db.scalar(select(Participant).where(
            Participant.id == participant_id,
            Participant.event_id == event.id,
            Participant.deleted_at.is_(None),
        ))
        if not participant:
            raise HTTPException(status_code=404, detail="Participant not found.")
        # Lock the finite-capacity resources before checking occupancy. This
        # serializes concurrent check-ins for the same session and room.
        session = await db.scalar(select(Session).where(
            Session.id == session_id,
            Session.event_id == event.id,
        ).with_for_update())
        if not session:
            raise HTTPException(status_code=404, detail="Session not found.")
        existing = await db.scalar(select(CheckIn).where(
            CheckIn.event_id == event.id,
            CheckIn.participant_id == participant_id,
            CheckIn.session_id == session_id,
        ))
        if existing:
            return existing, False

        room = None
        if session.room_id:
            room = await db.scalar(select(Room).where(
                Room.id == session.room_id,
                Room.event_id == event.id,
            ).with_for_update())

        session_rule = await db.scalar(select(CapacityRule).where(
            CapacityRule.event_id == event.id,
            CapacityRule.session_id == session.id,
        ))
        session_limits = [
            value for value in (
                getattr(session, "capacity", None),
                session_rule.capacity if session_rule else None,
            ) if value is not None and value >= 0
        ]
        if session_limits:
            occupied = await db.scalar(select(func.count(CheckIn.id)).where(
                CheckIn.event_id == event.id,
                CheckIn.session_id == session.id,
            )) or 0
            effective_limit = min(session_limits)
            if occupied >= effective_limit:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "code": "QUOTA_EXHAUSTED",
                        "limit_key": "session_capacity",
                        "used": occupied,
                        "allowed": effective_limit,
                    },
                )

        if room is not None:
            room_rule = await db.scalar(select(CapacityRule).where(
                CapacityRule.event_id == event.id,
                CapacityRule.room_id == room.id,
            ))
            room_limits = [
                value for value in (
                    room.capacity,
                    room_rule.capacity if room_rule else None,
                ) if value is not None and value >= 0
            ]
            if room_limits:
                occupied = await db.scalar(
                    select(func.count(CheckIn.id))
                    .join(Session, Session.id == CheckIn.session_id)
                    .where(
                        CheckIn.event_id == event.id,
                        Session.event_id == event.id,
                        Session.room_id == room.id,
                    )
                ) or 0
                effective_limit = min(room_limits)
                if occupied >= effective_limit:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail={
                            "code": "QUOTA_EXHAUSTED",
                            "limit_key": "room_capacity",
                            "used": occupied,
                            "allowed": effective_limit,
                        },
                    )
        row = CheckIn(event_id=event.id, participant_id=participant_id, session_id=session_id)
        db.add(row)
        await db.flush()
        return row, True

    @staticmethod
    async def remove(db: AsyncSession, event: Event, checkin_id: uuid.UUID) -> CheckIn:
        row = await db.scalar(select(CheckIn).where(CheckIn.id == checkin_id, CheckIn.event_id == event.id).with_for_update())
        if not row:
            raise HTTPException(status_code=404, detail="Check-in not found.")
        await db.delete(row)
        await db.flush()
        return row
