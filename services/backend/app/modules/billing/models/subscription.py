import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional, Dict, Any, List
from sqlalchemy import String, Integer, BigInteger, Boolean, DateTime, ForeignKey, Text, Numeric, ARRAY
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates

from app.database import Base

if TYPE_CHECKING:
    from app.modules.platform.models.organization import Organization
    from app.modules.identity.models.user import User
    from app.modules.events.models.event import Event
    from app.modules.billing.models.event_activation import EventActivation

class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"
    __table_args__ = {"schema": "billing"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False) # e.g. 'REGISTRATION'
    tagline: Mapped[Optional[str]] = mapped_column(String(200))
    description: Mapped[Optional[str]] = mapped_column(Text)
    
    max_events: Mapped[int] = mapped_column(Integer, default=3)
    max_users: Mapped[int] = mapped_column(Integer, default=10)
    max_registrations: Mapped[Optional[int]] = mapped_column(Integer, default=1000)
    max_speakers: Mapped[Optional[int]] = mapped_column(Integer)
    max_sessions: Mapped[Optional[int]] = mapped_column(Integer)
    max_rooms: Mapped[Optional[int]] = mapped_column(Integer, default=10)
    max_ticket_categories: Mapped[Optional[int]] = mapped_column(Integer)
    max_badge_templates: Mapped[Optional[int]] = mapped_column(Integer)
    max_certificate_templates: Mapped[Optional[int]] = mapped_column(Integer)
    storage_quota_mb: Mapped[int] = mapped_column(BigInteger, default=10240)
    
    currency: Mapped[str] = mapped_column(String(3), default='INR')
    price_per_event_min: Mapped[Optional[float]] = mapped_column(Numeric(12, 2))
    price_per_event_max: Mapped[Optional[float]] = mapped_column(Numeric(12, 2))
    billing_model: Mapped[str] = mapped_column(String(20), default='PER_EVENT')
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    is_popular: Mapped[bool] = mapped_column(Boolean, default=False)
    color_hex: Mapped[Optional[str]] = mapped_column(String(7))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    @property
    def price_display(self) -> str:
        if self.price_per_event_max:
            return f"₹{int(self.price_per_event_min):,} - ₹{int(self.price_per_event_max):,}"
        elif self.price_per_event_min:
            return f"Starting at ₹{int(self.price_per_event_min):,}"
        return "Custom Pricing"

    def check_limit(self, dimension: str, current_value: int) -> bool:
        limit = getattr(self, f"max_{dimension}", None)
        if limit is None:
            return True # Unlimited
        return current_value < limit

class OrganizationSubscription(Base):
    __tablename__ = "organization_subscriptions"
    __table_args__ = {"schema": "billing"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), unique=True)
    plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("billing.subscription_plans.id"))
    
    status: Mapped[str] = mapped_column(String(50), default="TRIAL") # ACTIVE, TRIAL, SUSPENDED, EXPIRED, PENDING_PAYMENT, GRACE_PERIOD, CANCELLED, ARCHIVED
    
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(String(255))
    stripe_subscription_id: Mapped[Optional[str]] = mapped_column(String(255))
    trial_ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    current_period_end: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, default=False)
    
    organization: Mapped["Organization"] = relationship("Organization", back_populates="subscription")
    plan: Mapped["SubscriptionPlan"] = relationship("SubscriptionPlan")
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class PlanFeature(Base):
    __tablename__ = "plan_features"
    __table_args__ = {"schema": "billing"}

    plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("billing.subscription_plans.id", ondelete="CASCADE"), primary_key=True)
    feature_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.feature_catalog.id", ondelete="CASCADE"), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)

class OrganizationFeature(Base):
    __tablename__ = "organization_feature_overrides"
    __table_args__ = {"schema": "billing"}

    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), primary_key=True)
    feature_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.feature_catalog.id", ondelete="CASCADE"), primary_key=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False)
    override_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    override_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=True)

class Addon(Base):
    __tablename__ = "addons"
    __table_args__ = {"schema": "billing"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    
    price_inr: Mapped[Optional[float]] = mapped_column(Numeric(12, 2))
    min_price_inr: Mapped[Optional[float]] = mapped_column(Numeric(12, 2))
    max_price_inr: Mapped[Optional[float]] = mapped_column(Numeric(12, 2))
    billing_unit: Mapped[Optional[str]] = mapped_column(String(20))
    available_for_plans: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String))
    is_optional_for_plan: Mapped[Optional[str]] = mapped_column(String(50))
    included_in_plan: Mapped[Optional[str]] = mapped_column(String(50))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    features_spec: Mapped[Optional[List[Dict[str, Any]]]] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class AddonFeature(Base):
    __tablename__ = "addon_features"
    __table_args__ = {"schema": "billing"}

    addon_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("billing.addons.id", ondelete="CASCADE"), primary_key=True)
    feature_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.feature_catalog.id", ondelete="CASCADE"), primary_key=True)

class OrganizationAddon(Base):
    __tablename__ = "organization_addons"
    __table_args__ = {"schema": "billing"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"))
    addon_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("billing.addons.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(50), default="ACTIVE")
    purchased_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=True
    )
    activation_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("billing.event_activations.id", ondelete="CASCADE"), nullable=True
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
    __table_args__ = {"schema": "billing"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"))
    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"))
    action_type: Mapped[str] = mapped_column(String(100), nullable=False)
    metadata_data: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class SubscriptionTransaction(Base):
    __tablename__ = "subscription_transactions"
    __table_args__ = {"schema": "billing"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False)
    plan_name: Mapped[str] = mapped_column(String(100), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    promo_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    gst_number: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)
    billing_name: Mapped[str] = mapped_column(String(255), nullable=False)
    billing_email: Mapped[str] = mapped_column(String(255), nullable=False)
    billing_phone: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="SUCCESS")
    is_custom_plan: Mapped[bool] = mapped_column(Boolean, default=False)
    custom_limits: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    addon_keys: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class RevenueMetric(Base):
    __tablename__ = "revenue_metrics"
    __table_args__ = {"schema": "billing"}
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"))
    period: Mapped[str] = mapped_column(String(50), nullable=False) # e.g. 2026-06
    mrr: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    arr: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    add_on_revenue: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

from app.modules.support.models.ticket import SupportTicket, TicketComment
