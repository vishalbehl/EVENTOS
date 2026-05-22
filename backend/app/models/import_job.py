import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.event import Event
    from app.models.user import User


class ImportJob(Base):
    """
    Tracks every Excel schedule import attempt.
    When an organizer uploads a .xlsx file, a job record is created
    and processed asynchronously by the Celery import_tasks worker.

    error_summary is a JSONB array of per-row errors:
    [{"row": 5, "error": "Email missing", "data": {...}}, ...]

    status lifecycle:
        uploaded → validating → validated → importing → completed | failed
    """
    __tablename__ = "import_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    uploaded_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    # Path to the stored Excel file in S3/R2
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)

    # schedule | eposter
    job_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default="schedule", index=True
    )

    # uploaded | validating | validated | importing | completed | failed
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="uploaded", index=True
    )

    # Counters updated as rows are processed
    rows_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rows_imported: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rows_failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rows_updated: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sessions_created: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    speakers_created: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rooms_created: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # JSONB array of validation errors and warnings per row
    error_summary: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

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
    event: Mapped["Event"] = relationship("Event", back_populates="import_jobs")
    uploader: Mapped[Optional["User"]] = relationship("User")

    def __repr__(self) -> str:
        return (
            f"<ImportJob id={self.id} filename={self.filename} "
            f"status={self.status}>"
        )
