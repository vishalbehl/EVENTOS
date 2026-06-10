import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional, Dict, Any, List
from sqlalchemy import String, Integer, BigInteger, Boolean, DateTime, ForeignKey, Text, Numeric
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.platform.models.organization import Organization
    from app.modules.identity.models.user import User

class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"
    __table_args__ = {"schema": "billing"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False) # e.g. 'REGISTRATION'
    description: Mapped[Optional[str]] = mapped_column(Text)
    
    max_events: Mapped[int] = mapped_column(Integer, default=3)
    max_users: Mapped[int] = mapped_column(Integer, default=10)
    max_registrations: Mapped[int] = mapped_column(Integer, default=1000)
    max_rooms: Mapped[int] = mapped_column(Integer, default=10)
    storage_quota_mb: Mapped[int] = mapped_column(BigInteger, default=10240)
    
    stripe_product_id: Mapped[Optional[str]] = mapped_column(String(255))
    
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

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

class Addon(Base):
    __tablename__ = "addons"
    __table_args__ = {"schema": "billing"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    monthly_price: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    yearly_price: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    stripe_product_id: Mapped[Optional[str]] = mapped_column(String(255))
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

class ActivityTimeline(Base):
    __tablename__ = "payment_events"
    __table_args__ = {"schema": "billing"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"))
    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"))
    action_type: Mapped[str] = mapped_column(String(100), nullable=False)
    metadata_data: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

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
