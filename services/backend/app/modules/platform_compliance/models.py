import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Text, DateTime, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

class PlatformSecurityEvent(Base):
    __tablename__ = "security_events"
    __table_args__ = (
        Index("idx_security_events", "organization_id", "severity"),
        {
            "postgresql_partition_by": "RANGE (created_at)",
            "schema": "platform_compliance"
        }
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_data: Mapped[Optional[dict]] = mapped_column("metadata", JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="OPEN", index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        primary_key=True, 
        default=lambda: datetime.now(timezone.utc), 
        index=True
    )


class ComplianceReport(Base):
    __tablename__ = "compliance_reports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    report_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    generated_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    file_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)


class RetentionPolicy(Base):
    __tablename__ = "retention_policies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    module: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    retention_days: Mapped[int] = mapped_column(nullable=False)
    archive_enabled: Mapped[bool] = mapped_column(default=False)
    delete_enabled: Mapped[bool] = mapped_column(default=True)
