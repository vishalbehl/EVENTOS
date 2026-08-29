import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import String, Text, DateTime, ForeignKey, Index, Numeric, Date, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class ServiceCategory(Base):
    __tablename__ = "service_categories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class Service(Base):
    __tablename__ = "services"
    __table_args__ = (
        Index("idx_service_category", "category_id"),
        Index("idx_service_code", "service_code"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("business.service_categories.id", ondelete="RESTRICT"), nullable=False)
    service_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    service_name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    unit_type: Mapped[str] = mapped_column(String(50), default="flat") # flat, hourly, daily, item
    is_active: Mapped[bool] = mapped_column(default=True, index=True)
    is_internal: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class ServiceFeature(Base):
    __tablename__ = "service_features"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    service_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("business.services.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class ServicePackage(Base):
    __tablename__ = "service_packages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    package_name: Mapped[str] = mapped_column(String(150), nullable=False)
    package_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    price: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class PackageService(Base):
    __tablename__ = "package_services"

    package_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("business.service_packages.id", ondelete="CASCADE"), primary_key=True)
    service_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("business.services.id", ondelete="CASCADE"), primary_key=True)
    quantity: Mapped[int] = mapped_column(default=1)


class StaffRole(Base):
    __tablename__ = "staff_roles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    role_code: Mapped[str] = mapped_column(String(50), nullable=False, default="OPS-ROLE")
    role_name: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)
    team_category: Mapped[str] = mapped_column(String(100), nullable=False, default="General Operations")
    grade: Mapped[str] = mapped_column(String(50), nullable=False, default="L1")
    cost_per_day: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0.0)
    selling_per_day: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0.0)
    available_count: Mapped[int] = mapped_column(default=10)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="ACTIVE")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class CommercialQuote(Base):
    __tablename__ = "quotes"
    __table_args__ = (
        UniqueConstraint("organization_id", "idempotency_key", name="uq_quotes_org_idempotency"),
        Index("ix_quotes_org_event_created", "organization_id", "event_id", "created_at"),
        Index("ix_quotes_org_status", "organization_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="RESTRICT"), nullable=False
    )
    service_request_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
    )
    quote_number: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="DRAFT")
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    validity_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    valid_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    discount_type: Mapped[str] = mapped_column(String(20), nullable=False, default="NONE")
    discount_value: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    tax_rate: Mapped[float] = mapped_column(Numeric(7, 4), nullable=False, default=0)
    subtotal: Mapped[float] = mapped_column(Numeric(16, 2), nullable=False, default=0)
    discount_amount: Mapped[float] = mapped_column(Numeric(16, 2), nullable=False, default=0)
    taxable_amount: Mapped[float] = mapped_column(Numeric(16, 2), nullable=False, default=0)
    tax_amount: Mapped[float] = mapped_column(Numeric(16, 2), nullable=False, default=0)
    total_amount: Mapped[float] = mapped_column(Numeric(16, 2), nullable=False, default=0)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    internal_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    request_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )
    line_items: Mapped[list["CommercialQuoteLineItem"]] = relationship(
        back_populates="quote", cascade="all, delete-orphan", order_by="CommercialQuoteLineItem.sort_order"
    )
    revisions: Mapped[list["CommercialQuoteRevision"]] = relationship(
        back_populates="quote", cascade="all, delete-orphan", order_by="CommercialQuoteRevision.version"
    )


class CommercialQuoteLineItem(Base):
    __tablename__ = "quote_line_items"
    __table_args__ = (Index("ix_quote_line_items_quote", "quote_id", "sort_order"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    quote_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("business.quotes.id", ondelete="CASCADE"), nullable=False
    )
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    quantity: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    unit_rate: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    line_subtotal: Mapped[float] = mapped_column(Numeric(16, 2), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    quote: Mapped["CommercialQuote"] = relationship(back_populates="line_items")


class CommercialQuoteRevision(Base):
    __tablename__ = "quote_revisions"
    __table_args__ = (
        UniqueConstraint("quote_id", "version", name="uq_quote_revision_version"),
        Index("ix_quote_revisions_quote_created", "quote_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    quote_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("business.quotes.id", ondelete="CASCADE"), nullable=False
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    quote: Mapped["CommercialQuote"] = relationship(back_populates="revisions")


class QuoteApprovalWorkflow(Base):
    __tablename__ = "quote_approval_workflows"
    __table_args__ = (
        UniqueConstraint("quote_id", name="uq_quote_approval_workflow_quote"),
        UniqueConstraint("organization_id", "submission_idempotency_key", name="uq_quote_approval_submission_idempotency"),
        Index("ix_quote_approval_workflows_org_status", "organization_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False
    )
    quote_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("business.quotes.id", ondelete="CASCADE"), nullable=False
    )
    quote_version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="PENDING")
    workflow_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    submission_reason: Mapped[str] = mapped_column(String(500), nullable=False)
    submission_idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    submission_request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    submitted_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False
    )
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    steps: Mapped[list["QuoteApprovalStep"]] = relationship(
        back_populates="workflow", cascade="all, delete-orphan", order_by="QuoteApprovalStep.step_order"
    )


class QuoteApprovalStep(Base):
    __tablename__ = "quote_approval_steps"
    __table_args__ = (
        UniqueConstraint("workflow_id", "step_order", name="uq_quote_approval_step_order"),
        Index("ix_quote_approval_steps_org_status", "organization_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("business.quote_approval_workflows.id", ondelete="CASCADE"), nullable=False
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False
    )
    step_order: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    assigned_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True
    )
    required_permission: Mapped[str] = mapped_column(String(100), nullable=False, default="quotes.approve")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="PENDING")
    decided_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True
    )
    decision_reason: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    decision_idempotency_key: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    decision_request_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    workflow: Mapped["QuoteApprovalWorkflow"] = relationship(back_populates="steps")


