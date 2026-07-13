import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import DateTime, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.billing.models.licensing import (
        EntitlementGrant,
        EventEntitlementSnapshotSet,
        GrantConsumption,
    )
    from app.modules.billing.models.subscription import OrganizationSubscription
    from app.modules.events.models.event import Event
    from app.modules.platform.models.organization import Organization


class EventActivation(Base):
    __tablename__ = "event_activations"
    __table_args__ = (
        Index("ix_event_activations_org_id", "organization_id"),
        Index("ix_event_activations_event_id", "event_id"),
        Index("ix_event_activations_subscription_id", "subscription_id"),
        Index("ix_event_activations_grant_id", "grant_id"),
        Index("ix_event_activations_grant_consumption_id", "grant_consumption_id"),
        Index("ix_event_activations_status", "activation_status"),
        Index(
            "uq_event_activations_live_event",
            "event_id",
            unique=True,
            postgresql_where=text(
                "activation_status IN ('PENDING','ACTIVE','SUSPENDED','EXPIRED','TRANSFER_PENDING')"
            ),
        ),
        {"schema": "billing"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False
    )
    subscription_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("billing.organization_subscriptions.id", ondelete="RESTRICT"), nullable=False
    )
    grant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("billing.entitlement_grants.id", ondelete="RESTRICT"), nullable=True
    )
    grant_consumption_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("billing.grant_consumptions.id", ondelete="RESTRICT"), unique=True, nullable=True
    )
    current_snapshot_set_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("billing.event_entitlement_snapshot_sets.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column("activation_status", String(50), default="PENDING", nullable=False)
    activation_policy: Mapped[str] = mapped_column(String(40), default="SNAPSHOT_LOCKED", nullable=False)
    activated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    usage_locked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    transfer_locked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    deactivation_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    suspension_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    transferred_from_activation_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("billing.event_activations.id", ondelete="SET NULL"), nullable=True
    )
    transferred_to_event_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    organization: Mapped["Organization"] = relationship("Organization", backref="event_activations")
    event: Mapped["Event"] = relationship("Event", backref="activation", foreign_keys=[event_id])
    subscription: Mapped["OrganizationSubscription"] = relationship(
        "OrganizationSubscription", backref="event_activations"
    )
    grant: Mapped[Optional["EntitlementGrant"]] = relationship("EntitlementGrant")
    grant_consumption: Mapped[Optional["GrantConsumption"]] = relationship("GrantConsumption")
    current_snapshot_set: Mapped[Optional["EventEntitlementSnapshotSet"]] = relationship(
        "EventEntitlementSnapshotSet", foreign_keys=[current_snapshot_set_id]
    )
    snapshot_sets: Mapped[List["EventEntitlementSnapshotSet"]] = relationship(
        "EventEntitlementSnapshotSet",
        foreign_keys="EventEntitlementSnapshotSet.activation_id",
        back_populates="activation",
    )

    @property
    def activation_status(self) -> str:
        return self.status
