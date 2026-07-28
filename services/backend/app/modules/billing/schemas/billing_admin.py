from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class BillingAdminSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class SubscriptionPlanAdminResponse(BillingAdminSchema):
    id: uuid.UUID
    name: str
    tagline: str | None = None
    billing_model: str
    price_per_event: float | None = None
    currency: str
    max_events: int
    max_users: int
    is_active: bool
    is_popular: bool
    display_order: int
    created_at: datetime


class OrganizationSubscriptionAdminResponse(BillingAdminSchema):
    id: uuid.UUID
    organization_id: uuid.UUID
    plan_id: uuid.UUID
    status: str
    stripe_subscription_id: str | None = None
    trial_ends_at: datetime | None = None
    current_period_end: datetime | None = None
    cancel_at_period_end: bool
    created_at: datetime
    updated_at: datetime
    version: int
    status_reason: str | None = None
    status_changed_at: datetime | None = None
    status_changed_by: uuid.UUID | None = None


class EntitlementGrantAdminResponse(BillingAdminSchema):
    id: uuid.UUID
    organization_id: uuid.UUID
    subscription_id: uuid.UUID | None = None
    grant_type: str
    scope_type: str
    consumption_model: str
    unit_type: str
    status: str
    source_type: str
    quantity_total: int | None = None
    quantity_consumed: int | None = None
    quantity_reserved: int | None = None
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    created_at: datetime
    updated_at: datetime
    version: int
    status_reason: str | None = None
    status_changed_at: datetime | None = None
    status_changed_by: uuid.UUID | None = None


class CreditNoteAdminResponse(BillingAdminSchema):
    id: uuid.UUID
    credit_note_number: str
    organization_id: uuid.UUID
    invoice_id: uuid.UUID
    amount_inr: float
    gst_amount: float
    reason: str | None = None
    status: str
    issued_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    version: int
    status_reason: str | None = None
    status_changed_by: uuid.UUID | None = None
    applied_to_invoice_id: uuid.UUID | None = None
    applied_at: datetime | None = None
    cancelled_at: datetime | None = None


class FinancialAuditAdminResponse(BillingAdminSchema):
    id: uuid.UUID
    activity_type: str
    entity_type: str
    entity_id: uuid.UUID | None = None
    entity_name: str | None = None
    organization_id: uuid.UUID | None = None
    amount_inr: float | None = None
    ip_address: str | None = None
    occurred_at: datetime


class RevenueMetricAdminResponse(BillingAdminSchema):
    id: uuid.UUID
    organization_id: uuid.UUID
    period: str
    mrr: float
    arr: float
    add_on_revenue: float
    created_at: datetime


class InvoiceAdminResponse(BillingAdminSchema):
    id: uuid.UUID
    organization_id: uuid.UUID
    event_id: uuid.UUID | None = None
    activation_id: uuid.UUID | None = None
    invoice_number: str | None = None
    amount: float
    gst_amount: float
    total_amount_inr: float
    currency: str
    status: str
    due_date: datetime | None = None
    paid_at: datetime | None = None
    issued_at: datetime
    stripe_invoice_id: str | None = None
    version: int
    status_reason: str | None = None
    status_changed_at: datetime | None = None
    status_changed_by: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


class InvoiceItemAdminResponse(BillingAdminSchema):
    id: uuid.UUID
    invoice_id: uuid.UUID
    description: str
    amount: float
    quantity: int


class CommercialPaymentAdminResponse(BillingAdminSchema):
    id: uuid.UUID
    organization_id: uuid.UUID
    invoice_id: uuid.UUID | None = None
    subscription_id: uuid.UUID | None = None
    plan_name: str
    amount: float
    currency: str
    provider: str
    provider_transaction_id: str | None = None
    provider_event_id: str | None = None
    parent_transaction_id: uuid.UUID | None = None
    refunded_amount: float = 0
    status: str
    reconciliation_status: str
    reconciled_at: datetime | None = None
    reconciled_by: uuid.UUID | None = None
    reconciliation_reason: str | None = None
    version: int
    created_at: datetime
    updated_at: datetime


class ProviderWebhookAdminResponse(BillingAdminSchema):
    id: uuid.UUID
    gateway_id: uuid.UUID
    organization_id: uuid.UUID
    invoice_id: uuid.UUID | None = None
    transaction_id: uuid.UUID | None = None
    provider: str
    provider_event_id: str
    event_type: str
    provider_created_at: datetime | None = None
    payload_hash: str
    status: str
    attempt_count: int
    failure_code: str | None = None
    failure_detail: str | None = None
    received_at: datetime
    processed_at: datetime | None = None


