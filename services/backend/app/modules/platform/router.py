import uuid
from uuid import UUID
import base64
import hashlib
import json
import re
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional, Any, Dict, Literal
from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, Request, Response, status
from sqlalchemy import select, func, and_, or_, desc, update, delete, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.dependencies import StepUpAuth, get_db
from app.modules.identity.models.user import User
from app.modules.identity.models.refresh_token import RefreshToken
from app.modules.audit.models.audit_log import AuditLog
from app.modules.audit.models.audit_domain_tables import ImpersonationLog
from app.modules.audit.application.queries import AuditQueryService
from app.schemas.cursor_pagination import CursorPage, bounded_page_size, decode_cursor, encode_cursor
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.feature import FeatureCatalog
from app.modules.platform.models.health import OrganizationHealth
from app.modules.analytics.models.usage import OrganizationUsage
from app.modules.billing.models.subscription import (
    SubscriptionPlan, OrganizationSubscription, PlanFeature, 
    OrganizationFeature, Addon, AddonFeature, CommercialTemplateVersion, OrganizationAddon, 
    ActivityTimeline, RevenueMetric
)
from app.modules.billing.models.billing_domain_tables import Invoice, InvoiceItem
from app.modules.billing.models.licensing import EntitlementGrant, GrantConsumption
from app.modules.billing.models.event_activation import EventActivation
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.billing.models.financial_audit_trail import FinancialAuditTrail
from app.dependencies import get_current_user
from pydantic import BaseModel, ConfigDict, Field
from app.modules.platform.models.platform_domain_tables import OrganizationDomain, TenantLimit
from app.modules.platform.models.organization_console import OrganizationBrandProfile
from app.modules.events.models.event import Event
from app.modules.registration.models.payment_transaction import PaymentTransaction
from app.modules.billing.capability_registry import CATALOG_LIMIT_KEYS, FEATURE_DEFINITIONS
from app.modules.billing.services.capability_service import CapabilityService
from app.modules.billing.services.entitlement_resolver import EntitlementResolver
from app.core.dependencies.feature_gate import enforce_org_operation
from app.core.tenant_context import TenantContextGuard
from app.modules.presentations.services import upload_service as presentation_upload_service
from app.modules.platform.application.governed_mutation_commands import commit_transaction
from app.modules.platform.application.queries import (
    OrganizationConsoleQueryService,
    PlatformUserQueryService,
    PlatformCommercialCatalogQueryService,
    PlatformCoreDashboardQueryService,
    PlatformOperationsQueryService,
    PlatformFinancialQueryService,
)
from app.modules.audit.application.queries import AuditQueryService
from app.modules.platform.application.security_queries import PlatformSecurityEventQueryService
from app.modules.platform.application.identity_commands import IdentityAdminCommandService
from app.modules.platform.application.organization_commands import OrganizationCommandService

router = APIRouter(prefix="/platform", tags=["Platform Admin CRM"])


def _governed_commercial_workflow_required(workflow: str) -> None:
    """Fail closed for obsolete mutation routes superseded by approvals."""
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": "DUAL_APPROVAL_REQUIRED",
            "workflow": workflow,
            "message": (
                "This legacy mutation is disabled. Submit and approve the "
                "corresponding request in Organizer Console."
            ),
        },
    )

# ── Response Models ──────────────────────────────────────────

class SubscriptionItem(BaseModel):
    id: str
    organization_id: str
    org_name: str
    org_slug: str
    plan_id: str
    plan_name: str
    plan_color_hex: str
    status: str
    trial_ends_at: Optional[str] = None
    current_period_end: Optional[str] = None
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    mrr_inr: float
    days_until_trial_end: Optional[int] = None

class SubscriptionSummary(BaseModel):
    total_mrr_inr: float
    total_arr_inr: float
    active_count: int
    trial_count: int
    at_risk_count: int

class SubscriptionListResponse(BaseModel):
    items: List[SubscriptionItem]
    total: int
    summary: SubscriptionSummary

class InvoiceItem(BaseModel):
    id: str
    invoice_number: str
    organization_id: str
    org_name: str
    plan_name: str
    amount_inr: float
    gst_amount: float
    total_amount_inr: float
    currency: str
    status: str
    due_date: Optional[str] = None
    paid_at: Optional[str] = None
    event_id: Optional[str] = None
    created_at: str

class InvoiceSummary(BaseModel):
    total_value_inr: float
    paid_inr: float
    pending_inr: float
    overdue_inr: float
    total_count: int
    paid_count: int
    overdue_count: int
    avg_collection_days: float

class InvoiceListResponse(BaseModel):
    items: List[InvoiceItem]
    total: int
    summary: InvoiceSummary

class ActivityItem(BaseModel):
    org_id: str
    org_name: str
    action: str
    amount: Optional[float] = None
    occurred_at: str

class TrialExpiring(BaseModel):
    org_id: str
    org_name: str
    plan_name: str
    trial_ends_at: str
    days_remaining: int

class DashboardMetrics(BaseModel):
    total_organizations: int
    active_organizations: int
    trial_organizations: int
    total_users: int
    total_events: int
    total_active_events: int
    total_registrations: int
    storage_used_bytes: int
    current_mrr: float
    mrr_current: float
    arr_current: float
    venue_servers_online: int
    active_users_30d: int
    churn_rate: float
    open_tickets: int
    events_this_month: int
    revenue_today: float
    # KPI aliases / additions
    revenue_today_inr: float
    orgs_trend: List[int]
    users_trend: List[int]
    mrr_trend: List[float]
    events_trend: List[int]
    revenue_trend: List[float]      # daily revenue INR, last 7 days
    subscriptions_active: int
    subscriptions_trial: int
    subscriptions_grace: int
    subscriptions_suspended: int
    subscriptions_expired: int
    subscriptions_cancelled: int
    recent_activity: List[ActivityItem]
    trials_expiring: List[TrialExpiring]
    top_orgs_by_mrr: List[Dict[str, Any]]  # {org_id, org_name, mrr, plan_name}
    platform_status: str
    services_degraded: int
    checked_at: str

# ── Dependencies ─────────────────────────────────────────

async def require_platform_admin(current_user: User = Depends(get_current_user)):
    is_admin = (
        (current_user.platform_role and current_user.platform_role in ["SUPER_ADMIN", "SUPPORT_ADMIN", "FINANCE_ADMIN"]) or
        current_user.role == "super_admin" or
        getattr(current_user, "is_platform_admin", False) or
        (current_user.organization and current_user.organization.slug == "Eventos")
    )
    if not is_admin:
        raise HTTPException(status_code=403, detail="Platform Admin access required")
    return current_user


async def _get_current_subscription(
    db: AsyncSession,
    org_id: uuid.UUID,
    *,
    with_plan: bool = False,
) -> Optional[OrganizationSubscription]:
    stmt = select(OrganizationSubscription).where(
        OrganizationSubscription.organization_id == org_id
    )
    if with_plan:
        stmt = stmt.options(selectinload(OrganizationSubscription.plan))
    stmt = stmt.order_by(
        OrganizationSubscription.status.in_(["ACTIVE", "TRIAL"]).desc(),
        OrganizationSubscription.created_at.desc(),
    ).limit(1)
    return await db.scalar(stmt)

# ── Endpoints ────────────────────────────────────────────

@router.get("/dashboard", response_model=DashboardMetrics)
async def get_dashboard_metrics(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_platform_admin)):
    """Fetch aggregated SaaS metrics for the Super Admin dashboard."""
    now_dt = datetime.now(timezone.utc)
    month_start = now_dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    current_period = now_dt.strftime("%Y-%m")
    dashboard_queries = PlatformCoreDashboardQueryService(db)
    core = await dashboard_queries.metrics(
        current_period=current_period,
        month_start=month_start,
        thirty_days_ago=now_dt - timedelta(days=30),
    )
    total_orgs = core.total_orgs
    active_orgs = core.active_orgs
    trial_orgs = core.trial_orgs
    total_users = core.total_users
    total_events = core.total_events
    total_active_events_usage = core.total_active_events_usage
    total_regs = core.total_regs
    total_storage = core.total_storage
    mrr_current = core.mrr_current
    active_users_30d = core.active_users_30d
    cancelled_this_month = core.cancelled_this_month
    active_last_month = core.active_last_month
    events_this_month = core.events_this_month
    revenue_today = core.revenue_today

    # Aggregated MRR from recent Revenue Metrics
    arr_current = mrr_current * 12.0

    # churn_rate = (cancelled this month / active last month) * 100
    if active_last_month == 0:
        active_last_month = active_orgs or 1
    churn_rate = round((cancelled_this_month / active_last_month) * 100.0, 2)

    # Sparkline data: trends (last 7 days)
    today = date.today()
    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)

    open_tickets = await dashboard_queries.open_support_ticket_count()
    trend_maps = await dashboard_queries.seven_day_trends(since=seven_days_ago)
    orgs_trend_map = trend_maps["orgs"]
    orgs_trend = [int(orgs_trend_map.get(today - timedelta(days=i), 0)) for i in range(6, -1, -1)]

    users_trend_map = trend_maps["users"]
    users_trend = [int(users_trend_map.get(today - timedelta(days=i), 0)) for i in range(6, -1, -1)]

    events_trend_map = trend_maps["events"]
    events_trend = [int(events_trend_map.get(today - timedelta(days=i), 0)) for i in range(6, -1, -1)]

    mrr_trend_map = trend_maps["mrr"]
    mrr_trend = [mrr_trend_map.get(today - timedelta(days=i), 0.0) for i in range(6, -1, -1)]

    revenue_by_day = await dashboard_queries.daily_payment_revenue(since=seven_days_ago)
    revenue_trend = [float(revenue_by_day.get(today - timedelta(days=i), 0.0)) for i in range(6, -1, -1)]

    top_orgs_by_mrr = await dashboard_queries.top_organizations_by_mrr(
        period=current_period,
        limit=5,
    )

    # subscription health matrix
    sub_map = await dashboard_queries.subscription_status_counts()
    subscriptions_active = sub_map.get("ACTIVE", 0)
    subscriptions_trial = sub_map.get("TRIAL", 0)
    subscriptions_grace = sub_map.get("GRACE_PERIOD", 0)
    subscriptions_suspended = sub_map.get("SUSPENDED", 0)
    subscriptions_expired = sub_map.get("EXPIRED", 0)
    subscriptions_cancelled = sub_map.get("CANCELLED", 0)

    recent_activity = await dashboard_queries.recent_billing_activity(limit=10)

    trials_expiring = await dashboard_queries.trials_expiring(
        before=now_dt + timedelta(days=14),
        limit=100,
    )

    # Platform status checks
    pg_status = "healthy"
    try:
        await db.execute(select(1))
    except Exception:
        await db.rollback()
        pg_status = "degraded"

    redis_status = "healthy"
    try:
        from app.redis import redis_client
        await redis_client.ping()
    except Exception:
        redis_status = "degraded"

    services_degraded = 0
    if pg_status != "healthy":
        services_degraded += 1
    if redis_status != "healthy":
        services_degraded += 1

    if pg_status == "degraded" and redis_status == "degraded":
        platform_status = "down"
    elif pg_status == "degraded" or redis_status == "degraded":
        platform_status = "degraded"
    else:
        platform_status = "healthy"

    return {
        "total_organizations": total_orgs,
        "active_organizations": active_orgs,
        "trial_organizations": trial_orgs,
        "total_users": total_users,
        "total_events": total_events,
        "total_active_events": total_active_events_usage,
        "total_registrations": total_regs,
        "storage_used_bytes": total_storage,
        "current_mrr": mrr_current,
        "mrr_current": mrr_current,
        "arr_current": arr_current,
        "venue_servers_online": 0,
        "active_users_30d": active_users_30d,
        "churn_rate": churn_rate,
        "open_tickets": open_tickets,
        "events_this_month": events_this_month,
        "revenue_today": revenue_today,
        "revenue_today_inr": revenue_today,   # INR alias
        "orgs_trend": orgs_trend,
        "users_trend": users_trend,
        "mrr_trend": mrr_trend,
        "events_trend": events_trend,
        "revenue_trend": revenue_trend,
        "subscriptions_active": subscriptions_active,
        "subscriptions_trial": subscriptions_trial,
        "subscriptions_grace": subscriptions_grace,
        "subscriptions_suspended": subscriptions_suspended,
        "subscriptions_expired": subscriptions_expired,
        "subscriptions_cancelled": subscriptions_cancelled,
        "recent_activity": recent_activity,
        "trials_expiring": trials_expiring,
        "top_orgs_by_mrr": top_orgs_by_mrr,
        "platform_status": platform_status,
        "services_degraded": services_degraded,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }

@router.get("/organizations")
async def list_organizations(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_platform_admin), skip: int = 0, limit: int = 100):
    del current_user
    return await OrganizationConsoleQueryService(db).organization_list(
        skip=skip,
        limit=min(max(limit, 1), 100),
    )

@router.get("/organizations/{org_id}")
async def get_organization_detail(org_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_platform_admin)):
    """Get full details for CRM Overview tab."""
    del current_user
    async with TenantContextGuard.scoped(db, org_id):
        detail = await OrganizationConsoleQueryService(db).organization_detail(
            organization_id=org_id
        )
        if detail is None:
            raise HTTPException(status_code=404, detail="Organization not found")
        return detail


@router.get("/organizations/{org_id}/features")
async def get_organization_features(org_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_platform_admin)):
    """List all features and whether they are enabled by Plan or Override, plus default/override states."""
    del current_user
    return await OrganizationConsoleQueryService(db).organization_features(
        organization_id=org_id
    )

class FeatureOverrideRequest(BaseModel):
    feature_id: uuid.UUID
    is_enabled: bool
    reason: str = Field(..., min_length=8, max_length=1000)
    expires_at: Optional[datetime] = None


class FeatureOverrideDeleteRequest(BaseModel):
    reason: str = Field(..., min_length=8, max_length=1000)

@router.put("/organizations/{org_id}/features/overrides")
async def override_organization_feature(org_id: uuid.UUID, payload: FeatureOverrideRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_platform_admin)):
    """Manual feature unlock without upgrading plan."""
    _governed_commercial_workflow_required("entitlement-override-request")
    if current_user.platform_role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin required for overrides")

    await OrganizationCommandService(db).set_feature_override(
        organization_id=org_id,
        feature_id=payload.feature_id,
        actor=current_user,
        is_enabled=payload.is_enabled,
        reason=payload.reason,
        expires_at=payload.expires_at,
    )
    return {"message": "Override applied successfully"}

