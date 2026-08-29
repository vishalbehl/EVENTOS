import uuid
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.events.models.event import Event
from app.modules.agenda.models.agenda import Agenda
from app.modules.agenda.models.agenda_day import AgendaDay
from app.modules.agenda.models.room_type import RoomType
from app.modules.agenda.models.room import Room
from app.modules.agenda.models.track_type import TrackType
from app.modules.agenda.models.track import Track
from app.modules.agenda.models.session_type import SessionType
from app.modules.agenda.models.agenda_role import AgendaRole
from app.modules.agenda.models.session import Session
from app.modules.agenda.models.session_person import SessionPerson
from app.modules.agenda.models.presentation_slot import PresentationSlot
from app.modules.agenda.models.agenda_conflict import AgendaConflict
from app.modules.agenda.schemas.agenda_schemas import AgendaSnapshotResponse
from app.modules.agenda.services.conflict_service import ConflictService


class AgendaService:
    @staticmethod
    async def get_or_create_default_agenda(
        db: AsyncSession, event: Event
    ) -> Agenda:
        q = select(Agenda).where(Agenda.event_id == event.id).order_by(Agenda.created_at)
        res = await db.execute(q)
        agenda = res.scalars().first()
        if not agenda:
            agenda = Agenda(
                id=uuid.uuid4(),
                event_id=event.id,
                name=f"{event.name} Agenda",
                code=f"MAIN-{str(event.id)[:6].upper()}",
                status="PUBLISHED",
                timezone=event.timezone or "UTC"
            )
            db.add(agenda)
            await db.commit()
            await db.refresh(agenda)
        return agenda

    @staticmethod
    async def get_full_snapshot(
        db: AsyncSession, event_id: uuid.UUID
    ) -> AgendaSnapshotResponse:
        # 1. Master Agenda
        agenda_q = select(Agenda).where(Agenda.event_id == event_id).order_by(Agenda.created_at)
        agenda_res = await db.execute(agenda_q)
        agenda = agenda_res.scalars().first()

        # 2. Days
        days_q = select(AgendaDay).where(AgendaDay.agenda_id == agenda.id if agenda else False).order_by(AgendaDay.sort_order, AgendaDay.date)
        days_res = await db.execute(days_q)
        days = days_res.scalars().all()

        # 3. Room types & Rooms
        rt_res = await db.execute(select(RoomType).where(RoomType.is_active.is_(True)).order_by(RoomType.name))
        room_types = rt_res.scalars().all()

        rooms_q = select(Room).where(Room.event_id == event_id, Room.is_active.is_(True)).order_by(Room.sort_order, Room.name)
        rooms_res = await db.execute(rooms_q)
        rooms = rooms_res.scalars().all()

        # 4. Track types & Tracks
        tt_res = await db.execute(select(TrackType).where(TrackType.is_active.is_(True)).order_by(TrackType.name))
        track_types = tt_res.scalars().all()

        tracks_q = select(Track).where(Track.event_id == event_id, Track.is_active.is_(True)).order_by(Track.sort_order, Track.name)
        tracks_res = await db.execute(tracks_q)
        tracks = tracks_res.scalars().all()

        # 5. Session Types & Roles
        st_res = await db.execute(select(SessionType).where(SessionType.is_active.is_(True)).order_by(SessionType.name))
        session_types = st_res.scalars().all()

        roles_res = await db.execute(select(AgendaRole).where(AgendaRole.is_active.is_(True)).order_by(AgendaRole.sort_order))
        roles = roles_res.scalars().all()

        # 6. Sessions with People & Slots
        sessions_q = (
            select(Session)
            .options(
                selectinload(Session.session_people),
                selectinload(Session.presentation_slots)
            )
            .where(
                Session.event_id == event_id,
                Session.deleted_at.is_(None)
            )
            .order_by(Session.sort_order, Session.start_time)
        )
        sessions_res = await db.execute(sessions_q)
        sessions = sessions_res.scalars().all()

        # 7. Scan Conflicts
        conflicts = await ConflictService.scan_event_conflicts(db, event_id)

        return AgendaSnapshotResponse(
            agenda=agenda,
            days=days,
            rooms=rooms,
            room_types=room_types,
            tracks=tracks,
            track_types=track_types,
            session_types=session_types,
            roles=roles,
            sessions=sessions,
            conflicts=conflicts
        )
