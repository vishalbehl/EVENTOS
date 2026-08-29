import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.database import SoftDeleteMixin

if TYPE_CHECKING:
    from app.modules.events.models.speaker import Speaker
    from app.modules.agenda.models.session_person import AgendaSessionPerson
    from app.modules.events.models.event import Event
    from app.modules.identity.models.user import User
    from app.modules.presentations.models.file_validation import FileValidation
    from app.modules.venue.models.venue_sync_job import VenueSyncJob
    from app.modules.venue.models.presentation_queue import PresentationQueue
    from app.modules.venue.models.venue_activity_log import VenueActivityLog
    from app.modules.presentations.models.presentation_bundle import BundleFile


class PresentationFile(Base, SoftDeleteMixin):
    """
    Every file version uploaded by a speaker.
    Only ONE record per speaker-session has is_current_version=True.
    When a speaker replaces their file, the old record stays for audit;
    version_number increments and the new record becomes current.

    Files are stored in Cloudflare R2 / MinIO — never on the app server.
    """
    __tablename__ = "files"
    __table_args__ = (
        CheckConstraint(
            "upload_status IN ('processing','valid','invalid','approved','rejected','locked','pending_validation')",
            name="ck_pf_upload_status"
        ),
        CheckConstraint(
            "upload_source IN ('web','kiosk','station','api','portal')",
            name="ck_pf_upload_source"
        ),
        {"schema": "presentations"},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    speaker_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("speakers.speakers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_speaker_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agenda.session_people.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── File Identity ─────────────────────────────────────
    # Original name as uploaded by speaker (display only)
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    # UUID-based name in storage (prevents path traversal / collisions)
    stored_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    # Full bucket path: presentations/event-id/speaker-id/uuid.pptx
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    # pptx | pdf | mp4 | key | ppt
    file_format: Mapped[str] = mapped_column(String(20), nullable=False, index=True)

    # ── Versioning ────────────────────────────────────────
    version_number: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1
    )
    # Only the latest upload has this set to True
    is_current_version: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, index=True
    )

    # ── Upload Metadata ───────────────────────────────────
    # web | kiosk | station | api
    upload_source: Mapped[str] = mapped_column(
        String(30), nullable=False, default="web"
    )

    # ── Status ────────────────────────────────────────────
    # processing | valid | invalid | approved | rejected | locked
    upload_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="processing", index=True
    )
    approved_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="SET NULL"),
        nullable=True,
    )
    approved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Locked files cannot be replaced even by the speaker
    is_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # FULL | LIMITED | NONE
    recording_rights: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # ── Venue Local Cache ─────────────────────────────────
    # Path on venue server's local MinIO after sync
    local_cache_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # pending | synced | failed
    local_sync_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="pending", index=True
    )
    local_synced_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    uploaded_at: Mapped[datetime] = mapped_column(
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

    # ── Relationships ─────────────────────────────────────
    speaker: Mapped["Speaker"] = relationship(
        "Speaker", back_populates="presentation_files"
    )
    session_speaker: Mapped[Optional["AgendaSessionPerson"]] = relationship(
        "AgendaSessionPerson"
    )
    event: Mapped["Event"] = relationship("Event", back_populates="presentation_files")
    approver: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[approved_by]
    )
    # One validation result per file version
    validation: Mapped[Optional["FileValidation"]] = relationship(
        "FileValidation",
        back_populates="file",
        uselist=False,
        cascade="all, delete-orphan",
    )
    venue_sync_jobs: Mapped[list["VenueSyncJob"]] = relationship(
        "VenueSyncJob", back_populates="file"
    )
    queue_entries: Mapped[list["PresentationQueue"]] = relationship(
        "PresentationQueue", back_populates="file"
    )
    venue_activity_logs: Mapped[list["VenueActivityLog"]] = relationship(
        "VenueActivityLog", back_populates="file"
    )
    bundle_entries: Mapped[list["BundleFile"]] = relationship(
        "BundleFile", back_populates="file", cascade="all, delete-orphan"
    )
    integrity_logs: Mapped[list["FileIntegrityLog"]] = relationship(
        "FileIntegrityLog", back_populates="file", cascade="all, delete-orphan"
    )

    @property
    def file_size_mb(self) -> float:
        return round(self.file_size_bytes / (1024 * 1024), 2)

    @property
    def speaker_name(self) -> Optional[str]:
        return self.speaker.name if self.speaker else None

    @property
    def session_name(self) -> Optional[str]:
        return self.session_speaker.session.name if self.session_speaker and self.session_speaker.session else None

    @property
    def session_start_time(self) -> Optional[datetime]:
        return self.session_speaker.session.start_time if self.session_speaker and self.session_speaker.session else None

    def __repr__(self) -> str:
        return (
            f"<PresentationFile id={self.id} "
            f"format={self.file_format} v{self.version_number} "
            f"status={self.upload_status}>"
        )
