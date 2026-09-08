from __future__ import annotations

import uuid
from typing import Iterable

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only, selectinload

from app.infrastructure.repositories import Repository
from app.modules.speakers.infrastructure.repositories import (
    SessionRepository,
    SpeakerRepository,
)
from app.modules.agenda.models import Session, SessionPerson as SessionSpeaker, Track
from app.modules.events.models.speaker import Speaker
from app.modules.events.models.speaker_profile import SpeakerProfile
from app.modules.events.models.event import Event
from app.modules.presentations.models.poster import Poster
from app.modules.presentations.models.presentation_file import PresentationFile
from app.modules.registration.models.participant import Participant
from app.schemas.cursor_pagination import CursorPage, bounded_page_size


class SpeakerQueryService:
    """Bounded, read-only speaker list query for large event datasets."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def profile_access_speaker(self, *, event_id: uuid.UUID, speaker_id: uuid.UUID, token: str) -> Speaker | None:
        """Resolve a portal token against the event without router-owned SQL."""
        result = await self.db.scalars(
            select(Speaker).options(selectinload(Speaker.event)).where(
                Speaker.id == speaker_id,
                Speaker.event_id == event_id,
                (Speaker.upload_token == token) | (Speaker.speaker_code == token.upper()),
                Speaker.deleted_at.is_(None),
            )
        )
        return result.one_or_none()

    async def event_for_profile_access(self, *, event_id: uuid.UUID) -> Event | None:
        result = await self.db.scalars(
            select(Event).options(load_only(Event.id, Event.organization_id)).where(Event.id == event_id)
        )
        return result.one_or_none()

    async def profile_exists(self, *, event_id: uuid.UUID, speaker_id: uuid.UUID) -> bool:
        return (await self.db.scalar(
            select(Speaker.id).where(
                Speaker.id == speaker_id,
                Speaker.event_id == event_id,
                Speaker.deleted_at.is_(None),
            )
        )) is not None

    async def profile_template_data(self, *, event_id: uuid.UUID, speaker_id: uuid.UUID) -> tuple[Speaker, Event, list[SessionSpeaker]] | None:
        """Load the bounded speaker/template projection used by the DOCX route."""
        speaker = await self.db.scalar(
            select(Speaker).where(
                Speaker.id == speaker_id, Speaker.event_id == event_id,
                Speaker.deleted_at.is_(None),
            ).options(load_only(Speaker.id, Speaker.first_name, Speaker.last_name))
        )
        event = await self.db.scalar(
            select(Event).where(Event.id == event_id).options(load_only(
                Event.id, Event.name, Event.start_date, Event.end_date, Event.speaker_settings,
            ))
        )
        if speaker is None or event is None:
            return None
        sessions = list((await self.db.scalars(
            select(SessionSpeaker).join(Session, SessionSpeaker.session_id == Session.id)
            .where(SessionSpeaker.speaker_id == speaker_id, Session.event_id == event_id)
            .options(selectinload(SessionSpeaker.session))
            .order_by(Session.start_time.asc(), Session.id.asc())
            .limit(100)
        )).all())
        return speaker, event, sessions

    async def resolve_access_scope(
        self,
        *,
        user_id: uuid.UUID,
        event_id: uuid.UUID,
        user_role: str | None,
    ) -> tuple[bool, set[uuid.UUID], set[uuid.UUID]]:
        """Resolve speaker-workspace scope in one query-service boundary."""
        event_wide_access = user_role in {"super_admin", "admin", "organiser", "organizer"}
        if event_wide_access:
            return True, set(), set()

        from app.modules.rbac.models.rbac import UserAccessNode
        from app.modules.rbac.models.user_assignment import UserEventAssignment

        nodes = (
            await self.db.execute(
                select(UserAccessNode.node_id, UserAccessNode.node_type).where(
                    UserAccessNode.user_id == user_id
                )
            )
        ).all()
        assigned_session_ids = {row.node_id for row in nodes if row.node_type == "SESSION"}
        assigned_room_ids = {row.node_id for row in nodes if row.node_type == "ROOM"}
        assigned_event_ids = {row.node_id for row in nodes if row.node_type == "EVENT"}
        legacy_event_ids = set(
            (
                await self.db.scalars(
                    select(UserEventAssignment.event_id).where(
                        UserEventAssignment.user_id == user_id,
                        or_(
                            ~UserEventAssignment.permissions.has_key("node_type"),
                            UserEventAssignment.permissions["node_type"].astext == "event",
                        ),
                    )
                )
            ).all()
        )
        return (
            event_id in assigned_event_ids or event_id in legacy_event_ids,
            assigned_session_ids,
            assigned_room_ids,
        )

    async def get_portal_config_event(self, *, event_id: uuid.UUID) -> Event | None:
        """Load only event fields needed to build the public speaker config."""
        result = await self.db.scalars(
            select(Event)
            .options(
                load_only(
                    Event.id,
                    Event.name,
                    Event.branding_settings,
                    Event.speaker_settings,
                    Event.registration_settings,
                    Event.theme_color,
                    Event.speaker_mode_enabled,
                    Event.registration_mode_enabled,
                    Event.start_date,
                    Event.end_date,
                    Event.location,
                    Event.venue_name,
                    Event.country,
                    Event.state,
                    Event.organizer_name,
                )
            )
            .where(Event.id == event_id)
        )
        return result.one_or_none()

    async def get_for_event(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        speaker_id: uuid.UUID,
    ) -> Speaker | None:
        result = await self.db.scalars(
            select(Speaker)
            .join(Event, Event.id == Speaker.event_id)
            .options(
                selectinload(Speaker.profile),
                selectinload(Speaker.track),
                selectinload(Speaker.participant),
            )
            .where(
                Speaker.id == speaker_id,
                Speaker.event_id == event_id,
                Event.organization_id == organization_id,
                Speaker.deleted_at.is_(None),
            )
        )
        return result.one_or_none()

    async def get_profile_for_event(
        self,
        *,
        organization_id: uuid.UUID | None,
        event_id: uuid.UUID,
        speaker_id: uuid.UUID,
    ) -> SpeakerProfile | None:
        conditions = [
            SpeakerProfile.speaker_id == speaker_id,
            SpeakerProfile.event_id == event_id,
        ]
        if organization_id:
            conditions.extend(
                [
                    SpeakerProfile.organization_id == organization_id,
                    Event.organization_id == organization_id,
                ]
            )
        query = select(SpeakerProfile).join(Event, Event.id == SpeakerProfile.event_id).where(*conditions)
        result = await self.db.scalars(query)
        return result.one_or_none()

    async def list_legacy(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        page: int = 1,
        page_size: int = 200,
        upload_status: str | None = None,
        search: str | None = None,
        room_id: uuid.UUID | None = None,
        session_id: uuid.UUID | None = None,
        assigned_session_ids: Iterable[uuid.UUID] = (),
        assigned_room_ids: Iterable[uuid.UUID] = (),
        event_wide_access: bool = True,
    ) -> list[Speaker]:
        """Bounded compatibility list preserving the legacy response contract."""
        session_ids = tuple(assigned_session_ids)
        room_ids = tuple(assigned_room_ids)
        query = (
            select(Speaker)
            .join(Event, Event.id == Speaker.event_id)
            .options(
                selectinload(Speaker.presentation_files),
                selectinload(Speaker.posters).selectinload(Poster.session).selectinload(Session.room),
                selectinload(Speaker.session_speakers).selectinload(SessionSpeaker.session),
                selectinload(Speaker.profile),
                selectinload(Speaker.track),
                selectinload(Speaker.participant),
            )
            .where(
                Event.organization_id == organization_id,
                Speaker.event_id == event_id,
                Speaker.deleted_at.is_(None),
            )
        )
        if upload_status:
            query = query.where(Speaker.upload_status == upload_status)
        if search:
            term = f"%{search}%"
            query = query.where(
                (Speaker.first_name + " " + Speaker.last_name).ilike(term)
                | Speaker.email.ilike(term)
                | Speaker.phone.ilike(term)
            )
        if room_id:
            room_sessions = select(Session.id).where(
                Session.event_id == event_id,
                Session.room_id == room_id,
            )
            query = query.where(
                Speaker.id.in_(select(SessionSpeaker.speaker_id).where(SessionSpeaker.session_id.in_(room_sessions)))
                | Speaker.id.in_(select(Poster.speaker_id).where(Poster.session_id.in_(room_sessions)))
            )
        if session_id:
            query = query.where(
                Speaker.id.in_(select(SessionSpeaker.speaker_id).where(SessionSpeaker.session_id == session_id))
                | Speaker.id.in_(select(Poster.speaker_id).where(Poster.session_id == session_id))
            )
        if not event_wide_access:
            query = query.where(
                Speaker.id.in_(
                    select(SessionSpeaker.speaker_id)
                    .join(Session, Session.id == SessionSpeaker.session_id)
                    .where(
                        Session.event_id == event_id,
                        (Session.id.in_(session_ids) if session_ids else False)
                        | (Session.room_id.in_(room_ids) if room_ids else False),
                    )
                )
                | Speaker.id.in_(
                    select(Poster.speaker_id)
                    .where(
                        (Poster.session_id.in_(session_ids) if session_ids else False)
                        | (
                            Poster.session_id.in_(
                                select(Session.id).where(
                                    Session.event_id == event_id,
                                    Session.room_id.in_(room_ids),
                                )
                            )
                            if room_ids
                            else False
                        )
                    )
                )
            )
        query = query.order_by(Speaker.last_name, Speaker.first_name, Speaker.id).offset(
            (max(page, 1) - 1) * min(max(page_size, 1), 1000)
        ).limit(min(max(page_size, 1), 1000))
        return list((await self.db.scalars(query)).all())

    async def list_page(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        page_size: int = 100,
        cursor: str | None = None,
        search: str | None = None,
        upload_status: str | None = None,
        room_id: uuid.UUID | None = None,
        session_id: uuid.UUID | None = None,
        assigned_session_ids: Iterable[uuid.UUID] | None = None,
        assigned_room_ids: Iterable[uuid.UUID] | None = None,
        event_wide_access: bool = True,
    ) -> CursorPage[Speaker]:
        query = (
            select(Speaker)
            .join(Event, Event.id == Speaker.event_id)
            .options(
                load_only(
                    Speaker.id,
                    Speaker.event_id,
                    Speaker.track_id,
                    Speaker.participant_id,
                    Speaker.role,
                    Speaker.regno,
                    Speaker.first_name,
                    Speaker.last_name,
                    Speaker.email,
                    Speaker.phone,
                    Speaker.designation,
                    Speaker.affiliation,
                    Speaker.country,
                    Speaker.speaker_code,
                    Speaker.upload_status,
                    Speaker.qr_code_url,
                    Speaker.checked_in_at,
                    Speaker.created_at,
                ),
                selectinload(Speaker.presentation_files).load_only(
                    PresentationFile.is_current_version,
                    PresentationFile.upload_status,
                ),
                selectinload(Speaker.posters).load_only(Poster.status),
                selectinload(Speaker.session_speakers).load_only(SessionSpeaker.id),
                selectinload(Speaker.track).load_only(Track.name, Track.display_color),
                selectinload(Speaker.participant).load_only(Participant.roles),
            )
            .where(
                Speaker.event_id == event_id,
                Event.organization_id == organization_id,
                Speaker.deleted_at.is_(None),
            )
        )

        if search:
            term = f"%{search}%"
            query = query.where(
                (Speaker.first_name + " " + Speaker.last_name).ilike(term)
                | Speaker.email.ilike(term)
                | Speaker.phone.ilike(term)
            )
        if upload_status:
            query = query.where(Speaker.upload_status == upload_status)
        if room_id:
            room_sessions = select(Session.id).where(
                Session.event_id == event_id,
                Session.room_id == room_id,
            )
            query = query.where(
                or_(
                    Speaker.id.in_(select(SessionSpeaker.speaker_id).where(SessionSpeaker.session_id.in_(room_sessions))),
                    Speaker.id.in_(select(Poster.speaker_id).where(Poster.session_id.in_(room_sessions))),
                )
            )
        if session_id:
            query = query.where(
                or_(
                    Speaker.id.in_(
                        select(SessionSpeaker.speaker_id)
                        .join(Session, Session.id == SessionSpeaker.session_id)
                        .where(SessionSpeaker.session_id == session_id, Session.event_id == event_id)
                    ),
                    Speaker.id.in_(
                        select(Poster.speaker_id)
                        .join(Session, Session.id == Poster.session_id)
                        .where(Poster.session_id == session_id, Session.event_id == event_id)
                    ),
                )
            )

        if not event_wide_access:
            session_ids = tuple(assigned_session_ids or ())
            room_ids = tuple(assigned_room_ids or ())
            if not session_ids and not room_ids:
                query = query.where(False)
            else:
                query = query.where(
                    or_(
                        Speaker.id.in_(
                            select(SessionSpeaker.speaker_id)
                            .join(Session, Session.id == SessionSpeaker.session_id)
                            .where(
                                Session.event_id == event_id,
                                or_(
                                    Session.id.in_(session_ids) if session_ids else False,
                                    Session.room_id.in_(room_ids) if room_ids else False,
                                )
                            )
                        ),
                        Speaker.id.in_(
                            select(Poster.speaker_id)
                            .where(
                                or_(
                                    Poster.session_id.in_(session_ids) if session_ids else False,
                                    Poster.session_id.in_(
                                        select(Session.id).where(
                                            Session.event_id == event_id,
                                            Session.room_id.in_(room_ids),
                                        )
                                    ) if room_ids else False,
                                )
                            )
                        ) if session_ids or room_ids else False,
                    )
                )

        return await SpeakerRepository(self.db).cursor_page(
            query,
            limit=bounded_page_size(page_size, maximum=100),
            cursor=cursor,
            cursor_column=("created_at", "id"),
            descending=True,
        )


class SessionQueryService:
    """Bounded, tenant-scoped schedule read for large event workspaces."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_for_event(self, *, organization_id: uuid.UUID, event_id: uuid.UUID,
                            session_id: uuid.UUID) -> Session | None:
        return await self.db.scalar(
            select(Session).join(Event, Event.id == Session.event_id).options(
                selectinload(Session.event), selectinload(Session.room),
                selectinload(Session.track),
                selectinload(Session.session_speakers).selectinload(SessionSpeaker.speaker),
            ).where(
                Session.id == session_id, Session.event_id == event_id,
                Event.organization_id == organization_id, Session.deleted_at.is_(None),
            )
        )

    async def list_legacy(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        page: int = 1,
        page_size: int = 100,
        room_id: uuid.UUID | None = None,
        status_filter: str | None = None,
        user_id: uuid.UUID | None = None,
        user_role: str | None = None,
    ) -> list[Session]:
        """Bounded offset-compatible session read with assignment filtering."""
        query = (
            select(Session)
            .join(Event, Event.id == Session.event_id)
            .options(
                selectinload(Session.event),
                selectinload(Session.room),
                selectinload(Session.track),
                selectinload(Session.session_speakers).selectinload(SessionSpeaker.speaker),
            )
            .where(
                Event.organization_id == organization_id,
                Session.event_id == event_id,
                Session.deleted_at.is_(None),
            )
        )
        if user_id and user_role not in {"super_admin", "admin", "organiser", "organizer"}:
            from app.modules.rbac.models.rbac import UserAccessNode

            event_assigned = select(UserAccessNode.node_id).where(
                UserAccessNode.user_id == user_id,
                UserAccessNode.node_type == "EVENT",
                UserAccessNode.node_id == event_id,
            )
            room_assignments = select(UserAccessNode.node_id).where(
                UserAccessNode.user_id == user_id,
                UserAccessNode.node_type == "ROOM",
            )
            session_assignments = select(UserAccessNode.node_id).where(
                UserAccessNode.user_id == user_id,
                UserAccessNode.node_type == "SESSION",
            )
            query = query.where(
                (Session.event_id.in_(event_assigned))
                | Session.room_id.in_(room_assignments)
                | Session.id.in_(session_assignments)
            )
        if room_id:
            query = query.where(Session.room_id == room_id)
        if status_filter:
            query = query.where(Session.status == status_filter)
        query = query.order_by(Session.start_time, Session.id).offset(
            (max(page, 1) - 1) * min(max(page_size, 1), 1000)
        ).limit(min(max(page_size, 1), 1000))
        return list((await self.db.scalars(query)).all())

    async def list_page(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        page_size: int = 100,
        cursor: str | None = None,
        room_id: uuid.UUID | None = None,
        status_filter: str | None = None,
        assigned_session_ids: Iterable[uuid.UUID] | None = None,
        assigned_room_ids: Iterable[uuid.UUID] | None = None,
        event_wide_access: bool = True,
    ) -> CursorPage[Session]:
        query = (
            select(Session)
            .join(Event, Event.id == Session.event_id)
            .options(
                load_only(
                    Session.id, Session.event_id, Session.room_id, Session.track_id,
                    Session.title, Session.session_code, Session.session_type,
                    Session.start_time, Session.end_time, Session.status,
                    Session.cme_credits, Session.cme_eligible, Session.version,
                ),
                selectinload(Session.event).load_only(Event.timezone),
                selectinload(Session.room),
                selectinload(Session.track),
                selectinload(Session.session_speakers).selectinload(SessionSpeaker.speaker),
            )
            .where(
                Event.organization_id == organization_id,
                Session.event_id == event_id,
                Session.deleted_at.is_(None),
            )
        )
        if room_id:
            query = query.where(Session.room_id == room_id)
        if status_filter:
            query = query.where(Session.status == status_filter)

        if not event_wide_access:
            session_ids = tuple(assigned_session_ids or ())
            room_ids = tuple(assigned_room_ids or ())
            if not session_ids and not room_ids:
                query = query.where(False)
            else:
                query = query.where(or_(
                    Session.id.in_(session_ids) if session_ids else False,
                    Session.room_id.in_(room_ids) if room_ids else False,
                ))

        return await SessionRepository(self.db).cursor_page(
            query,
            limit=bounded_page_size(page_size, maximum=100),
            cursor=cursor,
            cursor_column=("start_time", "id"),
            descending=False,
        )
