"""Transaction-owning commands for venue mutations."""

from __future__ import annotations

import uuid
import hashlib
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.agenda.models import Room, Session
from app.modules.analytics.models.attendance_log import AttendanceLog
from app.modules.audit.models.audit_log import AuditLog
from app.modules.events.models.capacity_rule import CapacityRule
from app.modules.events.models.speaker import Speaker
from app.modules.events.models.event import Event
from app.modules.registration.models.badge_models import Badge
from app.modules.registration.models.check_in import AttendanceMutation, CheckIn
from app.modules.registration.models.participant import Participant
from app.modules.registration.services.checkin_service import CheckInService
from app.modules.venue.models.srr_checkin import SRRCheckin
from app.modules.venue.models.srr_station import SRRStation
from app.modules.analytics.services.projection_dispatch import (
    enqueue_event_speaker_projection_refresh,
)


class SrrStationCommandService:
    """Own tenant/event-scoped station mutations and short transactions."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _station(self, station_id: uuid.UUID, event_id: uuid.UUID) -> SRRStation:
        station = await self.db.scalar(
            select(SRRStation)
            .where(SRRStation.id == station_id, SRRStation.event_id == event_id)
            .with_for_update()
        )
        if station is None:
            raise HTTPException(status_code=404, detail="Station not found.")
        return station

    async def create(self, *, event_id: uuid.UUID, data: dict) -> SRRStation:
        duplicate = await self.db.scalar(
            select(SRRStation).where(
                SRRStation.event_id == event_id,
                SRRStation.station_number == data["station_number"],
            )
        )
        if duplicate:
            raise HTTPException(
                status_code=409,
                detail=f"Station #{data['station_number']} already exists.",
            )
        station = SRRStation(event_id=event_id, **data)
        self.db.add(station)
        await self.db.commit()
        await self.db.refresh(station)
        return station

    async def update(
        self,
        *,
        event_id: uuid.UUID,
        station_id: uuid.UUID,
        data: dict,
    ) -> SRRStation:
        station = await self._station(station_id, event_id)
        for field, value in data.items():
            setattr(station, field, value)
        await self.db.commit()
        await self.db.refresh(station)
        return station

    async def release(self, *, event_id: uuid.UUID, station_id: uuid.UUID) -> SRRStation:
        station = await self._station(station_id, event_id)
        station.status = "idle"
        station.assigned_speaker_id = None
        station.session_assigned_at = None
        await self.db.commit()
        await self.db.refresh(station)
        return station

    async def assign(
        self,
        *,
        event_id: uuid.UUID,
        station_id: uuid.UUID,
        speaker_id: uuid.UUID,
        checked_in_by: uuid.UUID | None,
        checkin_method: str,
        mark_speaker_checked_in: bool = False,
    ) -> tuple[SRRStation, Speaker, SRRCheckin]:
        station = await self._station(station_id, event_id)
        if not station.is_available:
            raise HTTPException(
                status_code=409,
                detail=f"Station #{station.station_number} is not available (status: {station.status}).",
            )
        speaker = await self.db.scalar(
            select(Speaker)
            .where(Speaker.id == speaker_id, Speaker.event_id == event_id)
            .with_for_update()
        )
        if speaker is None:
            raise HTTPException(status_code=404, detail="Speaker not found.")
        now = datetime.now(timezone.utc)
        station.status = "occupied"
        station.assigned_speaker_id = speaker.id
        station.session_assigned_at = now
        if mark_speaker_checked_in:
            speaker.checked_in_at = now
        checkin = SRRCheckin(
            event_id=event_id,
            speaker_id=speaker.id,
            station_id=station.id,
            checked_in_by=checked_in_by,
            checkin_method=checkin_method,
        )
        self.db.add(checkin)
        await self.db.commit()
        await self.db.refresh(station)
        await self.db.refresh(checkin)
        if mark_speaker_checked_in:
            organization_id = await self.db.scalar(
                select(Event.organization_id).where(Event.id == event_id)
            )
            if organization_id is not None:
                enqueue_event_speaker_projection_refresh(
                    organization_id=organization_id, event_id=event_id
                )
        return station, speaker, checkin


class AttendanceCommandService:
    """Own serialized, tenant-scoped attendee check-in mutations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _resolve_participant(
        self,
        *,
        event_id: uuid.UUID,
        participant_id: uuid.UUID | None = None,
        badge_code: str | None = None,
        nfc_uid: str | None = None,
    ) -> uuid.UUID:
        if participant_id:
            participant = await self.db.get(Participant, participant_id)
            if participant and participant.event_id == event_id:
                return participant.id

        badge_value = badge_code or nfc_uid
        if badge_value:
            column = Badge.badge_code if badge_code else Badge.nfc_uid
            badge = await self.db.scalar(select(Badge).where(column == badge_value))
            if badge:
                participant = await self.db.get(Participant, badge.participant_id)
                if participant and participant.event_id == event_id:
                    return participant.id

        raise HTTPException(status_code=404, detail="Participant or Badge not found for this event.")

    @staticmethod
    def _request_hash(operation: str, event_id: uuid.UUID, participant_id: uuid.UUID, session_id: uuid.UUID, method: str | None, device_id: str | None) -> str:
        material = f"{operation}:{event_id}:{participant_id}:{session_id}:{method}:{device_id}"
        return hashlib.sha256(material.encode("utf-8")).hexdigest()

    async def _replay(self, mutation: AttendanceMutation | None) -> AttendanceLog | None:
        if mutation is None:
            return None
        if mutation.result_attendance_log_id is None:
            raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_RESULT_UNAVAILABLE"})
        log = await self.db.get(AttendanceLog, mutation.result_attendance_log_id)
        if log is None:
            raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_RESULT_UNAVAILABLE"})
        return log

    async def check_in(self, *, event, actor, payload, idempotency_key: str) -> AttendanceLog:
        if not payload.session_id:
            raise HTTPException(status_code=400, detail="session_id is required for check-in")
        participant_id = await self._resolve_participant(
            event_id=event.id,
            participant_id=payload.participant_id,
            badge_code=payload.badge_code,
            nfc_uid=payload.nfc_uid,
        )
        request_hash = self._request_hash("CHECK_IN", event.id, participant_id, payload.session_id, payload.method, payload.device_id)
        try:
            replay = await CheckInService.acquire_mutation(
                self.db, event=event, operation_type="CHECK_IN", idempotency_key=idempotency_key, request_hash=request_hash
            )
            replay_log = await self._replay(replay)
            if replay_log is not None:
                return replay_log

            legacy, legacy_created = await CheckInService.create(self.db, event, participant_id, payload.session_id)
            active_log = await self.db.scalar(select(AttendanceLog).where(
                AttendanceLog.participant_id == participant_id,
                AttendanceLog.session_id == payload.session_id,
                AttendanceLog.checkout_time.is_(None),
            ).with_for_update())
            log = active_log or AttendanceLog(
                participant_id=participant_id,
                session_id=payload.session_id,
                method=payload.method,
                device_id=payload.device_id,
                checkin_time=datetime.now(timezone.utc),
            )
            if active_log is None:
                self.db.add(log)
            await self.db.flush()
            self.db.add(AttendanceMutation(
                organization_id=event.organization_id, event_id=event.id, actor_user_id=actor.id,
                operation_type="CHECK_IN", idempotency_key=idempotency_key, request_hash=request_hash,
                result_checkin_id=legacy.id, result_attendance_log_id=log.id, result_created=legacy_created,
            ))
            self.db.add(AuditLog(
                organization_id=event.organization_id, actor_user_id=actor.id,
                actor_role=actor.platform_role or actor.role, resource_type="attendance_log", resource_id=log.id,
                action_type="ATTENDANCE_CHECKED_IN" if legacy_created else "ATTENDANCE_CHECKIN_RECORDED",
                new_state={"event_id": str(event.id), "participant_id": str(participant_id), "session_id": str(payload.session_id), "method": payload.method, "device_id": payload.device_id},
            ))
            await self.db.commit()
            await self.db.refresh(log)
            return log
        except Exception:
            await self.db.rollback()
            raise

    async def check_out(self, *, event, actor, payload, idempotency_key: str) -> AttendanceLog:
        if not payload.session_id:
            raise HTTPException(status_code=400, detail="session_id is required for check-out")
        participant_id = await self._resolve_participant(
            event_id=event.id,
            participant_id=payload.participant_id,
            badge_code=payload.badge_code,
            nfc_uid=payload.nfc_uid,
        )
        request_hash = self._request_hash("CHECK_OUT", event.id, participant_id, payload.session_id, None, payload.device_id)
        try:
            replay = await CheckInService.acquire_mutation(
                self.db, event=event, operation_type="CHECK_OUT", idempotency_key=idempotency_key, request_hash=request_hash
            )
            replay_log = await self._replay(replay)
            if replay_log is not None:
                return replay_log

            log = await self.db.scalar(select(AttendanceLog).where(
                AttendanceLog.participant_id == participant_id,
                AttendanceLog.session_id == payload.session_id,
                AttendanceLog.checkout_time.is_(None),
            ).with_for_update())
            if not log:
                raise HTTPException(status_code=404, detail="No active check-in found for this participant and session.")
            checkout_time = datetime.now(timezone.utc)
            duration_mins = int((checkout_time - log.checkin_time).total_seconds() / 60)
            log.checkout_time = checkout_time
            log.duration = duration_mins
            self.db.add(AttendanceMutation(
                organization_id=event.organization_id, event_id=event.id, actor_user_id=actor.id,
                operation_type="CHECK_OUT", idempotency_key=idempotency_key, request_hash=request_hash,
                result_attendance_log_id=log.id, result_created=False,
            ))
            self.db.add(AuditLog(
                organization_id=event.organization_id, actor_user_id=actor.id,
                actor_role=actor.platform_role or actor.role, resource_type="attendance_log", resource_id=log.id,
                action_type="ATTENDANCE_CHECKED_OUT", old_state={"checkout_time": None, "duration": None},
                new_state={"event_id": str(event.id), "participant_id": str(participant_id), "session_id": str(payload.session_id), "checkout_time": checkout_time.isoformat(), "duration": duration_mins, "device_id": payload.device_id},
            ))
            await self.db.commit()
            await self.db.refresh(log)
            return log
        except Exception:
            await self.db.rollback()
            raise
