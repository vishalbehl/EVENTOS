import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.events.models.event import Event
    from app.modules.identity.models.user import User
    from app.modules.agenda.models.agenda_day import AgendaDay
    from app.modules.agenda.models.room import AgendaRoom
    from app.modules.agenda.models.track import AgendaTrack
    from app.modules.agenda.models.session import AgendaSession


class MasterAgenda(Base):
    """
    Master agenda header for an event in the agenda schema.
    An event can have multiple agendas (e.g. Main Conference, Workshops, VIP).
    """
    __tablename__ = "agendas"
    __table_args__ = {"schema": "agenda"}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(
        String(150), nullable=False, default="Main Conference Agenda"
    )
    code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="DRAFT"
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    timezone: Mapped[str] = mapped_column(
        String(100), nullable=False, default="UTC"
    )
    published_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    published_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="SET NULL"),
        nullable=True,
    )
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
    event: Mapped["Event"] = relationship("Event", back_populates="agendas")
    publisher: Mapped[Optional["User"]] = relationship("User", foreign_keys=[published_by])
    days: Mapped[List["AgendaDay"]] = relationship("AgendaDay", back_populates="agenda", cascade="all, delete-orphan", order_by="AgendaDay.sort_order, AgendaDay.date")
    rooms: Mapped[List["AgendaRoom"]] = relationship("AgendaRoom", back_populates="agenda")
    tracks: Mapped[List["AgendaTrack"]] = relationship("AgendaTrack", back_populates="agenda")
    sessions: Mapped[List["AgendaSession"]] = relationship("AgendaSession", back_populates="agenda")


Agenda = MasterAgenda
