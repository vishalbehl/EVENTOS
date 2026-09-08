import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class RoomRuntimeState(Base):
    """Durable operator state for a room's live runtime surface.

    Schedule and presentation ownership remain on their authoritative domain
    records. This table only stores ephemeral-but-operational state that must
    survive a room-app restart, such as the timer and emergency banner.
    """

    __tablename__ = "room_runtime_states"
    __table_args__ = (
        UniqueConstraint("event_id", "room_id", name="uq_venue_room_runtime_state"),
        {"schema": "venue"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False, index=True
    )
    room_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.rooms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    timer_status: Mapped[str] = mapped_column(String(20), nullable=False, default="hidden")
    timer_duration_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    timer_remaining_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    timer_started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    emergency_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    event = relationship("Event")
    room = relationship("Room")
