"""Durable event speaker analytics projection."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class EventSpeakerSummary(Base):
    """Rebuildable speaker metrics; event and presentation tables are authoritative."""

    __tablename__ = "event_speaker_summary"
    __table_args__ = {"schema": "analytics"}

    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), primary_key=True
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    speaker_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    checked_in_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    uploaded_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    approved_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    assigned_speaker_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    current_file_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    approved_file_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    freshness_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    rebuild_status: Mapped[str] = mapped_column(String(24), nullable=False, default="ready")
    last_error: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