@router.delete("/organizations/{org_id}/features/overrides/{feature_id}")
async def delete_organization_feature_override(
    org_id: uuid.UUID,
    feature_id: uuid.UUID,
    payload: FeatureOverrideDeleteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Remove a manual feature override so it reverts to plan default."""
    _governed_commercial_workflow_required("entitlement-override-revocation")
    if current_user.platform_role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin required for overrides")

    await OrganizationCommandService(db).remove_feature_override(
        organization_id=org_id,
        feature_id=feature_id,
        actor=current_user,
        reason=payload.reason,
    )
    return {"message": "Override removed successfully"}


@router.get("/organizations/{org_id}/addons")
async def list_organization_addons(org_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_platform_admin)):
    """List active addons for the tenant."""
    del current_user
    return await OrganizationConsoleQueryService(db).organization_addons(
        organization_id=org_id
    )

@router.get("/organizations/{org_id}/usage")
async def get_organization_usage(org_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_platform_admin)):
    """Fetch usage metrics for quota tracking."""
    del current_user
    return await OrganizationConsoleQueryService(db).organization_usage(
        organization_id=org_id
    )

@router.get("/organizations/{org_id}/timeline")
async def get_organization_timeline(org_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_platform_admin), limit: int = 50):
    """Get the customer activity timeline."""
    del current_user
    return await OrganizationConsoleQueryService(db).organization_timeline(
        organization_id=org_id,
        limit=limit,
    )


@router.get("/organizations/{org_id}/timeline/page", response_model=CursorPage[dict])
async def get_organization_timeline_cursor(
    org_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin),
    page_size: int = Query(50, ge=1, le=100),
    cursor: Optional[str] = Query(None, max_length=512),
) -> CursorPage[dict]:
    """Bounded cursor-paginated audit timeline for platform operations."""
    del current_user
    position = decode_cursor(cursor) if cursor else None
    rows, has_next = await AuditQueryService(db).list_organization_cursor(
        organization_id=org_id,
        cursor_time=position.occurred_at if position else None,
        cursor_id=position.record_id if position else None,
        limit=bounded_page_size(page_size, maximum=100),
    )
    items = [
        {
            "id": str(row.id),
            "request_id": str(row.request_id) if row.request_id else None,
            "correlation_id": str(row.correlation_id) if row.correlation_id else None,
            "organization_id": str(row.organization_id) if row.organization_id else None,
            "actor_user_id": str(row.actor_user_id) if row.actor_user_id else None,
            "impersonated_by": str(row.impersonated_by) if row.impersonated_by else None,
            "actor_role": row.actor_role,
            "resource_type": row.resource_type,
            "resource_id": str(row.resource_id) if row.resource_id else None,
            "action_type": row.action_type,
            "old_state": row.old_state,
            "new_state": row.new_state,
            "change_diff": row.change_diff,
            "actor_ip": row.actor_ip,
            "is_sensitive": row.is_sensitive,
            "occurred_at": row.occurred_at.isoformat() if row.occurred_at else None,
            "row_hash": row.row_hash,
            "hash_version": row.hash_version,
        }
        for row in rows
    ]
    next_cursor = encode_cursor(rows[-1].occurred_at, rows[-1].id) if has_next and rows else None
    return CursorPage(items=items, next_cursor=next_cursor, has_next=has_next)


# ═══════════════════════════════════════════════════════════════
#  NEW SUPER ADMIN ENDPOINTS — Added for Super Admin Console
# ═══════════════════════════════════════════════════════════════

# ── Pydantic Schemas ──────────────────────────────────────────

class SubscriptionPlanIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    tagline: Optional[str] = None
    description: Optional[str] = None
    max_events: int = 3
    max_users: int = 10
    # None represents an unlimited plan capacity (used by Enterprise plans).
    max_registrations: Optional[int] = 1000
    max_speakers: Optional[int] = None
    max_sessions: Optional[int] = None
    max_rooms: Optional[int] = 10
    max_ticket_categories: Optional[int] = None
    max_badge_templates: Optional[int] = None
    max_certificate_templates: Optional[int] = None
    max_emails_per_event: Optional[int] = None
    storage_quota_mb: int = 10240
    currency: str = "INR"
    price_per_event: Optional[float] = None
    billing_model: str = "PER_EVENT"
    display_order: int = 0
    is_popular: bool = False
    color_hex: Optional[str] = None
    is_active: bool = True
    lifecycle_status: Literal["DRAFT", "REVIEW", "PUBLISHED", "RETIRED"] = "DRAFT"

class OrgStatusUpdate(BaseModel):
    is_active: bool
    suspension_reason: str = Field(..., min_length=8, max_length=1000)

class ReasonRequiredRequest(BaseModel):
    reason: str = Field(..., min_length=8, max_length=1000)


# ── Subscription Plans CRUD ────────────────────────────────────

def _commercial_request_hash(resource_type: str, resource_id: uuid.UUID | None, payload: dict) -> str:
    material = {"resource_type": resource_type, "resource_id": str(resource_id) if resource_id else None, "payload": payload}
    return hashlib.sha256(json.dumps(material, sort_keys=True, default=str, separators=(",", ":")).encode()).hexdigest()


async def _commercial_version_replay(db: AsyncSession, resource_type: str, idempotency_key: str, request_hash: str) -> CommercialTemplateVersion | None:
    existing = await db.scalar(select(CommercialTemplateVersion).where(
        CommercialTemplateVersion.resource_type == resource_type,
        CommercialTemplateVersion.idempotency_key == idempotency_key,
    ))
    if existing and existing.request_hash != request_hash:
        raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT"})
    return existing


async def _plan_template_snapshot(db: AsyncSession, plan: SubscriptionPlan) -> dict:
    assignments = (await db.execute(
        select(PlanFeature, FeatureCatalog)
        .join(FeatureCatalog, FeatureCatalog.id == PlanFeature.feature_id)
        .where(PlanFeature.plan_id == plan.id)
        .order_by(FeatureCatalog.key)
    )).all()
    return {
        "template": {
            "id": str(plan.id), "name": plan.name, "tagline": plan.tagline,
            "description": plan.description, "billing_model": plan.billing_model,
            "currency": plan.currency,
            "price_per_event": float(plan.price_per_event) if plan.price_per_event is not None else None,
            "max_events": plan.max_events, "max_users": plan.max_users,
            "max_event_team_members": plan.max_event_team_members,
            "max_registrations": plan.max_registrations, "max_speakers": plan.max_speakers,
            "max_sessions": plan.max_sessions, "max_rooms": plan.max_rooms,
            "max_ticket_categories": plan.max_ticket_categories,
            "max_badge_templates": plan.max_badge_templates,
            "max_certificate_templates": plan.max_certificate_templates,
            "max_emails_per_event": plan.max_emails_per_event,
            "storage_quota_mb": plan.storage_quota_mb, "display_order": plan.display_order,
            "is_popular": plan.is_popular, "color_hex": plan.color_hex,
            "is_active": plan.is_active, "version": plan.version,
            "lifecycle_status": plan.lifecycle_status,
            "effective_at": plan.effective_at.isoformat() if plan.effective_at else None,
            "retired_at": plan.retired_at.isoformat() if plan.retired_at else None,
        },
        "assignments": [{
            "feature_key": feature.key, "enabled": mapping.enabled,
            "value_type": mapping.value_type, "value": mapping.entitlement_value,
            "scope_type": mapping.scope_type, "enforcement_mode": mapping.enforcement_mode,
            "hard_ceiling": mapping.hard_ceiling,
        } for mapping, feature in assignments],
    }


async def _record_plan_template_version(
    db: AsyncSession, plan: SubscriptionPlan, *, actor: User,
    idempotency_key: str, request_hash: str, reason: str, change_type: str,
) -> CommercialTemplateVersion:
    row = CommercialTemplateVersion(
        resource_type="PLAN", resource_id=plan.id, version=plan.version,
        lifecycle_status=plan.lifecycle_status, change_type=change_type,
        snapshot_json=await _plan_template_snapshot(db, plan), request_hash=request_hash,
        reason=reason, idempotency_key=idempotency_key, actor_user_id=actor.id,
    )
    db.add(row)
    db.add(AuditLog(
        organization_id=None, actor_user_id=actor.id, actor_role=actor.platform_role or actor.role,
        resource_type="subscription_plan", resource_id=plan.id,
        action_type=f"PLAN_TEMPLATE_{change_type}",
        new_state={"version": plan.version, "lifecycle_status": plan.lifecycle_status, "reason": reason},
        is_sensitive=True,
    ))
    await db.flush()
    return row


async def _addon_template_snapshot(db: AsyncSession, addon: Addon) -> dict:
    assignments = (await db.execute(
        select(AddonFeature, FeatureCatalog)
        .join(FeatureCatalog, FeatureCatalog.id == AddonFeature.feature_id)
        .where(AddonFeature.addon_id == addon.id)
        .order_by(FeatureCatalog.key)
    )).all()
    return {
        "template": {
            "id": str(addon.id), "key": addon.key, "name": addon.name,
            "description": addon.description, "short_description": addon.short_description,
            "addon_type": addon.addon_type, "scope_type": addon.scope_type,
            "consumption_model": addon.consumption_model, "unit_type": addon.unit_type,
            "price_inr": float(addon.price_inr) if addon.price_inr is not None else None,
            "min_price_inr": float(addon.min_price_inr) if addon.min_price_inr is not None else None,
            "max_price_inr": float(addon.max_price_inr) if addon.max_price_inr is not None else None,
            "billing_unit": addon.billing_unit, "price_unit": addon.price_unit,
            "available_for_plans": addon.available_for_plans or [],
            "is_active": addon.is_active, "version": addon.version,
            "lifecycle_status": addon.lifecycle_status,
            "effective_at": addon.effective_at.isoformat() if addon.effective_at else None,
            "retired_at": addon.retired_at.isoformat() if addon.retired_at else None,
            "features_spec": addon.features_spec or [], "hardware_spec": addon.hardware_spec or [],
            "staff_spec": addon.staff_spec or [], "inclusions": addon.inclusions or [],
            "exclusions": addon.exclusions or [], "template_types": addon.template_types or [],
        },
        "assignments": [{
            "feature_key": feature.key, "value_type": mapping.value_type,
            "value": mapping.entitlement_value, "operation": mapping.operation,
            "scope_type": mapping.scope_type, "validity_days": mapping.validity_days,
            "stackable": mapping.stackable, "max_quantity": mapping.max_quantity,
        } for mapping, feature in assignments],
    }


async def _record_addon_template_version(
    db: AsyncSession, addon: Addon, *, actor: User,
    idempotency_key: str, request_hash: str, reason: str, change_type: str,
) -> CommercialTemplateVersion:
    row = CommercialTemplateVersion(
        resource_type="ADDON", resource_id=addon.id, version=addon.version,
        lifecycle_status=addon.lifecycle_status, change_type=change_type,
        snapshot_json=await _addon_template_snapshot(db, addon), request_hash=request_hash,
        reason=reason, idempotency_key=idempotency_key, actor_user_id=actor.id,
    )
    db.add(row)
    db.add(AuditLog(
        organization_id=None, actor_user_id=actor.id, actor_role=actor.platform_role or actor.role,
        resource_type="commercial_addon", resource_id=addon.id,
        action_type=f"ADDON_TEMPLATE_{change_type}",
        new_state={"version": addon.version, "lifecycle_status": addon.lifecycle_status, "reason": reason},
        is_sensitive=True,
    ))
    await db.flush()
    return row

@router.get("/subscription-plans")
async def list_subscription_plans(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """List all subscription plans with full details, subscriber counts, and MRR (Super Admin)."""
    mrr_period = datetime.now(timezone.utc).strftime("%Y-%m")
    return await PlatformCommercialCatalogQueryService(db).list_subscription_plans(
        mrr_period=mrr_period
    )


@router.get("/plans")
async def list_plans_alias(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Alias for /subscription-plans."""
    return await list_subscription_plans(db, current_user)


@router.get("/features/matrix")
async def get_features_matrix(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Return the canonical catalogue grouped for typed plan assignment."""
    del current_user
    return await PlatformCommercialCatalogQueryService(db).features_matrix()


async def calculate_addon_final_price(
    db: AsyncSession,
    addon_type: str,
    min_price_inr: Optional[float],
    price_inr: Optional[float],
    hardware_spec: List[Dict[str, Any]],
    staff_spec: List[Dict[str, Any]]
) -> float:
    import math
    base_price = float(min_price_inr if min_price_inr is not None else (price_inr if price_inr is not None else 0.0))
    if addon_type.upper() != "VENUE":
        # Round base price to nearest 500
        return float(math.floor(base_price / 500.0 + 0.5) * 500)

    hardware_cost = 0.0
    if hardware_spec:
        from app.modules.inventory.models import HardwareItem
        item_ids = []
        for row in hardware_spec:
            if "item_id" in row and row["item_id"]:
                try:
                    item_ids.append(uuid.UUID(str(row["item_id"])))
                except ValueError:
                    pass
        if item_ids:
            stmt = select(HardwareItem).where(HardwareItem.id.in_(item_ids))
            items = (await db.execute(stmt)).scalars().all()
            price_map = {item.id: float(item.renting_price or 0.0) for item in items}
            for row in hardware_spec:
                try:
                    item_uuid = uuid.UUID(str(row["item_id"]))
                    qty = int(row.get("quantity", 1))
                    days = int(row.get("days", 1))
                    unit_price = price_map.get(item_uuid, 0.0)
                    hardware_cost += qty * days * unit_price
                except Exception:
                    pass

    staff_cost = 0.0
    if staff_spec:
        from app.modules.commercial.models import StaffRole
        role_ids = []
        for row in staff_spec:
            if "role_id" in row and row["role_id"]:
                try:
                    role_ids.append(uuid.UUID(str(row["role_id"])))
                except ValueError:
                    pass
        if role_ids:
            stmt = select(StaffRole).where(StaffRole.id.in_(role_ids))
            roles = (await db.execute(stmt)).scalars().all()
            price_map = {role.id: float(role.selling_per_day or 0.0) for role in roles}
            for row in staff_spec:
                try:
                    role_uuid = uuid.UUID(str(row["role_id"]))
                    qty = int(row.get("quantity", 1))
                    days = int(row.get("days", 1))
                    unit_price = price_map.get(role_uuid, 0.0)
                    staff_cost += qty * days * unit_price
                except Exception:
                    pass

    total_cost = base_price + hardware_cost + staff_cost
    # Round final price to nearest 500
    return float(math.floor(total_cost / 500.0 + 0.5) * 500)


@router.get("/addons")
async def list_platform_addons(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """List all platform add-ons."""
    del current_user
    return await PlatformCommercialCatalogQueryService(db).list_addons()


@router.post("/subscription-plans", status_code=201)
async def create_subscription_plan(
    payload: SubscriptionPlanIn,
    step_up: StepUpAuth,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    reason: str = Header(..., alias="X-Admin-Reason", min_length=12, max_length=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Create a new subscription plan (SUPER_ADMIN only)."""
    is_super = current_user.platform_role == "SUPER_ADMIN" or current_user.role == "super_admin" or getattr(current_user, "is_platform_admin", False)
    if not is_super:
        raise HTTPException(status_code=403, detail="SUPER_ADMIN required")
    del step_up
    if payload.lifecycle_status in {"PUBLISHED", "RETIRED"}:
        raise HTTPException(status_code=422, detail={"code": "PLAN_MUST_START_AS_DRAFT_OR_REVIEW"})
    request_payload = payload.model_dump(mode="json")
    request_hash = _commercial_request_hash("PLAN", None, request_payload)
    replay = await _commercial_version_replay(db, "PLAN", idempotency_key, request_hash)
    if replay:
        existing_plan = await db.get(SubscriptionPlan, replay.resource_id)
        return {"id": replay.resource_id, "name": existing_plan.name if existing_plan else None, "message": "Plan already created", "replayed": True}
    plan = SubscriptionPlan(
        name=payload.name,
        tagline=payload.tagline,
        description=payload.description,
        max_events=payload.max_events,
        max_users=payload.max_users,
        max_registrations=payload.max_registrations,
        max_speakers=payload.max_speakers,
        max_sessions=payload.max_sessions,
        max_rooms=payload.max_rooms,
        max_ticket_categories=payload.max_ticket_categories,
        max_badge_templates=payload.max_badge_templates,
        max_certificate_templates=payload.max_certificate_templates,
        max_emails_per_event=payload.max_emails_per_event,
        storage_quota_mb=payload.storage_quota_mb,
        currency=payload.currency,
        price_per_event=payload.price_per_event,
        billing_model=payload.billing_model,
        display_order=payload.display_order,
        is_popular=payload.is_popular,
        color_hex=payload.color_hex,
        is_active=False,
        lifecycle_status=payload.lifecycle_status,
        version=1,
    )
    db.add(plan)
    await db.flush()
    await _record_plan_template_version(
        db, plan, actor=current_user, idempotency_key=idempotency_key,
        request_hash=request_hash, reason=reason, change_type="CREATED",
    )
    await commit_transaction(db)
    await db.refresh(plan)
    return {"id": plan.id, "name": plan.name, "message": "Plan created", "version": plan.version, "replayed": False}


@router.patch("/subscription-plans/{plan_id}")
async def update_subscription_plan(
    plan_id: uuid.UUID,
    payload: SubscriptionPlanIn,
    step_up: StepUpAuth,
    expected_version: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    reason: str = Header(..., alias="X-Admin-Reason", min_length=12, max_length=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Update a subscription plan (SUPER_ADMIN only)."""
    is_super = current_user.platform_role == "SUPER_ADMIN" or current_user.role == "super_admin" or getattr(current_user, "is_platform_admin", False)
    if not is_super:
        raise HTTPException(status_code=403, detail="SUPER_ADMIN required")
    del step_up
    request_payload = payload.model_dump(mode="json", exclude_unset=True)
    request_hash = _commercial_request_hash("PLAN", plan_id, request_payload)
    replay = await _commercial_version_replay(db, "PLAN", idempotency_key, request_hash)
    if replay:
        return {"message": "Plan update already applied", "version": replay.version, "replayed": True}
    plan = await db.get(SubscriptionPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if plan.version != expected_version:
        raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "expected": expected_version, "actual": plan.version})
    previous_lifecycle = plan.lifecycle_status
    target_lifecycle = request_payload.get("lifecycle_status", plan.lifecycle_status)
    if plan.lifecycle_status == "RETIRED" and target_lifecycle != "RETIRED":
        raise HTTPException(status_code=409, detail={"code": "RETIRED_PLAN_IMMUTABLE", "message": "Clone a retired plan to create a new draft."})
    if target_lifecycle == "PUBLISHED":
        assignment_count = int(await db.scalar(select(func.count(PlanFeature.feature_id)).where(PlanFeature.plan_id == plan_id)) or 0)
        if assignment_count == 0:
            raise HTTPException(status_code=422, detail={"code": "PLAN_ASSIGNMENTS_REQUIRED"})
    for field, val in request_payload.items():
        setattr(plan, field, val)
    now = datetime.now(timezone.utc)
    if target_lifecycle == "PUBLISHED" and previous_lifecycle != "PUBLISHED":
        plan.effective_at = now
    if target_lifecycle == "RETIRED":
        plan.retired_at = now
    plan.lifecycle_status = target_lifecycle
    plan.is_active = bool(request_payload.get("is_active", plan.is_active)) and target_lifecycle == "PUBLISHED"
    plan.version = expected_version + 1
    await db.flush()
    await _record_plan_template_version(
        db, plan, actor=current_user, idempotency_key=idempotency_key,
        request_hash=request_hash, reason=reason, change_type="UPDATED",
    )
    await commit_transaction(db)
    return {"message": "Plan updated", "version": plan.version, "replayed": False}


class PlanFeaturesUpdate(BaseModel):
    feature_keys: List[str]


@router.get("/features")
async def list_features_catalog(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """List all feature catalog items."""
    del current_user
    return await PlatformCommercialCatalogQueryService(db).list_features()


class FeatureCatalogIn(BaseModel):
    key: str
    name: str
    description: Optional[str] = None
    category: str = "core"
    category_order: Optional[int] = None
    feature_order: Optional[int] = None
    is_active: bool = True
    value_type: Literal["BOOLEAN", "LIMIT", "TIER", "ENUM"] = "BOOLEAN"
    scope_type: str = "EVENT"
    default_value: Any = None
    allowed_values: List[str] = Field(default_factory=list)
    unit: Optional[str] = None
    period: Optional[str] = None
    enforcement_mode: Literal["HARD", "SOFT_WARNING", "METERED_OVERAGE"] = "HARD"


class FeatureCategoryReorderIn(BaseModel):
    categories: List[str]


class FeatureOrderReorderIn(BaseModel):
    category: str
    feature_ids: List[uuid.UUID]


def _normalize_feature_key(key: str) -> str:
    normalized = re.sub(r"[^A-Z0-9_]", "_", key.strip().upper())
    normalized = re.sub(r"_+", "_", normalized).strip("_")
    if not normalized:
        raise HTTPException(status_code=400, detail="Feature key is required")
    return normalized


def _normalize_feature_category(category: str) -> str:
    normalized = re.sub(r"[^A-Z0-9_]", "_", category.strip().upper())
    normalized = re.sub(r"_+", "_", normalized).strip("_")
    if not normalized:
        raise HTTPException(status_code=400, detail="Category is required")
    return normalized


async def _resolve_category_order(
    db: AsyncSession,
    category: str,
    category_order: Optional[int],
) -> int:
    if category_order is not None:
        return category_order

    existing_order_stmt = (
        select(FeatureCatalog.category_order)
        .where(FeatureCatalog.category == category)
        .order_by(FeatureCatalog.category_order.asc())
        .limit(1)
    )
    existing_order = (await db.execute(existing_order_stmt)).scalar_one_or_none()
    if existing_order is not None:
        return existing_order

    max_order = (await db.execute(select(func.max(FeatureCatalog.category_order)))).scalar_one_or_none() or 0
    return max_order + 1


async def _resolve_feature_order(
    db: AsyncSession,
    category: str,
    feature_order: Optional[int],
) -> int:
    if feature_order is not None:
        return feature_order

    max_order_stmt = select(func.max(FeatureCatalog.feature_order)).where(FeatureCatalog.category == category)
    max_order = (await db.execute(max_order_stmt)).scalar_one_or_none() or 0
    return max_order + 1


def _validated_catalog_value(payload: FeatureCatalogIn) -> Optional[dict]:
    raw = payload.default_value.get("value") if isinstance(payload.default_value, dict) else payload.default_value
    if payload.value_type == "BOOLEAN" and raw is not None and not isinstance(raw, bool):
        raise HTTPException(status_code=422, detail="BOOLEAN features require a Boolean default value")
    if payload.value_type == "LIMIT" and raw is not None and (
        isinstance(raw, bool) or not isinstance(raw, (int, float)) or raw < 0
    ):
        raise HTTPException(status_code=422, detail="LIMIT features require a non-negative numeric default value")
    if payload.value_type in {"TIER", "ENUM"}:
        if not payload.allowed_values:
            raise HTTPException(status_code=422, detail=f"{payload.value_type} features require allowed values")
        if raw is not None and raw not in payload.allowed_values:
            raise HTTPException(status_code=422, detail="The default value must be one of the allowed values")
    return {"value": raw} if raw is not None else None


def _serialize_feature_catalog_item(feature: FeatureCatalog) -> dict:
    return {
        "id": feature.id,
        "key": feature.key,
        "name": feature.name,
        "description": feature.description,
        "category": feature.category,
        "category_order": feature.category_order,
        "feature_order": feature.feature_order,
        "is_active": feature.is_active,
        "value_type": feature.value_type,
        "scope_type": feature.scope_type,
        "default_value": feature.default_value,
        "allowed_values": feature.allowed_values or [],
        "unit": feature.unit,
        "period": feature.period,
        "enforcement_mode": feature.enforcement_mode,
        "version": feature.version,
        "portal_routes": feature.portal_routes or [],
        "backend_operations": feature.backend_operations or [],
        "required_permissions": feature.required_permissions or [],
        "metric_key": feature.metric_key,
        "dependencies": feature.dependencies or [],
        "conflicts": feature.conflicts or [],
        "owner_console": feature.owner_console,
        "owner_team": feature.owner_team,
        "risk_level": feature.risk_level,
        "lifecycle_status": feature.lifecycle_status,
        "replacement_key": feature.replacement_key,
    }


@router.post("/features", status_code=201)
async def create_feature_catalog_item(
    payload: FeatureCatalogIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Create a new feature catalog item (SUPER_ADMIN only)."""
    is_super = current_user.platform_role == "SUPER_ADMIN" or current_user.role == "super_admin" or getattr(current_user, "is_platform_admin", False)
    if not is_super:
        raise HTTPException(status_code=403, detail="SUPER_ADMIN required")

    key = _normalize_feature_key(payload.key)
    category = _normalize_feature_category(payload.category)

    # Check for duplicate key
    existing_stmt = select(FeatureCatalog).where(FeatureCatalog.key == key)
    existing = (await db.execute(existing_stmt)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail=f"Feature with key '{key}' already exists")

    feature = FeatureCatalog(
        key=key,
        name=payload.name,
        description=payload.description,
        category=category,
        category_order=await _resolve_category_order(db, category, payload.category_order),
        feature_order=await _resolve_feature_order(db, category, payload.feature_order),
        is_active=payload.is_active,
        value_type=payload.value_type,
        scope_type=payload.scope_type,
        default_value=_validated_catalog_value(payload),
        allowed_values=payload.allowed_values,
        unit=payload.unit,
        period=payload.period,
        enforcement_mode=payload.enforcement_mode,
    )
    db.add(feature)
    await commit_transaction(db)
    await db.refresh(feature)
    return {**_serialize_feature_catalog_item(feature), "message": "Feature created successfully"}


@router.patch("/features/{feature_id}")
async def update_feature_catalog_item(
    feature_id: uuid.UUID,
    payload: FeatureCatalogIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Update a feature catalog item (SUPER_ADMIN only)."""
    is_super = current_user.platform_role == "SUPER_ADMIN" or current_user.role == "super_admin" or getattr(current_user, "is_platform_admin", False)
    if not is_super:
        raise HTTPException(status_code=403, detail="SUPER_ADMIN required")

    feature = await db.get(FeatureCatalog, feature_id)
    if not feature:
        raise HTTPException(status_code=404, detail="Feature not found")

    key = _normalize_feature_key(payload.key)
    category = _normalize_feature_category(payload.category)

    # Enforcement keys are immutable once created. Deprecation/replacement is
    # explicit so active contracts never silently change meaning.
    if feature.key != key:
        raise HTTPException(status_code=409, detail={"code": "IMMUTABLE_FEATURE_KEY", "feature_key": feature.key})

    feature.key = key
    feature.name = payload.name
    feature.description = payload.description
    feature.category = category
    feature.category_order = await _resolve_category_order(db, category, payload.category_order)
    feature.feature_order = await _resolve_feature_order(db, category, payload.feature_order)
    feature.is_active = payload.is_active
    feature.value_type = payload.value_type
    feature.scope_type = payload.scope_type
    feature.default_value = _validated_catalog_value(payload)
    feature.allowed_values = payload.allowed_values
    feature.unit = payload.unit
    feature.period = payload.period
    feature.enforcement_mode = payload.enforcement_mode
    feature.version = (feature.version or 0) + 1

    await commit_transaction(db)
    await db.refresh(feature)
    return {**_serialize_feature_catalog_item(feature), "message": "Feature updated successfully"}


@router.patch("/feature-categories/reorder")
async def reorder_feature_categories(
    payload: FeatureCategoryReorderIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Persist category ordering for the feature catalog."""
    is_super = current_user.platform_role == "SUPER_ADMIN" or current_user.role == "super_admin" or getattr(current_user, "is_platform_admin", False)
    if not is_super:
        raise HTTPException(status_code=403, detail="SUPER_ADMIN required")

    categories = [_normalize_feature_category(category) for category in payload.categories if category.strip()]
    seen: set[str] = set()
    ordered_categories: List[str] = []
    for category in categories:
        if category not in seen:
            seen.add(category)
            ordered_categories.append(category)

    if not ordered_categories:
        raise HTTPException(status_code=400, detail="At least one category is required")

    for order, category in enumerate(ordered_categories, start=1):
        await db.execute(
            update(FeatureCatalog)
            .where(FeatureCatalog.category == category)
            .values(category_order=order)
        )

    await commit_transaction(db)
    return {"message": "Category order updated successfully"}


@router.patch("/feature-orders/reorder")
async def reorder_features_within_category(
    payload: FeatureOrderReorderIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Persist feature ordering inside a category."""
    is_super = current_user.platform_role == "SUPER_ADMIN" or current_user.role == "super_admin" or getattr(current_user, "is_platform_admin", False)
    if not is_super:
        raise HTTPException(status_code=403, detail="SUPER_ADMIN required")

    category = _normalize_feature_category(payload.category)
    if not payload.feature_ids:
        raise HTTPException(status_code=400, detail="At least one feature is required")

    feature_ids = list(dict.fromkeys(payload.feature_ids))
    features = (
        await db.execute(
            select(FeatureCatalog).where(
                FeatureCatalog.id.in_(feature_ids),
                FeatureCatalog.category == category,
            )
        )
    ).scalars().all()

    if len(features) != len(feature_ids):
        raise HTTPException(status_code=400, detail="One or more features do not belong to the selected category")

    for order, feature_id in enumerate(feature_ids, start=1):
        await db.execute(
            update(FeatureCatalog)
            .where(FeatureCatalog.id == feature_id, FeatureCatalog.category == category)
            .values(feature_order=order)
        )

    await commit_transaction(db)
    return {"message": "Feature order updated successfully"}


@router.delete("/features/{feature_id}")
async def delete_feature_catalog_item(
    feature_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Deprecate a feature key without breaking active contracts."""
    is_super = current_user.platform_role == "SUPER_ADMIN" or current_user.role == "super_admin" or getattr(current_user, "is_platform_admin", False)
    if not is_super:
        raise HTTPException(status_code=403, detail="SUPER_ADMIN required")

    feature = await db.get(FeatureCatalog, feature_id)
    if not feature:
        raise HTTPException(status_code=404, detail="Feature not found")

    feature.is_active = False
    feature.lifecycle_status = "DEPRECATED"
    feature.version = (feature.version or 0) + 1
    await commit_transaction(db)
    return {"message": "Feature deprecated successfully", "feature_key": feature.key}


@router.get("/subscription-plans/{plan_id}/features")
async def get_plan_features(
    plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Get the features enabled for a subscription plan."""
    return await PlatformCommercialCatalogQueryService(db).plan_feature_keys(plan_id=plan_id)

    stmt = select(FeatureCatalog.key).join(PlanFeature).where(
        and_(PlanFeature.plan_id == plan_id, PlanFeature.enabled == True)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


async def update_plan_features(
    plan_id: uuid.UUID,
    payload: PlanFeaturesUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Update (replace) the features enabled for a subscription plan."""
    is_super = current_user.platform_role == "SUPER_ADMIN" or current_user.role == "super_admin" or getattr(current_user, "is_platform_admin", False)
    if not is_super:
        raise HTTPException(status_code=403, detail="SUPER_ADMIN required")
        
    plan = await db.get(SubscriptionPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
        
    # Delete existing mappings
    await db.execute(
        delete(PlanFeature).where(PlanFeature.plan_id == plan_id)
    )
    
    # Resolve keys to IDs
    if payload.feature_keys:
        feat_stmt = select(FeatureCatalog).where(FeatureCatalog.key.in_(payload.feature_keys))
        features_res = await db.execute(feat_stmt)
        features = features_res.scalars().all()
        
        for f in features:
            db.add(PlanFeature(plan_id=plan_id, feature_id=f.id, enabled=True))
        
    await commit_transaction(db)
    return {"message": "Plan features updated successfully"}



# ── All Subscriptions List ─────────────────────────────────────

async def _get_org_mrr(db: AsyncSession, org_id: uuid.UUID) -> float:
    current_period = datetime.now(timezone.utc).strftime("%Y-%m")
    result = await db.scalar(
        select(RevenueMetric.mrr)
        .where(
            and_(
                RevenueMetric.organization_id == org_id,
                RevenueMetric.period == current_period
            )
        )
    )
    return float(result) if result else 0.0


@router.get("/subscriptions", response_model=SubscriptionListResponse)
async def list_all_subscriptions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin),
    status: Optional[str] = Query(None),
    plan_id: Optional[uuid.UUID] = Query(None),
    search: Optional[str] = Query(None),
    expiring_days: Optional[int] = Query(None),
    skip: int = Query(0),
    limit: int = Query(20),
):
    """List all organization subscriptions across platform (Super Admin)."""
    del current_user
    return await PlatformCommercialCatalogQueryService(db).list_subscriptions(
        status=status,
        plan_id=plan_id,
        search=search,
        expiring_days=expiring_days,
        skip=skip,
        limit=limit,
    )


@router.get("/invoices", response_model=InvoiceListResponse)
async def list_all_invoices(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin),
    status: Optional[str] = Query(None),
    org_id: Optional[uuid.UUID] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0),
    limit: int = Query(20),
):
    """List all invoices across platform (Super Admin)."""
    del current_user
    return await PlatformCommercialCatalogQueryService(db).list_invoices(
        status=status,
        organization_id=org_id,
        search=search,
        skip=skip,
        limit=limit,
    )


# ── Revenue Metrics ────────────────────────────────────────────

@router.get("/revenue-metrics")
async def get_revenue_metrics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin),
    months: int = Query(12, ge=1, le=24),
):
    """Aggregated MRR/ARR per month for revenue analytics chart."""
    return await PlatformCoreDashboardQueryService(db).revenue_metrics(months=months)


# ── Global Users ───────────────────────────────────────────────

# C1: Extended user list with risk scores + session counts
@router.get("/global-users")
@router.get("/users")
async def get_platform_users(
    search: Optional[str] = None,
    role: Optional[str] = None,
    org_id: Optional[uuid.UUID] = None,
    two_fa_enabled: Optional[bool] = None,
    is_active: Optional[bool] = None,
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin)
):
    return await PlatformUserQueryService(db).offset_page(
        skip=skip,
        limit=limit,
        search=search,
        role=role,
        organization_id=org_id,
        two_fa_enabled=two_fa_enabled,
        is_active=is_active,
    )

@router.get("/global-users/cursor")
@router.get("/users/cursor")
async def get_platform_users_cursor(
    search: Optional[str] = Query(None, max_length=120),
    role: Optional[str] = Query(None, max_length=80),
    org_id: Optional[uuid.UUID] = None,
    two_fa_enabled: Optional[bool] = None,
    is_active: Optional[bool] = None,
    cursor: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin),
):
    """Cursor replacement for large platform-user reads; offset remains compatible."""
    return await PlatformUserQueryService(db).cursor_page(
        cursor=cursor,
        limit=limit,
        search=search,
        role=role,
        organization_id=org_id,
        two_fa_enabled=two_fa_enabled,
        is_active=is_active,
    )


