import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.event import Event
    from app.models.presentation_file import PresentationFile


class VenueSyncJob(Base):
    """
    Tracks every file sync operation between cloud storage
    (Cloudflare R2) and the venue server's local MinIO.

    Created by the cloud backend when a file is approved.
    Processed by the venue server's APScheduler sync loop.

    priority field:
        1 = Highest — files for today's sessions
        2 = High    — files for tomorrow's sessions
        5 = Normal  — all other approved files

    sync_type values:
        download  → Pull file from R2 to venue MinIO (most common)
        upload    → Push last-minute station upload to cloud R2
        delete    → Remove file from venue cache (rejected/replaced)

    status lifecycle:
        pending     → Job created, not yet started
        in_progress → Venue server is downloading/uploading
        completed   → File successfully synced
        failed      → Error occurred (see error_message)
        skipped     → File no longer needed (session cancelled etc.)
    """
    __table_args__ = {"schema": "venue"}
    __tablename__ = "venue_sync_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    file_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("presentations.presentation_files.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # download | upload | delete
    sync_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default="download"
    )
    # 1 = urgent (today's session), 5 = normal
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=5)

    # pending | in_progress | completed | failed | skipped
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="pending", index=True
    )
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    # ── Relationships ─────────────────────────────────────
    event: Mapped["Event"] = relationship(
        "Event", back_populates="venue_sync_jobs"
    )
    file: Mapped["PresentationFile"] = relationship(
        "PresentationFile", back_populates="venue_sync_jobs"
    )

    def __repr__(self) -> str:
        return (
            f"<VenueSyncJob type={self.sync_type} "
            f"priority={self.priority} status={self.status}>"
        )
