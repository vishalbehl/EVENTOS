import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Text, DateTime, ForeignKey, Index, Numeric, Date, Boolean
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class PricingRule(Base):
    __tablename__ = "pricing_rules"
    __table_args__ = (
        Index("idx_pricing_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE") # ACTIVE, INACTIVE
    effective_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    effective_to: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    priority: Mapped[int] = mapped_column(default=0)


class PricingRuleCondition(Base):
    __tablename__ = "pricing_rule_conditions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rule_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("pricing.pricing_rules.id", ondelete="CASCADE"), nullable=False)
    field_name: Mapped[str] = mapped_column(String(100), nullable=False) # attendees, duration, region, event_type
    operator: Mapped[str] = mapped_column(String(20), nullable=False) # >, <, =, !=
    value: Mapped[str] = mapped_column(String(255), nullable=False)
    logical_operator: Mapped[str] = mapped_column(String(10), default="AND") # AND, OR


class PricingRuleAction(Base):
    __tablename__ = "pricing_rule_actions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rule_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("pricing.pricing_rules.id", ondelete="CASCADE"), nullable=False)
    action_type: Mapped[str] = mapped_column(String(50), nullable=False) # PERCENTAGE_DISCOUNT, PERCENTAGE_MARKUP, FLAT_DISCOUNT, FLAT_MARKUP
    value: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)


class ServicePricing(Base):
    __tablename__ = "service_pricing"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    service_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("commercial.services.id", ondelete="CASCADE"), nullable=False)
    region: Mapped[str] = mapped_column(String(50), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    base_price: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    minimum_price: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    maximum_price: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    cost_price: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    margin_percentage: Mapped[float] = mapped_column(Numeric(5, 2), default=0.0)
    tax_code: Mapped[str] = mapped_column(String(50), nullable=False)
    effective_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    effective_to: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class DiscountRule(Base):
    __tablename__ = "discount_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    discount_type: Mapped[str] = mapped_column(String(50), nullable=False) # PERCENTAGE, FLAT
    discount_value: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    max_discount: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    approval_required: Mapped[bool] = mapped_column(default=False)


class TaxRule(Base):
    __tablename__ = "tax_rules"
    __table_args__ = (
        Index("idx_tax_country", "country"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    country: Mapped[str] = mapped_column(String(100), nullable=False)
    tax_rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    tax_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True)


class CurrencyRate(Base):
    __tablename__ = "currency_rates"
    __table_args__ = (
        Index("idx_currency_pair", "from_currency", "to_currency"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    from_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    to_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    exchange_rate: Mapped[float] = mapped_column(Numeric(12, 6), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class PricingSimulation(Base):
    __tablename__ = "pricing_simulations"
    __table_args__ = (
        {"postgresql_partition_by": "RANGE (created_at)"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    input_data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    output_data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        primary_key=True, 
        default=lambda: datetime.now(timezone.utc), 
        index=True
    )


class CostFormula(Base):
    __tablename__ = "cost_formulas"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    expression: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class MarginPolicy(Base):
    __tablename__ = "margin_policies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    minimum_margin: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    recommended_margin: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    maximum_discount: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)


class RevenueForecast(Base):
    __tablename__ = "revenue_forecasts"
    __table_args__ = (
        {"postgresql_partition_by": "RANGE (created_at)"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    month: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    forecast_amount: Mapped[float] = mapped_column(Numeric(14, 2), default=0.0)
    actual_amount: Mapped[float] = mapped_column(Numeric(14, 2), default=0.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        primary_key=True, 
        default=lambda: datetime.now(timezone.utc), 
        index=True
    )