class InvoiceDetailAdminResponse(BaseModel):
    invoice: InvoiceAdminResponse
    items: list[InvoiceItemAdminResponse]
    payments: list[CommercialPaymentAdminResponse]
    reconciled_amount: float
    outstanding_amount: float
    reconciliation_status: str


class InvoiceArtifactRequest(BaseModel):
    version: int = Field(ge=1)
    reason: str = Field(min_length=12, max_length=500)


class InvoiceArtifactResponse(BaseModel):
    export_id: uuid.UUID
    invoice_id: uuid.UUID
    invoice_version: int
    status: str
    created_at: datetime
    completed_at: datetime | None = None
    expires_at: datetime | None = None
    failure_reason: str | None = None


class InvoiceArtifactDownload(BaseModel):
    download_url: str
    filename: str
    expires_in: int


class EventActivationAdminResponse(BillingAdminSchema):
    id: uuid.UUID
    organization_id: uuid.UUID
    event_id: uuid.UUID
    subscription_id: uuid.UUID
    grant_id: uuid.UUID | None = None
    grant_consumption_id: uuid.UUID | None = None
    status: str
    activation_policy: str
    current_snapshot_set_id: uuid.UUID | None = None
    activated_at: datetime
    expires_at: datetime | None = None
    usage_locked_at: datetime | None = None
    transfer_locked_at: datetime | None = None
    deactivation_reason: str | None = None
    suspension_reason: str | None = None
    created_at: datetime
    updated_at: datetime


class GrantConsumptionAdminResponse(BillingAdminSchema):
    id: uuid.UUID
    grant_id: uuid.UUID
    organization_id: uuid.UUID
    event_id: uuid.UUID | None = None
    quantity: int
    unit_type: str
    status: str
    reserved_at: datetime | None = None
    consumed_at: datetime | None = None
    released_at: datetime | None = None
    reservation_expires_at: datetime | None = None
    transferred_to_consumption_id: uuid.UUID | None = None
    created_at: datetime


class SnapshotSetAdminSummary(BillingAdminSchema):
    id: uuid.UUID
    version: int
    resolution_reason: str
    resolver_version: str
    policy_type: str
    checksum: str
    previous_snapshot_set_id: uuid.UUID | None = None
    created_at: datetime
    is_current: bool = False


class SnapshotFeatureAdminItem(BaseModel):
    feature_key: str
    enabled: bool
    scope_type: str
    source_type: str
    source_ref: str | None = None
    override_source: str | None = None
    denial_reason: str | None = None


class SnapshotLimitAdminItem(BaseModel):
    limit_key: str
    limit_value: int | None = None
    usage_value: int
    remaining_value: int | None = None
    usage_strategy: str
    scope_type: str
    source_type: str
    source_ref: str | None = None
    override_source: str | None = None
    denial_reason: str | None = None


class ActivationInspectionAdminResponse(BaseModel):
    activation: EventActivationAdminResponse
    event_name: str
    plan_id: uuid.UUID | None = None
    plan_name: str | None = None
    grant: EntitlementGrantAdminResponse | None = None
    consumption: GrantConsumptionAdminResponse | None = None
    current_snapshot: SnapshotSetAdminSummary | None = None
    snapshot_history: list[SnapshotSetAdminSummary]
    features: list[SnapshotFeatureAdminItem]
    limits: list[SnapshotLimitAdminItem]
    usage: dict[str, int]
    transfer_eligibility: dict[str, Any] | None = None
    denial_reason: str | None = None


class BillingMutationBase(BaseModel):
    reason: str = Field(min_length=12, max_length=500)


class SubscriptionStatusUpdate(BillingMutationBase):
    approved_request_id: uuid.UUID
    version: int = Field(ge=1)
    status: Literal[
        "ACTIVE", "TRIAL", "SUSPENDED", "EXPIRED", "PENDING_PAYMENT",
        "GRACE_PERIOD", "CANCELLED", "ARCHIVED",
    ]


