import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional, Dict, Any, List
from sqlalchemy import String, Integer, BigInteger, Boolean, DateTime, ForeignKey, Text, Numeric, ARRAY, Index, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates

from app.database import Base

if TYPE_CHECKING:
    from app.modules.platform.models.organization import Organization
    from app.modules.identity.models.user import User
    from app.modules.events.models.event import Event
    from app.modules.billing.models.event_activation import EventActivation
    from app.modules.billing.models.licensing import EntitlementGrant

class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"
    __table_args__ = {"schema": "commerce"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False) # e.g. 'REGISTRATION'
    tagline: Mapped[Optional[str]] = mapped_column(String(200))
    description: Mapped[Optional[str]] = mapped_column(Text)
    
    max_events: Mapped[int] = mapped_column(Integer, default=3)
    max_users: Mapped[int] = mapped_column(Integer, default=10)
    max_event_team_members: Mapped[Optional[int]] = mapped_column(Integer)
    max_registrations: Mapped[Optional[int]] = mapped_column(Integer, default=1000)
    max_speakers: Mapped[Optional[int]] = mapped_column(Integer)
    max_sessions: Mapped[Optional[int]] = mapped_column(Integer)
    max_rooms: Mapped[Optional[int]] = mapped_column(Integer, default=10)
    max_ticket_categories: Mapped[Optional[int]] = mapped_column(Integer)
    max_badge_templates: Mapped[Optional[int]] = mapped_column(Integer)
    max_certificate_templates: Mapped[Optional[int]] = mapped_column(Integer)
    max_emails_per_event: Mapped[Optional[int]] = mapped_column(Integer)
    storage_quota_mb: Mapped[int] = mapped_column(BigInteger, default=10240)
    
    currency: Mapped[str] = mapped_column(String(3), default='INR')
    price_per_event: Mapped[Optional[float]] = mapped_column(Numeric(12, 2))
    billing_model: Mapped[str] = mapped_column(String(20), default='PER_EVENT')
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    is_popular: Mapped[bool] = mapped_column(Boolean, default=False)
    color_hex: Mapped[Optional[str]] = mapped_column(String(7))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    lifecycle_status: Mapped[str] = mapped_column(String(20), default="PUBLISHED", nullable=False)
    effective_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    retired_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    @property
    def price_display(self) -> str:
        if self.price_per_event is not None:
            return f"₹{int(self.price_per_event):,} / event"
        return "Custom Pricing"

    def check_limit(self, dimension: str, current_value: int) -> bool:
        limit = getattr(self, f"max_{dimension}", None)
        if limit is None:
            return True # Unlimited
        return current_value < limit

class OrganizationSubscription(Base):
    __tablename__ = "organization_subscriptions"
    __table_args__ = (
        Index("ix_rls_billing_organization_subscriptions_organization", "organization_id"),
        {"schema": "commerce"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"))
    plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("commerce.subscription_plans.id"))
    
    status: Mapped[str] = mapped_column(String(50), default="TRIAL") # ACTIVE, TRIAL, SUSPENDED, EXPIRED, PENDING_PAYMENT, GRACE_PERIOD, CANCELLED, ARCHIVED
    
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(String(255))
    stripe_subscription_id: Mapped[Optional[str]] = mapped_column(String(255))
    trial_ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    current_period_end: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status_changed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status_changed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True
    )
    
    organization: Mapped["Organization"] = relationship("Organization", back_populates="subscription")
    plan: Mapped["SubscriptionPlan"] = relationship("SubscriptionPlan")
    entitlement_grants: Mapped[List["EntitlementGrant"]] = relationship(
        "EntitlementGrant", back_populates="subscription"
    )
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class PlanFeature(Base):
    __tablename__ = "plan_features"
    __table_args__ = {"schema": "commerce"}

    plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("commerce.subscription_plans.id", ondelete="CASCADE"), primary_key=True)
    feature_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("commerce.feature_catalog.id", ondelete="CASCADE"), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    value_type: Mapped[str] = mapped_column(String(20), default="BOOLEAN", nullable=False)
    entitlement_value: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    scope_type: Mapped[str] = mapped_column(String(30), default="EVENT", nullable=False)
    enforcement_mode: Mapped[str] = mapped_column(String(30), default="HARD", nullable=False)
    hard_ceiling: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

class OrganizationFeature(Base):
    __tablename__ = "organization_feature_overrides"
    __table_args__ = {"schema": "commerce"}

    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), primary_key=True)
    feature_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("commerce.feature_catalog.id", ondelete="CASCADE"), primary_key=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False)
    override_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    override_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=True)
    effective_from: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