# C2: Force logout (revoke all sessions)
class UserAdminActionRequest(BaseModel):
    reason: str = Field(..., min_length=12, max_length=1000)

@router.delete("/users/{user_id}/sessions")
async def force_logout_user(
    user_id: uuid.UUID,
    payload: UserAdminActionRequest,
    step_up: StepUpAuth,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    del step_up
    revoked = await IdentityAdminCommandService(db).force_logout(
        user_id=user_id,
        actor=current_user,
        reason=payload.reason,
    )
    return {"revoked": revoked}


# C3: Reset 2FA
@router.delete("/users/{user_id}/2fa")
async def reset_user_2fa(
    user_id: uuid.UUID,
    step_up: StepUpAuth,
    payload: UserAdminActionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    del step_up
    await IdentityAdminCommandService(db).reset_2fa(
        user_id=user_id,
        actor=current_user,
        reason=payload.reason,
    )
    return {"success": True}


# C4: Audit logs with real diff viewer support
@router.get("/audit")
async def get_audit_logs(
    action_type: Optional[str] = None,
    resource_type: Optional[str] = None,
    actor_user_id: Optional[uuid.UUID] = None,
    organization_id: Optional[uuid.UUID] = None,
    is_sensitive: Optional[bool] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    include_state: bool = False,
    skip: int = 0,
    limit: int = 50,
    cursor: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin)
):
    parsed_cursor = None
    parsed_cursor_id = None
    if cursor:
        normalized = cursor
        if "|" in cursor:
            normalized, cursor_id_raw = cursor.rsplit("|", 1)
            if " " in normalized:
                parts = normalized.rsplit(" ", 1)
                if len(parts) == 2 and ":" in parts[1]:
                    normalized = "+".join(parts)
            try:
                parsed_cursor_id = uuid.UUID(cursor_id_raw)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid cursor format")
        elif " " in cursor:
            parts = cursor.rsplit(" ", 1)
            if len(parts) == 2 and ":" in parts[1]:
                normalized = "+".join(parts)
        try:
            parsed_cursor = datetime.fromisoformat(normalized)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid cursor format")
    results, total, action_counts, has_next = await AuditQueryService(db).list_platform_audit(
        action_type=action_type,
        resource_type=resource_type,
        actor_user_id=actor_user_id,
        organization_id=organization_id,
        is_sensitive=is_sensitive,
        date_from=date_from,
        date_to=date_to,
        cursor_time=parsed_cursor,
        cursor_id=parsed_cursor_id,
        skip=skip,
        limit=limit,
        include_state=include_state,
    )
    next_cursor = None
    if has_next and results:
        next_cursor = f"{results[-1]['occurred_at']}|{results[-1]['id']}"
    return {
        "items": results,
        "total": total,
        "action_counts": action_counts,
        "has_next": has_next,
        "next_cursor": next_cursor,
    }


# C5: Security events (real data from identity.security_events)
@router.get("/security/events")
async def get_security_events(
    severity: Optional[str] = None,
    event_type: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin)
):
    return await PlatformSecurityEventQueryService(db).dashboard_feed(
        severity=severity,
        event_type=event_type,
        skip=skip,
        limit=limit,
    )


# C6: Impersonation logs (real data)
@router.get("/impersonation-logs")
async def get_impersonation_logs(
    skip: int = 0, limit: int = 20,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin)
):
    rows, total, summary = await AuditQueryService(db).list_impersonation_logs(
        skip=skip,
        limit=limit,
    )
    return {
        "items": rows,
        "total": total,
        "summary": summary,
    }


# ── Organization Status Update (Suspend / Activate) ────────────

@router.patch("/organizations/{org_id}/status")
async def update_organization_status(
    org_id: uuid.UUID,
    payload: OrgStatusUpdate,
    step_up: StepUpAuth,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Suspend or activate an organization (SUPER_ADMIN only)."""
    _governed_commercial_workflow_required("capability-restriction-request")
    del step_up
    is_auth = (current_user.platform_role in ["SUPER_ADMIN", "SUPPORT_ADMIN"]) or current_user.role == "super_admin" or getattr(current_user, "is_platform_admin", False)
    if not is_auth:
        raise HTTPException(status_code=403, detail="SUPER_ADMIN or SUPPORT_ADMIN required")
    await OrganizationCommandService(db).update_status(
        organization_id=org_id,
        actor=current_user,
        is_active=payload.is_active,
        suspension_reason=payload.suspension_reason,
    )
    return {"message": f"Organization {'suspended' if not payload.is_active else 'activated'} successfully"}


@router.get("/organizations/{org_id}/dossier")
async def get_organization_dossier(
    org_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin),
):
    """Return a coherent, point-in-time command-center view of one tenant."""
    dossier = await OrganizationConsoleQueryService(db).organization_dossier(
        organization_id=org_id
    )
    if dossier is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    return dossier

@router.delete("/organizations/{org_id}")
async def delete_organization(
    org_id: uuid.UUID,
    payload: ReasonRequiredRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Refuse destructive tenant deletion until the retention workflow exists."""
    is_super = current_user.platform_role == "SUPER_ADMIN" or current_user.role == "super_admin" or getattr(current_user, "is_platform_admin", False)
    if not is_super:
        raise HTTPException(status_code=403, detail="SUPER_ADMIN required")
        
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "code": "RETENTION_WORKFLOW_REQUIRED",
            "message": "Organizations cannot be hard deleted. Suspend the tenant until an approved retention and deletion workflow is available.",
        },
    )



