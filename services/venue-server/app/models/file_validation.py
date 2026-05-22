import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.presentation_file import PresentationFile


class FileValidation(Base):
    """
    Result of automated file validation run by the Celery worker.
    One record per PresentationFile (one-to-one).
    Created asynchronously after upload by the file_tasks worker.

    overall_result values:
        pass    → file is fully compatible
        warning → minor issues (large images, embedded fonts missing)
        fail    → critical issues (unsupported format, corrupted slides)
    """
    __tablename__ = "file_validations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    file_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("presentation_files.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,        # Enforces one-to-one with presentation_files
        index=True,
    )

    # Version of the validation engine that ran (useful for debugging)
    validation_engine_version: Mapped[str] = mapped_column(
        String(20), nullable=False
    )

    # ── PPTX-specific checks ──────────────────────────────
    slide_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    has_missing_fonts: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    # Array of font names that are not embedded, e.g. ['Calibri', 'Helvetica Neue']
    missing_fonts_list: Mapped[Optional[List[str]]] = mapped_column(
        ARRAY(String), nullable=True
    )
    has_unsupported_video: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    has_corrupted_slides: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    has_large_images: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    # ── Overall result ────────────────────────────────────
    # pass | warning | fail
    overall_result: Mapped[str] = mapped_column(
        String(20), nullable=False, index=True
    )

    # Full per-issue JSON report from the validation engine
    # Example: [{"type": "missing_font", "font": "Calibri", "slides": [3, 7]}]
    error_details: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # Generated first-slide thumbnail URL (uploaded to R2 /thumbnails bucket)
    thumbnail_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    validated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    # ── Relationships ─────────────────────────────────────
    file: Mapped["PresentationFile"] = relationship(
        "PresentationFile", back_populates="validation"
    )

    def __repr__(self) -> str:
        return (
            f"<FileValidation file={self.file_id} "
            f"result={self.overall_result}>"
        )
