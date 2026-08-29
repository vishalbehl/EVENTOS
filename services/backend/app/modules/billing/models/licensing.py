import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.billing.models.event_activation import EventActivation
    from app.modules.billing.models.subscription import Addon, OrganizationSubscription, SubscriptionPlan
    from app.modules.events.models.event import Event
    from app.modules.platform.models.organization import Organization


class EntitlementGrant(Base):
    __tablename__ = "entitlement_grants"
    __table_args__ = (
        Index("ix_entitlement_grants_org_id", "organization_id"),
        Index("ix_entitlement_grants_subscription_id", "subscription_id"),
        Index("ix_entitlement_grants_status", "status"),
        {"schema": "commerce"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False
    )
    subscription_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.organization_subscriptions.id", ondelete="SET NULL"), nullable=True
    )
    grant_type: Mapped[str] = mapped_column(String(50), nullable=False, default="EVENT_UNIT")
    scope_type: Mapped[str] = mapped_column(String(30), nullable=False, default="EVENT")
    consumption_model: Mapped[str] = mapped_column(String(40), nullable=False, default="SINGLE_USE")
    unit_type: Mapped[str] = mapped_column(String(40), nullable=False, default="EVENT")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="ACTIVE")
    source_type: Mapped[str] = mapped_column(String(40), nullable=False, default="PLAN")
    source_ref: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    quantity_total: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    quantity_consumed: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True, default=0)
    quantity_reserved: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True, default=0)
    valid_from: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    valid_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_json: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status_changed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status_changed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True
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

    organization: Mapped["Organization"] = relationship("Organization")
    subscription: Mapped[Optional["OrganizationSubscription"]] = relationship(
        "OrganizationSubscription", back_populates="entitlement_grants"
    )
    consumptions: Mapped[List["GrantConsumption"]] = relationship(
        "GrantConsumption", back_populates="grant", cascade="all, delete-orphan"
    )


class GrantConsumption(Base):
    __tablename__ = "grant_consumptions"
    __table_args__ = (
        Index("ix_grant_consumptions_grant_id", "grant_id"),
        Index("ix_grant_consumptions_org_id", "organization_id"),
        Index("ix_grant_consumptions_event_id", "event_id"),
        Index("ix_grant_consumptions_status", "status"),
        {"schema": "commerce"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    grant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.entitlement_grants.id", ondelete="CASCADE"), nullable=False
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False
    )
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="SET NULL"), nullable=True
    )
    quantity: Mapped[int] = mapped_column(BigInteger, nullable=False, default=1)
    unit_type: Mapped[str] = mapped_column(String(40), nullable=False, default="EVENT")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="RESERVED")
    reserved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    consumed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    released_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    reservation_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    transferred_to_consumption_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.grant_consumptions.id", ondelete="SET NULL"), nullable=True
    )
    metadata_json: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    grant: Mapped["EntitlementGrant"] = relationship("EntitlementGrant", back_populates="consumptions")
    organization: Mapped["Organization"] = relationship("Organization")
    event: Mapped[Optional["Event"]] = relationship("Event")


class EventEntitlementSnapshotSet(Base):
    __tablename__ = "event_entitlement_snapshot_sets"
    __table_args__ = (
        Index("ix_event_entitlement_snapshot_sets_activation_id", "activation_id"),
        Index("ix_rls_billing_event_entitlement_snapshot_sets_organization", "organization_id"),
        UniqueConstraint("activation_id", "version", name="uq_event_entitlement_snapshot_sets_activation_version"),
        {"schema": "commerce"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    activation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.event_activations.id", ondelete="CASCADE"), nullable=False
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    resolution_reason: Mapped[str] = mapped_column(String(50), nullable=False, default="INITIAL_ACTIVATION")
    resolver_version: Mapped[str] = mapped_column(String(50), nullable=False, default="v4")
    policy_type: Mapped[str] = mapped_column(String(40), nullable=False, default="SNAPSHOT_LOCKED")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True
    )
    previous_snapshot_set_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("commerce.event_entitlement_snapshot_sets.id", ondelete="SET NULL"),
        nullable=True,
    )
    checksum: Mapped[str] = mapped_column(String(128), nullable=False)

    activation: Mapped["EventActivation"] = relationship(
        "EventActivation", foreign_keys=[activation_id], back_populates="snapshot_sets"
    )
    feature_items: Mapped[List["EventEntitlementSnapshotItem"]] = relationship(
        "EventEntitlementSnapshotItem", back_populates="snapshot_set", cascade="all, delete-orphan"
    )
    limit_items: Mapped[List["EventLimitSnapshotItem"]] = relationship(
        "EventLimitSnapshotItem", back_populates="snapshot_set", cascade="all, delete-orphan"
    )


class EventEntitlementSnapshotItem(Base):
    __tablename__ = "event_entitlement_snapshot_items"
    __table_args__ = (
        UniqueConstraint("snapshot_set_id", "feature_key", name="uq_event_entitlement_snapshot_items_feature"),
        {"schema": "commerce"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    snapshot_set_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.event_entitlement_snapshot_sets.id", ondelete="CASCADE"), nullable=False
    )
    feature_key: Mapped[str] = mapped_column(String(100), nullable=False)
    scope_type: Mapped[str] = mapped_column(String(30), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(nullable=False, default=True)
    source_type: Mapped[str] = mapped_column(String(40), nullable=False)
    source_ref: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    override_source: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    denial_reason_default: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    snapshot_set: Mapped["EventEntitlementSnapshotSet"] = relationship(
        "EventEntitlementSnapshotSet", back_populates="feature_items"
    )


class EventLimitSnapshotItem(Base):
    __tablename__ = "event_limit_snapshot_items"
    __table_args__ = (
        UniqueConstraint("snapshot_set_id", "limit_key", name="uq_event_limit_snapshot_items_limit"),
        {"schema": "commerce"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    snapshot_set_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.event_entitlement_snapshot_sets.id", ondelete="CASCADE"), nullable=False
    )
    limit_key: Mapped[str] = mapped_column(String(100), nullable=False)
    scope_type: Mapped[str] = mapped_column(String(30), nullable=False)
    limit_value: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    source_type: Mapped[str] = mapped_column(String(40), nullable=False)
    source_ref: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    override_source: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    snapshot_set: Mapped["EventEntitlementSnapshotSet"] = relationship(
        "EventEntitlementSnapshotSet", back_populates="limit_items"
    )


class BillingOperationRequest(Base):
    __tablename__ = "operation_requests"
    __table_args__ = (
        Index("ix_rls_billing_operation_requests_organization", "organization_id"),
        UniqueConstraint("organization_id", "operation_type", "idempotency_key", name="uq_billing_operation_request"),
        {"schema": "commerce"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False
    )
    operation_type: Mapped[str] = mapped_column(String(50), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDING")
    result_ref_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    result_ref_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class ActivationTransferPolicy(Base):
    __tablename__ = "activation_transfer_policies"
    __table_args__ = (
        Index("ix_activation_transfer_policies_policy_key", "policy_key"),
        {"schema": "commerce"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    policy_key: Mapped[str] = mapped_column(String(100), nullable=False)
    metric_key: Mapped[str] = mapped_column(String(100), nullable=False)
    operator: Mapped[str] = mapped_column(String(20), nullable=False, default=">=")
    threshold_value: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    action: Mapped[str] = mapped_column(String(30), nullable=False, default="ALLOW")
    plan_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.subscription_plans.id", ondelete="CASCADE"), nullable=True
    )
    grant_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    plan: Mapped[Optional["SubscriptionPlan"]] = relationship("SubscriptionPlan")
