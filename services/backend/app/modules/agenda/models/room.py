import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.events.models.event import Event
    from app.modules.agenda.models.agenda import Agenda
    from app.modules.agenda.models.room_type import AgendaRoomType
    from app.modules.agenda.models.session import AgendaSession


class AgendaRoom(Base):
    """
    Physical or virtual room entity in the agenda schema.
    """
    __tablename__ = "rooms"
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
    agenda_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agenda.agendas.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    room_type_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agenda.room_types.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    room_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="presentation"
    )
    capacity: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    screen_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    floor: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    building: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    room_coordinator: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    av_technician: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    location_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

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
    agenda: Mapped[Optional["MasterAgenda"]] = relationship("MasterAgenda", back_populates="rooms")
    event: Mapped["Event"] = relationship("Event", back_populates="rooms")
    room_type_ref: Mapped[Optional["AgendaRoomType"]] = relationship("AgendaRoomType", back_populates="rooms")
    sessions: Mapped[List["AgendaSession"]] = relationship("AgendaSession", back_populates="room")


Room = AgendaRoom
