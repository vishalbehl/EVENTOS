# =============================================================
# Billing Commercial Schemas
# Super Admin commercial view response models
# =============================================================
from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


# ── Plans ──────────────────────────────────────────────────────

class PlanFeatureSummary(BaseModel):
    feature_name: str
    feature_key: str
    enabled: bool


class CommercialPlanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    tagline: Optional[str] = None
    description: Optional[str] = None
    billing_model: str
    currency: str
    price_per_event_min: Optional[float] = None
    price_per_event_max: Optional[float] = None
    max_events: int
    max_users: int
    max_registrations: Optional[int] = None
    max_speakers: Optional[int] = None
    max_sessions: Optional[int] = None
    max_rooms: Optional[int] = None
    storage_quota_mb: int
    is_popular: bool
    color_hex: Optional[str] = None
    is_active: bool
    display_order: int
    # aggregated
    subscriber_count: int = 0
    total_mrr: float = 0.0
    features: List[PlanFeatureSummary] = []


# ── Subscriptions ──────────────────────────────────────────────

class CommercialSubscriptionItem(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    org_name: str
    org_slug: str
    plan_id: uuid.UUID
    plan_name: str
    status: str
    trial_ends_at: Optional[datetime] = None
    current_period_end: Optional[datetime] = None
    cancel_at_period_end: bool = False
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    mrr: float = 0.0
    created_at: datetime


class SubscriptionStatusSummary(BaseModel):
    ACTIVE: int = 0
    TRIAL: int = 0
    GRACE_PERIOD: int = 0
    SUSPENDED: int = 0
    EXPIRED: int = 0
    CANCELLED: int = 0
    total: int = 0


class PaginatedSubscriptions(BaseModel):
    items: List[CommercialSubscriptionItem]
    total: int
    page: int
    page_size: int
    summary: SubscriptionStatusSummary


# ── Invoices ───────────────────────────────────────────────────

class CommercialInvoiceItem(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    organization_name: str
    amount: float
    currency: str
    status: str
    due_date: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    issued_at: datetime
    stripe_invoice_id: Optional[str] = None
    plan_name: Optional[str] = None


class InvoiceSummary(BaseModel):
    total: float = 0.0
    paid: float = 0.0
    pending: float = 0.0
    overdue: float = 0.0
    total_count: int = 0
    this_month: float = 0.0


class PaginatedInvoices(BaseModel):
    items: List[CommercialInvoiceItem]
    total: int
    page: int
    page_size: int
    summary: InvoiceSummary


# ── Revenue ────────────────────────────────────────────────────

class RevenueSummaryResponse(BaseModel):
    mrr: float = 0.0
    arr: float = 0.0
    net_new_mrr: float = 0.0
    churned_mrr: float = 0.0
    expansion_mrr: float = 0.0
    arpu: float = 0.0
    mrr_change_pct: float = 0.0    # vs previous period
    arr_change_pct: float = 0.0


class MrrHistoryPoint(BaseModel):
    month: str          # "Jun 2026"
    period: str         # "2026-06"
    mrr: float
    arr: float
    net_new: float = 0.0
    churned: float = 0.0
    expansion: float = 0.0


class PlanRevenue(BaseModel):
    plan_id: str
    plan_name: str
    mrr: float
    subscriber_count: int
    pct: float          # percentage of total MRR