class Addon(Base):
    __tablename__ = "addons"
    __table_args__ = {"schema": "commerce"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    addon_type: Mapped[str] = mapped_column(String(20), default="PLAN", nullable=False)
    short_description: Mapped[Optional[str]] = mapped_column(String(255))
    image_url: Mapped[Optional[str]] = mapped_column(Text)
    
    price_inr: Mapped[Optional[float]] = mapped_column(Numeric(12, 2))
    min_price_inr: Mapped[Optional[float]] = mapped_column(Numeric(12, 2))
    max_price_inr: Mapped[Optional[float]] = mapped_column(Numeric(12, 2))
    billing_unit: Mapped[Optional[str]] = mapped_column(String(20))
    price_unit: Mapped[Optional[str]] = mapped_column(String(50))
    scope_type: Mapped[str] = mapped_column(String(30), default="ORG_SCOPED", nullable=False)
    consumption_model: Mapped[str] = mapped_column(String(40), default="NON_CONSUMABLE", nullable=False)
    unit_type: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    available_for_plans: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String))
    is_optional_for_plan: Mapped[Optional[str]] = mapped_column(String(50))
    included_in_plan: Mapped[Optional[str]] = mapped_column(String(50))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    lifecycle_status: Mapped[str] = mapped_column(String(20), default="DRAFT", nullable=False)
    effective_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    retired_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    final_price: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), default=0.0)
    
    features_spec: Mapped[Optional[List[Dict[str, Any]]]] = mapped_column(JSONB, default=list)
    hardware_spec: Mapped[Optional[List[Dict[str, Any]]]] = mapped_column(JSONB, default=list)
    staff_spec: Mapped[Optional[List[Dict[str, Any]]]] = mapped_column(JSONB, default=list)
    inclusions: Mapped[Optional[List[str]]] = mapped_column(JSONB, default=list)
    exclusions: Mapped[Optional[List[str]]] = mapped_column(JSONB, default=list)
    consumables_cost: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), default=0)
    template_types: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String), default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class AddonFeature(Base):
    __tablename__ = "addon_features"
    __table_args__ = {"schema": "commerce"}

    addon_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("commerce.addons.id", ondelete="CASCADE"), primary_key=True)
    feature_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("commerce.feature_catalog.id", ondelete="CASCADE"), primary_key=True)
    value_type: Mapped[str] = mapped_column(String(20), default="BOOLEAN", nullable=False)
    entitlement_value: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    operation: Mapped[str] = mapped_column(String(20), default="UNLOCK", nullable=False)
    scope_type: Mapped[str] = mapped_column(String(30), default="EVENT", nullable=False)
    validity_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    stackable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    max_quantity: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)


class CommercialTemplateVersion(Base):
    """Append-only snapshots for plan and add-on template revisions."""

    __tablename__ = "commercial_template_versions"
    __table_args__ = (
        UniqueConstraint("resource_type", "resource_id", "version", name="uq_commercial_template_resource_version"),
        UniqueConstraint("resource_type", "idempotency_key", name="uq_commercial_template_idempotency"),
        Index("ix_commercial_template_versions_resource", "resource_type", "resource_id", "created_at"),
        {"schema": "commerce"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    resource_type: Mapped[str] = mapped_column(String(20), nullable=False)
    resource_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    lifecycle_status: Mapped[str] = mapped_column(String(20), nullable=False)
    change_type: Mapped[str] = mapped_column(String(40), nullable=False)
    snapshot_json: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(200), nullable=False)
    actor_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

class OrganizationAddon(Base):
    __tablename__ = "organization_addons"
    __table_args__ = (
        Index("ix_rls_billing_organization_addons_organization", "organization_id"),
        {"schema": "commerce"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"))
    addon_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("commerce.addons.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(50), default="ACTIVE")
    purchased_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    unit_price_snapshot: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    subscription_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("commerce.organization_subscriptions.id", ondelete="SET NULL"), nullable=True)
    assignment_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    assigned_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=True
    )
    activation_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.event_activations.id", ondelete="CASCADE"), nullable=True
    )

    # Relationships
    event: Mapped[Optional["Event"]] = relationship("Event", backref="organization_addons")
    activation: Mapped[Optional["EventActivation"]] = relationship("EventActivation", backref="organization_addons")

    @validates("event_id", "activation_id")
    def validate_scope(self, key, value):
        if value is not None:
            other_key = "activation_id" if key == "event_id" else "event_id"
            other_val = getattr(self, other_key, None)
            if other_val is not None:
                raise ValueError("An addon cannot be scoped to both an event and an activation simultaneously.")
        return value

class ActivityTimeline(Base):
    __tablename__ = "payment_events"
    __table_args__ = {"schema": "commerce"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"))
    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"))
    action_type: Mapped[str] = mapped_column(String(100), nullable=False)
    metadata_data: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class SubscriptionTransaction(Base):
    __tablename__ = "subscription_transactions"
    __table_args__ = (
        Index(
            "uq_subscription_transactions_provider_reference",
            "provider",
            "provider_transaction_id",
            unique=True,
            postgresql_where=text("provider_transaction_id IS NOT NULL"),
        ),
        {"schema": "commerce"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False)
    invoice_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.invoices.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    subscription_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.organization_subscriptions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    plan_name: Mapped[str] = mapped_column(String(100), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    promo_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    gst_number: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)
    billing_name: Mapped[str] = mapped_column(String(255), nullable=False)
    billing_email: Mapped[str] = mapped_column(String(255), nullable=False)
    billing_phone: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="SUCCESS")
    currency: Mapped[str] = mapped_column(String(10), default="INR", nullable=False)
    provider: Mapped[str] = mapped_column(String(40), default="OFFLINE", nullable=False)
    provider_transaction_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    provider_event_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    parent_transaction_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.subscription_transactions.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    refunded_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0, server_default="0")
    reconciliation_status: Mapped[str] = mapped_column(String(30), default="PENDING", nullable=False, index=True)
    reconciled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    reconciled_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True
    )
    reconciliation_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_custom_plan: Mapped[bool] = mapped_column(Boolean, default=False)
    custom_limits: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    addon_keys: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

class RevenueMetric(Base):
    __tablename__ = "revenue_metrics"
    __table_args__ = {"schema": "commerce"}
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"))
    period: Mapped[str] = mapped_column(String(50), nullable=False) # e.g. 2026-06
    mrr: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    arr: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    add_on_revenue: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

from app.modules.support.models.ticket import SupportTicket, TicketComment
