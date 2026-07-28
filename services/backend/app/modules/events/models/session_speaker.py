import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.events.models.session import Session
    from app.modules.events.models.speaker import Speaker
    from app.modules.presentations.models.presentation_file import PresentationFile
    from app.modules.venue.models.presentation_queue import PresentationQueue
    from app.modules.presentations.models.presentation_bundle import PresentationBundle


class SessionSpeaker(Base):
    """
    Junction table linking speakers to sessions with talk-specific metadata.
    A speaker can present in multiple sessions; a session can have
    multiple speakers. Each row represents one speaker's slot in one session.
    talk_order controls playback sequence within the session.
    """
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
        ForeignKey("events.speakers.id", ondelete="CASCADE"),
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
    speaker_type: Mapped[Optional[str]] = mapped_column(
        String(10), nullable=True
    )
    is_confirmed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    start_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    end_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    abstract_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    abstract_keywords: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list
    )
    abstract_status: Mapped[str] = mapped_column(
        String(24), nullable=False, default="DRAFT", index=True
    )
    abstract_version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1
    )
    abstract_submitted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    abstract_reviewed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    abstract_reviewed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="SET NULL"),
        nullable=True,
    )
    abstract_review_notes: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )
    abstract_idempotency_key: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True
    )
    presentation_bundle_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "presentations.bundles.id",
            ondelete="SET NULL",
            name="fk_session_speakers_presentation_bundle_id",
            use_alter=True,
        ),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # ── Relationships ─────────────────────────────────────
    session: Mapped["Session"] = relationship(
        "Session", back_populates="session_speakers"
    )
    speaker: Mapped["Speaker"] = relationship(
        "Speaker", back_populates="session_speakers"
    )
    presentation_files: Mapped[List["PresentationFile"]] = relationship(
        "PresentationFile",
        back_populates="session_speaker",
        cascade="all, delete-orphan",
        order_by="PresentationFile.version_number.desc()",
    )
    presentation_queue_entries: Mapped[List["PresentationQueue"]] = relationship(
        "PresentationQueue", back_populates="session_speaker"
    )
    presentation_bundle: Mapped[Optional["PresentationBundle"]] = relationship(
        "PresentationBundle",
        back_populates="session_speaker",
        foreign_keys=[presentation_bundle_id],
        post_update=True,
    )
    presentation_bundles: Mapped[List["PresentationBundle"]] = relationship(
        "PresentationBundle",
        back_populates="owner_session_speaker",
        foreign_keys="PresentationBundle.session_speaker_id",
    )

    @property
    def current_file(self) -> Optional["PresentationFile"]:
        if "presentation_files" in self.__dict__:
            for f in self.presentation_files:
                if f.is_current_version:
                    return f
        return None

    def __repr__(self) -> str:
        return (
            f"<SessionSpeaker session={self.session_id} "
            f"speaker={self.speaker_id} order={self.talk_order}>"
        )
