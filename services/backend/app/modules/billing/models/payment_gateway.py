import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PaymentGateway(Base):
    """
    Registry of configured payment gateways.
    Credentials are stored encrypted (JSONB) — never in plain text.

    provider values:
        'STRIPE' | 'RAZORPAY' | 'PAYU' | 'CCAVENUE' | 'PAYTM' | 'DUMMY'

    mode values:
        'LIVE' | 'TEST'

    health_status values:
        'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN'
    """
    __tablename__ = "payment_gateways"
    __table_args__ = {"schema": "commerce"}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # e.g. 'Stripe Live', 'Razorpay Live', 'PayU Live', 'Test Gateway'
    gateway_name: Mapped[str] = mapped_column(String(50), nullable=False)
    # 'STRIPE' | 'RAZORPAY' | 'PAYU' | 'CCAVENUE' | 'PAYTM' | 'DUMMY'
    provider: Mapped[str] = mapped_column(String(30), nullable=False)
    # 'LIVE' | 'TEST'
    mode: Mapped[str] = mapped_column(String(10), nullable=False, default="LIVE", server_default="LIVE")

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    # Rolling 30-day success rate (populated by health-check worker)
    success_rate_30d: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    transactions_mtd: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    volume_mtd_inr: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), default=0, server_default="0")

    last_health_check: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN'
    health_status: Mapped[str] = mapped_column(
        String(20), default="UNKNOWN", server_default="UNKNOWN"
    )

    # Encrypted at application layer before storage
    credentials_encrypted: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    webhook_secret_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    config_metadata: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

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
            f"<PaymentGateway name={self.gateway_name!r} "
            f"provider={self.provider} mode={self.mode} "
            f"active={self.is_active}>"
        )
