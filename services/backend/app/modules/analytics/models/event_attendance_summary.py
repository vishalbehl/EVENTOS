"""Durable event attendance projection for bounded analytics reads."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class EventAttendanceSummary(Base):
    """Rebuildable attendance metrics; registration.attendance is authoritative."""

    __tablename__ = "event_attendance_summary"
    __table_args__ = {"schema": "analytics"}

    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), primary_key=True
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    registered_participant_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    checked_in_participant_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    checkin_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    session_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    freshness_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    rebuild_status: Mapped[str] = mapped_column(String(24), nullable=False, default="ready")
    last_error: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
