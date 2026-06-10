import uuid
from datetime import datetime, timezone
from typing import Dict, Any
from sqlalchemy import String, Integer, BigInteger, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

class OrganizationUsage(Base):
    __tablename__ = "organization_usage"

    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), primary_key=True)
    
    active_events_count: Mapped[int] = mapped_column(Integer, default=0)
    active_users_count: Mapped[int] = mapped_column(Integer, default=0)
    total_registrations_count: Mapped[int] = mapped_column(Integer, default=0)
    storage_used_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    
    last_calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class UsageEvent(Base):
    __tablename__ = "usage_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"))
    event_type: Mapped[str] = mapped_column(String(100), nullable=False) # e.g. EMAIL_SENT, API_CALL
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class UsageSnapshot(Base):
    __tablename__ = "usage_snapshots"

    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), primary_key=True)
    period: Mapped[str] = mapped_column(String(50), primary_key=True) # e.g. 2026-06-01
    metrics: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
