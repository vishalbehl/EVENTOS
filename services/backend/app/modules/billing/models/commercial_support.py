"""Supporting billing models that are not cloud commercial plans.

Cloud pricing, contracts, allocations, and entitlements live in
``cloud_commercial.py``. Venue applications now use the canonical plan
catalogue; this module contains only organization overrides and finance
projections.
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class OrganizationFeature(Base):
    __tablename__ = "organization_feature_overrides"
    __table_args__ = {"schema": "commerce"}

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), primary_key=True
    )
    feature_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.feature_catalog.id", ondelete="CASCADE"), primary_key=True
    )
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False)
    override_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True
    )
    override_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    effective_from: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc), nullable=False
    )


class ActivityTimeline(Base):
    __tablename__ = "payment_events"
    __table_args__ = {"schema": "commerce"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"))
    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"))
    action_type: Mapped[str] = mapped_column(String(100), nullable=False)
    metadata_data: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class RevenueMetric(Base):
    __tablename__ = "revenue_metrics"
    __table_args__ = {"schema": "commerce"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"))
    period: Mapped[str] = mapped_column(String(50), nullable=False)
    mrr: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    arr: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    add_on_revenue: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

