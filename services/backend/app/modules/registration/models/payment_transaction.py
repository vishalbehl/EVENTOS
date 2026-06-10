import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, String, Float, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.events.models.event import Event
    from app.modules.registration.models.participant_registration import ParticipantRegistration
    from app.modules.registration.models.promo_code import PromoCode


class PaymentTransaction(Base):
    """
    Tracks registration payment statuses and metadata from external payment gateways.
    """
    __tablename__ = "payment_transactions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    registration_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("registration.registrations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="INR")
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="pending"  # pending, completed, failed, refunded
    )
    payment_method: Mapped[str] = mapped_column(
        String(50), nullable=False, default="stripe"  # stripe, razorpay, simulated
    )
    gateway_order_id: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, index=True  # Stripe session ID / Razorpay order ID
    )
    gateway_payment_id: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, index=True  # Stripe intent ID / Razorpay payment ID
    )
    promo_code_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("registration.promo_codes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    discount_applied: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    event: Mapped["Event"] = relationship("Event")
    registration: Mapped[Optional["ParticipantRegistration"]] = relationship("ParticipantRegistration")
    promo_code: Mapped[Optional["PromoCode"]] = relationship("PromoCode")

    def __repr__(self) -> str:
        return f"<PaymentTransaction id={self.id} status={self.status} amount={self.amount}>"
