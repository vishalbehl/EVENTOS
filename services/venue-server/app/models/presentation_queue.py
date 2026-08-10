import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.session import Session
    from app.models.session_speaker import SessionSpeaker
    from app.models.presentation_file import PresentationFile
    from app.models.room_device import RoomDevice
    from app.models.playback_event import PlaybackEvent


class PresentationQueue(Base):
    """
    The ordered list of presentations to be played in a session.
    Each row = one speaker's file queued for one session.

    Technician creates queue entries by clicking 'Send to Room'
    in the Technician Dashboard. The Room Presentation App
    polls/receives this queue via WebSocket and loads files
    in queue_order sequence.

    status lifecycle:
        queued     → Entry created, file not yet loaded on room PC
        active     → Currently being presented
        completed  → Presentation finished
        skipped    → Skipped by technician override
    """
    __table_args__ = {"schema": "presentations"}
    __tablename__ = "presentation_queue"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_speaker_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("presentations.session_speakers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    file_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("presentations.presentation_files.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    # The room PC that will play / is playing this file
    device_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("venue.room_devices.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Position in the session playback order (0-based)
    queue_order: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    # queued | active | completed | skipped
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="queued", index=True
    )

    # Timestamps tracking actual room PC lifecycle
    loaded_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ended_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

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
    session: Mapped["Session"] = relationship(
        "Session", back_populates="presentation_queue"
    )
    session_speaker: Mapped["SessionSpeaker"] = relationship(
        "SessionSpeaker", back_populates="presentation_queue_entries"
    )
    file: Mapped["PresentationFile"] = relationship(
        "PresentationFile", back_populates="queue_entries"
    )
    device: Mapped[Optional["RoomDevice"]] = relationship(
        "RoomDevice", back_populates="queue_entries"
    )
    playback_events: Mapped[List["PlaybackEvent"]] = relationship(
        "PlaybackEvent",
        back_populates="queue_entry",
        cascade="all, delete-orphan",
        order_by="PlaybackEvent.occurred_at",
    )

    @property
    def actual_duration_minutes(self) -> Optional[int]:
        """Real duration if presentation has ended."""
        if self.started_at and self.ended_at:
            delta = self.ended_at - self.started_at
            return int(delta.total_seconds() / 60)
        return None

    def __repr__(self) -> str:
        return (
            f"<PresentationQueue session={self.session_id} "
            f"order={self.queue_order} status={self.status}>"
        )
