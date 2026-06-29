import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SubscriptionAnalytics(Base):
    """
    Monthly aggregated subscription analytics snapshot.
    Computed by a scheduled job and stored here for fast dashboard reads.
    Period is in 'YYYY-MM' format (e.g. '2026-06').
    """
    __tablename__ = "subscription_analytics"
    __table_args__ = (
        UniqueConstraint("period", name="uq_subscription_analytics_period"),
        {"schema": "billing"},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    period: Mapped[str] = mapped_column(String(7), nullable=False)  # 'YYYY-MM'

    # Subscription counts
    active_subscriptions: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    trial_subscriptions: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    new_subscriptions: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    cancelled_subscriptions: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    grace_period_subscriptions: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    # Rate metrics (0-100 percentages)
    trial_conversion_rate: Mapped[Optional[float]] = mapped_column(
        Numeric(5, 2), default=0, server_default="0"
    )
    churn_rate: Mapped[Optional[float]] = mapped_column(
        Numeric(5, 2), default=0, server_default="0"
    )
    logo_retention_rate: Mapped[Optional[float]] = mapped_column(
        Numeric(5, 2), default=0, server_default="0"
    )

    # Revenue metrics (INR)
    arpu_inr: Mapped[Optional[float]] = mapped_column(
        Numeric(12, 2), default=0, server_default="0"
    )
    total_mrr_inr: Mapped[Optional[float]] = mapped_column(
        Numeric(14, 2), default=0, server_default="0"
    )
    new_mrr_inr: Mapped[Optional[float]] = mapped_column(
        Numeric(12, 2), default=0, server_default="0"
    )
    churned_mrr_inr: Mapped[Optional[float]] = mapped_column(
        Numeric(12, 2), default=0, server_default="0"
    )
    expansion_mrr_inr: Mapped[Optional[float]] = mapped_column(
        Numeric(12, 2), default=0, server_default="0"
    )

    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc)
    )

    def __repr__(self) -> str:
        return f"<SubscriptionAnalytics period={self.period} mrr={self.total_mrr_inr}>"
