import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from sqlalchemy import String, Text, DateTime, ForeignKey, Boolean, Integer, BigInteger, CheckConstraint, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

class DashboardMetric(Base):
    __tablename__ = "dashboard_metrics"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), index=True)
    metric_name: Mapped[str] = mapped_column(String(100), nullable=False)
    metric_value: Mapped[float] = mapped_column(default=0.0)
    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class FeatureUsage(Base):
    __tablename__ = "feature_usage"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), index=True)
    feature_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("commerce.feature_catalog.id", ondelete="CASCADE"))
    use_count: Mapped[int] = mapped_column(Integer, default=0)
    last_used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class ApplicationUsage(Base):
    __tablename__ = "application_usage"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), index=True)
    app_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.apps.id", ondelete="CASCADE"))
    active_users: Mapped[int] = mapped_column(Integer, default=0)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class ApiUsageMetric(Base):
    __tablename__ = "api_usage"
    __table_args__ = (
        UniqueConstraint("organization_id", "period_start", "endpoint", name="uq_api_usage_period_endpoint"),
        CheckConstraint("call_count IS NOT NULL AND call_count >= 0", name="ck_api_usage_count"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), index=True)
    endpoint: Mapped[str] = mapped_column(String(255), nullable=False)
    call_count: Mapped[int] = mapped_column(BigInteger, default=0)
    period_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc).replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        ),
        nullable=False,
    )
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class ApiUsageWatermark(Base):
    __tablename__ = "api_usage_watermarks"
    __table_args__ = (
        CheckConstraint("persisted_count >= 0 AND persisted_count <= 9007199254740991", name="ck_api_usage_watermark_count"),
        {"schema": "analytics"},
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id"), primary_key=True)
    generation: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    endpoint_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    persisted_count: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)


class EventMetric(Base):
    __tablename__ = "event_metrics"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), index=True)
    metric_name: Mapped[str] = mapped_column(String(100), nullable=False)
    metric_value: Mapped[float] = mapped_column(default=0.0)
    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class AdoptionMetric(Base):
    __tablename__ = "adoption_metrics"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), index=True)
    metric_name: Mapped[str] = mapped_column(String(100), nullable=False)
    metric_value: Mapped[float] = mapped_column(default=0.0)
    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
