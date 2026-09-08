"""Read-only agenda query services."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import Select, and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only, selectinload

from app.modules.agenda.models import Agenda, AgendaDay, Room, Track
from app.modules.agenda.models.agenda_role import AgendaRole
from app.modules.agenda.models.room_type import RoomType
from app.modules.agenda.models.session_type import SessionType
from app.modules.agenda.models.track_type import TrackType
from app.modules.events.models.event import Event
from app.modules.agenda.schemas.agenda_schemas import AgendaSnapshotResponse
from app.modules.agenda.services.conflict_service import ConflictService
from app.modules.rbac.models.rbac import UserAccessNode
from app.modules.rbac.models.user_assignment import UserEventAssignment


class RoomQueryService:
    """Return bounded room summaries without owning writes or transactions."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_for_event(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        access_predicate: Any | None = None,
    ) -> list[Room]:
        statement: Select = (
            select(Room)
            .join(Event, Event.id == Room.event_id)
            .options(
                load_only(
                    Room.id,
                    Room.event_id,
                    Room.name,
                    Room.code,
                    Room.room_type,
                    Room.room_type_id,
                    Room.room_coordinator,
                    Room.is_active,
                    Room.version,
                    Room.created_at,
                    Room.updated_at,
                ),
                selectinload(Room.event).load_only(Event.timezone),
            )
            .where(
                Event.organization_id == organization_id,
                Room.event_id == event_id,
                Room.is_active.is_(True),
            )
            .order_by(Room.name, Room.id)
            .limit(100)
        )
        if access_predicate is not None:
            statement = statement.where(access_predicate)
        return list((await self.db.scalars(statement)).all())

    async def get_for_event(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        room_id: uuid.UUID,
        allow_inactive: bool = False,
    ) -> Room | None:
        """Load one bounded room projection with its event timezone."""
        statement: Select = (
            select(Room)
            .join(Event, Event.id == Room.event_id)
            .options(
                load_only(
                    Room.id, Room.event_id, Room.name, Room.code,
                    Room.room_type, Room.room_type_id, Room.room_coordinator,
                    Room.is_active, Room.version, Room.created_at,
                ),
                selectinload(Room.event).load_only(Event.timezone),
            )
            .where(
                Room.id == room_id,
                Room.event_id == event_id,
                Event.organization_id == organization_id,
            )
        )
        if not allow_inactive:
            statement = statement.where(Room.is_active.is_(True))
        return await self.db.scalar(statement)

    async def user_can_access(
        self,
        *,
        user_id: uuid.UUID,
        event_id: uuid.UUID,
        room_id: uuid.UUID,
    ) -> bool:
        """Check current and legacy assignments without loading assignment rows."""
        current_assignment = await self.db.scalar(
            select(UserAccessNode.id).where(
                UserAccessNode.user_id == user_id,
                or_(
                    and_(UserAccessNode.node_id == event_id, UserAccessNode.node_type == "EVENT"),
                    and_(UserAccessNode.node_id == room_id, UserAccessNode.node_type == "ROOM"),
                ),
            ).limit(1)
        )
        if current_assignment is not None:
            return True
        legacy_assignment = await self.db.scalar(
            select(UserEventAssignment.id).where(
                UserEventAssignment.user_id == user_id,
                UserEventAssignment.event_id == event_id,
            ).limit(1)
        )
        return legacy_assignment is not None


