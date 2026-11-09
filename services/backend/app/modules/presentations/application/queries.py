"""Read-only, tenant-scoped presentation workspace projections."""
from __future__ import annotations

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.agenda.models import Room, Session
from app.modules.events.models.event import Event
from app.modules.venue.models.presentation_queue import PresentationQueue
from app.modules.presentations.models.presentation_file import PresentationFile
from app.modules.presentations.models.poster import Poster
from app.modules.agenda.models import SessionPerson as SessionSpeaker


class PresentationQueueQueryService:
    """Own the bounded queue reads used by venue and technician workspaces."""

    MAX_ROWS = 2_000

    def __init__(self, db: AsyncSession):
        self.db = db

    @classmethod
    def _bound(cls, value: int | None = None) -> int:
        return max(1, min(value or cls.MAX_ROWS, cls.MAX_ROWS))

    async def list_for_event(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID
    ) -> list[PresentationQueue]:
        rows = await self.db.scalars(
            select(PresentationQueue)
            .join(Session, Session.id == PresentationQueue.session_id)
            .join(Event, Event.id == Session.event_id)
            .where(
                Event.organization_id == organization_id,
                Session.event_id == event_id,
                Session.deleted_at.is_(None),
            )
            .order_by(Session.start_time.asc(), Session.id.asc(), PresentationQueue.queue_order.asc(), PresentationQueue.id.asc())
            .limit(self._bound())
        )
        return list(rows.all())


class PresentationFileQueryService:
    """Bounded presentation-file workspace reads with assignment visibility."""

    MAX_ROWS = 2_000

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_for_event(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        user_id: uuid.UUID,
        user_role: str | None,
        session_speaker_id: uuid.UUID | None,
        upload_status: str | None,
        current_version_only: bool,
    ) -> list[PresentationFile]:
        query = select(PresentationFile).join(Event, Event.id == PresentationFile.event_id).where(
            Event.organization_id == organization_id,
            PresentationFile.event_id == event_id,
        ).options(
            selectinload(PresentationFile.speaker),
            selectinload(PresentationFile.session_speaker).selectinload(SessionSpeaker.session),
            selectinload(PresentationFile.validation),
        )
        if user_role not in {"super_admin", "admin", "organiser", "organizer"}:
            from app.modules.rbac.models.rbac import UserAccessNode
            from app.modules.rbac.models.user_assignment import UserEventAssignment

            nodes = (await self.db.execute(
                select(UserAccessNode.node_id, UserAccessNode.node_type).where(
                    UserAccessNode.user_id == user_id
                )
            )).all()
            event_ids = {row.node_id for row in nodes if row.node_type == "EVENT"}
            session_ids = {row.node_id for row in nodes if row.node_type == "SESSION"}
            room_ids = {row.node_id for row in nodes if row.node_type == "ROOM"}
            legacy = await self.db.scalars(select(UserEventAssignment.event_id).where(
                UserEventAssignment.user_id == user_id,
                or_(
                    ~UserEventAssignment.permissions.has_key("node_type"),
                    UserEventAssignment.permissions["node_type"].astext == "event",
                ),
            ))
            event_ids.update(legacy.all())
            if event_id not in event_ids:
                if not session_ids and not room_ids:
                    query = query.where(False)
                else:
                    query = query.where(PresentationFile.session_speaker_id.in_(
                        select(SessionSpeaker.id).join(Session, Session.id == SessionSpeaker.session_id).where(
                            Session.event_id == event_id,
                            or_(
                                Session.id.in_(tuple(session_ids)) if session_ids else False,
                                Session.room_id.in_(tuple(room_ids)) if room_ids else False,
                            ),
                        )
                    ))
        if session_speaker_id:
            query = query.where(PresentationFile.session_speaker_id == session_speaker_id)
        if upload_status:
            query = query.where(PresentationFile.upload_status == upload_status)
        if current_version_only:
            query = query.where(PresentationFile.is_current_version.is_(True))
        rows = await self.db.scalars(
            query.order_by(PresentationFile.uploaded_at.desc(), PresentationFile.id.desc()).limit(self.MAX_ROWS)
        )
        return list(rows.all())


class PosterQueryService:
    """Bounded poster catalogue reads used by organiser and signage clients."""

    MAX_ROWS = 2_000

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_categories(self, *, organization_id: uuid.UUID, event_id: uuid.UUID) -> list[str]:
        rows = await self.db.execute(
            select(Poster.category)
            .join(Event, Event.id == Poster.event_id)
            .where(
                Event.organization_id == organization_id,
                Poster.event_id == event_id,
                Poster.category.is_not(None),
            )
            .distinct()
            .order_by(Poster.category.asc())
            .limit(500)
        )
        return [row[0] for row in rows.all() if row[0]]

    async def list_for_screen(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID, screen_id: str
    ) -> list[Poster]:
        screen = screen_id.strip().lower()
        rows = await self.db.scalars(
            select(Poster)
            .join(Event, Event.id == Poster.event_id)
            .where(
                Event.organization_id == organization_id,
                Poster.event_id == event_id,
                Poster.status == "approved",
                func.concat(",", Poster.display_screen, ",").like(f"%,{screen},%"),
            )
            .order_by(Poster.is_featured.desc(), Poster.display_order.asc(), Poster.id.asc())
            .limit(self.MAX_ROWS)
        )
        return list(rows.all())

    async def list_for_session(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID, session_id: uuid.UUID
    ) -> list[PresentationQueue]:
        rows = await self.db.scalars(
            select(PresentationQueue)
            .join(Session, Session.id == PresentationQueue.session_id)
            .join(Event, Event.id == Session.event_id)
            .where(
                Event.organization_id == organization_id,
                Session.event_id == event_id,
                Session.id == session_id,
                Session.deleted_at.is_(None),
            )
            .order_by(PresentationQueue.queue_order.asc(), PresentationQueue.id.asc())
            .limit(self._bound())
        )
        return list(rows.all())

    async def list_for_room(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID, room_id: uuid.UUID,
        queued_only: bool,
    ) -> list[PresentationQueue]:
        statement = (
            select(PresentationQueue)
            .join(Session, Session.id == PresentationQueue.session_id)
            .join(Event, Event.id == Session.event_id)
            .join(Room, Room.id == Session.room_id)
            .where(
                Event.organization_id == organization_id,
                Session.event_id == event_id,
                Room.id == room_id,
                Session.deleted_at.is_(None),
            )
        )
        if queued_only:
            statement = statement.where(PresentationQueue.status.in_(("queued", "active")))
        rows = await self.db.scalars(
            statement.order_by(
                Session.start_time.asc(), Session.id.asc(),
                PresentationQueue.queue_order.asc(), PresentationQueue.id.asc(),
            ).limit(self._bound())
        )
        return list(rows.all())