# ── Applications Registry ──────────────────────────────────────

@router.get("/applications")
async def list_platform_applications(
    _: User = Depends(require_platform_admin),
):
    """List the platform application registry (Super Admin)."""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Application registry is unavailable until persisted release and health records are authoritative",
    )


# ── Impersonation Logs ─────────────────────────────────────────

class ImpersonateStartRequest(BaseModel):
    reason: str

@router.post("/impersonate/{user_id}")
async def start_impersonation(
    user_id: uuid.UUID,
    payload: ImpersonateStartRequest,
    request: Request,
    step_up: StepUpAuth,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin),
):
    """Start an impersonation session and return an access token."""
    # 1. Fetch target user
    target_user = await db.get(User, user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="Target user not found")

    # 2. Generate secure impersonation access token
    from app.modules.identity.services import auth_service
    token = auth_service.create_access_token(
        target_user,
        mfa_authenticated_at=step_up.auth_time,
        impersonator_id=current_user.id,
        expires_minutes=15,
    )
    token_hash = hashlib.sha256(token.encode()).hexdigest()

    # 3. Create ImpersonationLog row
    started_at = datetime.now(timezone.utc)
    session_expires_at = started_at + timedelta(minutes=15)
    
    ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else None)
    ua = request.headers.get("User-Agent")

    log = ImpersonationLog(
        super_admin_id=current_user.id,
        target_organization_id=target_user.organization_id,
        target_user_id=user_id,
        reason=payload.reason,
        started_at=started_at,
        session_expires_at=session_expires_at,
        ip_address=ip,
        user_agent=ua,
        session_token_hash=token_hash,
    )
    db.add(log)
    await commit_transaction(db)
    await db.refresh(log)

    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": 900,
        "session_id": log.id,
    }


@router.get("/impersonation-logs")
async def list_impersonation_logs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin),
    skip: int = 0,
    limit: int = 50,
):
    """Compatibility response backed by the shared impersonation query service."""
    rows, total, _summary = await AuditQueryService(db).list_impersonation_logs(
        skip=skip,
        limit=limit,
    )
    return {"total": total, "items": rows}


@router.post("/impersonation/{session_id}/end")
async def end_impersonation(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin),
):
    """End an active impersonation session by recording ended_at/terminated_at."""
    log = await db.get(ImpersonationLog, session_id)
    if not log:
        raise HTTPException(status_code=404, detail="Impersonation session not found")

    if log.terminated_at is not None:
        return {"message": "Impersonation session already ended"}

    log.terminated_at = datetime.now(timezone.utc)
    await commit_transaction(db)
    return {"message": "Impersonation session ended successfully"}


@router.get("/audit")
async def get_platform_audit(
    action_type: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    actor_user_id: Optional[uuid.UUID] = Query(None),
    organization_id: Optional[uuid.UUID] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    is_sensitive: Optional[bool] = Query(None),
    include_state: bool = Query(False),
    cursor: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin),
):
    """
    Super Admin endpoint to query the global audit trail.
    Uses cursor-based pagination and supports state-masking by default.
    """
    cursor_time = None
    cursor_id = None
    if cursor:
        try:
            decoded = json.loads(base64.urlsafe_b64decode(cursor.encode("utf-8")).decode("utf-8"))
            cursor_time = datetime.fromisoformat(decoded["occurred_at"])
            cursor_id = uuid.UUID(decoded["id"])
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Invalid pagination cursor") from exc
    results, total, action_counts, has_next = await AuditQueryService(db).list_platform_audit(
        action_type=action_type, resource_type=resource_type,
        actor_user_id=actor_user_id, organization_id=organization_id,
        date_from=date_from, date_to=date_to, is_sensitive=is_sensitive,
        cursor_time=cursor_time, cursor_id=cursor_id, skip=0, limit=limit,
        include_state=include_state,
    )
    next_cursor = f"{results[-1]['occurred_at']}|{results[-1]['id']}" if has_next and results else None
    return {"items": results, "next_cursor": next_cursor, "has_next": has_next,
            "total": total, "action_counts": action_counts}

    import base64
    import json
    from app.modules.audit.models.audit_log import AuditLog

    def decode_cursor(cursor_str: str) -> tuple[datetime, uuid.UUID]:
        try:
            cursor_bytes = base64.urlsafe_b64decode(cursor_str.encode("utf-8"))
            cursor_data = json.loads(cursor_bytes.decode("utf-8"))
            return datetime.fromisoformat(cursor_data["occurred_at"]), uuid.UUID(cursor_data["id"])
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid pagination cursor")

    def encode_cursor(occurred_at: datetime, record_id: uuid.UUID) -> str:
        cursor_data = {
            "occurred_at": occurred_at.isoformat(),
            "id": str(record_id)
        }
        cursor_bytes = json.dumps(cursor_data).encode("utf-8")
        return base64.urlsafe_b64encode(cursor_bytes).decode("utf-8")

    stmt = select(AuditLog)

    if action_type:
        stmt = stmt.where(AuditLog.action_type == action_type)
    if resource_type:
        stmt = stmt.where(AuditLog.resource_type == resource_type)
    if actor_user_id:
        stmt = stmt.where(AuditLog.actor_user_id == actor_user_id)
    if organization_id:
        stmt = stmt.where(AuditLog.organization_id == organization_id)
    if date_from:
        stmt = stmt.where(AuditLog.occurred_at >= date_from)
    if date_to:
        stmt = stmt.where(AuditLog.occurred_at <= date_to)
    if is_sensitive is not None:
        stmt = stmt.where(AuditLog.is_sensitive == is_sensitive)

    if cursor:
        cursor_occurred_at, cursor_id = decode_cursor(cursor)
        stmt = stmt.where(
            or_(
                AuditLog.occurred_at < cursor_occurred_at,
                and_(
                    AuditLog.occurred_at == cursor_occurred_at,
                    AuditLog.id < cursor_id
                )
            )
        )

    stmt = stmt.order_by(desc(AuditLog.occurred_at), desc(AuditLog.id)).limit(limit + 1)
    result = await db.execute(stmt)
    logs = result.scalars().all()

    has_next = len(logs) > limit
    if has_next:
        logs = logs[:limit]
        next_cursor = encode_cursor(logs[-1].occurred_at, logs[-1].id)
    else:
        next_cursor = None

    items = []
    for log in logs:
        item = {
            "id": str(log.id),
            "request_id": str(log.request_id) if log.request_id else None,
            "correlation_id": str(log.correlation_id) if log.correlation_id else None,
            "organization_id": str(log.organization_id) if log.organization_id else None,
            "actor_user_id": str(log.actor_user_id) if log.actor_user_id else None,
            "resource_type": log.resource_type,
            "resource_id": str(log.resource_id) if log.resource_id else None,
            "action_type": log.action_type,
            "actor_role": log.actor_role,
            "actor_ip": log.actor_ip,
            "actor_user_agent": log.actor_user_agent,
            "geo_location": log.geo_location,
            "row_hash": log.row_hash,
            "occurred_at": log.occurred_at.isoformat() if log.occurred_at else None,
            "retention_until": log.retention_until.isoformat() if log.retention_until else None,
            "is_sensitive": log.is_sensitive,
            "impersonated_by": str(log.impersonated_by) if log.impersonated_by else None,
        }
        if include_state:
            item["old_state"] = log.old_state
            item["new_state"] = log.new_state
            item["change_diff"] = log.change_diff
        items.append(item)

    return {
        "items": items,
        "next_cursor": next_cursor,
        "has_next": has_next
    }


@router.post("/audit/export")
async def export_audit_logs(
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Trigger audit log export (Super Admin)."""
    raise HTTPException(
        status_code=501,
        detail={
            "code": "AUDIT_EXPORT_NOT_AVAILABLE",
            "message": (
                "Audit export requires a durable export-job record, authorization-gated "
                "download endpoint, and immutable export audit trail before it can be enabled."
            ),
            "requested_format": payload.get("format", "csv"),
            "required_contract": "durable_export_job",
        },
    )


# ── Platform Health Check ─────────────────────────────────────

@router.get("/health")
async def get_platform_health(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin)
):
    from app.modules.platform_health.router import collect_platform_health

    try:
        return await collect_platform_health(db)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Platform health collection failed",
        ) from exc


# TASK 10: Celery queue depths from Redis
@router.get("/operations/queues")
async def get_queue_stats(
    _: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
):
    return await PlatformOperationsQueryService(db).queue_stats()

    import redis.asyncio as aioredis
    r = aioredis.from_url(settings.REDIS_URL)
    queues = ['default', 'files', 'sync', 'notifications',
              'imports', 'reports', 'webhooks', 'maintenance']
    stats = []
    try:
        for q in queues:
            length = await r.llen(q)
            stats.append({
                "name": q,
                "depth": length,
                "status": "HEALTHY" if length < 100
                         else "DEGRADED" if length < 500
                         else "OVERLOADED",
                "oldest_message_age_seconds": None,
                "dead_letter_depth": None,
                "worker_status": "UNVERIFIED",
                "freshness_at": datetime.now(timezone.utc).isoformat(),
            })
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Queue telemetry is unavailable because the broker could not be reached",
        ) from exc
    finally:
        await r.aclose()
    return stats


# D2: Database monitoring
@router.get("/operations/database")
async def get_database_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin)
):
    return await PlatformOperationsQueryService(db).database_stats()

    # Connection stats
    conn_stats = await db.execute(text("""
    SELECT count(*) as total,
           count(*) FILTER (WHERE state = 'active') as active,
           count(*) FILTER (WHERE state = 'idle') as idle,
           count(*) FILTER (WHERE wait_event_type = 'Lock') as waiting
    FROM pg_stat_activity WHERE datname = current_database()
    """))
    c = conn_stats.fetchone()
    
    # Slow queries (with safe catalog check to prevent aborting transactions)
    slow_queries = []
    slow_query_stats_available = False
    try:
        check = await db.execute(text("""
        SELECT EXISTS (
            SELECT 1 FROM pg_views WHERE viewname = 'pg_stat_statements'
        )
        """))
        has_statements = check.scalar() or False
        if has_statements:
            slow_query_stats_available = True
            slow_q = await db.execute(text("""
            SELECT query, round(mean_exec_time::numeric, 2) as avg_ms, calls
            FROM pg_stat_statements
            WHERE mean_exec_time > 100
            ORDER BY mean_exec_time DESC LIMIT 10
            """))
            slow_queries = [{"query": r.query[:120], "avg_ms": float(r.avg_ms), "calls": r.calls} for r in slow_q]
    except Exception:
        slow_query_stats_available = False
    
    # Table sizes
    table_sizes = await db.execute(text("""
    SELECT schemaname || '.' || tablename as table_name,
           pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
           pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
    FROM pg_tables
    WHERE schemaname NOT IN ('pg_catalog','information_schema')
    ORDER BY size_bytes DESC LIMIT 10
    """))
    
    # Cache hit ratio
    cache_hit = await db.execute(text("""
    SELECT round(
        sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0) * 100, 2
    ) as ratio FROM pg_statio_user_tables
    """))
    cache_ratio = cache_hit.scalar() or 0
    
    # DB size
    db_size = await db.scalar(text("SELECT pg_database_size(current_database())"))
    
    # Dead tuples
    dead_tuples = await db.scalar(text(
        "SELECT SUM(n_dead_tup) FROM pg_stat_user_tables"
    )) or 0

    migration_revision = None
    if await db.scalar(text("SELECT to_regclass('public.alembic_version') IS NOT NULL")):
        migration_revision = await db.scalar(text("SELECT version_num FROM public.alembic_version LIMIT 1"))
    rls_row = (await db.execute(text("""
        SELECT COUNT(*) FILTER (WHERE relrowsecurity) AS enabled,
               COUNT(*) FILTER (WHERE relforcerowsecurity) AS forced
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind='r' AND n.nspname NOT IN ('pg_catalog','information_schema')
    """))).one()
    
    return {
        "connections": {"total": c.total, "active": c.active, "idle": c.idle, "waiting": c.waiting},
        "slow_queries": slow_queries,
        "slow_query_stats_available": slow_query_stats_available,
        "table_sizes": [{"name": r.table_name, "size": r.size, "bytes": r.size_bytes} for r in table_sizes],
        "cache_hit_ratio": float(cache_ratio),
        "database_size_bytes": db_size,
        "dead_tuples": dead_tuples,
        "migration": {"current_revision": migration_revision, "expected_revision": None, "status": "UNVERIFIED" if migration_revision is None else "OBSERVED"},
        "rls": {"enabled_tables": rls_row.enabled, "forced_tables": rls_row.forced, "status": "OBSERVED"},
        "backup": {"status": "UNVERIFIED", "latest_backup_at": None, "latest_restore_test_at": None},
        "freshness_at": datetime.now(timezone.utc).isoformat(),
    }


# D3: Background jobs aggregate over existing domain job tables.
@router.get("/operations/jobs")
async def get_background_jobs(
    status: Optional[str] = None,
    queue: Optional[str] = None,
    organization_id: Optional[UUID] = None,
    event_id: Optional[UUID] = None,
    source: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin)
):
    return await PlatformOperationsQueryService(db).background_jobs(
        status=status, queue=queue, organization_id=organization_id,
        event_id=event_id, source=source, skip=skip, limit=limit,
    )

    async def table_exists(regclass_name: str) -> bool:
        return bool(await db.scalar(text("SELECT to_regclass(:table_name)"), {"table_name": regclass_name}))

    def normalize_status(raw_status: Optional[str]) -> str:
        value = (raw_status or "queued").lower()
        if value in {"uploaded", "validating", "validated", "pending", "queued", "scheduled"}:
            return "queued"
        if value in {"importing", "indexing", "processing", "in_progress", "running"}:
            return "running"
        if value in {"completed", "success", "succeeded"}:
            return "success"
        if value in {"retrying"}:
            return "retrying"
        if value in {"failed", "scan_failed", "upload_failed", "processing_failed"}:
            return "failed"
        return value

    def duration_seconds(started_at: Any, finished_at: Any) -> Optional[float]:
        if not started_at or not finished_at:
            return None
        return max((finished_at - started_at).total_seconds(), 0.0)

    source_queries = [
        {
            "table": "registration.import_jobs",
            "source": "registration_import",
            "sql": """
                SELECT j.id::text AS id,
                       j.id::text AS job_id,
                       e.organization_id::text AS organization_id,
                       j.event_id::text AS event_id,
                       j.status,
                       j.created_at AS started_at,
                       j.completed_at AS finished_at,
                       ('registration.import.' || COALESCE(j.job_type, 'schedule')) AS task_name,
                       'imports' AS queue,
                       NULL::text AS error_message
                FROM registration.import_jobs j JOIN events.events e ON e.id=j.event_id
                ORDER BY j.created_at DESC
                LIMIT 500
            """,
        },
        {
            "table": "search.search_jobs",
            "source": "search_index",
            "sql": """
                SELECT id::text AS id,
                       id::text AS job_id,
                       organization_id::text AS organization_id,
                       NULL::text AS event_id,
                       status,
                       created_at AS started_at,
                       finished_at,
                       'search.reindex' AS task_name,
                       'search' AS queue,
                       CASE WHEN error_code IS NULL THEN NULL ELSE 'Failure detail available' END AS error_message
                FROM search.search_jobs
                ORDER BY created_at DESC
                LIMIT 500
            """,
        },
        {
            "table": "presentations.processing_jobs",
            "source": "presentation_processing",
            "sql": """
                SELECT j.id::text AS id,
                       j.id::text AS job_id,
                       e.organization_id::text AS organization_id,
                       f.event_id::text AS event_id,
                       j.status,
                       j.created_at AS started_at,
                       NULL::timestamptz AS finished_at,
                       'presentation.processing' AS task_name,
                       'presentations' AS queue,
                       CASE WHEN j.logs IS NULL THEN NULL ELSE 'Failure detail available' END AS error_message
                FROM presentations.processing_jobs j JOIN presentations.files f ON f.id=j.file_id JOIN events.events e ON e.id=f.event_id
                ORDER BY j.created_at DESC
                LIMIT 500
            """,
        },
        {
            "table": "registration.badge_print_jobs",
            "source": "badge_print",
            "sql": """
                SELECT j.id::text AS id,
                       j.id::text AS job_id,
                       e.organization_id::text AS organization_id,
                       p.event_id::text AS event_id,
                       j.status,
                       j.queued_at AS started_at,
                       j.printed_at AS finished_at,
                       'badge.print' AS task_name,
                       'badges' AS queue,
                       NULL::text AS error_message
                FROM registration.badge_print_jobs j JOIN registration.badges b ON b.id=j.badge_id JOIN registration.participants p ON p.id=b.participant_id JOIN events.events e ON e.id=p.event_id
                ORDER BY j.queued_at DESC
                LIMIT 500
            """,
        },
        {
            "table": "venue.sync_jobs",
            "source": "venue_sync",
            "sql": """
                SELECT j.id::text AS id,
                       j.id::text AS job_id,
                       e.organization_id::text AS organization_id,
                       j.event_id::text AS event_id,
                       j.status,
                       COALESCE(j.started_at, j.created_at) AS started_at,
                       j.completed_at AS finished_at,
                       ('venue.sync.' || COALESCE(j.sync_type, 'download')) AS task_name,
                       'venue-sync' AS queue,
                       CASE WHEN j.error_message IS NULL THEN NULL ELSE 'Failure detail available' END AS error_message
                FROM venue.sync_jobs j JOIN events.events e ON e.id=j.event_id
                ORDER BY j.created_at DESC
                LIMIT 500
            """,
        },
    ]

    items: List[Dict[str, Any]] = []
    unavailable_sources: List[Dict[str, str]] = []

    for source in source_queries:
        if not await table_exists(source["table"]):
            unavailable_sources.append({
                "source": source["source"],
                "reason": f"{source['table']} is not present in this database.",
            })
            continue
        try:
            result = await db.execute(text(source["sql"]))
            for row in result.mappings():
                normalized = normalize_status(row.get("status"))
                item = {
                    "id": row["id"],
                    "job_id": row["job_id"],
                    "organization_id": row.get("organization_id"),
                    "event_id": row.get("event_id"),
                    "status": normalized,
                    "raw_status": row.get("status"),
                    "started_at": row["started_at"].isoformat() if row.get("started_at") else None,
                    "finished_at": row["finished_at"].isoformat() if row.get("finished_at") else None,
                    "duration_seconds": duration_seconds(row.get("started_at"), row.get("finished_at")),
                    "task_name": row.get("task_name"),
                    "queue": row.get("queue"),
                    "source": source["source"],
                    "error_message": row.get("error_message") if normalized == "failed" else None,
                    "capabilities": {
                        "retry": source["source"] == "search_index" and normalized == "failed",
                        "cancel": source["source"] == "search_index" and normalized == "queued",
                    },
                }
                items.append(item)
        except Exception as exc:
            unavailable_sources.append({
                "source": source["source"],
                "reason": f"Could not read {source['table']}: {exc.__class__.__name__}",
            })

    if queue and queue != "ALL":
        items = [item for item in items if item.get("queue") == queue]
    if source:
        items = [item for item in items if item.get("source") == source]
    if organization_id:
        items = [item for item in items if item.get("organization_id") == str(organization_id)]
    if event_id:
        items = [item for item in items if item.get("event_id") == str(event_id)]
    if status:
        normalized_filter = normalize_status(status)
        items = [item for item in items if item.get("status") == normalized_filter]

    items.sort(key=lambda item: item.get("started_at") or "", reverse=True)
    total = len(items)
    paged_items = items[skip: skip + limit]
    completed_24h_cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    completed_24h = [
        item for item in items
        if item["status"] == "success"
        and item.get("finished_at")
        and datetime.fromisoformat(item["finished_at"]) >= completed_24h_cutoff
    ]
    failed_24h = [
        item for item in items
        if item["status"] == "failed"
        and item.get("started_at")
        and datetime.fromisoformat(item["started_at"]) >= completed_24h_cutoff
    ]
    completed_total = len([item for item in items if item["status"] == "success"])
    failed_total = len([item for item in items if item["status"] == "failed"])
    terminal_total = completed_total + failed_total
    durations = [
        item["duration_seconds"] * 1000
        for item in items
        if item.get("duration_seconds") is not None
    ]
    summary = {
        "running": len([item for item in items if item["status"] == "running"]),
        "pending": len([item for item in items if item["status"] == "queued"]),
        "queued": len([item for item in items if item["status"] == "queued"]),
        "completed_24h": len(completed_24h),
        "failed_24h": len(failed_24h),
        "success_rate": round((completed_total / terminal_total) * 100, 2) if terminal_total else 0.0,
        "avg_duration_ms": round(sum(durations) / len(durations), 2) if durations else 0.0,
        "total_jobs": total,
        "active_jobs": len([item for item in items if item["status"] in {"queued", "running", "retrying"}]),
        "total_executions": total,
        "succeeded": completed_total,
        "failed": failed_total,
        "retrying": len([item for item in items if item["status"] == "retrying"]),
        "unavailable_sources": unavailable_sources,
    }

    return {
        "items": paged_items,
        "summary": summary,
        "total": total,
        "skip": skip,
        "limit": limit,
        "unavailable_sources": unavailable_sources,
    }


class FeatureOverrideItem(BaseModel):
    feature_id: UUID
    override: Optional[bool] = None  # None = remove override


class FeatureOverrideBulkRequest(BaseModel):
    overrides: list[FeatureOverrideItem]
    reason: str = Field(..., min_length=8, max_length=1000)


# E1: Get org feature overrides (3-state: null=plan_default, true=force_enable, false=force_disable)
@router.get("/organizations/{org_id}/feature-overrides")
async def get_org_feature_overrides(
    org_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin)
):
    return await OrganizationConsoleQueryService(db).organization_feature_overrides(
        organization_id=org_id
    )


# E2: Save feature overrides (bulk)
@router.put("/organizations/{org_id}/feature-overrides")
async def save_org_feature_overrides(
    org_id: UUID,
    payload: FeatureOverrideBulkRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    _governed_commercial_workflow_required("entitlement-override-request")
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    audit_changes = []
    for item in payload.overrides:
        feature = await db.get(FeatureCatalog, item.feature_id)
        if not feature:
            raise HTTPException(status_code=404, detail=f"Feature not found: {item.feature_id}")

        existing = await db.scalar(
            select(OrganizationFeature)
            .where(
                OrganizationFeature.organization_id == org_id,
                OrganizationFeature.feature_id == item.feature_id
            )
        )
        previous_override = existing.is_enabled if existing else None
        if item.override is None:
            # Remove override (revert to plan default)
            if existing:
                await db.delete(existing)
        else:
            if existing:
                existing.is_enabled = item.override
                existing.override_by = current_user.id
                existing.override_at = datetime.now(timezone.utc)
            else:
                db.add(OrganizationFeature(
                    organization_id=org_id,
                    feature_id=item.feature_id,
                    is_enabled=item.override,
                    override_by=current_user.id,
                    override_at=datetime.now(timezone.utc)
                ))
        audit_changes.append({
            "feature_id": str(item.feature_id),
            "feature_key": feature.key,
            "previous_override": previous_override,
            "new_override": item.override,
        })
    
    # Save ORM AuditLog to automatically trigger row hashing hook
    log = AuditLog(
        id=uuid.uuid4(),
        actor_user_id=current_user.id,
        organization_id=org_id,
        action_type="FEATURE_OVERRIDE",
        resource_type="organization",
        resource_id=org_id,
        old_state={"organization_id": str(org_id), "organization_name": org.name},
        new_state={"overrides_updated": len(payload.overrides), "changes": audit_changes},
        change_diff={"reason": payload.reason},
        is_sensitive=True,
        occurred_at=datetime.now(timezone.utc)
    )
    db.add(log)
    
    await commit_transaction(db)
    return {"success": True, "updated": len(payload.overrides)}


# ── Subscription Health Summary ───────────────────────────────

@router.get("/subscriptions/health-summary")
async def get_subscriptions_health_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Get count metrics per subscription status."""
    del current_user
    return await PlatformCommercialCatalogQueryService(db).subscription_health_summary()


