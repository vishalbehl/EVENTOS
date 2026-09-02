import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Integer,
    Index, Numeric, String, Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.ext.hybrid import hybrid_property

from app.database import Base, SoftDeleteMixin

if TYPE_CHECKING:
    from app.modules.events.models.event import Event
    from app.modules.agenda.models.agenda import Agenda
    from app.modules.agenda.models.agenda_day import AgendaDay
    from app.modules.agenda.models.room import AgendaRoom
    from app.modules.agenda.models.track import AgendaTrack
    from app.modules.agenda.models.session_type import AgendaSessionType
    from app.modules.agenda.models.session_person import AgendaSessionPerson
    from app.modules.agenda.models.presentation_slot import AgendaPresentationSlot


class AgendaSession(Base, SoftDeleteMixin):
    """
    Heart of conference schedule in the agenda schema.
    """
    __tablename__ = "sessions"
    __table_args__ = (
        Index("ix_agenda_sessions_event_start_id", "event_id", "start_time", "id"),
        {"schema": "agenda"},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Optimistic concurrency token for schedule workspace edits.
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    agenda_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agenda.agendas.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    agenda_day_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agenda.agenda_days.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    room_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agenda.rooms.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    track_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agenda.tracks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    session_type_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agenda.session_types.id", ondelete="SET NULL"),
        nullable=True,
    )
    parent_session_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agenda.sessions.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    moderator_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    session_code: Mapped[str] = mapped_column(String(50), nullable=False)
    session_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="Scientific Session"
    )
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    start_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    end_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="SCHEDULED"
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cme_credits: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(4, 2), nullable=True
    )
    cme_eligible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    operations_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    seating_layout: Mapped[str] = mapped_column(
        String(50), nullable=False, default="Theater"
    )
    live_stream_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    display_color: Mapped[str] = mapped_column(
        String(30), nullable=False, default="#3b82f6"
    )
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    agenda: Mapped[Optional["MasterAgenda"]] = relationship("MasterAgenda", back_populates="sessions")
    agenda_day: Mapped[Optional["AgendaDay"]] = relationship("AgendaDay", back_populates="sessions")
    event: Mapped["Event"] = relationship("Event", back_populates="sessions")
    room: Mapped[Optional["AgendaRoom"]] = relationship("AgendaRoom", back_populates="sessions")
    track: Mapped[Optional["AgendaTrack"]] = relationship("AgendaTrack", back_populates="sessions")
    session_type_ref: Mapped[Optional["AgendaSessionType"]] = relationship("AgendaSessionType", back_populates="sessions")
    parent_session: Mapped[Optional["AgendaSession"]] = relationship("AgendaSession", remote_side=[id], backref="child_sessions")
    session_people: Mapped[List["AgendaSessionPerson"]] = relationship("AgendaSessionPerson", back_populates="session", cascade="all, delete-orphan", order_by="AgendaSessionPerson.display_order")
    session_speakers: Mapped[List["AgendaSessionPerson"]] = relationship("AgendaSessionPerson", viewonly=True, order_by="AgendaSessionPerson.display_order")
    presentation_slots: Mapped[List["AgendaPresentationSlot"]] = relationship("AgendaPresentationSlot", back_populates="session", cascade="all, delete-orphan", order_by="AgendaPresentationSlot.display_order")

    # Compatibility properties
    @hybrid_property
    def name(self) -> str:
        return self.title

    @name.setter
    def name(self, value: str) -> None:
        self.title = value

    @property
    def duration_minutes(self) -> int:
        if self.start_time and self.end_time:
            return int((self.end_time - self.start_time).total_seconds() // 60)
        return 0

    @property
    def moderator_name(self) -> Optional[str]:
        """Compatibility field; detailed moderator projection is query-service owned."""
        return None

    def __init__(self, **kwargs):
        if "name" in kwargs and "title" not in kwargs:
            kwargs["title"] = kwargs.pop("name")
        # moderator_name is a response-only compatibility field; persistence
        # uses moderator_id and the query service resolves the display name.
        kwargs.pop("moderator_name", None)
        super().__init__(**kwargs)


Session = AgendaSession
