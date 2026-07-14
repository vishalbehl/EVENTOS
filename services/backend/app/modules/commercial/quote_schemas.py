from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class QuoteLineItemInput(BaseModel):
    category: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    quantity: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    duration_days: int = Field(default=1, ge=1, le=3650)
    unit_rate: Decimal = Field(ge=0, max_digits=14, decimal_places=2)


class QuotePricingInput(BaseModel):
    line_items: list[QuoteLineItemInput] = Field(min_length=1, max_length=500)
    discount_type: str = "NONE"
    discount_value: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)
    tax_rate: Decimal = Field(default=Decimal("0"), ge=0, le=100, max_digits=7, decimal_places=4)

    @model_validator(mode="after")
    def validate_discount(self):
        self.discount_type = self.discount_type.upper()
        if self.discount_type not in {"NONE", "PERCENTAGE", "FIXED"}:
            raise ValueError("discount_type must be NONE, PERCENTAGE, or FIXED")
        if self.discount_type == "PERCENTAGE" and self.discount_value > 100:
            raise ValueError("percentage discount cannot exceed 100")
        if self.discount_type == "NONE" and self.discount_value != 0:
            raise ValueError("discount_value must be zero when discount_type is NONE")
        return self


class QuoteCreate(QuotePricingInput):
    organization_id: uuid.UUID
    event_id: uuid.UUID
    service_request_id: uuid.UUID | None = None
    title: str = Field(min_length=1, max_length=255)
    currency: str = Field(default="INR", pattern=r"^[A-Z]{3}$")
    validity_days: int = Field(default=30, ge=1, le=365)
    internal_notes: str | None = Field(default=None, max_length=10000)


class QuoteUpdate(QuotePricingInput):
    expected_version: int = Field(ge=1)
    reason: str = Field(min_length=3, max_length=500)
    title: str = Field(min_length=1, max_length=255)
    currency: str = Field(default="INR", pattern=r"^[A-Z]{3}$")
    validity_days: int = Field(default=30, ge=1, le=365)
    internal_notes: str | None = Field(default=None, max_length=10000)


class QuoteLineItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    category: str
    name: str
    description: str | None
    quantity: Decimal
    duration_days: int
    unit_rate: Decimal
    line_subtotal: Decimal
    sort_order: int


class QuoteTotalsOut(BaseModel):
    subtotal: Decimal
    discount_amount: Decimal
    taxable_amount: Decimal
    tax_amount: Decimal
    total_amount: Decimal


class QuoteOut(QuoteTotalsOut):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: uuid.UUID
    event_id: uuid.UUID
    service_request_id: uuid.UUID | None
    quote_number: str
    title: str
    status: str
    currency: str
    validity_days: int
    valid_until: datetime | None
    discount_type: str
    discount_value: Decimal
    tax_rate: Decimal
    version: int
    internal_notes: str | None
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    line_items: list[QuoteLineItemOut]


class QuoteRevisionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    quote_id: uuid.UUID
    organization_id: uuid.UUID
    version: int
    snapshot_json: dict
    reason: str
    created_by: uuid.UUID
    created_at: datetime


class QuoteApprovalSubmit(BaseModel):
    expected_quote_version: int = Field(ge=1)
    reason: str = Field(min_length=3, max_length=500)
    assigned_user_id: uuid.UUID | None = None


class QuoteApprovalDecision(BaseModel):
    action: str
    reason: str = Field(min_length=3, max_length=1000)
    expected_workflow_version: int = Field(ge=1)

    @model_validator(mode="after")
    def validate_action(self):
        self.action = self.action.upper()
        if self.action not in {"APPROVE", "REJECT"}:
            raise ValueError("action must be APPROVE or REJECT")
        return self


class QuoteApprovalStepOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    workflow_id: uuid.UUID
    organization_id: uuid.UUID
    step_order: int
    name: str
    assigned_user_id: uuid.UUID | None
    required_permission: str
    status: str
    decided_by: uuid.UUID | None
    decision_reason: str | None
    decided_at: datetime | None


class QuoteApprovalWorkflowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: uuid.UUID
    quote_id: uuid.UUID
    quote_version: int
    status: str
    workflow_version: int
    submission_reason: str
    submitted_by: uuid.UUID
    submitted_at: datetime
    completed_at: datetime | None
    steps: list[QuoteApprovalStepOut]


class ProposalConvert(BaseModel):
    expected_quote_version: int = Field(ge=1)
    reason: str = Field(min_length=3, max_length=500)


class ProposalVersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: uuid.UUID
    proposal_id: uuid.UUID
    version: int
    source_quote_id: uuid.UUID
    source_quote_version: int
    snapshot_json: dict
    reason: str
    created_by: uuid.UUID
    created_at: datetime


class ProposalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: uuid.UUID
    event_id: uuid.UUID | None
    quote_id: uuid.UUID | None
    proposal_number: str | None
    title: str
    status: str
    current_version: int
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    versions: list[ProposalVersionOut]


class ProposalDocumentRequest(BaseModel):
    expected_version: int = Field(ge=1)
    reason: str = Field(min_length=3, max_length=500)


class ProposalDocumentOut(BaseModel):
    export_id: uuid.UUID
    proposal_id: uuid.UUID
    proposal_version: int
    status: str
    file_format: str
    created_at: datetime
    completed_at: datetime | None = None
    expires_at: datetime | None = None
    failure_reason: str | None = None


class ProposalShareCreate(BaseModel):
    expected_version: int = Field(ge=1)
    recipient_name: str = Field(min_length=2, max_length=200)
    recipient_email: str = Field(min_length=5, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    expires_in_hours: int = Field(default=72, ge=1, le=720)
    reason: str = Field(min_length=3, max_length=500)


class ProposalShareRevoke(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class ProposalShareOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    proposal_id: uuid.UUID
    proposal_version: int
    recipient_name: str
    recipient_email: str
    status: str
    expires_at: datetime
    created_by: uuid.UUID
    created_at: datetime
    last_accessed_at: datetime | None
    access_count: int
    decision: str | None
    decision_reason: str | None
    signer_name: str | None
    signer_title: str | None
    decided_at: datetime | None
    revoked_at: datetime | None
    revocation_reason: str | None


class ProposalShareCreated(ProposalShareOut):
    token: str


class ProposalShareAccessOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    share_id: uuid.UUID
    action: str
    ip_address: str | None
    user_agent: str | None
    occurred_at: datetime


class PublicProposalOut(BaseModel):
    proposal_id: uuid.UUID
    proposal_number: str | None
    title: str
    proposal_version: int
    recipient_name: str
    status: str
    expires_at: datetime
    snapshot: dict
    decided_at: datetime | None


class PublicProposalDecision(BaseModel):
    decision: str = Field(pattern=r"^(ACCEPTED|REJECTED)$")
    signer_name: str = Field(min_length=2, max_length=200)
    signer_title: str | None = Field(default=None, max_length=200)
    reason: str = Field(min_length=3, max_length=1000)
    consent_confirmed: bool

    @model_validator(mode="after")
    def require_consent(self) -> "PublicProposalDecision":
        if not self.consent_confirmed:
            raise ValueError("Explicit decision consent is required")
        return self


class PublicProposalDecisionOut(BaseModel):
    proposal_id: uuid.UUID
    proposal_version: int
    decision: str
    signer_name: str
    decided_at: datetime
