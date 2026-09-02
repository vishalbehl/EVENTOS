import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.session import Session
    from app.models.speaker import Speaker


class SessionSpeaker(Base):
    """
    Junction table linking speakers to sessions with talk-specific metadata.
    A speaker can present in multiple sessions; a session can have
    multiple speakers. Each row represents one speaker's slot in one session.
    talk_order controls playback sequence within the session.
    """
    __table_args__ = {"schema": "presentations"}
    __tablename__ = "session_speakers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    speaker_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("presentations.speakers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Title of this specific talk in this session
    presentation_title: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )
    # 0-based order within the session for playback
    talk_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Allocated speaking time in minutes
    talk_duration_minutes: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True
    )
    is_confirmed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # ── Relationships ─────────────────────────────────────
    session: Mapped["Session"] = relationship("Session")
    speaker: Mapped["Speaker"] = relationship("Speaker")
    @property
    def current_file(self) -> Optional["PresentationFile"]:
        return None

    def __repr__(self) -> str:
        return (
            f"<SessionSpeaker session={self.session_id} "
            f"speaker={self.speaker_id} order={self.talk_order}>"
        )
