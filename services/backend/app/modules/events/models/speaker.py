import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.database import SoftDeleteMixin

if TYPE_CHECKING:
    from app.modules.events.models.event import Event
    from app.modules.agenda.models.track import AgendaTrack
    from app.modules.registration.models.participant import Participant
    from app.modules.identity.models.user import User
    from app.modules.agenda.models.session_person import AgendaSessionPerson
    from app.modules.presentations.models.presentation_file import PresentationFile
    from app.modules.venue.models.srr_checkin import SRRCheckin
    from app.modules.venue.models.venue_activity_log import VenueActivityLog
    from app.modules.communications.models.email_log import EmailLog
    from app.modules.presentations.models.poster import Poster
    from app.modules.events.models.speaker_profile import SpeakerProfile


class Speaker(Base, SoftDeleteMixin):
    """
    A conference speaker. Speakers do NOT need login accounts.
    Authentication is via upload_token embedded in their email link.

    A speaker belongs to exactly one event. If the same person
    speaks at two events, they get two speaker records.
    """
    __tablename__ = "speakers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Optimistic concurrency token for shared speaker workspace edits.
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Optional link to a system user account (if speaker is also an organizer)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Optional link to event track
    track_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agenda.tracks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Optional link to registered participant
    participant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("registration.participants.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    role: Mapped[str] = mapped_column(
        String(100), nullable=False, default="Speaker"
    )

    regno: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)

    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    designation: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    affiliation: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    bio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    photo_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    social_links: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    research_interests: Mapped[Optional[List[str]]] = mapped_column(JSONB, nullable=True)

    # ── Upload Token (the heart of speaker auth) ──────────
    # Unique token embedded in speaker's email link
    upload_token: Mapped[str] = mapped_column(
        String(128), unique=True, nullable=False, index=True
    )
    # Human-readable code for kiosk access (e.g. 8-char hex)
    speaker_code: Mapped[str] = mapped_column(
        String(20), unique=True, nullable=False, index=True
    )
    token_expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── Upload Status ─────────────────────────────────────
    # pending | uploaded | replaced | approved | rejected
    upload_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="pending", index=True
    )

    # ── Deadline Override ─────────────────────────────────
    # If True, speaker may upload after the event upload_deadline (late submission)
    allow_override: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    # ── On-site SRR ───────────────────────────────────────
    qr_code_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    checked_in_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # ── Relationships ─────────────────────────────────────
    event: Mapped["Event"] = relationship("Event", back_populates="speakers")
    user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[user_id])
    track: Mapped[Optional["AgendaTrack"]] = relationship("AgendaTrack", foreign_keys=[track_id])
    participant: Mapped[Optional["Participant"]] = relationship("Participant", foreign_keys=[participant_id])
    profile: Mapped[Optional["SpeakerProfile"]] = relationship(
        "SpeakerProfile",
        back_populates="speaker",
        uselist=False,
        cascade="all, delete-orphan",
    )
    session_speakers: Mapped[List["AgendaSessionPerson"]] = relationship(
        "AgendaSessionPerson",
        back_populates="speaker",
        cascade="all, delete-orphan",
    )
    presentation_files: Mapped[List["PresentationFile"]] = relationship(
        "PresentationFile",
        back_populates="speaker",
        cascade="all, delete-orphan",
        order_by="PresentationFile.version_number.desc()",
    )
    srr_checkins: Mapped[List["SRRCheckin"]] = relationship(
        "SRRCheckin", back_populates="speaker"
    )
    venue_activity_logs: Mapped[List["VenueActivityLog"]] = relationship(
        "VenueActivityLog", back_populates="speaker"
    )
    email_logs: Mapped[List["EmailLog"]] = relationship(
        "EmailLog", back_populates="speaker"
    )
    posters: Mapped[List["Poster"]] = relationship(
        "Poster",
        back_populates="speaker",
        cascade="all, delete-orphan",
    )

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    @property
    def current_file(self) -> Optional["PresentationFile"]:
        """Returns the current active file version, or None."""
        for f in self.presentation_files:
            if f.is_current_version:
                return f
        return None

    def __repr__(self) -> str:
        return (
            f"<Speaker id={self.id} name={self.full_name} "
            f"status={self.upload_status}>"
        )
