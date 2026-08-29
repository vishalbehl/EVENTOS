import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PlatformIntegration(Base):
    """
    Registry of all third-party integrations connected to the platform.
    Health status is updated by periodic background health-check jobs.

    type values:
        'PAYMENT' | 'EMAIL' | 'SMS' | 'ANALYTICS' | 'STORAGE' | 'WEBHOOK'

    provider values:
        'STRIPE' | 'RAZORPAY' | 'RESEND' | 'TWILIO' | 'GOOGLE_ANALYTICS' |
        'AWS_S3' | 'CLOUDFLARE_R2' | 'WEBHOOK_RECEIVER'

    status values:
        'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN'
    """
    __tablename__ = "platform_integrations"
    __table_args__ = {"schema": "integrations"}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # 'PAYMENT' | 'EMAIL' | 'SMS' | 'ANALYTICS' | 'STORAGE' | 'WEBHOOK'
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    # 'STRIPE' | 'RAZORPAY' | 'RESEND' | 'TWILIO' | 'GOOGLE_ANALYTICS' | etc.
    provider: Mapped[str] = mapped_column(String(50), nullable=False)

    # 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN'
    status: Mapped[str] = mapped_column(
        String(20), default="UNKNOWN", server_default="UNKNOWN"
    )
    last_health_check: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    response_time_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # 0.0000–1.0000 (e.g. 0.0012 = 0.12% error rate)
    error_rate: Mapped[Optional[float]] = mapped_column(Numeric(6, 4), nullable=True)

    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true"
    )
    # Encrypted configuration — decrypted at the application layer only
    config_encrypted: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    integration_metadata: Mapped[Optional[dict]] = mapped_column(
        "metadata", JSONB, nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc)
    )

    def __repr__(self) -> str:
        return (
            f"<PlatformIntegration name={self.name!r} "
            f"type={self.type} provider={self.provider} "
            f"status={self.status}>"
        )
