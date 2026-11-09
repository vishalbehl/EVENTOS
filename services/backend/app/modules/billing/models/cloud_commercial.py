"""Versioned cloud-commercial models.

The versioned commercial tables are the only cloud pricing authority.  A
contract stores the selected offer version and allocation snapshot so future
catalogue edits cannot rewrite historical billing or entitlements.
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class CommercialAccount(Base):
    __tablename__ = "billing_accounts"
    __table_args__ = (
        UniqueConstraint("owner_organization_id", name="uq_commercial_accounts_owner_org"),
        Index("ix_commercial_accounts_type_status", "account_type", "status"),
        {"schema": "commerce"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_type: Mapped[str] = mapped_column(String(20), nullable=False, default="ORGANIZER")
    owner_organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="ACTIVE")
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR", server_default="INR")
    country: Mapped[str] = mapped_column(String(2), nullable=False, default="IN", server_default="IN")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class CommercialAccountWorkspace(Base):
    __tablename__ = "account_organizations"
    __table_args__ = (
        UniqueConstraint("commercial_account_id", "organization_id", name="uq_commercial_account_workspace"),
        Index("ix_commercial_account_workspaces_account", "commercial_account_id", "status"),
        {"schema": "commerce"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    commercial_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.billing_accounts.id", ondelete="CASCADE"), nullable=False
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False
    )
    workspace_role: Mapped[str] = mapped_column(String(20), nullable=False, default="OWNER")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class CommercialOffer(Base):
    __tablename__ = "plans"
    __table_args__ = (
        UniqueConstraint("code", name="uq_commercial_offers_code"),
        Index("ix_commercial_offers_family_status", "product_family", "lifecycle_status"),
        {"schema": "commerce"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(80), nullable=False)
    product_family: Mapped[str] = mapped_column(String(30), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    scope_type: Mapped[str] = mapped_column(String(30), nullable=False)
    is_quote_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    lifecycle_status: Mapped[str] = mapped_column(String(20), nullable=False, default="DRAFT")
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class CommercialOfferVersion(Base):
    __tablename__ = "plan_versions"
    __table_args__ = (
        UniqueConstraint("offer_id", "version_number", name="uq_commercial_offer_version"),
        UniqueConstraint("offer_id", "idempotency_key", name="uq_commercial_offer_version_idempotency"),
        Index("ix_commercial_offer_versions_effective", "offer_id", "effective_from", "effective_until"),
        {"schema": "commerce"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    offer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.plans.id", ondelete="CASCADE"), nullable=False
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    effective_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    effective_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    version_status: Mapped[str] = mapped_column(String(20), nullable=False, default="DRAFT")
    change_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True
    )
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    eligible_addon_codes: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class CommercialOfferPrice(Base):
    __tablename__ = "plan_prices"
    __table_args__ = (
        Index("ix_commercial_offer_prices_version", "offer_version_id", "billing_interval"),
        {"schema": "commerce"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    offer_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.plan_versions.id", ondelete="CASCADE"), nullable=False
    )
    billing_interval: Mapped[str] = mapped_column(String(20), nullable=False)
    pricing_unit: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR", server_default="INR")
    tax_mode: Mapped[str] = mapped_column(String(30), nullable=False, default="EXCLUSIVE")
    minimum_quantity: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    maximum_quantity: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class CommercialOfferEntitlement(Base):
    __tablename__ = "plan_entitlements"
    __table_args__ = (
        UniqueConstraint("offer_version_id", "entitlement_key", name="uq_commercial_offer_entitlement"),
        {"schema": "commerce"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    offer_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.plan_versions.id", ondelete="CASCADE"), nullable=False
    )
    entitlement_key: Mapped[str] = mapped_column(String(100), nullable=False)
    scope_type: Mapped[str] = mapped_column(String(30), nullable=False)
    value_type: Mapped[str] = mapped_column(String(20), nullable=False, default="QUANTITY")
    quantity: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    unit_type: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    consumption_model: Mapped[str] = mapped_column(String(30), nullable=False, default="LIMIT")
    hard_ceiling: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    metadata_json: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")


class CommercialRequest(Base):
    __tablename__ = "plan_requests"
    __table_args__ = (
        UniqueConstraint("commercial_account_id", "idempotency_key", name="uq_commercial_request_idempotency"),
        UniqueConstraint("decision_idempotency_key", name="uq_commercial_request_decision_idempotency"),
        UniqueConstraint("commercial_account_id", "quote_acceptance_idempotency_key", name="uq_commercial_request_quote_acceptance_idempotency"),
        Index("ix_commercial_requests_account_status", "commercial_account_id", "status", "created_at"),
        Index("ix_commercial_requests_organization_status", "organization_id", "status", "created_at"),
        {"schema": "commerce"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    commercial_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.billing_accounts.id", ondelete="CASCADE"), nullable=False
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False
    )
    request_type: Mapped[str] = mapped_column(String(30), nullable=False, default="QUOTE")
    product_family: Mapped[str] = mapped_column(String(30), nullable=False)
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="SET NULL"), nullable=True
    )
    client_workspace_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.account_organizations.id", ondelete="SET NULL"), nullable=True
    )
    requested_offer_codes: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    requested_capacity: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    requirements_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    preview_snapshot_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    billing_profile: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    quote_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    quote_reference: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="PENDING")
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False
    )
    decided_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True
    )
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    decision_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(200), nullable=False)
    decision_idempotency_key: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    quote_acceptance_idempotency_key: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class CommercialPricingConfiguration(Base):
    """Saved Command Center calculator input and its immutable preview snapshot."""

    __tablename__ = "pricing_drafts"
    __table_args__ = (
        UniqueConstraint("created_by", "idempotency_key", name="uq_commercial_pricing_config_idempotency"),
        Index("ix_commercial_pricing_config_created_by", "created_by", "created_at"),
        {"schema": "commerce"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    account_type: Mapped[str] = mapped_column(String(20), nullable=False)
    payload_json: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    preview_snapshot_json: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False
    )
    idempotency_key: Mapped[str] = mapped_column(String(200), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class CommercialContract(Base):
    __tablename__ = "plan_contracts"
    __table_args__ = (
        Index("ix_commercial_contracts_account_status", "commercial_account_id", "status"),
        Index("ix_commercial_contracts_source_quote", "source_quote_id"),
        UniqueConstraint("commercial_account_id", "checkout_idempotency_key", name="uq_commercial_contract_checkout_idempotency"),
        {"schema": "commerce"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    commercial_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.billing_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    contract_type: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="PENDING_PAYMENT")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    billing_interval: Mapped[str] = mapped_column(String(20), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR", server_default="INR")
    price_book_version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    source_quote_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    auto_renew: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    source_request_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.plan_requests.id", ondelete="SET NULL"), nullable=True
    )
    invoice_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.invoices.id", ondelete="SET NULL"), nullable=True
    )
    renewed_from_contract_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.plan_contracts.id", ondelete="SET NULL"), nullable=True
    )
    checkout_idempotency_key: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    cancellation_idempotency_key: Mapped[Optional[str]] = mapped_column(String(200), nullable=True, unique=True)
    activated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class CommercialContractItem(Base):
    __tablename__ = "contract_items"
    __table_args__ = (
        Index("ix_commercial_contract_items_contract", "contract_id"),
        Index("ix_commercial_contract_items_event", "event_id"),
        {"schema": "commerce"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    contract_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.plan_contracts.id", ondelete="CASCADE"), nullable=False
    )
    offer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.plans.id", ondelete="RESTRICT"), nullable=False
    )
    offer_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.plan_versions.id", ondelete="RESTRICT"), nullable=False
    )
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="SET NULL"), nullable=True
    )
    client_workspace_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.account_organizations.id", ondelete="SET NULL"), nullable=True
    )
    quantity: Mapped[int] = mapped_column(BigInteger, nullable=False, default=1, server_default="1")
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    tax_rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=18, server_default="18")
    line_total: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    allocation_snapshot_json: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class CommercialContractAmendment(Base):
    __tablename__ = "contract_changes"
    __table_args__ = (
        UniqueConstraint("commercial_account_id", "idempotency_key", name="uq_commercial_contract_amendment_idempotency"),
        Index("ix_commercial_contract_amendments_contract", "contract_id", "created_at"),
        {"schema": "commerce"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    contract_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.plan_contracts.id", ondelete="RESTRICT"), nullable=False
    )
    commercial_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.billing_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="APPLIED")
    target_offer_code: Mapped[str] = mapped_column(String(80), nullable=False)
    source_offer_version_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.plan_versions.id", ondelete="SET NULL"), nullable=True
    )
    target_offer_version_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.plan_versions.id", ondelete="SET NULL"), nullable=True
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    old_snapshot_json: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    new_snapshot_json: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    price_delta: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0, server_default="0")
    gst_delta: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0, server_default="0")
    total_delta: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0, server_default="0")
    invoice_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.invoices.id", ondelete="SET NULL"), nullable=True
    )
    requested_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True
    )
    approved_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(200), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class CommercialAllocation(Base):
    __tablename__ = "allocations"
    __table_args__ = (
        Index("ix_commercial_allocations_account_key", "commercial_account_id", "entitlement_key"),
        Index("ix_commercial_allocations_event_key", "event_id", "entitlement_key"),
        {"schema": "commerce"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    contract_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.contract_items.id", ondelete="RESTRICT"), nullable=False
    )
    commercial_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.billing_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False
    )
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="SET NULL"), nullable=True
    )
    client_workspace_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.account_organizations.id", ondelete="SET NULL"), nullable=True
    )
    entitlement_key: Mapped[str] = mapped_column(String(100), nullable=False)
    quantity_total: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    quantity_reserved: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    quantity_consumed: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    valid_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")


class CommercialAllocationTransfer(Base):
    __tablename__ = "allocation_transfers"
    __table_args__ = (
        Index("ix_commercial_allocation_transfers_account", "commercial_account_id", "created_at"),
        {"schema": "commerce"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    commercial_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.billing_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    source_allocation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.allocations.id", ondelete="RESTRICT"), nullable=False
    )
    target_allocation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.allocations.id", ondelete="RESTRICT"), nullable=False
    )
    entitlement_key: Mapped[str] = mapped_column(String(100), nullable=False)
    quantity: Mapped[int] = mapped_column(BigInteger, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


class CommercialUsageLedger(Base):
    __tablename__ = "usage_entries"
    __table_args__ = (
        UniqueConstraint("commercial_account_id", "idempotency_key", name="uq_commercial_usage_idempotency"),
        Index("ix_commercial_usage_account_key", "commercial_account_id", "entitlement_key", "created_at"),
        Index("ix_commercial_usage_event_key", "event_id", "entitlement_key", "created_at"),
        {"schema": "commerce"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    commercial_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.billing_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False
    )
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="SET NULL"), nullable=True
    )
    allocation_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commerce.allocations.id", ondelete="SET NULL"), nullable=True
    )
    entitlement_key: Mapped[str] = mapped_column(String(100), nullable=False)
    quantity: Mapped[int] = mapped_column(BigInteger, nullable=False)
    operation_type: Mapped[str] = mapped_column(String(20), nullable=False)
    source_record_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(200), nullable=False)
    metadata_json: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
