import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.presentations.models.presentation_file import PresentationFile


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
    image_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    video_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    animation_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    
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
    has_animations: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    has_transitions: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notes_present: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notes_slide_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    has_ole_objects: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    has_broken_ole: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    audio_objects_detected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    audio_format_valid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    internet_dependent_content: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    external_url_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    has_broken_internal_media: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    render_diff_detected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    has_custom_addins: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    has_macros: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    pdf_fallback_forced: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    linked_assets_detected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    linked_assets_resolved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    image_links_detected: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    absolute_path_links_detected: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    
    # ── Forensic & Integrity ─────────────────────────────
    sha256_hash: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    md5_hash: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    entropy_score: Mapped[Optional[float]] = mapped_column(Float) # Detects encryption/packing
    mime_type_detected: Mapped[Optional[str]] = mapped_column(String(100))
    antivirus_status: Mapped[str] = mapped_column(String(20), default="CLEAN") # CLEAN, INFECTED, SKIPPED
    validator_telemetry: Mapped[Optional[dict]] = mapped_column(JSONB) # {node_id, memory_peak, cpu_ms}
    
    # ── Media & Advanced Diagnostics ──────────────────────
    # Stores format-specific data (Duration, DPI, CMYK, FPS, Codecs, etc.)
    technical_metadata: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    
    # ── Bundle / Package Intelligence ───────────────────
    is_bundle: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # List of files inside a ZIP/Folder: [{"name": "talk.pptx", "size": "45MB", "type": "Presentation"}]
    bundle_contents: Mapped[Optional[List[dict]]] = mapped_column(JSONB, nullable=True)

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
