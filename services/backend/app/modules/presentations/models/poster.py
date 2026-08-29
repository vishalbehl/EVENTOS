import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.events.models.event import Event
    from app.modules.events.models.speaker import Speaker
    from app.modules.identity.models.user import User
    from app.modules.agenda.models.session import AgendaSession


class Poster(Base):
    """
    A digital ePoster submission.

    Workflow:
        1. Author submits PDF via speaker portal /poster/[token]
        2. Command Center reviews and approves/rejects in Command Center
        3. Approved poster is assigned to a display screen
        4. ePoster Display App (kiosk) shows all approved posters

    status lifecycle:
        pending     → Initial state after organizer creates record
        submitted   → PDF uploaded, pending review
        under_review → Reviewer has opened it
        approved    → Cleared for display
        rejected    → Returned to author with reason
        withdrawn   → Author retracted submission

    display_screen is the venue screen identifier where this
    poster will be shown (e.g. 'screen-1', 'lobby-left').
    """
    __tablename__ = "posters"
    __table_args__ = {"schema": "presentations"}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # The speaker/author who submitted the poster
    speaker_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("speakers.speakers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # The session this poster belongs to (optional, but used for scheduling)
    session_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agenda.sessions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    reviewed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ── Poster metadata ───────────────────────────────────
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    authors: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    abstract: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ── File references ───────────────────────────────────
    # Original PDF path in R2 /posters bucket
    storage_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    original_filename: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )
    file_size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Generated thumbnail of first page for grid display
    thumbnail_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ── Status & review ───────────────────────────────────
    # pending | submitted | under_review | approved | rejected | withdrawn
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="pending", index=True
    )
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── Display assignment ────────────────────────────────
    # Which physical screen this poster is assigned to (e.g. 'screen-1')
    display_screen: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, index=True
    )
    # Display order within the screen's rotation queue
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_featured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # FULL | LIMITED | NONE
    recording_rights: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # ── Version tracking ──────────────────────────────────
    version_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
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
    event: Mapped["Event"] = relationship("Event", back_populates="posters")
    speaker: Mapped[Optional["Speaker"]] = relationship("Speaker")
    session: Mapped[Optional["AgendaSession"]] = relationship("AgendaSession")
    reviewer: Mapped[Optional["User"]] = relationship("User")

    def __repr__(self) -> str:
        return (
            f"<Poster id={self.id} title={self.title[:40]} "
            f"status={self.status}>"
        )