class TrackQueryService:
    """Return bounded track summaries without loading session relationships."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_for_event(self, *, organization_id: uuid.UUID, event_id: uuid.UUID) -> list[Track]:
        statement = (
            select(Track)
            .join(Event, Event.id == Track.event_id)
            .options(load_only(Track.id, Track.event_id, Track.name, Track.description, Track.display_color, Track.sort_order, Track.version))
            .where(Event.organization_id == organization_id, Track.event_id == event_id, Track.is_active.is_(True))
            .order_by(Track.sort_order, Track.name, Track.id)
            .limit(100)
        )
        return list((await self.db.scalars(statement)).all())


class AgendaQueryService:
    """Read-only, bounded projections for master agendas and their days."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def full_snapshot(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID
    ) -> AgendaSnapshotResponse:
        """Load the agenda builder projection without writes or lazy reads."""
        agenda = (
            await self.db.scalars(
                select(Agenda)
                .join(Event, Event.id == Agenda.event_id)
                .options(load_only(
                    Agenda.id, Agenda.event_id, Agenda.name, Agenda.code,
                    Agenda.description, Agenda.timezone, Agenda.status,
                    Agenda.version, Agenda.published_at, Agenda.published_by,
                    Agenda.created_at, Agenda.updated_at,
                ))
                .where(Event.organization_id == organization_id, Agenda.event_id == event_id)
                .order_by(Agenda.created_at, Agenda.id)
                .limit(1)
            )
        ).first()
        days = list((await self.db.scalars(
            select(AgendaDay)
            .join(Agenda, Agenda.id == AgendaDay.agenda_id)
            .join(Event, Event.id == Agenda.event_id)
            .options(load_only(
                AgendaDay.id, AgendaDay.agenda_id, AgendaDay.day_number,
                AgendaDay.name, AgendaDay.date, AgendaDay.start_time,
                AgendaDay.end_time, AgendaDay.timezone, AgendaDay.status,
                AgendaDay.sort_order, AgendaDay.created_at, AgendaDay.updated_at,
            ))
            .where(Event.organization_id == organization_id, Agenda.event_id == event_id)
            .order_by(AgendaDay.sort_order, AgendaDay.date, AgendaDay.id)
            .limit(100)
        )).all()) if agenda else []
        catalog_scope = lambda model: or_(
            model.organization_id.is_(None), model.organization_id == organization_id
        )
        room_types = list((await self.db.scalars(
            select(RoomType).options(load_only(
                RoomType.id, RoomType.organization_id, RoomType.name,
                RoomType.code, RoomType.description, RoomType.is_system,
                RoomType.is_active, RoomType.created_at, RoomType.updated_at,
            )).where(RoomType.is_active.is_(True), catalog_scope(RoomType))
            .order_by(RoomType.name, RoomType.id).limit(100)
        )).all())
        rooms = list((await self.db.scalars(
            select(Room).join(Event, Event.id == Room.event_id).options(load_only(
                Room.id, Room.event_id, Room.name, Room.code, Room.room_type,
                Room.room_type_id, Room.room_coordinator, Room.is_active,
                Room.version, Room.created_at, Room.updated_at,
            )).where(
                Event.organization_id == organization_id,
                Room.event_id == event_id, Room.is_active.is_(True),
            ).order_by(Room.sort_order, Room.name, Room.id).limit(100)
        )).all())
        track_types = list((await self.db.scalars(
            select(TrackType).options(load_only(
                TrackType.id, TrackType.organization_id, TrackType.name,
                TrackType.code, TrackType.description, TrackType.is_system,
                TrackType.is_active, TrackType.created_at, TrackType.updated_at,
            )).where(TrackType.is_active.is_(True), catalog_scope(TrackType))
            .order_by(TrackType.name, TrackType.id).limit(100)
        )).all())
        tracks = list((await self.db.scalars(
            select(Track).join(Event, Event.id == Track.event_id).options(load_only(
                Track.id, Track.event_id, Track.name, Track.description,
                Track.display_color, Track.sort_order, Track.version,
            )).where(
                Event.organization_id == organization_id,
                Track.event_id == event_id, Track.is_active.is_(True),
            ).order_by(Track.sort_order, Track.name, Track.id).limit(100)
        )).all())
        session_types = list((await self.db.scalars(
            select(SessionType).options(load_only(
                SessionType.id, SessionType.organization_id, SessionType.name,
                SessionType.code, SessionType.category, SessionType.description,
                SessionType.default_duration_minutes, SessionType.configuration,
                SessionType.is_system, SessionType.is_active,
                SessionType.created_at, SessionType.updated_at,
            )).where(SessionType.is_active.is_(True), catalog_scope(SessionType))
            .order_by(SessionType.name, SessionType.id).limit(100)
        )).all())
        roles = list((await self.db.scalars(
            select(AgendaRole).options(load_only(
                AgendaRole.id, AgendaRole.code, AgendaRole.name,
                AgendaRole.category, AgendaRole.description, AgendaRole.is_system,
                AgendaRole.is_active, AgendaRole.sort_order,
            )).where(AgendaRole.is_active.is_(True))
            .order_by(AgendaRole.sort_order, AgendaRole.name, AgendaRole.id).limit(100)
        )).all())
        sessions = list((await self.db.scalars(
            select(Session)
            .join(Event, Event.id == Session.event_id)
            .options(selectinload(Session.session_people), selectinload(Session.presentation_slots))
            .where(
                Event.organization_id == organization_id,
                Session.event_id == event_id, Session.deleted_at.is_(None),
            ).order_by(Session.sort_order, Session.start_time, Session.id).limit(500)
        )).all())
        conflicts = await ConflictService.scan_event_conflicts(self.db, event_id)
        return AgendaSnapshotResponse(
            agenda=agenda, days=days, rooms=rooms, room_types=room_types,
            tracks=tracks, track_types=track_types, session_types=session_types,
            roles=roles, sessions=sessions, conflicts=conflicts,
        )

    async def list_for_event(self, *, organization_id: uuid.UUID, event_id: uuid.UUID) -> list[Agenda]:
        statement = (
            select(Agenda)
            .join(Event, Event.id == Agenda.event_id)
            .options(load_only(
                Agenda.id, Agenda.event_id, Agenda.name, Agenda.code,
                Agenda.description, Agenda.timezone, Agenda.status,
                Agenda.version, Agenda.published_at, Agenda.published_by,
                Agenda.created_at, Agenda.updated_at,
            ))
            .where(Event.organization_id == organization_id, Agenda.event_id == event_id)
            .order_by(Agenda.created_at, Agenda.id)
            .limit(100)
        )
        return list((await self.db.scalars(statement)).all())


    async def list_days_for_agenda(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID, agenda_id: uuid.UUID
    ) -> list[AgendaDay]:
        statement = (
            select(AgendaDay)
            .join(Agenda, Agenda.id == AgendaDay.agenda_id)
            .join(Event, Event.id == Agenda.event_id)
            .options(load_only(
                AgendaDay.id, AgendaDay.agenda_id, AgendaDay.day_number,
                AgendaDay.name, AgendaDay.date, AgendaDay.start_time,
                AgendaDay.end_time, AgendaDay.timezone, AgendaDay.status,
                AgendaDay.sort_order, AgendaDay.created_at, AgendaDay.updated_at,
            ))
            .where(
                Event.organization_id == organization_id,
                Agenda.event_id == event_id,
                AgendaDay.agenda_id == agenda_id,
            )
            .order_by(AgendaDay.sort_order, AgendaDay.date, AgendaDay.id)
            .limit(100)
        )
        return list((await self.db.scalars(statement)).all())

    async def list_days_for_event(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID
    ) -> list[AgendaDay]:
        """Load days for the event's earliest agenda in one bounded read."""
        default_agenda_id = (
            select(Agenda.id)
            .join(Event, Event.id == Agenda.event_id)
            .where(Event.organization_id == organization_id, Agenda.event_id == event_id)
            .order_by(Agenda.created_at, Agenda.id)
            .limit(1)
            .scalar_subquery()
        )
        statement = (
            select(AgendaDay)
            .join(Agenda, Agenda.id == AgendaDay.agenda_id)
            .join(Event, Event.id == Agenda.event_id)
            .options(load_only(
                AgendaDay.id, AgendaDay.agenda_id, AgendaDay.day_number,
                AgendaDay.name, AgendaDay.date, AgendaDay.start_time,
                AgendaDay.end_time, AgendaDay.timezone, AgendaDay.status,
                AgendaDay.sort_order, AgendaDay.created_at, AgendaDay.updated_at,
            ))
            .where(
                Event.organization_id == organization_id,
                Agenda.event_id == event_id,
                AgendaDay.agenda_id == default_agenda_id,
            )
            .order_by(AgendaDay.sort_order, AgendaDay.date, AgendaDay.id)
            .limit(100)
        )
        return list((await self.db.scalars(statement)).all())


