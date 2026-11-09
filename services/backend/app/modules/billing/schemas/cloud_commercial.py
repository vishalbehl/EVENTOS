from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


AccountType = Literal["ORGANIZER", "EMC"]


class CloudEventSelection(BaseModel):
    event_id: Optional[uuid.UUID] = None
    offer_code: Optional[str] = None
    quantity: int = Field(default=1, gt=0)
    client_workspace_id: Optional[uuid.UUID] = None
    capacity_addon_codes: list[str] = Field(default_factory=list)


class CloudVenueSelection(BaseModel):
    offer_code: str = Field(min_length=3, max_length=80, pattern=r"^[A-Z0-9_]+$")
    quantity: int = Field(default=1, ge=1, le=100)
    event_id: Optional[uuid.UUID] = None


class CloudPricingPreviewRequest(BaseModel):
    account_type: AccountType
    workspace_offer_code: Optional[str] = None
    workspace_billing_interval: Optional[str] = None
    emc_offer_code: Optional[str] = None
    venue_offer_codes: list[str] = Field(default_factory=list)
    venue_event_id: Optional[uuid.UUID] = None
    venue_items: list[CloudVenueSelection] = Field(default_factory=list, max_length=25)
    capacity_addon_codes: list[str] = Field(default_factory=list)
    events: list[CloudEventSelection] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_commercial_family(self):
        if self.workspace_offer_code and self.emc_offer_code:
            raise ValueError("Workspace and EMC offers cannot be selected together")
        if self.account_type == "ORGANIZER" and self.emc_offer_code:
            raise ValueError("EMC offers require an EMC commercial account")
        if self.account_type == "EMC" and self.workspace_offer_code:
            raise ValueError("Workspace offers require an Organizer commercial account")
        if (self.venue_offer_codes or self.venue_items) and self.account_type != "ORGANIZER":
            raise ValueError("Venue offers require an Organizer commercial account")
        has_event_or_capacity_selection = bool(
            self.capacity_addon_codes
            or self.venue_offer_codes
            or self.venue_items
            or any(event.offer_code or event.capacity_addon_codes for event in self.events)
        )
        if not self.workspace_offer_code and not self.emc_offer_code and not has_event_or_capacity_selection:
            raise ValueError("A Workspace, EMC, event, or capacity selection is required")
        return self


class CloudPriceLine(BaseModel):
    code: str
    display_name: str
    product_family: str
    quantity: int
    unit_price: Decimal
    line_total: Decimal
    billing_interval: str
    offer_version_id: uuid.UUID
    event_id: Optional[uuid.UUID] = None
    client_workspace_id: Optional[uuid.UUID] = None
    entitlement_snapshot: dict[str, Any] = Field(default_factory=dict)


class CloudPricingPreviewResponse(BaseModel):
    price_book_version: str
    quote_required: bool
    currency: str = "INR"
    line_items: list[CloudPriceLine]
    subtotal: Decimal
    gst_rate: Decimal = Decimal("18")
    gst: Decimal
    total: Decimal
    warnings: list[str] = Field(default_factory=list)


class CommercialOfferResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    product_family: str
    name: str
    display_name: str
    description: Optional[str]
    scope_type: str
    is_quote_only: bool
    lifecycle_status: str
    version_id: Optional[uuid.UUID] = None
    version_number: int
    effective_from: datetime
    eligible_addon_codes: list[str] = Field(default_factory=list)
    prices: list[dict[str, Any]] = Field(default_factory=list)
    entitlements: list[dict[str, Any]] = Field(default_factory=list)


class CommercialAccountResponse(BaseModel):
    id: uuid.UUID
    account_type: str
    owner_organization_id: uuid.UUID
    status: str
    currency: str
    country: str


class CommercialContractResponse(BaseModel):
    id: uuid.UUID
    contract_type: str
    status: str
    starts_at: datetime
    ends_at: Optional[datetime]
    billing_interval: str
    currency: str
    auto_renew: bool
    cancel_at_period_end: bool
    invoice_id: Optional[uuid.UUID] = None
    activated_at: Optional[datetime] = None
    items: list[dict[str, Any]] = Field(default_factory=list)


class CommercialUsageResponse(BaseModel):
    account_type: str
    event_id: Optional[uuid.UUID] = None
    items: list[dict[str, Any]] = Field(default_factory=list)


class OfferPriceInput(BaseModel):
    billing_interval: str
    pricing_unit: str
    amount: Decimal = Field(ge=0)
    currency: str = "INR"
    tax_mode: str = "EXCLUSIVE"


class CommercialOfferCreateRequest(BaseModel):
    """Stable customer-facing offer identity; prices and allocations live in versions."""

    code: str = Field(min_length=3, max_length=80, pattern=r"^[A-Z0-9_]+$")
    product_family: Literal["WORKSPACE", "EVENT", "EMC", "CAPACITY_ADDON", "VENUE", "VENUE_ADDON"]
    name: str = Field(min_length=2, max_length=255)
    display_name: str = Field(min_length=2, max_length=255)
    description: Optional[str] = Field(default=None, max_length=4000)
    scope_type: str = Field(min_length=2, max_length=30)
    is_quote_only: bool = False
    display_order: int = Field(default=0, ge=0)
    change_reason: str = Field(min_length=5, max_length=2000)


class CommercialPricingConfigurationCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    payload: CloudPricingPreviewRequest
    preview_snapshot: CloudPricingPreviewResponse


class OfferEntitlementInput(BaseModel):
    entitlement_key: str
    scope_type: str
    value_type: str = "QUANTITY"
    quantity: Optional[int] = None
    unit_type: Optional[str] = None
    consumption_model: str = "LIMIT"
    hard_ceiling: bool = True
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class OfferVersionCreateRequest(BaseModel):
    effective_from: datetime
    change_reason: str = Field(min_length=5, max_length=2000)
    prices: list[OfferPriceInput] = Field(min_length=1)
    entitlements: list[OfferEntitlementInput] = Field(default_factory=list)
    eligible_addon_codes: list[str] = Field(default_factory=list)


class CloudCheckoutRequest(CloudPricingPreviewRequest):
    billing_profile: dict[str, Any] = Field(default_factory=dict)
    auto_renew: bool = True
    source_request_id: Optional[uuid.UUID] = None


class CloudCartCheckoutRequest(BaseModel):
    """A bounded cart of independently renewable commercial selections.

    Each item becomes its own immutable contract and invoice so a monthly
    Workspace plan, per-event plan and annual Venue plan never inherit one
    another's renewal or expiry rules.
    """

    items: list[CloudCheckoutRequest] = Field(min_length=1, max_length=25)


class MockCommercialPaymentRequest(BaseModel):
    """Development-only settlement input for a completed commercial cart."""

    invoice_ids: list[uuid.UUID] = Field(min_length=1, max_length=25)

    @model_validator(mode="after")
    def validate_unique_invoices(self):
        if len(set(self.invoice_ids)) != len(self.invoice_ids):
            raise ValueError("invoice_ids must be unique")
        return self


class CommercialRequestCreateRequest(CloudPricingPreviewRequest):
    request_type: Literal["QUOTE", "CUSTOM_CAPACITY", "ENTERPRISE", "EMC", "VENUE"] = "QUOTE"
    requested_capacity: dict[str, int] = Field(default_factory=dict)
    requirements: dict[str, Any] = Field(default_factory=dict)
    billing_profile: dict[str, Any] = Field(default_factory=dict)
    reason: str = Field(min_length=5, max_length=2000)

    @model_validator(mode="after")
    def validate_requested_capacity(self):
        for key, quantity in self.requested_capacity.items():
            if not key or len(key) > 100 or quantity <= 0:
                raise ValueError("requested_capacity must contain named positive quantities")
        return self


class AdminCommercialRequestCreateRequest(CommercialRequestCreateRequest):
    organization_id: uuid.UUID


class CommercialRequestResponse(BaseModel):
    id: uuid.UUID
    product_family: str
    request_type: str
    status: str
    requested_offer_codes: list[str]
    quote_id: Optional[uuid.UUID] = None
    quote_reference: Optional[str] = None
    created_at: datetime


class CommercialRequestDecisionRequest(BaseModel):
    decision: Literal["APPROVED", "REJECTED", "QUOTE_ISSUED"]
    reason: str = Field(min_length=5, max_length=2000)
    quote_reference: Optional[str] = Field(default=None, max_length=120)


class ContractAmendmentRequest(BaseModel):
    target_offer_code: Optional[str] = None
    reason: str = Field(min_length=5, max_length=2000)


class ContractCancellationRequest(BaseModel):
    reason: str = Field(min_length=5, max_length=2000)


class OfferVersionResponse(BaseModel):
    id: uuid.UUID
    offer_id: uuid.UUID
    version_number: int
    effective_from: datetime
    version_status: str
    change_reason: Optional[str]


class AllocationTransferRequest(BaseModel):
    source_allocation_id: uuid.UUID
    target_allocation_id: uuid.UUID
    entitlement_key: str
    quantity: int = Field(gt=0)
    reason: str = Field(min_length=5, max_length=1000)


class EmcWorkspaceCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    organization_id: uuid.UUID
    reason: str = Field(min_length=5, max_length=1000)


class EmcAllocationCreateRequest(BaseModel):
    client_workspace_id: uuid.UUID
    entitlement_key: str = Field(min_length=2, max_length=100)
    quantity: int = Field(gt=0)
    event_id: Optional[uuid.UUID] = None
    reason: str = Field(min_length=5, max_length=1000)


class UsageMutationRequest(BaseModel):
    allocation_id: uuid.UUID
    entitlement_key: str
    quantity: int = Field(gt=0)
    operation_type: Literal["RESERVE", "CONSUME", "RELEASE", "ADJUST"]
    source_record_id: Optional[str] = Field(default=None, max_length=255)