# ── Change Organization Plan ──────────────────────────────────

class ChangePlanRequest(BaseModel):
    plan_id: uuid.UUID
    reason: str = Field(..., min_length=8, max_length=1000)
@router.patch("/organizations/{org_id}/subscription/plan")
async def change_organization_plan(
    org_id: uuid.UUID,
    payload: ChangePlanRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Change the plan tier for an organization."""
    _governed_commercial_workflow_required("commercial-access-request")
    sub = await _get_current_subscription(db, org_id, with_plan=True)
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
        
    plan = await db.get(SubscriptionPlan, payload.plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Selected plan not found")
        
    old_plan_name = sub.plan.name if sub.plan else "None"
    old_state = {
        "subscription_id": str(sub.id),
        "plan_id": str(sub.plan_id) if sub.plan_id else None,
        "plan_name": old_plan_name,
        "status": sub.status,
    }
    sub.plan_id = payload.plan_id
    
    # 3. INSERT commerce.financial_audit_trail (activity_type='PLAN_CHANGED')
    audit_trail = FinancialAuditTrail(
        activity_type='PLAN_CHANGED',
        entity_type='SUBSCRIPTION',
        entity_id=sub.id,
        organization_id=org_id,
        performed_by=current_user.id,
        details={
            "from_plan": old_plan_name,
            "to_plan": plan.name,
            "reason": payload.reason,
            "actor": str(current_user.id)
        }
    )
    db.add(audit_trail)
    
    # 4. INSERT commerce.payment_events (event_type='PLAN_CHANGE', metadata={'from_plan': old_plan_name, 'to_plan': new_plan_name})
    log = ActivityTimeline(
        organization_id=org_id,
        actor_id=current_user.id,
        action_type="PLAN_CHANGE",
        metadata_data={
            "from_plan": old_plan_name,
            "to_plan": plan.name,
            "reason": payload.reason,
            "actor": str(current_user.id)
        }
    )
    db.add(log)
    db.add(AuditLog(
        actor_user_id=current_user.id,
        organization_id=org_id,
        action_type="PLAN_CHANGED",
        resource_type="subscription",
        resource_id=sub.id,
        old_state=old_state,
        new_state={
            "subscription_id": str(sub.id),
            "plan_id": str(sub.plan_id),
            "plan_name": plan.name,
            "status": sub.status,
        },
        change_diff={"reason": payload.reason},
        is_sensitive=True,
        occurred_at=datetime.now(timezone.utc),
    ))
    
    await commit_transaction(db)
    return {
        "success": True,
        "new_plan_name": plan.name
    }


# ── Remove Organization Subscription ──────────────────────────

@router.delete("/organizations/{org_id}/subscription")
async def delete_organization_subscription(
    org_id: uuid.UUID,
    payload: ReasonRequiredRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Delete the active subscription, addons, and limits override for an organization (Super Admin)."""
    _governed_commercial_workflow_required("commercial-access-request")


# ── Extend Organization Trial ─────────────────────────────────

class ExtendTrialRequest(BaseModel):
    days: int = Field(ge=1, le=90)
    reason: str = Field(..., min_length=8, max_length=1000)
@router.patch("/organizations/{org_id}/trial/extend")
async def extend_organization_trial(
    org_id: uuid.UUID,
    payload: ExtendTrialRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Extend the trial period for an organization's subscription."""
    _governed_commercial_workflow_required("entitlement-override-request")
    sub = await _get_current_subscription(db, org_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    old_state = {
        "subscription_id": str(sub.id),
        "status": sub.status,
        "trial_ends_at": sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
    }
    current_trial = sub.trial_ends_at or datetime.now(timezone.utc)
    if current_trial.tzinfo is None:
        current_trial = current_trial.replace(tzinfo=timezone.utc)
        
    new_trial = current_trial + timedelta(days=payload.days)
    sub.trial_ends_at = new_trial
    sub.status = 'TRIAL'
    
    # 4. INSERT into commerce.financial_audit_trail:
    audit_trail = FinancialAuditTrail(
        activity_type='TRIAL_EXTENDED',
        entity_type='SUBSCRIPTION',
        entity_id=sub.id,
        organization_id=org_id,
        performed_by=current_user.id,
        details={
            "days": payload.days,
            "reason": payload.reason,
            "new_end": new_trial.isoformat()
        }
    )
    db.add(audit_trail)
    
    # 5. INSERT into commerce.payment_events:
    log = ActivityTimeline(
        organization_id=org_id,
        actor_id=current_user.id,
        action_type="TRIAL_EXTENDED",
        metadata_data={
            "days": payload.days,
            "reason": payload.reason,
            "actor": str(current_user.id)
        }
    )
    db.add(log)
    db.add(AuditLog(
        actor_user_id=current_user.id,
        organization_id=org_id,
        action_type="TRIAL_EXTENDED",
        resource_type="subscription",
        resource_id=sub.id,
        old_state=old_state,
        new_state={
            "subscription_id": str(sub.id),
            "status": sub.status,
            "trial_ends_at": sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
        },
        change_diff={"days": payload.days, "reason": payload.reason},
        is_sensitive=True,
        occurred_at=datetime.now(timezone.utc),
    ))
    
    await commit_transaction(db)
    return {
        "success": True,
        "new_trial_ends_at": new_trial.isoformat()
    }


# ── Apply Billing Credit ──────────────────────────────────────

class ApplyCreditRequest(BaseModel):
    amount: float = Field(gt=0)
    currency: str = "USD"
    reason: str = Field(..., min_length=8, max_length=1000)

@router.post("/organizations/{org_id}/apply-credit")
async def apply_organization_credit(
    org_id: uuid.UUID,
    payload: ApplyCreditRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Apply a manual billing credit to an organization."""
    _governed_commercial_workflow_required("financial-adjustment-request")
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Write to Activity Timeline (acts as a payment/credit event log)
    log = ActivityTimeline(
        organization_id=org_id,
        actor_id=current_user.id,
        action_type="CREDIT_APPLIED",
        metadata_data={
            "amount": payload.amount,
            "currency": payload.currency,
            "reason": payload.reason,
            "by": str(current_user.id)
        }
    )
    db.add(log)
    db.add(AuditLog(
        actor_user_id=current_user.id,
        organization_id=org_id,
        action_type="CREDIT_APPLIED",
        resource_type="organization",
        resource_id=org_id,
        old_state=None,
        new_state={
            "amount": payload.amount,
            "currency": payload.currency,
        },
        change_diff={"reason": payload.reason},
        is_sensitive=True,
        occurred_at=datetime.now(timezone.utc),
    ))
    await commit_transaction(db)
    return {"message": "Credit applied successfully", "amount": payload.amount}


# ── Tenant Limits Override ────────────────────────────────────

class TenantLimitsUpdateRequest(BaseModel):
    limits: Dict[str, int]
    reason: str = Field(..., min_length=8, max_length=1000)

@router.get("/organizations/{org_id}/limits")
async def get_organization_limits(
    org_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Fetch customized limits overrides for a tenant."""
    del current_user
    return await OrganizationConsoleQueryService(db).organization_limits(
        organization_id=org_id
    )

@router.put("/organizations/{org_id}/limits")
async def update_organization_limits(
    org_id: uuid.UUID,
    payload: TenantLimitsUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Replace customized limits overrides for a tenant."""
    _governed_commercial_workflow_required("entitlement-override-request")
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    existing_limits = (await db.execute(
        select(TenantLimit).where(TenantLimit.organization_id == org_id)
    )).scalars().all()
    old_state = {limit.limit_key: limit.limit_value for limit in existing_limits}
    new_state = dict(payload.limits)

    await db.execute(delete(TenantLimit).where(TenantLimit.organization_id == org_id))

    for key, value in new_state.items():
        db.add(TenantLimit(organization_id=org_id, limit_key=key, limit_value=value))

    db.add(AuditLog(
        actor_user_id=current_user.id,
        organization_id=org_id,
        action_type="TENANT_LIMITS_UPDATED",
        resource_type="organization",
        resource_id=org_id,
        old_state=old_state,
        new_state=new_state,
        change_diff={"reason": payload.reason},
        is_sensitive=True,
        occurred_at=datetime.now(timezone.utc),
    ))
    db.add(ActivityTimeline(
        organization_id=org_id,
        actor_id=current_user.id,
        action_type="TENANT_LIMITS_UPDATED",
        metadata_data={
            "reason": payload.reason,
            "updated_keys": sorted(new_state.keys()),
            "by": str(current_user.id),
        },
    ))

    await commit_transaction(db)
    return {"message": "Limits updated successfully"}


# ── Custom Domain Management ──────────────────────────────────

class AddDomainRequest(BaseModel):
    domain: str
    reason: str = Field(..., min_length=8, max_length=1000)

class DeleteDomainRequest(BaseModel):
    reason: str = Field(..., min_length=8, max_length=1000)

class VerifyDomainRequest(BaseModel):
    reason: str = Field(..., min_length=8, max_length=1000)


@router.get("/public/branding")
async def get_public_organization_branding(
    response: Response,
    host: Optional[str] = Query(default=None, min_length=3, max_length=255),
    slug: Optional[str] = Query(default=None, min_length=2, max_length=100),
    db: AsyncSession = Depends(get_db),
):
    """Return only the currently published, entitlement-resolved brand shell."""
    if bool(host) == bool(slug):
        raise HTTPException(
            status_code=422,
            detail={"code": "BRAND_LOOKUP_REQUIRED", "message": "Supply exactly one of host or slug."},
        )
    if host:
        normalized_host = host.strip().lower().split(":", 1)[0].rstrip(".")
        if not re.fullmatch(r"[a-z0-9.-]+", normalized_host):
            raise HTTPException(status_code=422, detail={"code": "INVALID_HOST"})
        organization, profile = await OrganizationConsoleQueryService(db).public_branding_sources(
            host=normalized_host
        )
    else:
        normalized_slug = (slug or "").strip().lower()
        organization, profile = await OrganizationConsoleQueryService(db).public_branding_sources(
            slug=normalized_slug
        )
    if organization is None:
        raise HTTPException(status_code=404, detail="Organization brand not found")

    try:
        capabilities = await CapabilityService.resolve_organization(
            db,
            organization.id,
            environment=settings.environment.upper(),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={"code": "RESOLUTION_UNAVAILABLE"},
        ) from exc

    templates = dict(profile.templates or {}) if profile else {}
    white_capability = capabilities["features"].get("FEAT_WHITE_LABEL", {})
    login_capability = capabilities["features"].get("FEAT_CUSTOM_LOGIN_PAGE", {})

    def resolved_configuration(key: str, capability: dict) -> dict:
        configured = templates.get(key)
        if not isinstance(configured, dict) or not configured.get("enabled"):
            return {"enabled": False, "reason_code": "NOT_CONFIGURED"}
        if not capability.get("enabled"):
            return {
                "enabled": False,
                "reason_code": capability.get("reason_code") or "NOT_ENTITLED",
            }
        return configured

    safe_tokens = {
        key: value
        for key, value in (profile.tokens or {}).items()
        if re.fullmatch(r"[a-z][a-z0-9_]{0,63}", str(key))
        and isinstance(value, (str, int, float, bool))
        and "css" not in str(key).lower()
        and "script" not in str(key).lower()
    } if profile else {}
    async with TenantContextGuard.scoped(db, organization.id):
        def public_asset_url(reference: Any) -> Any:
            if not isinstance(reference, str) or not reference.lstrip("/").startswith(
                f"{organization.id}/"
            ):
                return reference
            return presentation_upload_service.create_presigned_download(
                bucket=settings.S3_BUCKET_ASSETS,
                storage_path=reference.lstrip("/"),
                expiry_seconds=300,
                inline=True,
            )

        public_assets = {
            key: public_asset_url(value)
            for key, value in (profile.assets or {}).items()
        } if profile else {}
        public_login = resolved_configuration("login_page", login_capability)
        for field in ("logo_asset_ref", "background_asset_ref"):
            if public_login.get(field):
                public_login[field.removesuffix("_ref") + "_url"] = public_asset_url(
                    public_login[field]
                )
                public_login.pop(field, None)

        response.headers["Cache-Control"] = "public, max-age=60, must-revalidate"
        return {
            "organization": {
                "slug": organization.slug,
                "name": organization.name,
            },
            "published": profile is not None,
            "published_version": profile.published_version if profile else None,
            "assets": public_assets,
            "tokens": safe_tokens,
            "white_label": resolved_configuration("white_label", white_capability),
            "login_page": public_login,
            "freshness_at": capabilities["freshness_at"],
        }


@router.get("/organizations/{org_id}/domains")
async def get_organization_domains(
    org_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """List domains associated with an organization."""
    del current_user
    return await OrganizationConsoleQueryService(db).organization_domains(
        organization_id=org_id
    )

@router.post("/organizations/{org_id}/domains")
async def add_organization_domain(
    org_id: uuid.UUID,
    payload: AddDomainRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Add a new custom domain for an organization."""
    await enforce_org_operation(
        db,
        org_id,
        "branding.custom_domain.manage",
        user_id=current_user.id,
    )
    dom = await OrganizationCommandService(db).add_domain(
        organization_id=org_id,
        actor=current_user,
        domain=payload.domain,
        reason=payload.reason,
    )
    return {
        "id": dom.id,
        "domain": dom.domain,
        "is_verified": dom.is_verified,
        "created_at": dom.created_at
    }

@router.delete("/organizations/{org_id}/domains/{domain_id}")
async def delete_organization_domain(
    org_id: uuid.UUID,
    domain_id: uuid.UUID,
    payload: DeleteDomainRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Remove a domain mapping."""
    await enforce_org_operation(
        db,
        org_id,
        "branding.custom_domain.manage",
        user_id=current_user.id,
    )
    await OrganizationCommandService(db).delete_domain(
        organization_id=org_id,
        domain_id=domain_id,
        actor=current_user,
        reason=payload.reason,
    )
    return {"message": "Domain mapping deleted"}

@router.post("/organizations/{org_id}/domains/{domain_id}/verify")
async def verify_organization_domain(
    org_id: uuid.UUID,
    domain_id: uuid.UUID,
    payload: VerifyDomainRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Mark a domain as verified and activate it as the primary custom domain."""
    await enforce_org_operation(
        db,
        org_id,
        "branding.custom_domain.manage",
        user_id=current_user.id,
    )
    dom = await OrganizationCommandService(db).verify_domain(
        organization_id=org_id,
        domain_id=domain_id,
        actor=current_user,
        reason=payload.reason,
    )
    return {"message": "Domain successfully verified", "domain": dom.domain}


# ── Organization Events Listing ───────────────────────────────

@router.get("/organizations/{org_id}/events")
async def get_organization_events(
    org_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """List all events of an organization along with participant counts."""
    rows = await OrganizationConsoleQueryService(db).events_with_registration_counts(
        organization_id=org_id
    )

    output = []
    for row in rows:
        output.append({
            "id": str(row.id),
            "name": row.name,
            "short_code": row.short_code,
            "status": row.status,
            "start_date": row.start_date.isoformat() if row.start_date else None,
            "end_date": row.end_date.isoformat() if row.end_date else None,
            "registration_count": row.registration_count or 0
        })
    return output


# ── Global Payment/Billing Events ─────────────────────────────

@router.get("/payment-events")
async def list_payment_events(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin),
    limit: int = 10
):
    """List recent billing/payment events platform-wide."""
    return await OrganizationConsoleQueryService(db).payment_events(limit=limit)


# ── Update User Status ────────────────────────────────────────

class UserStatusUpdateRequest(BaseModel):
    is_active: bool
    reason: str = Field(..., min_length=12, max_length=1000)


class UserPlatformRoleUpdateRequest(BaseModel):
    platform_role: Literal["SUPER_ADMIN", "SUPPORT_ADMIN", "FINANCE_ADMIN", "NONE"]
    reason: str = Field(..., min_length=12, max_length=1000)


@router.patch("/users/{user_id}/platform-role")
async def update_user_platform_role(
    user_id: uuid.UUID,
    payload: UserPlatformRoleUpdateRequest,
    step_up: StepUpAuth,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin),
):
    del step_up
    if current_user.role != "super_admin" and current_user.platform_role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin required")
    next_role, _ = await IdentityAdminCommandService(db).update_platform_role(
        user_id=user_id,
        actor=current_user,
        platform_role=payload.platform_role,
        reason=payload.reason,
    )
    return {"message": "Platform role updated", "platform_role": next_role}

@router.patch("/users/{user_id}/status")
async def update_user_status(
    user_id: uuid.UUID,
    payload: UserStatusUpdateRequest,
    step_up: StepUpAuth,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Enable or disable a user account globally."""
    del step_up
    revoked_sessions = await IdentityAdminCommandService(db).update_status(
        user_id=user_id,
        actor=current_user,
        is_active=payload.is_active,
        reason=payload.reason,
    )
    return {"message": f"User account {'activated' if payload.is_active else 'deactivated'} successfully"}


# ── Database Migration Helpers ───────────────────────────────

# ── Plans Extensions ──────────────────────────────────────────

class PlanPatchRequest(BaseModel):
    name: Optional[str] = None
    tagline: Optional[str] = None
    description: Optional[str] = None
    max_events: Optional[int] = None
    max_users: Optional[int] = None
    max_registrations: Optional[int] = None
    max_rooms: Optional[int] = None
    storage_quota_mb: Optional[int] = None
    is_active: Optional[bool] = None
    max_speakers: Optional[int] = None
    max_sessions: Optional[int] = None
    max_ticket_categories: Optional[int] = None
    max_badge_templates: Optional[int] = None
    max_certificate_templates: Optional[int] = None
    max_emails_per_event: Optional[int] = None
    price_per_event: Optional[float] = None
    currency: Optional[str] = None
    billing_model: Optional[str] = None
    display_order: Optional[int] = None
    is_popular: Optional[bool] = None
    color_hex: Optional[str] = None

@router.patch("/plans/{plan_id}")
async def patch_plan(
    plan_id: uuid.UUID,
    payload: PlanPatchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Retired Boolean/legacy-limit mutation route."""
    del plan_id, payload, db, current_user
    _governed_commercial_workflow_required("versioned-subscription-plan-update")


class TypedFeatureAssignmentPayload(BaseModel):
    feature_key: str
    name: Optional[str] = None
    value_type: str = "BOOLEAN"
    value: Any = True
    scope_type: str = "EVENT"
    enforcement_mode: Literal["HARD", "SOFT_WARNING", "METERED_OVERAGE"] = "HARD"
    hard_ceiling: Optional[int] = None
    allowed_values: Optional[List[str]] = None
    unit: Optional[str] = None
class PlanFeaturesBulkUpdate(BaseModel):
    feature_keys: Optional[List[str]] = Field(default=None)
    assignments: Optional[List[TypedFeatureAssignmentPayload]] = Field(default=None)

@router.get("/plans/{plan_id}/feature-assignments")
@router.get("/subscription-plans/{plan_id}/feature-assignments")
async def get_typed_plan_feature_assignments(plan_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_platform_admin)):
    assignments = await PlatformCommercialCatalogQueryService(db).plan_feature_assignments(
        plan_id=plan_id
    )
    if assignments is None:
        raise HTTPException(status_code=404, detail="Plan not found")
    return assignments


@router.get("/subscription-plans/{plan_id}/versions")
async def list_plan_template_versions(
    plan_id: uuid.UUID,
    cursor: Optional[str] = Query(default=None),
    limit: int = Query(default=25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin),
):
    del current_user
    try:
        versions = await PlatformCommercialCatalogQueryService(db).plan_template_versions(
            plan_id=plan_id,
            cursor=cursor,
            limit=limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"code": str(exc)}) from exc
    if versions is None:
        raise HTTPException(status_code=404, detail="Plan not found")
    return versions

@router.put("/plans/{plan_id}/features")
@router.put("/subscription-plans/{plan_id}/features")
async def bulk_update_plan_features(
    plan_id: uuid.UUID,
    payload: PlanFeaturesBulkUpdate,
    step_up: StepUpAuth,
    expected_version: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    reason: str = Header(..., alias="X-Admin-Reason", min_length=12, max_length=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Replace all features configured for a plan, returning count of affected tenants (Super Admin)."""
    is_super = current_user.platform_role == "SUPER_ADMIN" or current_user.role == "super_admin" or getattr(current_user, "is_platform_admin", False)
    if not is_super:
        raise HTTPException(status_code=403, detail="SUPER_ADMIN required")
    del step_up
    request_payload = payload.model_dump(mode="json")
    request_hash = _commercial_request_hash("PLAN", plan_id, {"assignments": request_payload})
    replay = await _commercial_version_replay(db, "PLAN", idempotency_key, request_hash)
    if replay:
        return {"message": "Plan features already updated", "organizations_affected": 0, "version": replay.version, "replayed": True}
        
    plan = await db.get(SubscriptionPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if plan.version != expected_version:
        raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "expected": expected_version, "actual": plan.version})
    if plan.lifecycle_status == "RETIRED":
        raise HTTPException(status_code=409, detail={"code": "RETIRED_PLAN_IMMUTABLE"})
    requested_keys = payload.feature_keys or [assignment.feature_key for assignment in (payload.assignments or [])]
    if plan.lifecycle_status == "PUBLISHED" and not requested_keys:
        raise HTTPException(status_code=422, detail={"code": "PUBLISHED_PLAN_ASSIGNMENTS_REQUIRED"})
        
    # Delete current mappings
    await db.execute(delete(PlanFeature).where(PlanFeature.plan_id == plan_id))
    
    # Insert new mappings
    assignments = payload.assignments or []
    feature_keys = payload.feature_keys or [a.feature_key for a in assignments]
    if feature_keys:
        feat_stmt = select(FeatureCatalog).where(FeatureCatalog.key.in_(feature_keys))
        features = (await db.execute(feat_stmt)).scalars().all()
        by_key = {f.key: f for f in features}
        missing = sorted(set(feature_keys) - set(by_key))
        if missing:
            raise HTTPException(status_code=422, detail={"code": "UNKNOWN_FEATURE_KEYS", "keys": missing})
        inactive = sorted(feature.key for feature in features if not feature.is_active)
        if inactive:
            raise HTTPException(status_code=422, detail={"code": "INACTIVE_FEATURE_KEYS", "keys": inactive})
        valid_keys = set(FEATURE_DEFINITIONS) | set(CATALOG_LIMIT_KEYS) | set(by_key.keys())
        unenforced = sorted(set(feature_keys) - valid_keys)
        if unenforced:
            raise HTTPException(status_code=422, detail={"code": "UNENFORCED_FEATURE_KEYS", "keys": unenforced})

        requested_assignments = {
            assignment.feature_key: assignment
            for assignment in (payload.assignments or [])
        }
        def assignment_is_enabled(key: str) -> bool:
            assignment = requested_assignments.get(key)
            if assignment is None:
                return True
            value = assignment.value
            if value is None or value is False or value == 0:
                return False
            if isinstance(value, str):
                return value.upper() not in {
                    "",
                    "NONE",
                    "DISABLED",
                    "NOT_INCLUDED",
                }
            return True

        enabled_keys = {key for key in feature_keys if assignment_is_enabled(key)}
        dependency_errors = {
            key: sorted(set(by_key[key].dependencies or []) - enabled_keys)
            for key in enabled_keys
            if set(by_key[key].dependencies or []) - enabled_keys
        }
        if dependency_errors:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "FEATURE_DEPENDENCIES_REQUIRED",
                    "features": dependency_errors,
                },
            )
        conflict_pairs = sorted({
            tuple(sorted((key, conflict)))
            for key in enabled_keys
            for conflict in (by_key[key].conflicts or [])
            if conflict in enabled_keys
        })
        if conflict_pairs:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "FEATURE_CONFLICT",
                    "conflicts": [list(pair) for pair in conflict_pairs],
                },
            )
        
        plan_defaults = {
            "LIMIT_ORGANIZER_USERS": plan.max_users,
            "LIMIT_REGISTRATIONS": plan.max_registrations,
            "LIMIT_SPEAKERS": plan.max_speakers,
            "LIMIT_SESSIONS": plan.max_sessions,
            "LIMIT_ROOMS": plan.max_rooms,
            "LIMIT_STORAGE": plan.storage_quota_mb,
            "FEAT_TICKET_CATEGORIES": plan.max_ticket_categories,
            "FEAT_BADGE_TEMPLATES": plan.max_badge_templates,
            "FEAT_CERTIFICATE_TEMPLATES": plan.max_certificate_templates,
            "FEAT_EMAIL_NOTIFICATIONS": plan.max_emails_per_event,
        }

        if payload.assignments:
            for assignment in payload.assignments:
                if assignment.feature_key in by_key:
                    f = by_key[assignment.feature_key]
                    val_type = (f.value_type or "BOOLEAN").upper()
                    if assignment.value_type.upper() != val_type:
                        raise HTTPException(status_code=422, detail={
                            "code": "FEATURE_TYPE_MISMATCH",
                            "feature_key": f.key,
                            "expected": val_type,
                            "received": assignment.value_type,
                        })
                    val = assignment.value
                    # Honor explicit enabled from payload (supports toggle off).
                    # For LIMIT features — always enabled=True (the limit itself is what controls access).
                    # For BOOLEAN features — enabled mirrors the boolean value.
                    if val_type == "LIMIT":
                        if val is None:
                            val = plan_defaults.get(f.key) if plan_defaults.get(f.key) is not None else 0
                        if isinstance(val, bool) or not isinstance(val, (int, float)) or val < 0:
                            raise HTTPException(status_code=422, detail={"code": "INVALID_LIMIT_VALUE", "feature_key": f.key})
                        val = int(val)
                        # For LIMIT features: enabled reflects whether the feature is available at all.
                        # A limit of 0 means blocked; otherwise always enabled=True.
                        enabled = val > 0 if isinstance(val, int) else True
                    elif val_type == "BOOLEAN":
                        if not isinstance(val, bool):
                            raise HTTPException(status_code=422, detail={"code": "INVALID_BOOLEAN_VALUE", "feature_key": f.key})
                        enabled = val
                    else:
                        if val not in (f.allowed_values or []):
                            raise HTTPException(status_code=422, detail={
                                "code": "INVALID_ENUM_VALUE",
                                "feature_key": f.key,
                                "allowed_values": f.allowed_values or [],
                            })
                        enabled = True
                    if assignment.hard_ceiling is not None:
                        if assignment.hard_ceiling < 0:
                            raise HTTPException(status_code=422, detail={"code": "INVALID_HARD_CEILING", "feature_key": f.key})
                        if val_type == "LIMIT" and assignment.hard_ceiling < val:
                            raise HTTPException(status_code=422, detail={"code": "CEILING_BELOW_ALLOWANCE", "feature_key": f.key})

                    db.add(PlanFeature(
                        plan_id=plan_id,
                        feature_id=f.id,
                        enabled=enabled,
                        value_type=val_type,
                        entitlement_value={"value": val} if val is not None else None,
                        scope_type=assignment.scope_type or f.scope_type,
                        enforcement_mode=assignment.enforcement_mode or "HARD",
                        hard_ceiling={"value": assignment.hard_ceiling} if assignment.hard_ceiling is not None else None,
                        version=plan.version + 1 if hasattr(plan, "version") else 1
                    ))
        else:
            for f in features:
                db.add(PlanFeature(plan_id=plan_id, feature_id=f.id, enabled=True, value_type=f.value_type, scope_type=f.scope_type))
            
    plan.version = expected_version + 1
    await db.flush()
    await _record_plan_template_version(
        db, plan, actor=current_user, idempotency_key=idempotency_key,
        request_hash=request_hash, reason=reason, change_type="ENTITLEMENTS_UPDATED",
    )
    await commit_transaction(db)
    
    # Calculate affected organizations count
    org_count = await db.scalar(
        select(func.count(OrganizationSubscription.id))
        .where(OrganizationSubscription.plan_id == plan_id)
    ) or 0
    
    return {"message": "Plan features updated successfully", "organizations_affected": org_count, "version": plan.version, "replayed": False}


# ── Add-ons Extensions ──────────────────────────────────────────

class AddonFeatureAssignmentPayload(BaseModel):
    feature_key: str
    value_type: Literal["BOOLEAN", "LIMIT", "TIER", "ENUM"] = "BOOLEAN"
    value: Any = True
    scope_type: str = "EVENT"
    operation: Literal["REPLACE", "INCREMENT", "DECREMENT", "UNLOCK"] = "UNLOCK"
    validity_days: Optional[int] = Field(default=None, ge=1, le=3650)
    stackable: bool = False
    max_quantity: Optional[int] = Field(default=None, ge=1)


async def _replace_addon_feature_assignments(
    db: AsyncSession,
    addon_id: uuid.UUID,
    assignments: Optional[List[AddonFeatureAssignmentPayload]],
    compatibility_feature_ids: Optional[List[uuid.UUID]],
) -> None:
    """Validate and replace the typed add-on mapping as one atomic unit."""
    if assignments is None and compatibility_feature_ids is None:
        return

    requested = assignments or []
    feature_keys = [item.feature_key.strip().upper() for item in requested]
    if len(feature_keys) != len(set(feature_keys)):
        raise HTTPException(status_code=422, detail="Duplicate feature keys are not allowed in an add-on")

    by_key: Dict[str, FeatureCatalog] = {}
    if feature_keys:
        features = (await db.execute(
            select(FeatureCatalog).where(FeatureCatalog.key.in_(feature_keys))
        )).scalars().all()
        by_key = {feature.key: feature for feature in features}
        missing = sorted(set(feature_keys) - set(by_key))
        if missing:
            raise HTTPException(status_code=422, detail={"code": "UNKNOWN_FEATURE_KEYS", "keys": missing})
    elif compatibility_feature_ids:
        features = (await db.execute(
            select(FeatureCatalog).where(FeatureCatalog.id.in_(compatibility_feature_ids))
        )).scalars().all()
        if len(features) != len(set(compatibility_feature_ids)):
            raise HTTPException(status_code=422, detail="One or more feature IDs are unknown")
        requested = [
            AddonFeatureAssignmentPayload(
                feature_key=feature.key,
                value_type=feature.value_type or "BOOLEAN",
                value=True,
                scope_type=feature.scope_type or "EVENT",
                operation="UNLOCK",
            )
            for feature in features
        ]
        by_key = {feature.key: feature for feature in features}

    normalized: list[tuple[FeatureCatalog, AddonFeatureAssignmentPayload, Any]] = []
    for item in requested:
        key = item.feature_key.strip().upper()
        feature = by_key[key]
        if not feature.is_active:
            raise HTTPException(status_code=422, detail={"code": "INACTIVE_FEATURE", "feature_key": key})
        canonical_type = (feature.value_type or "BOOLEAN").upper()
        if item.value_type != canonical_type:
            raise HTTPException(status_code=422, detail={
                "code": "FEATURE_TYPE_MISMATCH",
                "feature_key": key,
                "expected": canonical_type,
                "received": item.value_type,
            })
        value = item.value
        if canonical_type == "BOOLEAN" and not isinstance(value, bool):
            raise HTTPException(status_code=422, detail={"code": "INVALID_BOOLEAN_VALUE", "feature_key": key})
        if canonical_type == "LIMIT" and (isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0):
            raise HTTPException(status_code=422, detail={"code": "INVALID_LIMIT_VALUE", "feature_key": key})
        if canonical_type in {"TIER", "ENUM"} and value not in (feature.allowed_values or []):
            raise HTTPException(status_code=422, detail={
                "code": "INVALID_ENUM_VALUE",
                "feature_key": key,
                "allowed_values": feature.allowed_values or [],
            })
        if item.operation in {"INCREMENT", "DECREMENT"} and canonical_type != "LIMIT":
            raise HTTPException(status_code=422, detail={"code": "INVALID_ADDON_OPERATION", "feature_key": key})
        normalized.append((feature, item, value))

    await db.execute(delete(AddonFeature).where(AddonFeature.addon_id == addon_id))
    for feature, item, value in normalized:
        db.add(AddonFeature(
            addon_id=addon_id,
            feature_id=feature.id,
            value_type=feature.value_type,
            entitlement_value={"value": value},
            operation=item.operation,
            scope_type=item.scope_type or feature.scope_type,
            validity_days=item.validity_days,
            stackable=item.stackable,
            max_quantity=item.max_quantity,
        ))


class AddonPostRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    key: str
    description: Optional[str] = None
    addon_type: str = "PLAN"
    scope_type: Literal["ORGANIZATION", "EVENT"] = "EVENT"
    consumption_model: Literal["NON_CONSUMABLE", "QUOTA", "METERED"] = "NON_CONSUMABLE"
    unit_type: Optional[str] = None
    short_description: Optional[str] = None
    image_url: Optional[str] = None
    price_inr: Optional[float] = None
    min_price_inr: Optional[float] = None
    max_price_inr: Optional[float] = None
    billing_unit: str  # 'PER_EVENT' | 'PER_MONTH' | 'CUSTOM'
    price_unit: Optional[str] = None
    available_for_plans: List[str] = Field(default_factory=list)
    is_optional_for_plan: Optional[str] = None
    included_in_plan: Optional[str] = None
    is_active: bool = True
    lifecycle_status: Literal["DRAFT", "REVIEW", "PUBLISHED", "RETIRED"] = "DRAFT"
    feature_ids: List[uuid.UUID] = Field(default_factory=list)
    feature_assignments: List[AddonFeatureAssignmentPayload] = Field(default_factory=list)
    features_spec: List[Dict[str, Any]] = Field(default_factory=list)
    hardware_spec: List[Dict[str, Any]] = Field(default_factory=list)
    staff_spec: List[Dict[str, Any]] = Field(default_factory=list)
    inclusions: List[str] = Field(default_factory=list)
    exclusions: List[str] = Field(default_factory=list)
    consumables_cost: float = 0
    template_types: List[str] = Field(default_factory=list)

class AddonPatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = None
    key: Optional[str] = None
    description: Optional[str] = None
    addon_type: Optional[str] = None
    scope_type: Optional[Literal["ORGANIZATION", "EVENT"]] = None
    consumption_model: Optional[Literal["NON_CONSUMABLE", "QUOTA", "METERED"]] = None
    unit_type: Optional[str] = None
    short_description: Optional[str] = None
    image_url: Optional[str] = None
    price_inr: Optional[float] = None
    min_price_inr: Optional[float] = None
    max_price_inr: Optional[float] = None
    billing_unit: Optional[str] = None
    price_unit: Optional[str] = None
    available_for_plans: Optional[List[str]] = None
    is_optional_for_plan: Optional[str] = None
    included_in_plan: Optional[str] = None
    is_active: Optional[bool] = None
    lifecycle_status: Optional[Literal["DRAFT", "REVIEW", "PUBLISHED", "RETIRED"]] = None
    feature_ids: Optional[List[uuid.UUID]] = None
    feature_assignments: Optional[List[AddonFeatureAssignmentPayload]] = None
    features_spec: Optional[List[Dict[str, Any]]] = None
    hardware_spec: Optional[List[Dict[str, Any]]] = None
    staff_spec: Optional[List[Dict[str, Any]]] = None
    inclusions: Optional[List[str]] = None
    exclusions: Optional[List[str]] = None
    consumables_cost: Optional[float] = None
    template_types: Optional[List[str]] = None


@router.get("/addons/{addon_id}/versions")
async def list_addon_template_versions(
    addon_id: uuid.UUID,
    cursor: Optional[str] = Query(default=None),
    limit: int = Query(default=25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin),
):
    del current_user
    try:
        versions = await PlatformCommercialCatalogQueryService(db).addon_template_versions(
            addon_id=addon_id,
            cursor=cursor,
            limit=limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail={"code": str(exc)}) from exc
    if versions is None:
        raise HTTPException(status_code=404, detail="Add-on not found")
    return versions

@router.post("/addons", status_code=201)
async def create_platform_addon(
    payload: AddonPostRequest,
    step_up: StepUpAuth,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    reason: str = Header(..., alias="X-Admin-Reason", min_length=12, max_length=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Create a new platform add-on (Super Admin)."""
    is_super = current_user.platform_role == "SUPER_ADMIN" or current_user.role == "super_admin" or getattr(current_user, "is_platform_admin", False)
    if not is_super:
        raise HTTPException(status_code=403, detail="SUPER_ADMIN required")
    del step_up
    if payload.lifecycle_status in {"PUBLISHED", "RETIRED"}:
        raise HTTPException(status_code=422, detail={"code": "ADDON_MUST_START_AS_DRAFT_OR_REVIEW"})
    request_payload = payload.model_dump(mode="json")
    request_hash = _commercial_request_hash("ADDON", None, request_payload)
    replay = await _commercial_version_replay(db, "ADDON", idempotency_key, request_hash)
    if replay:
        existing_addon = await db.get(Addon, replay.resource_id)
        return {
            "message": "Add-on already created",
            "addon_id": replay.resource_id,
            "addon": existing_addon.name if existing_addon else None,
            "version": replay.version,
            "replayed": True,
        }

    # Check duplicate key
    stmt = select(Addon).where(Addon.key == payload.key)
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Add-on key already exists")

    addon_type = payload.addon_type.upper()
    hardware_spec = payload.hardware_spec if addon_type == "VENUE" else []
    staff_spec = payload.staff_spec if addon_type == "VENUE" else []
    final_price = await calculate_addon_final_price(
        db,
        addon_type=addon_type,
        min_price_inr=payload.min_price_inr,
        price_inr=payload.price_inr,
        hardware_spec=hardware_spec,
        staff_spec=staff_spec
    )
        
    addon = Addon(
        name=payload.name,
        key=payload.key,
        description=payload.description,
        addon_type=addon_type,
        short_description=payload.short_description,
        image_url=payload.image_url,
        price_inr=payload.price_inr,
        min_price_inr=payload.min_price_inr,
        max_price_inr=payload.max_price_inr,
        billing_unit=payload.billing_unit,
        price_unit=getattr(payload, "price_unit", None),
        scope_type=payload.scope_type,
        consumption_model=payload.consumption_model,
        unit_type=payload.unit_type,
        available_for_plans=payload.available_for_plans,
        is_optional_for_plan=payload.is_optional_for_plan,
        included_in_plan=payload.included_in_plan,
        is_active=False,
        lifecycle_status=payload.lifecycle_status,
        version=1,
        features_spec=payload.features_spec,
        hardware_spec=hardware_spec,
        staff_spec=staff_spec,
        final_price=final_price,
        inclusions=payload.inclusions,
        exclusions=payload.exclusions,
        consumables_cost=payload.consumables_cost
        ,template_types=[value.lower() for value in payload.template_types]
    )
    db.add(addon)
    await db.flush()  # To get addon.id
    
    await _replace_addon_feature_assignments(
        db,
        addon.id,
        payload.feature_assignments if payload.feature_assignments else None,
        payload.feature_ids if payload.feature_ids else None,
    )
    await db.flush()
    await _record_addon_template_version(
        db, addon, actor=current_user, idempotency_key=idempotency_key,
        request_hash=request_hash, reason=reason, change_type="CREATED",
    )
    await commit_transaction(db)
    return {"message": "Add-on created successfully", "addon_id": addon.id, "version": addon.version, "replayed": False}

@router.patch("/addons/{addon_id}")
async def patch_platform_addon(
    addon_id: uuid.UUID,
    payload: AddonPatchRequest,
    step_up: StepUpAuth,
    expected_version: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    reason: str = Header(..., alias="X-Admin-Reason", min_length=12, max_length=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Update details or feature associations for a platform add-on (Super Admin)."""
    is_super = current_user.platform_role == "SUPER_ADMIN" or current_user.role == "super_admin" or getattr(current_user, "is_platform_admin", False)
    if not is_super:
        raise HTTPException(status_code=403, detail="SUPER_ADMIN required")
    del step_up
    request_payload = payload.model_dump(mode="json", exclude_unset=True)
    request_hash = _commercial_request_hash("ADDON", addon_id, request_payload)
    replay = await _commercial_version_replay(db, "ADDON", idempotency_key, request_hash)
    if replay:
        return {"message": "Add-on update already applied", "version": replay.version, "replayed": True}

    addon = await db.get(Addon, addon_id)
    if not addon:
        raise HTTPException(status_code=404, detail="Add-on not found")
    if addon.version != expected_version:
        raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "expected": expected_version, "actual": addon.version})
    if addon.lifecycle_status == "RETIRED":
        raise HTTPException(status_code=409, detail={"code": "RETIRED_ADDON_IMMUTABLE", "message": "Clone a retired add-on to create a new draft."})

    update_data = payload.model_dump(exclude_unset=True, exclude={"feature_ids", "feature_assignments"})
    previous_lifecycle = addon.lifecycle_status
    addon_type = update_data.get("addon_type", addon.addon_type).upper() if update_data.get("addon_type") else addon.addon_type
    if addon_type != "VENUE":
        update_data["hardware_spec"] = []
        update_data["staff_spec"] = []
    for field, val in update_data.items():
        if field == "addon_type" and isinstance(val, str):
            val = val.upper()
        setattr(addon, field, val)
    target_lifecycle = payload.lifecycle_status or addon.lifecycle_status
    if target_lifecycle == "PUBLISHED" and addon.addon_type == "PLAN":
        proposed_assignments = payload.feature_assignments
        if proposed_assignments is not None:
            has_assignments = bool(proposed_assignments)
        else:
            has_assignments = bool(await db.scalar(select(func.count(AddonFeature.feature_id)).where(AddonFeature.addon_id == addon_id)))
        if not has_assignments:
            raise HTTPException(status_code=422, detail={"code": "ADDON_ASSIGNMENTS_REQUIRED"})
    if target_lifecycle == "PUBLISHED" and previous_lifecycle != "PUBLISHED":
        addon.effective_at = datetime.now(timezone.utc)
        addon.is_active = True
    if target_lifecycle == "RETIRED":
        addon.retired_at = datetime.now(timezone.utc)
        addon.is_active = False
    addon.lifecycle_status = target_lifecycle
    addon.is_active = bool(update_data.get("is_active", addon.is_active)) and target_lifecycle == "PUBLISHED"
    addon.version = expected_version + 1
        
    # Recalculate final_price
    addon.final_price = await calculate_addon_final_price(
        db,
        addon_type=addon.addon_type,
        min_price_inr=addon.min_price_inr,
        price_inr=addon.price_inr,
        hardware_spec=addon.hardware_spec or [],
        staff_spec=addon.staff_spec or []
    )
        
    await _replace_addon_feature_assignments(
        db,
        addon_id,
        payload.feature_assignments,
        payload.feature_ids,
    )
    await db.flush()
    await _record_addon_template_version(
        db, addon, actor=current_user, idempotency_key=idempotency_key,
        request_hash=request_hash, reason=reason, change_type="UPDATED",
    )
    await commit_transaction(db)
    return {"message": "Add-on updated successfully", "addon": addon.name, "version": addon.version, "replayed": False}

@router.delete("/addons/{addon_id}")
async def delete_platform_addon(
    addon_id: uuid.UUID,
    step_up: StepUpAuth,
    expected_version: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    reason: str = Header(..., alias="X-Admin-Reason", min_length=12, max_length=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Retire an add-on while preserving contracts, lineage, and history."""
    del step_up
    request_hash = _commercial_request_hash("ADDON", addon_id, {"lifecycle_status": "RETIRED"})
    replay = await _commercial_version_replay(db, "ADDON", idempotency_key, request_hash)
    if replay:
        return {"message": "Add-on retirement already applied", "version": replay.version, "replayed": True}
    addon = await db.get(Addon, addon_id)
    if not addon:
        raise HTTPException(status_code=404, detail="Add-on not found")
    if addon.version != expected_version:
        raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "expected": expected_version, "actual": addon.version})
    if addon.lifecycle_status == "RETIRED":
        raise HTTPException(status_code=409, detail={"code": "ADDON_ALREADY_RETIRED"})
    addon.lifecycle_status = "RETIRED"
    addon.is_active = False
    addon.retired_at = datetime.now(timezone.utc)
    addon.version = expected_version + 1
    await db.flush()
    await _record_addon_template_version(
        db, addon, actor=current_user, idempotency_key=idempotency_key,
        request_hash=request_hash, reason=reason, change_type="RETIRED",
    )
    await commit_transaction(db)
    return {"message": "Add-on retired", "version": addon.version, "replayed": False}


# ── Subscriptions Extensions ───────────────────────────────────

class BulkExtendTrialRequest(BaseModel):
    org_ids: List[uuid.UUID]
    days: int = Field(ge=1, le=90)
    reason: str = Field(..., min_length=8, max_length=1000)

@router.post("/subscriptions/bulk-extend")
async def bulk_extend_trial(
    payload: BulkExtendTrialRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Extend trial period for multiple organization subscriptions (Super Admin)."""
    _governed_commercial_workflow_required("entitlement-override-request")
    for org_id in payload.org_ids:
        sub = await _get_current_subscription(db, org_id)
        if sub:
            old_state = {
                "subscription_id": str(sub.id),
                "status": sub.status,
                "trial_ends_at": sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
            }
            current_trial = sub.trial_ends_at or datetime.now(timezone.utc)
            sub.trial_ends_at = current_trial + timedelta(days=payload.days)
            db.add(ActivityTimeline(
                organization_id=org_id,
                actor_id=current_user.id,
                action_type="TRIAL_EXTENDED",
                metadata_data={"days_extended": payload.days, "reason": payload.reason, "bulk": True}
            ))
            db.add(AuditLog(
                actor_user_id=current_user.id,
                organization_id=org_id,
                action_type="TRIAL_EXTENDED",
                resource_type="subscription",
                resource_id=sub.id,
                old_state=old_state,
                new_state={
                    "subscription_id": str(sub.id),
                    "status": sub.status,
                    "trial_ends_at": sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
                },
                change_diff={"days": payload.days, "reason": payload.reason, "bulk": True},
                is_sensitive=True,
                occurred_at=datetime.now(timezone.utc),
            ))
    await commit_transaction(db)
    return {"message": f"Successfully extended trial for {len(payload.org_ids)} tenants"}


class BulkChangePlanRequest(BaseModel):
    org_ids: List[uuid.UUID]
    plan_id: uuid.UUID
    reason: str = Field(..., min_length=8, max_length=1000)

@router.post("/subscriptions/bulk-change-plan")
async def bulk_change_plan(
    payload: BulkChangePlanRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Migrate multiple organizations to a new subscription plan (Super Admin)."""
    _governed_commercial_workflow_required("commercial-access-request")
    plan = await db.get(SubscriptionPlan, payload.plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Selected plan not found")
        
    for org_id in payload.org_ids:
        sub = await _get_current_subscription(db, org_id)
        if sub:
            old_plan_id = sub.plan_id
            old_state = {
                "subscription_id": str(sub.id),
                "plan_id": str(old_plan_id) if old_plan_id else None,
                "status": sub.status,
            }
            sub.plan_id = payload.plan_id
            db.add(ActivityTimeline(
                organization_id=org_id,
                actor_id=current_user.id,
                action_type="PLAN_CHANGED",
                metadata_data={
                    "old_plan_id": str(old_plan_id),
                    "new_plan_id": str(payload.plan_id),
                    "new_plan_name": plan.name,
                    "reason": payload.reason,
                    "bulk": True
                }
            ))
            db.add(AuditLog(
                actor_user_id=current_user.id,
                organization_id=org_id,
                action_type="PLAN_CHANGED",
                resource_type="subscription",
                resource_id=sub.id,
                old_state=old_state,
                new_state={
                    "subscription_id": str(sub.id),
                    "plan_id": str(sub.plan_id),
                    "plan_name": plan.name,
                    "status": sub.status,
                },
                change_diff={"reason": payload.reason, "bulk": True},
                is_sensitive=True,
                occurred_at=datetime.now(timezone.utc),
            ))
    await commit_transaction(db)
    return {"message": f"Successfully migrated plan to {plan.name} for {len(payload.org_ids)} tenants"}


@router.post("/subscriptions/{subscription_id}/cancel")
async def cancel_subscription(
    subscription_id: uuid.UUID,
    payload: ReasonRequiredRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Flag an active subscription as CANCELLED (Super Admin)."""
    _governed_commercial_workflow_required("commercial-access-request")
    sub = await db.get(OrganizationSubscription, subscription_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    old_state = {"subscription_id": str(sub.id), "status": sub.status}
    sub.status = "CANCELLED"
    db.add(ActivityTimeline(
        organization_id=sub.organization_id,
        actor_id=current_user.id,
        action_type="SUBSCRIPTION_CANCELLED",
        metadata_data={"reason": payload.reason, "by": str(current_user.id)}
    ))
    db.add(AuditLog(
        actor_user_id=current_user.id,
        organization_id=sub.organization_id,
        action_type="SUBSCRIPTION_CANCELLED",
        resource_type="subscription",
        resource_id=sub.id,
        old_state=old_state,
        new_state={"subscription_id": str(sub.id), "status": sub.status},
        change_diff={"reason": payload.reason},
        is_sensitive=True,
        occurred_at=datetime.now(timezone.utc),
    ))
    await commit_transaction(db)
    return {"message": "Subscription cancelled successfully"}


@router.post("/subscriptions/{subscription_id}/reactivate")
async def reactivate_subscription(
    subscription_id: uuid.UUID,
    payload: ReasonRequiredRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Reactivate a cancelled/expired subscription back to ACTIVE (Super Admin)."""
    _governed_commercial_workflow_required("commercial-access-request")
    sub = await db.get(OrganizationSubscription, subscription_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    old_state = {"subscription_id": str(sub.id), "status": sub.status}
    sub.status = "ACTIVE"
    db.add(ActivityTimeline(
        organization_id=sub.organization_id,
        actor_id=current_user.id,
        action_type="SUBSCRIPTION_REACTIVATED",
        metadata_data={"reason": payload.reason, "by": str(current_user.id)}
    ))
    db.add(AuditLog(
        actor_user_id=current_user.id,
        organization_id=sub.organization_id,
        action_type="SUBSCRIPTION_REACTIVATED",
        resource_type="subscription",
        resource_id=sub.id,
        old_state=old_state,
        new_state={"subscription_id": str(sub.id), "status": sub.status},
        change_diff={"reason": payload.reason},
        is_sensitive=True,
        occurred_at=datetime.now(timezone.utc),
    ))
    await commit_transaction(db)
    return {"message": "Subscription reactivated successfully"}


# ── Invoices Extensions ────────────────────────────────────────

@router.get("/invoices/{invoice_id}/items")
async def get_invoice_items(
    invoice_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Retrieve invoice items list (Super Admin)."""
    del current_user
    return await PlatformCommercialCatalogQueryService(db).invoice_items(
        invoice_id=invoice_id
    )


@router.post("/invoices/{invoice_id}/mark-paid")
async def mark_invoice_paid(
    invoice_id: uuid.UUID,
    payload: ReasonRequiredRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Manually flag an outstanding invoice as PAID offline (Super Admin)."""
    inv = await db.get(Invoice, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    old_state = {
        "invoice_id": str(inv.id),
        "status": inv.status,
        "paid_at": inv.paid_at.isoformat() if inv.paid_at else None,
        "amount": float(inv.amount),
    }
    inv.status = "PAID"
    inv.paid_at = datetime.now(timezone.utc)
    
    db.add(ActivityTimeline(
        organization_id=inv.organization_id,
        actor_id=current_user.id,
        action_type="INVOICE_MARKED_PAID",
        metadata_data={
            "invoice_id": str(invoice_id),
            "amount": float(inv.amount),
            "reason": payload.reason,
            "by": str(current_user.id),
        }
    ))
    db.add(AuditLog(
        actor_user_id=current_user.id,
        organization_id=inv.organization_id,
        action_type="INVOICE_MARKED_PAID",
        resource_type="invoice",
        resource_id=invoice_id,
        old_state=old_state,
        new_state={
            "invoice_id": str(inv.id),
            "status": inv.status,
            "paid_at": inv.paid_at.isoformat() if inv.paid_at else None,
            "amount": float(inv.amount),
        },
        change_diff={"reason": payload.reason},
        is_sensitive=True,
        occurred_at=datetime.now(timezone.utc),
    ))
    await commit_transaction(db)
    return {"message": "Invoice status updated to PAID"}


@router.post("/invoices/{invoice_id}/send-reminder")
async def send_invoice_reminder(
    invoice_id: uuid.UUID,
    payload: ReasonRequiredRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Trigger payment reminder notifications for overdue invoices (Super Admin)."""
    inv = await db.get(Invoice, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    db.add(ActivityTimeline(
        organization_id=inv.organization_id,
        actor_id=current_user.id,
        action_type="INVOICE_REMINDER_UNAVAILABLE",
        metadata_data={
            "invoice_id": str(invoice_id),
            "reason": payload.reason,
            "by": str(current_user.id),
        },
    ))
    db.add(AuditLog(
        actor_user_id=current_user.id,
        organization_id=inv.organization_id,
        action_type="INVOICE_REMINDER_UNAVAILABLE",
        resource_type="invoice",
        resource_id=invoice_id,
        old_state={
            "invoice_id": str(inv.id),
            "status": inv.status,
            "amount": float(inv.amount),
        },
        new_state=None,
        change_diff={
            "reason": payload.reason,
            "blocked_reason": "Durable invoice reminder job is not implemented.",
        },
        is_sensitive=True,
        occurred_at=datetime.now(timezone.utc),
    ))
    await commit_transaction(db)
    raise HTTPException(
        status_code=501,
        detail="Invoice reminders are not available until a durable communications job is implemented.",
    )


@router.post("/invoices/{invoice_id}/void")
async def void_invoice(
    invoice_id: uuid.UUID,
    payload: ReasonRequiredRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Void an outstanding/incorrect invoice (Super Admin)."""
    inv = await db.get(Invoice, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    old_state = {
        "invoice_id": str(inv.id),
        "status": inv.status,
        "paid_at": inv.paid_at.isoformat() if inv.paid_at else None,
        "amount": float(inv.amount),
    }
    inv.status = "VOID"
    
    db.add(ActivityTimeline(
        organization_id=inv.organization_id,
        actor_id=current_user.id,
        action_type="INVOICE_VOIDED",
        metadata_data={
            "invoice_id": str(invoice_id),
            "reason": payload.reason,
            "by": str(current_user.id),
        }
    ))
    db.add(AuditLog(
        actor_user_id=current_user.id,
        organization_id=inv.organization_id,
        action_type="INVOICE_VOIDED",
        resource_type="invoice",
        resource_id=invoice_id,
        old_state=old_state,
        new_state={
            "invoice_id": str(inv.id),
            "status": inv.status,
            "paid_at": inv.paid_at.isoformat() if inv.paid_at else None,
            "amount": float(inv.amount),
        },
        change_diff={"reason": payload.reason},
        is_sensitive=True,
        occurred_at=datetime.now(timezone.utc),
    ))
    await commit_transaction(db)
    return {"message": "Invoice voided successfully"}


# ── Revenue Analytics ──────────────────────────────────────────

@router.get("/revenue/analytics")
async def get_revenue_analytics(
    breakdown: str = Query("plan"),
    period: str = Query("12m"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Return the bounded revenue projection for the platform dashboard."""
    return await PlatformCoreDashboardQueryService(db).revenue_analytics(period=period)


async def _legacy_revenue_analytics(
    breakdown: str = Query("plan"),
    period: str = Query("12m"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Fetch aggregated MRR metrics, country breakdown, plan flows, and cohort tables (Super Admin)."""
    # 1. Total active metrics
    current_period = datetime.now(timezone.utc).strftime("%Y-%m")
    total_mrr = await db.scalar(select(func.sum(RevenueMetric.mrr)).where(RevenueMetric.period == current_period)) or 0.0
    active_count = await db.scalar(select(func.count(Organization.id)).where(Organization.is_active == True)) or 0
    
    # ARPU
    arpu = float(total_mrr) / active_count if active_count > 0 else 0.0
    
    # 2. 12-Month stacked area history
    periods = []
    for i in range(12):
        d = datetime.now(timezone.utc) - timedelta(days=30*i)
        periods.append(d.strftime("%Y-%m"))
    periods.reverse()
    
    mrr_breakdown = []
    for p in periods:
        basic_mrr = await db.scalar(
            select(func.sum(RevenueMetric.mrr))
            .join(Organization, RevenueMetric.organization_id == Organization.id)
            .where(and_(RevenueMetric.period == p, Organization.plan.ilike("%basic%")))
        ) or 0.0
        pro_mrr = await db.scalar(
            select(func.sum(RevenueMetric.mrr))
            .join(Organization, RevenueMetric.organization_id == Organization.id)
            .where(and_(RevenueMetric.period == p, or_(Organization.plan.ilike("%pro%"), Organization.plan.ilike("%professional%"))))
        ) or 0.0
        ent_mrr = await db.scalar(
            select(func.sum(RevenueMetric.mrr))
            .join(Organization, RevenueMetric.organization_id == Organization.id)
            .where(and_(RevenueMetric.period == p, Organization.plan.ilike("%enterprise%")))
        ) or 0.0
        addon_mrr = await db.scalar(
            select(func.sum(RevenueMetric.add_on_revenue))
            .where(RevenueMetric.period == p)
        ) or 0.0
        
        total_p = basic_mrr + pro_mrr + ent_mrr + addon_mrr
        mrr_breakdown.append({
            "period": p,
            "Basic": float(basic_mrr),
            "Pro": float(pro_mrr),
            "Enterprise": float(ent_mrr),
            "Addons": float(addon_mrr),
            "total_mrr": float(total_p),
            "total_arr": float(total_p * 12),
        })
        
    # Deltas
    curr_total = mrr_breakdown[-1]["total_mrr"]
    prev_total = mrr_breakdown[-2]["total_mrr"] if len(mrr_breakdown) > 1 else curr_total
    
    net_new = curr_total - prev_total if curr_total > prev_total else 0.0
    churn = 0.0 if curr_total >= prev_total else (prev_total - curr_total)
    expansion = curr_total - prev_total - net_new if curr_total > prev_total else 0.0
    
    # 3. Country Revenue
    country_rows = await db.execute(
        select(Organization.country, func.count(Organization.id))
        .group_by(Organization.country)
        .order_by(desc(func.count(Organization.id)))
        .limit(10)
    )
    country_data = []
    for code, count in country_rows.all():
        country_data.append({
            "country": code,
            "organizations": count,
            "revenue": count * 240.0
        })
            
    # Dynamic upgrades/downgrades counts by plan tier
    upgrades_downgrades = []
    try:
        res = await db.execute(text("""
            SELECT sp.name, 
                   COUNT(*) FILTER (WHERE os.status = 'ACTIVE') as upgrades,
                   0 as downgrades
            FROM commerce.organization_subscriptions os
            JOIN commerce.subscription_plans sp ON sp.id = os.plan_id
            GROUP BY sp.name
        """))
        upgrades_downgrades = [{"tier": r[0], "upgrades": int(r[1] or 0), "downgrades": int(r[2] or 0)} for r in res.fetchall()]
    except Exception:
        pass
    
    # Dynamic cohort retention calculation
    cohort_retention = []
    try:
        cohort_res = await db.execute(text("""
            SELECT
                TO_CHAR(created_at, 'YYYY-MM') as cohort,
                COUNT(*) as size,
                COUNT(*) FILTER (WHERE is_active = True) as active_now
            FROM platform.organizations
            GROUP BY TO_CHAR(created_at, 'YYYY-MM')
            ORDER BY cohort DESC
            LIMIT 6
        """))
        for r in cohort_res.fetchall():
            size = int(r.size or 0)
            active = int(r.active_now or 0)
            pct = round((active / size) * 100.0, 1) if size > 0 else 0.0
            cohort_retention.append({
                "cohort": r.cohort,
                "size": size,
                "m1": 100.0,
                "m2": pct,
                "m3": pct,
                "m4": None,
                "m5": None,
                "m6": None
            })
    except Exception:
        pass

    # B4 integrations
    months_count = 12 if period == "12m" else int(period.replace("m", ""))
    
    # MRR by month across all orgs
    mrr_by_month_res = await db.execute(
        text("""
        SELECT period, SUM(mrr) as total_mrr, SUM(arr) as total_arr
        FROM commerce.revenue_metrics
        WHERE period >= TO_CHAR(NOW() - (CAST(:months AS INTEGER) * INTERVAL '1 month'), 'YYYY-MM')
        GROUP BY period
        ORDER BY period
        """),
        {"months": months_count}
    )
    mrr_by_month_rows = mrr_by_month_res.all()
    
    # MRR by plan tier
    mrr_by_plan_res = await db.execute(
        text("""
        SELECT sp.name as plan_name, SUM(rm.mrr) as mrr, COUNT(DISTINCT rm.organization_id) as org_count
        FROM commerce.revenue_metrics rm
        JOIN commerce.organization_subscriptions os ON os.organization_id = rm.organization_id
        JOIN commerce.subscription_plans sp ON sp.id = os.plan_id
        WHERE rm.period = TO_CHAR(NOW(), 'YYYY-MM')
        GROUP BY sp.name
        ORDER BY mrr DESC
        """)
    )
    mrr_by_plan_rows = mrr_by_plan_res.all()
    
    # Plan upgrades/downgrades this month from commerce.payment_events / commerce.financial_audit_trail
    plans_res = await db.execute(select(SubscriptionPlan.id, SubscriptionPlan.display_order, SubscriptionPlan.name))
    plan_info = {str(p.id): p.display_order for p in plans_res.all()}
    plan_name_info = {p.name.upper(): p.display_order for p in plans_res.all()}

    upgrades_this_month = 0
    downgrades_this_month = 0
    try:
        events_res = await db.execute(text("""
            SELECT metadata_data 
            FROM commerce.payment_events
            WHERE action_type IN ('PLAN_CHANGED', 'PLAN_CHANGE')
              AND timestamp >= DATE_TRUNC('month', NOW())
        """))
        for row in events_res.all():
            meta = row.metadata_data
            if not isinstance(meta, dict):
                continue
            old_order = None
            new_order = None
            
            old_pid = meta.get("old_plan_id")
            new_pid = meta.get("new_plan_id")
            if old_pid and new_pid:
                old_order = plan_info.get(str(old_pid))
                new_order = plan_info.get(str(new_pid))
            
            if old_order is None or new_order is None:
                from_p = meta.get("from_plan")
                to_p = meta.get("to_plan")
                if from_p and to_p:
                    old_order = plan_name_info.get(from_p.upper())
                    new_order = plan_name_info.get(to_p.upper())
                    
            if old_order is not None and new_order is not None:
                if new_order > old_order:
                    upgrades_this_month += 1
                elif new_order < old_order:
                    downgrades_this_month += 1
            else:
                upgrades_this_month += 1
    except Exception:
        upgrades_this_month = 0
        downgrades_this_month = 0

    mrr_by_month = []
    for r in mrr_by_month_rows:
        mrr_by_month.append({
            "period": r.period,
            "mrr": float(r.total_mrr or 0.0),
            "arr": float(r.total_arr or 0.0)
        })
        
    if not mrr_by_month:
        mrr_by_month = []
        
    mrr_by_plan = []
    for r in mrr_by_plan_rows:
        mrr_by_plan.append({
            "plan": r.plan_name,
            "mrr": float(r.mrr or 0.0),
            "orgs": r.org_count,
            "pct": round((float(r.mrr or 0.0) / total_mrr) * 100.0, 2) if total_mrr > 0 else 0.0
        })
        
    if not mrr_by_plan:
        mrr_by_plan = []
    
    return {
        "metrics": {
            "mrr": float(total_mrr) if total_mrr > 0 else float(curr_total),
            "arr": float(total_mrr * 12) if total_mrr > 0 else float(mrr_breakdown[-1]["total_arr"]),
            "net_new_mrr": float(net_new),
            "churn_mrr": float(churn),
            "expansion_mrr": float(expansion),
            "arpu": float(arpu) if arpu > 0 else 235.0,
        },
        "mrr_breakdown": mrr_breakdown,
        "country_revenue": country_data,
        "upgrades_downgrades": upgrades_downgrades,
        "cohort_retention": cohort_retention,
        
        "mrr_by_month": mrr_by_month,
        "mrr_by_plan": mrr_by_plan,
        "upgrades_this_month": upgrades_this_month,
        "downgrades_this_month": downgrades_this_month,
        "arpu_inr": float(arpu) if arpu > 0 else 235.0,
        "summary": {
            "mrr": float(total_mrr) if total_mrr > 0 else float(curr_total),
            "arr": float(total_mrr * 12) if total_mrr > 0 else float(mrr_breakdown[-1]["total_arr"]),
            "net_new_mrr": float(net_new),
            "churned_mrr": float(churn),
            "expansion_mrr": float(expansion)
        }
    }


# ── Phase 4 Financial, Security, Impersonation and AI routes ──

from app.modules.billing.models.payment_gateway import PaymentGateway

@router.get("/financial/gateways")
async def get_financial_gateways(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin)
):
    return await PlatformCoreDashboardQueryService(db).payment_gateway_health()

@router.get("/financial/tax-config")
async def get_financial_tax_config(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin)
):
    return await PlatformFinancialQueryService(db).tax_configuration()

@router.get("/financial/transactions")
async def get_financial_transactions(
    skip: int = 0,
    limit: int = 50,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin)
):
    return await PlatformFinancialQueryService(db).payment_transactions(
        skip=skip,
        limit=limit,
        status=status,
    )

@router.get("/financial/audit-trail")
async def get_financial_audit_trail(
    skip: int = 0,
    limit: int = 50,
    org_id: Optional[str] = None,
    activity_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin)
):
    return await PlatformFinancialQueryService(db).financial_audit_trail(
        skip=skip,
        limit=limit,
        organization_id=org_id,
        activity_type=activity_type,
    )

@router.get("/impersonation-logs")
async def get_impersonation_logs_route(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin)
):
    rows, total_count, _summary = await AuditQueryService(db).list_impersonation_logs(
        skip=skip,
        limit=limit,
    )
    return {
        "items": [{
            "id": row["id"],
            "impersonator_name": row["impersonator_name"] or "Super Admin",
            "impersonator_email": row["impersonator_email"] or "superadmin@Event.com",
            "target_user_name": row["target_name"] or "Organizer",
            "target_user_email": row["target_email"] or "organizer@Eventos.com",
            "org_name": row["org_name"] or "Platform",
            "target_organization_name": row["org_name"] or "Platform",
            "ip_address": row["ip_address"],
            "duration_seconds": int(row["duration_seconds"] or 0),
            "started_at": row["started_at"].isoformat(),
            "ended_at": row["ended_at"].isoformat() if row["ended_at"] else None,
        } for row in rows],
        "total": total_count,
    }

@router.get("/ai/dashboard")
async def get_ai_dashboard(
    _: User = Depends(require_platform_admin)
):
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="AI dashboard is unavailable until usage and cost ledgers are authoritative",
    )

@router.get("/ai/prompts")
async def get_ai_prompts(
    _: User = Depends(require_platform_admin)
):
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="AI prompt library is unavailable until its versioned governance contract is implemented",
    )

@router.get("/ai/models")
async def get_ai_models(
    _: User = Depends(require_platform_admin)
):
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="AI model registry is unavailable until provider and routing records are authoritative",
    )