class GrantIssueRequest(BillingMutationBase):
    approved_request_id: uuid.UUID
    subscription_id: uuid.UUID | None = None
    grant_type: Literal["EVENT_UNIT", "EVENT_PACK", "EVENT_CREDIT_POOL", "ORG_CAPABILITY", "SERVICE_ALLOWANCE"]
    scope_type: Literal["ORG", "EVENT"]
    consumption_model: Literal["SINGLE_USE", "QUANTITY", "CREDIT", "DURATION", "NON_CONSUMABLE", "MANUAL_FULFILLMENT"]
    unit_type: Literal["EVENT", "CREDIT", "MESSAGE", "EMAIL", "STORAGE_MB", "STREAMING_MINUTE", "SERVICE_HOUR", "CUSTOM"]
    source_type: Literal["PLAN", "ADDON", "CONTRACT", "PLATFORM_OVERRIDE"]
    source_ref: str | None = Field(None, max_length=255)
    quantity_total: int | None = Field(None, ge=1)
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    metadata_json: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_commercial_shape(self):
        consumable = self.consumption_model in {"SINGLE_USE", "QUANTITY", "CREDIT", "DURATION"}
        if consumable and self.quantity_total is None:
            raise ValueError("Consumable grants require quantity_total.")
        if not consumable and self.quantity_total is not None:
            raise ValueError("Non-consumable or manually fulfilled grants cannot define quantity_total.")
        if self.consumption_model == "SINGLE_USE" and self.quantity_total != 1:
            raise ValueError("SINGLE_USE grants require quantity_total=1.")
        if self.valid_from and self.valid_until and self.valid_until <= self.valid_from:
            raise ValueError("valid_until must be later than valid_from.")
        return self


class GrantCapacityUpdate(BillingMutationBase):
    approved_request_id: uuid.UUID
    version: int = Field(ge=1)
    quantity_total: int = Field(ge=1)


class GrantStatusUpdate(BillingMutationBase):
    approved_request_id: uuid.UUID
    version: int = Field(ge=1)
    status: Literal["PENDING", "ACTIVE", "SUSPENDED", "EXPIRED", "CANCELLED"]


class CreditNoteIssueRequest(BillingMutationBase):
    invoice_id: uuid.UUID
    amount_inr: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    gst_amount: Decimal = Field(default=Decimal("0"), ge=0, max_digits=12, decimal_places=2)


class CreditNoteStatusUpdate(BillingMutationBase):
    version: int = Field(ge=1)
    status: Literal["ISSUED", "APPLIED", "CANCELLED"]
    applied_to_invoice_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def validate_target_invoice(self):
        if self.status == "APPLIED" and self.applied_to_invoice_id is None:
            raise ValueError("APPLIED status requires applied_to_invoice_id.")
        if self.status != "APPLIED" and self.applied_to_invoice_id is not None:
            raise ValueError("applied_to_invoice_id is only valid for APPLIED status.")
        return self


class SnapshotRefreshRequest(BillingMutationBase):
    resolution_reason: Literal[
        "SNAPSHOT_REFRESH",
        "PLATFORM_OVERRIDE",
        "CONTRACT_AMENDMENT",
        "RECOVERY_REBUILD",
    ] = "SNAPSHOT_REFRESH"


class ActivationDeactivateRequest(BillingMutationBase):
    pass


class ActivationTransferRequest(BillingMutationBase):
    target_event_id: uuid.UUID


class InvoiceStatusUpdate(BillingMutationBase):
    version: int = Field(ge=1)
    status: Literal["VOID"]


class CommercialPaymentRecordRequest(BillingMutationBase):
    subscription_id: uuid.UUID | None = None
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    currency: str = Field(default="INR", min_length=3, max_length=10)
    provider: Literal["OFFLINE", "STRIPE", "RAZORPAY", "PAYU", "CCAVENUE", "PAYTM", "OTHER"]
    provider_transaction_id: str | None = Field(None, min_length=3, max_length=255)
    provider_event_id: str | None = Field(None, min_length=3, max_length=255)
    status: Literal["PENDING", "SUCCEEDED", "FAILED"] = "SUCCEEDED"

    @model_validator(mode="after")
    def validate_provider_reference(self):
        if self.provider != "OFFLINE" and not self.provider_transaction_id:
            raise ValueError("Provider payments require provider_transaction_id.")
        return self


class CommercialPaymentReconcileRequest(BillingMutationBase):
    version: int = Field(ge=1)
    reconciliation_status: Literal["RECONCILED", "MISMATCH", "REVERSED"]


class CommercialPaymentRefundRequest(BillingMutationBase):
    version: int = Field(ge=1)
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    provider_refund_id: str | None = Field(None, min_length=3, max_length=255)
