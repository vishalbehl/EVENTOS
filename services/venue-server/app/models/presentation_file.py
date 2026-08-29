import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.speaker import Speaker
    from app.models.session_speaker import SessionSpeaker
    from app.models.event import Event

    from app.models.venue_sync_job import VenueSyncJob
    from app.models.presentation_queue import PresentationQueue
    from app.models.srr_activity_log import SRRActivityLog


class PresentationFile(Base):
    """
    Every file version uploaded by a speaker.
    Only ONE record per speaker-session has is_current_version=True.
    When a speaker replaces their file, the old record stays for audit;
    version_number increments and the new record becomes current.

    Files are stored in Cloudflare R2 / MinIO — never on the app server.
    """
    __table_args__ = {"schema": "presentations"}
    __tablename__ = "presentation_files"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    speaker_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("presentations.speakers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_speaker_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("presentations.session_speakers.id", ondelete="CASCADE"),
        nullable=False,
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
    content_sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
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
        nullable=True,
    )
    approved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Locked files cannot be replaced even by the speaker
    is_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

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
    session_speaker: Mapped["SessionSpeaker"] = relationship(
        "SessionSpeaker", back_populates="presentation_files"
    )
    event: Mapped["Event"] = relationship("Event")

    # One validation result per file version
    venue_sync_jobs: Mapped[list["VenueSyncJob"]] = relationship(
        "VenueSyncJob", back_populates="file"
    )
    queue_entries: Mapped[list["PresentationQueue"]] = relationship(
        "PresentationQueue", back_populates="file"
    )
    srr_activity_logs: Mapped[list["SRRActivityLog"]] = relationship(
        "SRRActivityLog", back_populates="file"
    )

    @property
    def file_size_mb(self) -> float:
        return round(self.file_size_bytes / (1024 * 1024), 2)

    def __repr__(self) -> str:
        return (
            f"<PresentationFile id={self.id} "
            f"format={self.file_format} v{self.version_number} "
            f"status={self.upload_status}>"
        )