class AgendaCatalogQueryService:
    """Return bounded active agenda catalog projections without writes."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_roles(self) -> list[AgendaRole]:
        statement = (
            select(AgendaRole)
            .options(load_only(
                AgendaRole.id, AgendaRole.code, AgendaRole.name,
                AgendaRole.category, AgendaRole.description, AgendaRole.is_system,
                AgendaRole.is_active, AgendaRole.sort_order,
            ))
            .where(AgendaRole.is_active.is_(True))
            .order_by(AgendaRole.sort_order, AgendaRole.name, AgendaRole.id)
            .limit(100)
        )
        return list((await self.db.scalars(statement)).all())

    async def list_session_types(self, *, organization_id: uuid.UUID) -> list[SessionType]:
        statement = (
            select(SessionType)
            .options(load_only(
                SessionType.id, SessionType.organization_id, SessionType.name,
                SessionType.code, SessionType.category, SessionType.description,
                SessionType.default_duration_minutes, SessionType.configuration,
                SessionType.is_system, SessionType.is_active,
                SessionType.created_at, SessionType.updated_at,
            ))
            .where(
                SessionType.is_active.is_(True),
                or_(SessionType.organization_id.is_(None), SessionType.organization_id == organization_id),
            )
            .distinct(SessionType.code)
            .order_by(
                SessionType.code,
                SessionType.organization_id.is_not(None).desc(),
                SessionType.name,
                SessionType.id,
            )
            .limit(100)
            .execution_options(skip_tenant_filter=True)
        )
        return list((await self.db.scalars(statement)).all())

    async def list_room_types(self, *, organization_id: uuid.UUID) -> list[RoomType]:
        statement = (
            select(RoomType)
            .options(load_only(
                RoomType.id, RoomType.organization_id, RoomType.name,
                RoomType.code, RoomType.description, RoomType.is_system,
                RoomType.is_active, RoomType.created_at, RoomType.updated_at,
            ))
            .where(
                RoomType.is_active.is_(True),
                or_(RoomType.organization_id.is_(None), RoomType.organization_id == organization_id),
            )
            .distinct(RoomType.code)
            .order_by(
                RoomType.code,
                RoomType.organization_id.is_not(None).desc(),
                RoomType.name,
                RoomType.id,
            )
            .limit(100)
            .execution_options(skip_tenant_filter=True)
        )
        return list((await self.db.scalars(statement)).all())

    async def list_track_types(self, *, organization_id: uuid.UUID) -> list[TrackType]:
        statement = (
            select(TrackType)
            .options(load_only(
                TrackType.id, TrackType.organization_id, TrackType.name,
                TrackType.code, TrackType.description, TrackType.is_system,
                TrackType.is_active, TrackType.created_at, TrackType.updated_at,
            ))
            .where(
                TrackType.is_active.is_(True),
                or_(TrackType.organization_id.is_(None), TrackType.organization_id == organization_id),
            )
            .distinct(TrackType.code)
            .order_by(
                TrackType.code,
                TrackType.organization_id.is_not(None).desc(),
                TrackType.name,
                TrackType.id,
            )
            .limit(100)
            .execution_options(skip_tenant_filter=True)
        )
        return list((await self.db.scalars(statement)).all())
