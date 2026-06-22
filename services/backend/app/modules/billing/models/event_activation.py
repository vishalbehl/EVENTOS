import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional
from sqlalchemy import String, DateTime, ForeignKey, Index, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.platform.models.organization import Organization
    from app.modules.events.models.event import Event
    from app.modules.billing.models.subscription import OrganizationSubscription


class EventActivation(Base):
    __tablename__ = "event_activations"
    __table_args__ = (
        Index("ix_event_activations_org_id", "organization_id"),
        Index("ix_event_activations_event_id", "event_id"),
        Index("ix_event_activations_subscription_id", "subscription_id"),
        Index("ix_event_activations_status", "status"),
        Index(
            "uq_event_activations_active",
            "event_id",
            unique=True,
            postgresql_where=text("status = 'ACTIVE'"),
        ),
        {"schema": "billing"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("platform.organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
    )
    subscription_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("billing.organization_subscriptions.id", ondelete="RESTRICT"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(50), default="ACTIVE", nullable=False)
    activated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    organization: Mapped["Organization"] = relationship("Organization", backref="event_activations")
    event: Mapped["Event"] = relationship("Event", backref="activation")
    subscription: Mapped["OrganizationSubscription"] = relationship(
        "OrganizationSubscription", backref="event_activations"
    )
