import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.presentations.models.presentation_file import PresentationFile


class FileIntegrityLog(Base):
    """
    Forensic log tracking the integrity of a file version throughout its lifecycle.
    Entries are created during:
    1. Post-upload validation (Initial Hash)
    2. Venue sync (Transfer verification)
    3. Periodic integrity audits
    
    This table is IMMUTABLE (SQL trigger prevents UPDATE/DELETE).
    """
    __tablename__ = "integrity_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    file_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("presentations.files.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    
    # Stage where this integrity check happened: UPLOAD, SYNC_STAGING, SYNC_DEST, AUDIT
    stage: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    
    # Checksums
    sha256_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    md5_hash: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    etag: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    # Storage Context
    storage_provider: Mapped[str] = mapped_column(String(50), nullable=False) # R2, LOCAL_MINIO, DISK
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    
    # Results
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    verification_details: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True) # {error: "hash mismatch", ...}
    
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    # Relationships
    file: Mapped["PresentationFile"] = relationship(
        "PresentationFile", back_populates="integrity_logs"
    )

    def __repr__(self) -> str:
        return f"<FileIntegrityLog file={self.file_id} stage={self.stage} verified={self.is_verified}>"
