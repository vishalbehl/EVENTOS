"""Durable, freshness-aware registration metrics for event dashboards."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class EventRegistrationSummary(Base):
    """A rebuildable projection; registration tables remain authoritative."""

    __tablename__ = "event_registration_summary"
    __table_args__ = {"schema": "analytics"}

    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        primary_key=True,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("platform.organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    participant_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    approved_participant_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    paid_participant_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    registration_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    approved_registration_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    waitlisted_registration_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_payment_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_payment_total: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    registration_status_counts: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    freshness_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    rebuild_status: Mapped[str] = mapped_column(String(24), nullable=False, default="ready")
    last_error: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )
