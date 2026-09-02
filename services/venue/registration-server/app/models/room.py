import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.event import Event
    from app.models.session import Session
    from app.models.room_device import RoomDevice


class Room(Base):
    """
    A physical conference hall or workshop room.
    Belongs to an event; sessions are scheduled inside rooms.
    """
    __table_args__ = {"schema": "events"}
    __tablename__ = "rooms"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    capacity: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    screen_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # presentation | workshop | poster | plenary
    room_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="presentation"
    )
    av_technician: Mapped[Optional[str]] = mapped_column(
        String(150), nullable=True
    )
    location_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # ── Relationships ─────────────────────────────────────
    event: Mapped["Event"] = relationship("Event", back_populates="rooms")
    sessions: Mapped[List["Session"]] = relationship(
        "Session", back_populates="room"
    )
    devices: Mapped[List["RoomDevice"]] = relationship(
        "RoomDevice", back_populates="room", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Room id={self.id} name={self.name}>"
