from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


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
