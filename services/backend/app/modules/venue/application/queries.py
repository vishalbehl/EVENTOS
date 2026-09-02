"""Bounded, read-only venue attendance queries."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.modules.agenda.models import Session
from app.modules.events.models.event import Event
from app.modules.registration.models.check_in import CheckIn
from app.modules.registration.models.participant import Participant
from app.modules.analytics.models.attendance_log import AttendanceLog
from app.modules.venue.models.room_device import RoomDevice
from app.modules.venue.models.srr_checkin import SRRCheckin
from app.modules.venue.models.srr_station import SRRStation


class SrrQueryService:
    """Bounded Speaker Ready Room projections with event scoping."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_stations(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID, limit: int = 200
    ) -> list[SRRStation]:
        bounded_limit = max(1, min(limit, 200))
        statement = (
            select(SRRStation)
            .options(
                load_only(
                    SRRStation.id, SRRStation.event_id, SRRStation.station_number,
                    SRRStation.device_name, SRRStation.ip_address, SRRStation.status,
                    SRRStation.assigned_speaker_id, SRRStation.session_assigned_at,
                    SRRStation.last_heartbeat_at, SRRStation.notes,
                    SRRStation.is_active, SRRStation.updated_at,
                )
            )
            .join(Event, Event.id == SRRStation.event_id)
            .where(
                SRRStation.event_id == event_id,
                Event.organization_id == organization_id,
            )
            .order_by(SRRStation.station_number, SRRStation.id)
            .limit(bounded_limit)
        )
        return list((await self.db.scalars(statement)).all())

    async def list_checkins(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID, limit: int = 200
    ) -> list[SRRCheckin]:
        bounded_limit = max(1, min(limit, 200))
        statement = (
            select(SRRCheckin)
            .options(
                load_only(
                    SRRCheckin.id, SRRCheckin.event_id, SRRCheckin.speaker_id,
                    SRRCheckin.station_id, SRRCheckin.checkin_method,
                    SRRCheckin.checked_in_at, SRRCheckin.checked_out_at,
                )
            )
            .join(Event, Event.id == SRRCheckin.event_id)
            .where(
                SRRCheckin.event_id == event_id,
                Event.organization_id == organization_id,
            )
            .order_by(SRRCheckin.checked_in_at.desc(), SRRCheckin.id.desc())
            .limit(bounded_limit)
        )
        return list((await self.db.scalars(statement)).all())

    async def get_station(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID, station_id: uuid.UUID
    ) -> SRRStation | None:
        return await self.db.scalar(
            select(SRRStation)
            .options(load_only(
                SRRStation.id, SRRStation.event_id, SRRStation.station_number,
                SRRStation.device_name, SRRStation.ip_address, SRRStation.status,
                SRRStation.assigned_speaker_id, SRRStation.session_assigned_at,
                SRRStation.last_heartbeat_at, SRRStation.notes,
                SRRStation.is_active, SRRStation.updated_at,
            ))
            .join(Event, Event.id == SRRStation.event_id)
            .where(
                SRRStation.id == station_id,
                SRRStation.event_id == event_id,
                Event.organization_id == organization_id,
            )
        )


class RoomDeviceQueryService:
    """Bounded room-device projections for venue administration screens."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_for_room(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        room_id: uuid.UUID,
        limit: int = 100,
    ) -> list[RoomDevice]:
        bounded_limit = max(1, min(limit, 500))
        statement = (
            select(RoomDevice)
            .options(
                load_only(
                    RoomDevice.id,
                    RoomDevice.room_id,
                    RoomDevice.event_id,
                    RoomDevice.device_type,
                    RoomDevice.device_name,
                    RoomDevice.hostname,
                    RoomDevice.status,
                    RoomDevice.app_version,
                    RoomDevice.last_heartbeat_at,
                    RoomDevice.registered_at,
                )
            )
            .where(
                RoomDevice.organization_id == organization_id,
                RoomDevice.event_id == event_id,
                RoomDevice.room_id == room_id,
            )
            .order_by(RoomDevice.device_type, RoomDevice.id)
            .limit(bounded_limit)
        )
        return list((await self.db.scalars(statement)).all())


class AttendanceQueryService:
    """Screen-level attendance reads with tenant and event boundaries."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_logs(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        session_id: uuid.UUID | None = None,
        participant_id: uuid.UUID | None = None,
        limit: int = 500,
    ) -> list[AttendanceLog]:
        statement = (
            select(AttendanceLog)
            .join(Participant, Participant.id == AttendanceLog.participant_id)
            .join(Event, Event.id == Participant.event_id)
            .options(
                load_only(
                    AttendanceLog.id,
                    AttendanceLog.participant_id,
                    AttendanceLog.session_id,
                    AttendanceLog.checkin_time,
                    AttendanceLog.checkout_time,
                    AttendanceLog.duration,
                    AttendanceLog.method,
                    AttendanceLog.device_id,
                    AttendanceLog.created_at,
                )
            )
            .where(
                Event.organization_id == organization_id,
                Participant.event_id == event_id,
            )
        )
        if session_id is not None:
            statement = statement.where(AttendanceLog.session_id == session_id)
        if participant_id is not None:
            statement = statement.where(AttendanceLog.participant_id == participant_id)
        rows = await self.db.scalars(
            statement.order_by(AttendanceLog.checkin_time.desc()).limit(max(1, min(limit, 500)))
        )
        return list(rows.all())

    async def metrics(self, *, organization_id: uuid.UUID, event_id: uuid.UUID) -> dict:
        registered = select(func.count(Participant.id)).where(
            Participant.event_id == event_id, Participant.deleted_at.is_(None)
        ).scalar_subquery()
        checked_in = select(func.count(func.distinct(CheckIn.participant_id))).where(
            CheckIn.event_id == event_id
        ).scalar_subquery()
        totals = (
            await self.db.execute(
                select(registered.label("registered"), checked_in.label("checked_in")).where(
                    Event.id == event_id, Event.organization_id == organization_id
                )
            )
        ).mappings().one()
        session_rows = await self.db.execute(
            select(Session.id, Session.name, func.count(CheckIn.id))
            .join(Event, Event.id == Session.event_id)
            .outerjoin(CheckIn, CheckIn.session_id == Session.id)
            .where(Event.id == event_id, Event.organization_id == organization_id)
            .group_by(Session.id, Session.name)
        )
        occupancy = {name or str(session_id): int(count or 0) for session_id, name, count in session_rows}
        total_registered = int(totals["registered"] or 0)
        total_checked_in = int(totals["checked_in"] or 0)
        rate = float(total_checked_in / total_registered) if total_registered else 0.0
        return {
            "total_registered": total_registered,
            "total_checked_in": total_checked_in,
            "attendance_rate": rate,
            "no_show_count": total_registered - total_checked_in,
            "no_show_rate": float((total_registered - total_checked_in) / total_registered) if total_registered else 0.0,
            "session_occupancy": occupancy,
        }
