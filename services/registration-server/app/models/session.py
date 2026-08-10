import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.event import Event
    from app.models.room import Room



class Session(Base):
    """
    A scheduled time block in a room during which speakers present.
    One session can have multiple speakers (via session_speakers).
    """
    __table_args__ = {"schema": "events"}
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    room_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.rooms.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Assigned moderator (must be a system user with moderator role)
    moderator_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
    )

    # Unique code from Excel import, e.g. S-101
    session_code: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # regular | keynote | workshop | panel | poster
    session_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="regular"
    )

    start_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    end_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    # Free-text moderator name for cases where moderator is not a system user
    moderator_name: Mapped[Optional[str]] = mapped_column(
        String(150), nullable=True
    )
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # scheduled | in_progress | completed | cancelled
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="scheduled", index=True
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

    # ── Relationships ─────────────────────────────────────
    event: Mapped["Event"] = relationship("Event", back_populates="sessions")
    room: Mapped[Optional["Room"]] = relationship("Room", back_populates="sessions")

    @property
    def duration_minutes(self) -> int:
        delta = self.end_time - self.start_time
        return int(delta.total_seconds() / 60)

    def __repr__(self) -> str:
        return f"<Session id={self.id} code={self.session_code} name={self.name[:40]}>"
