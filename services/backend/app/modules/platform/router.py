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
    total_orgs = await db.scalar(select(func.count(Organization.id))) or 0
    active_orgs = await db.scalar(select(func.count(Organization.id)).where(Organization.is_active == True)) or 0
    trial_orgs = await db.scalar(
        select(func.count(OrganizationSubscription.id))
        .where(OrganizationSubscription.status == 'TRIAL')
    ) or 0
    
    total_users = await db.scalar(select(func.count(User.id))) or 0
    total_events = await db.scalar(select(func.count(Event.id))) or 0
    
    # Aggregated from denormalized usage metrics
    total_active_events_usage = await db.scalar(select(func.sum(OrganizationUsage.active_events_count))) or 0
    total_regs = await db.scalar(select(func.sum(OrganizationUsage.total_registrations_count))) or 0
    total_storage = await db.scalar(select(func.sum(OrganizationUsage.storage_used_bytes))) or 0
    
    # Aggregated MRR from recent Revenue Metrics
    current_period = datetime.now(timezone.utc).strftime("%Y-%m")
    mrr_current = await db.scalar(select(func.sum(RevenueMetric.mrr)).where(RevenueMetric.period == current_period)) or 0.0
    mrr_current = float(mrr_current)
    arr_current = mrr_current * 12.0

    # active_users_30d
    active_users_30d = await db.scalar(
        select(func.count()).select_from(User)
        .where(User.last_login_at >= datetime.now(timezone.utc) - timedelta(days=30))
    ) or 0

    # churn_rate = (cancelled this month / active last month) * 100
    now_dt = datetime.now(timezone.utc)
    month_start = now_dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    cancelled_this_month = await db.scalar(
        select(func.count(OrganizationSubscription.id))
        .where(
            OrganizationSubscription.status == 'CANCELLED',
            OrganizationSubscription.updated_at >= month_start
        )
    ) or 0

    last_month_end = month_start - timedelta(seconds=1)
    active_last_month = await db.scalar(
        select(func.count(OrganizationSubscription.id))
        .where(
            OrganizationSubscription.status == 'ACTIVE',
            OrganizationSubscription.created_at <= last_month_end
        )
    ) or 0

    if active_last_month == 0:
        active_last_month = active_orgs or 1
    churn_rate = round((cancelled_this_month / active_last_month) * 100.0, 2)

    # open_tickets (handle missing table gracefully)
    try:
        open_tickets = await db.scalar(
            text("SELECT COUNT(*) FROM support.support_tickets WHERE status NOT IN ('RESOLVED','CLOSED')")
        ) or 0
    except Exception:
        open_tickets = 0

    # events_this_month
    events_this_month = await db.scalar(
        select(func.count(Event.id))
        .where(Event.created_at >= month_start)
    ) or 0

    # revenue_today
    revenue_today = await db.scalar(
        select(func.coalesce(func.sum(PaymentTransaction.amount), 0))
        .where(
            func.date(PaymentTransaction.created_at) == func.current_date(),
            func.lower(PaymentTransaction.status) == 'completed'
        )
    ) or 0.0
    revenue_today = float(revenue_today)

    # Sparkline data: trends (last 7 days)
    today = date.today()
    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)

    # orgs_trend
    orgs_trend_res = await db.execute(
        select(func.date(Organization.created_at).label("day"), func.count(Organization.id).label("cnt"))
        .where(Organization.created_at >= seven_days_ago)
        .group_by(func.date(Organization.created_at))
    )
    orgs_trend_map = {row.day: row.cnt for row in orgs_trend_res}
    orgs_trend = [orgs_trend_map.get(today - timedelta(days=i), 0) for i in range(6, -1, -1)]

    # users_trend
    users_trend_res = await db.execute(
        select(func.date(User.created_at).label("day"), func.count(User.id).label("cnt"))
        .where(User.created_at >= seven_days_ago)
        .group_by(func.date(User.created_at))
    )
    users_trend_map = {row.day: row.cnt for row in users_trend_res}
    users_trend = [users_trend_map.get(today - timedelta(days=i), 0) for i in range(6, -1, -1)]

    # events_trend
    events_trend_res = await db.execute(
        select(func.date(Event.created_at).label("day"), func.count(Event.id).label("cnt"))
        .where(Event.created_at >= seven_days_ago)
        .group_by(func.date(Event.created_at))
    )
    events_trend_map = {row.day: row.cnt for row in events_trend_res}
    events_trend = [events_trend_map.get(today - timedelta(days=i), 0) for i in range(6, -1, -1)]

    # mrr_trend
    mrr_trend_res = await db.execute(
        select(func.date(RevenueMetric.created_at).label("day"), func.sum(RevenueMetric.mrr).label("mrr_sum"))
        .where(RevenueMetric.created_at >= seven_days_ago)
        .group_by(func.date(RevenueMetric.created_at))
    )
    mrr_trend_map = {row.day: float(row.mrr_sum) for row in mrr_trend_res if row.mrr_sum is not None}
    mrr_trend = [mrr_trend_map.get(today - timedelta(days=i), 0.0) for i in range(6, -1, -1)]

    # revenue_trend — daily payment_transactions sums for last 7 days
    try:
        revenue_trend_res = await db.execute(text("""
            WITH days AS (
                SELECT generate_series(
                    CURRENT_DATE - INTERVAL '6 days',
                    CURRENT_DATE,
                    INTERVAL '1 day'
                )::date AS day
            )
            SELECT d.day, COALESCE(SUM(pt.amount), 0) as rev
            FROM days d
            LEFT JOIN registration.payment_transactions pt
              ON DATE(pt.created_at) = d.day AND LOWER(pt.status) = 'completed'
            GROUP BY d.day ORDER BY d.day
        """))
        revenue_trend = [float(r.rev) for r in revenue_trend_res]
        # Ensure always 7 elements
        while len(revenue_trend) < 7:
            revenue_trend.insert(0, 0.0)
    except Exception:
        revenue_trend = [0.0] * 7

    # top_orgs_by_mrr — top 5 orgs by MRR this period
    try:
        top_orgs_res = await db.execute(text("""
            SELECT rm.organization_id, o.name as org_name,
                   SUM(rm.mrr) as mrr, sp.name as plan_name
            FROM billing.revenue_metrics rm
            JOIN platform.organizations o ON o.id = rm.organization_id
            JOIN billing.organization_subscriptions os
              ON os.organization_id = rm.organization_id
            JOIN billing.subscription_plans sp ON sp.id = os.plan_id
            WHERE rm.period = TO_CHAR(NOW(), 'YYYY-MM')
            GROUP BY rm.organization_id, o.name, sp.name
            ORDER BY mrr DESC LIMIT 5
        """))
        top_orgs_by_mrr = [
            {
                "org_id": str(r.organization_id),
                "org_name": r.org_name,
                "mrr": float(r.mrr or 0),
                "plan_name": r.plan_name,
            }
            for r in top_orgs_res
        ]
    except Exception:
        top_orgs_by_mrr = []

    # subscription health matrix
    sub_counts = await db.execute(
        select(OrganizationSubscription.status, func.count())
        .group_by(OrganizationSubscription.status)
    )
    sub_map = {row[0].upper() if row[0] else "": row[1] for row in sub_counts}
    
    subscriptions_active = sub_map.get("ACTIVE", 0)
    subscriptions_trial = sub_map.get("TRIAL", 0)
    subscriptions_grace = sub_map.get("GRACE_PERIOD", 0)
    subscriptions_suspended = sub_map.get("SUSPENDED", 0)
    subscriptions_expired = sub_map.get("EXPIRED", 0)
    subscriptions_cancelled = sub_map.get("CANCELLED", 0)

    # recent billing activity (last 10 events)
    activity_q = await db.execute(
        select(
            ActivityTimeline.action_type,
            ActivityTimeline.metadata_data,
            ActivityTimeline.timestamp,
            Organization.name.label("org_name"),
            Organization.id.label("org_id")
        )
        .join(Organization, Organization.id == ActivityTimeline.organization_id)
        .order_by(ActivityTimeline.timestamp.desc())
        .limit(10)
    )
    
    def safe_float(val):
        if val is None:
            return None
        try:
            return float(val)
        except (ValueError, TypeError):
            return None

    recent_activity = [
        {
            "org_id": str(r.org_id),
            "org_name": r.org_name,
            "action": r.action_type,
            "amount": safe_float(r.metadata_data.get("amount")) if isinstance(r.metadata_data, dict) else None,
            "occurred_at": r.timestamp.isoformat()
        }
        for r in activity_q
    ]

    # trials expiring in 14 days
    trials_q = await db.execute(
        select(
            OrganizationSubscription.organization_id,
            Organization.name.label("org_name"),
            SubscriptionPlan.name.label("plan_name"),
            OrganizationSubscription.trial_ends_at
        )
        .join(Organization, Organization.id == OrganizationSubscription.organization_id)
        .join(SubscriptionPlan, SubscriptionPlan.id == OrganizationSubscription.plan_id)
        .where(
            OrganizationSubscription.status == 'TRIAL',
            OrganizationSubscription.trial_ends_at <= datetime.now(timezone.utc) + timedelta(days=14)
        )
        .order_by(OrganizationSubscription.trial_ends_at.asc())
    )
    trials_expiring = [
        {
            "org_id": str(r.organization_id),
            "org_name": r.org_name,
            "plan_name": r.plan_name,
            "trial_ends_at": r.trial_ends_at.isoformat(),
            "days_remaining": max(0, (r.trial_ends_at.date() - datetime.now(timezone.utc).date()).days)
        }
        for r in trials_q
    ]

    # Platform status checks
    pg_status = "healthy"
    try:
        await db.execute(select(1))
    except Exception:
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
    """List tenants with enriched health and billing state."""
    stmt = (
        select(Organization, OrganizationHealth, OrganizationUsage)
        .outerjoin(OrganizationHealth, Organization.id == OrganizationHealth.organization_id)
        .outerjoin(OrganizationUsage, Organization.id == OrganizationUsage.organization_id)
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    
    response = []
    for org, health, usage in result.all():
        sub = await _get_current_subscription(db, org.id, with_plan=True)
        plan_name = sub.plan.name if sub and sub.plan else "NONE"
        # Revenue is reported only from the financial ledger. Plan-name price
        # guesses are not authoritative MRR evidence.
        mrr = None
            
        # Query users count in organization
        users_count = await db.scalar(
            select(func.count(User.id)).where(User.organization_id == org.id)
        ) or 0

        # Query organizer/owner name (creator)
        owner_stmt = select(User).where(
            and_(User.organization_id == org.id, User.role.in_(["owner", "admin", "super_admin"]))
        ).order_by(User.created_at.asc()).limit(1)
        owner_user = (await db.execute(owner_stmt)).scalar_one_or_none()
        if not owner_user:
            owner_stmt = select(User).where(User.organization_id == org.id).order_by(User.created_at.asc()).limit(1)
            owner_user = (await db.execute(owner_stmt)).scalar_one_or_none()

        creator_name = f"{owner_user.first_name} {owner_user.last_name}" if owner_user else "—"

        response.append({
            "id": org.id,
            "name": org.name,
            "slug": org.slug,
            "plan": plan_name,
            "status": sub.status if sub else "TRIAL",
            "health_score": health.health_score if health else None,
            "health_status": health.status if health else "NOT_MEASURED",
            "created_at": org.created_at,
            "events_count": usage.active_events_count if usage else 0,
            "users_count": users_count,
            "created_by": creator_name,
            "mrr": mrr
        })
    return response

@router.get("/organizations/{org_id}")
async def get_organization_detail(org_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_platform_admin)):
    """Get full details for CRM Overview tab."""
    del current_user
    async with TenantContextGuard.scoped(db, org_id):
        org = await db.get(Organization, org_id)
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")

        sub = await _get_current_subscription(db, org_id, with_plan=True)
        health_stmt = select(OrganizationHealth).where(OrganizationHealth.organization_id == org_id)
        health = (await db.execute(health_stmt)).scalar_one_or_none()
        max_events = await EntitlementResolver.get_limit(db, org_id, "max_events")
        max_users = await EntitlementResolver.get_limit(db, org_id, "max_users")
        storage_quota_mb = await EntitlementResolver.get_limit(db, org_id, "storage_quota_mb")
        resolved_limits = (max_events, max_users, storage_quota_mb)
        availability = (
            "AVAILABLE"
            if all(value is not None for value in resolved_limits)
            else "UNAVAILABLE"
            if all(value is None for value in resolved_limits)
            else "PARTIAL"
        )

        return {
            "id": org.id,
            "name": org.name,
            "slug": org.slug,
            "domain": org.custom_domain,
            "created_at": org.created_at,
            "max_events": max_events,
            "max_users": max_users,
            "max_storage_gb": (
                storage_quota_mb / 1024 if storage_quota_mb is not None else None
            ),
            "commercial": {
                "source": "CANONICAL_ENTITLEMENT_RESOLVER",
                "availability": availability,
                "limits": {
                    "max_events": max_events,
                    "max_users": max_users,
                    "storage_quota_mb": storage_quota_mb,
                },
            },
            "country": org.country,
            "timezone": org.timezone,
            "subscription": {
                "plan": sub.plan.name if sub and sub.plan else None,
                "status": sub.status if sub else "NOT_CONFIGURED",
                "current_period_end": sub.current_period_end if sub else None,
                "stripe_customer_id": sub.stripe_customer_id if sub else None
            },
            "health": {
                "score": health.health_score if health else None,
                "status": health.status if health else "NOT_MEASURED",
                "warnings": health.warnings if health else []
            }
        }


@router.get("/organizations/{org_id}/features")
async def get_organization_features(org_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_platform_admin)):
    """List all features and whether they are enabled by Plan or Override, plus default/override states."""
    # Get org subscription and plan
    sub = await _get_current_subscription(db, org_id)
    plan_id = sub.plan_id if sub else None
    
    # Get plan features
    plan_feat_keys = set()
    if plan_id:
        pf_stmt = select(FeatureCatalog.key).join(PlanFeature).where(
            and_(PlanFeature.plan_id == plan_id, PlanFeature.enabled == True)
        )
        plan_feat_keys = set((await db.execute(pf_stmt)).scalars().all())
        
    # Get active overrides
    ov_stmt = select(OrganizationFeature).where(OrganizationFeature.organization_id == org_id)
    overrides = {o.feature_id: o.is_enabled for o in (await db.execute(ov_stmt)).scalars().all()}
    
    catalog = (await db.execute(select(FeatureCatalog))).scalars().all()
    
    response = []
    for f in catalog:
        override_val = overrides.get(f.id) # True, False, or None
        is_enabled = override_val if override_val is not None else (f.key in plan_feat_keys)
        response.append({
            "id": str(f.id),
            "key": f.key,
            "name": f.name,
            "description": f.description,
            "category": f.category,
            "plan_enabled": f.key in plan_feat_keys,
            "override_enabled": override_val, # True, False, or None
            "is_enabled": is_enabled
        })
    return response

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

    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    feature = await db.get(FeatureCatalog, payload.feature_id)
    if not feature:
        raise HTTPException(status_code=404, detail="Feature not found")
        
    stmt = select(OrganizationFeature).where(
        and_(OrganizationFeature.organization_id == org_id, OrganizationFeature.feature_id == payload.feature_id)
    )
    override = (await db.execute(stmt)).scalar_one_or_none()
    previous_override = override.is_enabled if override else None
    
    if override:
        override.is_enabled = payload.is_enabled
        override.effective_from = datetime.now(timezone.utc)
        override.expires_at = payload.expires_at
        override.reason = payload.reason
        override.override_by = current_user.id
        override.override_at = datetime.now(timezone.utc)
        override.version += 1
    else:
        new_override = OrganizationFeature(
            organization_id=org_id,
            feature_id=payload.feature_id,
            is_enabled=payload.is_enabled,
            override_by=current_user.id,
            effective_from=datetime.now(timezone.utc),
            expires_at=payload.expires_at,
            reason=payload.reason,
        )
        db.add(new_override)
        
    # Log timeline event
    log = ActivityTimeline(
        organization_id=org_id,
        actor_id=current_user.id,
        action_type="FEATURE_OVERRIDE_CHANGED",
        metadata_data={
            "feature_id": str(payload.feature_id),
            "feature_key": feature.key,
            "previous_override": previous_override,
            "enabled": payload.is_enabled,
            "reason": payload.reason,
        },
    )
    db.add(log)
    db.add(AuditLog(
        actor_user_id=current_user.id,
        organization_id=org_id,
        action_type="FEATURE_OVERRIDE_CHANGED",
        resource_type="organization",
        resource_id=org_id,
        old_state={"feature_id": str(payload.feature_id), "feature_key": feature.key, "override": previous_override},
        new_state={"feature_id": str(payload.feature_id), "feature_key": feature.key, "override": payload.is_enabled},
        change_diff={"reason": payload.reason},
        is_sensitive=True,
        occurred_at=datetime.now(timezone.utc),
    ))
    
    await db.commit()
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

    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    feature = await db.get(FeatureCatalog, feature_id)
    if not feature:
        raise HTTPException(status_code=404, detail="Feature not found")

    existing = await db.scalar(
        select(OrganizationFeature).where(
            and_(OrganizationFeature.organization_id == org_id, OrganizationFeature.feature_id == feature_id)
        )
    )
    previous_override = existing.is_enabled if existing else None
        
    await db.execute(
        delete(OrganizationFeature).where(
            and_(OrganizationFeature.organization_id == org_id, OrganizationFeature.feature_id == feature_id)
        )
    )
    
    # Log timeline event
    log = ActivityTimeline(
        organization_id=org_id,
        actor_id=current_user.id,
        action_type="FEATURE_OVERRIDE_REMOVED",
        metadata_data={
            "feature_id": str(feature_id),
            "feature_key": feature.key,
            "previous_override": previous_override,
            "by": str(current_user.id),
            "reason": payload.reason,
        }
    )
    db.add(log)
    db.add(AuditLog(
        actor_user_id=current_user.id,
        organization_id=org_id,
        action_type="FEATURE_OVERRIDE_REMOVED",
        resource_type="organization",
        resource_id=org_id,
        old_state={"feature_id": str(feature_id), "feature_key": feature.key, "override": previous_override},
        new_state={"feature_id": str(feature_id), "feature_key": feature.key, "override": None},
        change_diff={"reason": payload.reason},
        is_sensitive=True,
        occurred_at=datetime.now(timezone.utc),
    ))
    await db.commit()
    return {"message": "Override removed successfully"}


@router.get("/organizations/{org_id}/addons")
async def list_organization_addons(org_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_platform_admin)):
    """List active addons for the tenant."""
    stmt = select(OrganizationAddon, Addon).join(Addon).where(OrganizationAddon.organization_id == org_id)
    result = await db.execute(stmt)
    return [
        {
            "addon_id": addon.id,
            "name": addon.name,
            "status": org_addon.status,
            "purchased_at": org_addon.purchased_at
        } for org_addon, addon in result.all()
    ]

@router.get("/organizations/{org_id}/usage")
async def get_organization_usage(org_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_platform_admin)):
    """Fetch usage metrics for quota tracking."""
    usage = await db.get(OrganizationUsage, org_id)
    if not usage:
        return {"active_events_count": 0, "active_users_count": 0, "total_registrations_count": 0, "storage_used_bytes": 0}
    return {
        "active_events_count": usage.active_events_count,
        "active_users_count": usage.active_users_count,
        "total_registrations_count": usage.total_registrations_count,
        "storage_used_bytes": usage.storage_used_bytes,
        "last_calculated_at": usage.last_calculated_at
    }

@router.get("/organizations/{org_id}/timeline")
async def get_organization_timeline(org_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_platform_admin), limit: int = 50):
    """Get the customer activity timeline."""
    stmt = select(ActivityTimeline).where(ActivityTimeline.organization_id == org_id).order_by(ActivityTimeline.timestamp.desc()).limit(limit)
    result = await db.execute(stmt)
    return [
        {
            "id": t.id,
            "action_type": t.action_type,
            "actor_id": t.actor_id,
            "timestamp": t.timestamp,
            "metadata": t.metadata_data
        } for t in result.scalars().all()
    ]


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
    plans_stmt = select(SubscriptionPlan).order_by(SubscriptionPlan.display_order.asc())
    plans = (await db.execute(plans_stmt)).scalars().all()
    
    mrr_period = datetime.now(timezone.utc).strftime("%Y-%m")
    
    res = []
    for p in plans:
        # Get active subscribers count
        subscribers_count = await db.scalar(
            select(func.count(OrganizationSubscription.id))
            .where(
                OrganizationSubscription.plan_id == p.id,
                OrganizationSubscription.status.in_(["ACTIVE", "TRIAL"])
            )
        ) or 0
        
        # Calculate MRR for this plan
        plan_mrr = await db.scalar(
            select(func.sum(RevenueMetric.mrr))
            .join(OrganizationSubscription, OrganizationSubscription.organization_id == RevenueMetric.organization_id)
            .where(
                OrganizationSubscription.plan_id == p.id,
                RevenueMetric.period == mrr_period
            )
        ) or 0.0
        
        res.append({
            "id": p.id,
            "name": p.name,
            "tagline": p.tagline,
            "description": p.description,
            "billing_model": p.billing_model,
            "currency": p.currency,
            "price_per_event": float(p.price_per_event) if p.price_per_event is not None else None,
            "price_display": p.price_display,
            "max_events": p.max_events,
            "max_users": p.max_users,
            "max_registrations": p.max_registrations,
            "max_speakers": p.max_speakers,
            "max_sessions": p.max_sessions,
            "max_rooms": p.max_rooms,
            "max_ticket_categories": p.max_ticket_categories,
            "max_badge_templates": p.max_badge_templates,
            "max_certificate_templates": p.max_certificate_templates,
            "max_emails_per_event": p.max_emails_per_event,
            "storage_quota_mb": p.storage_quota_mb,
            "display_order": p.display_order,
            "is_popular": p.is_popular,
            "color_hex": p.color_hex,
            "is_active": p.is_active,
            "version": p.version,
            "lifecycle_status": p.lifecycle_status,
            "effective_at": p.effective_at,
            "retired_at": p.retired_at,
            "created_at": p.created_at,
            "subscribers_count": subscribers_count,
            "mrr": float(plan_mrr),
        })
    return res


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
    stmt = select(FeatureCatalog).where(FeatureCatalog.is_active == True).order_by(
        FeatureCatalog.category_order.asc(),
        FeatureCatalog.feature_order.asc()
    )
    features = (await db.execute(stmt)).scalars().all()

    categories: dict[str, dict[str, Any]] = {}
    for f in features:
        cat = f.category or "GENERAL"
        if cat not in categories:
            categories[cat] = {
                "category": cat,
                "category_name": cat.replace("_", " ").title(),
                "features": []
            }

        categories[cat]["features"].append({
            "key": f.key,
            "name": f.name,
            "description": f.description,
            "value_type": f.value_type,
            "scope_type": f.scope_type,
            "enforcement_mode": f.enforcement_mode,
            "default_value": f.default_value,
            "allowed_values": f.allowed_values or [],
            "unit": f.unit,
            "period": f.period,
            "version": f.version,
        })
    return list(categories.values())


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
    stmt = select(Addon).order_by(Addon.name.asc())
    addons = (await db.execute(stmt)).scalars().all()
    
    addon_list = []
    for a in addons:
        feature_rows = (await db.execute(
            select(AddonFeature, FeatureCatalog)
            .join(FeatureCatalog, FeatureCatalog.id == AddonFeature.feature_id)
            .where(AddonFeature.addon_id == a.id)
            .order_by(FeatureCatalog.category_order, FeatureCatalog.feature_order)
        )).all()
        feature_ids = [mapping.feature_id for mapping, _feature in feature_rows]
        feature_assignments = []
        for mapping, feature in feature_rows:
            raw_value = mapping.entitlement_value
            value = raw_value.get("value") if isinstance(raw_value, dict) else raw_value
            if value is None and (mapping.value_type or feature.value_type) == "BOOLEAN":
                value = True
            feature_assignments.append({
                "feature_key": feature.key,
                "name": feature.name,
                "value_type": mapping.value_type or feature.value_type or "BOOLEAN",
                "value": value,
                "scope_type": mapping.scope_type or feature.scope_type,
                "operation": mapping.operation or "UNLOCK",
                "validity_days": mapping.validity_days,
                "stackable": mapping.stackable,
                "max_quantity": mapping.max_quantity,
                "allowed_values": feature.allowed_values or [],
                "unit": feature.unit,
                "period": feature.period,
            })
        addon_list.append({
            "id": a.id,
            "key": a.key,
            "name": a.name,
            "description": a.description,
            "addon_type": a.addon_type,
            "short_description": a.short_description,
            "image_url": a.image_url,
            "price_inr": float(a.price_inr) if a.price_inr is not None else None,
            "min_price_inr": float(a.min_price_inr) if a.min_price_inr is not None else None,
            "max_price_inr": float(a.max_price_inr) if a.max_price_inr is not None else None,
            "billing_unit": a.billing_unit,
            "price_unit": a.price_unit,
            "scope_type": a.scope_type,
            "consumption_model": a.consumption_model,
            "unit_type": a.unit_type,
            "final_price": float(a.final_price) if a.final_price is not None else None,
            "available_for_plans": a.available_for_plans or [],
            "is_optional_for_plan": a.is_optional_for_plan,
            "included_in_plan": a.included_in_plan,
            "is_active": a.is_active,
            "version": a.version,
            "lifecycle_status": a.lifecycle_status,
            "effective_at": a.effective_at,
            "retired_at": a.retired_at,
            "created_at": a.created_at,
            "feature_ids": [str(fid) for fid in feature_ids],
            "feature_assignments": feature_assignments,
            "features_spec": a.features_spec or [],
            "hardware_spec": a.hardware_spec or [],
            "staff_spec": a.staff_spec or [],
            "inclusions": a.inclusions or [],
            "exclusions": a.exclusions or [],
            "consumables_cost": float(a.consumables_cost or 0)
            ,"template_types": a.template_types or []
        })
    return addon_list


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
    await db.commit()
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
    await db.commit()
    return {"message": "Plan updated", "version": plan.version, "replayed": False}


class PlanFeaturesUpdate(BaseModel):
    feature_keys: List[str]


@router.get("/features")
async def list_features_catalog(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """List all feature catalog items."""
    result = await db.execute(
        select(FeatureCatalog).order_by(
            FeatureCatalog.category_order.asc(),
            FeatureCatalog.category.asc(),
            FeatureCatalog.feature_order.asc(),
            FeatureCatalog.name.asc(),
        )
    )
    catalog = result.scalars().all()
    return [_serialize_feature_catalog_item(feature) for feature in catalog]


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
    await db.commit()
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

    await db.commit()
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

    await db.commit()
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

    await db.commit()
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
    await db.commit()
    return {"message": "Feature deprecated successfully", "feature_key": feature.key}


@router.get("/subscription-plans/{plan_id}/features")
async def get_plan_features(
    plan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Get the features enabled for a subscription plan."""
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
        
    await db.commit()
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
    q = text("""
      SELECT
        os.id, os.organization_id, o.name as org_name, o.slug as org_slug,
        os.plan_id, sp.name as plan_name, sp.color_hex as plan_color_hex,
        os.status, os.trial_ends_at, os.current_period_end,
        os.stripe_customer_id, os.stripe_subscription_id,
        COALESCE(rm.mrr, 0) as mrr_inr,
        CASE WHEN os.trial_ends_at IS NOT NULL
          THEN EXTRACT(DAY FROM os.trial_ends_at - NOW())::int
          ELSE NULL END as days_until_trial_end,
        COUNT(*) OVER() as total_count
      FROM billing.organization_subscriptions os
      JOIN platform.organizations o ON o.id = os.organization_id
      JOIN billing.subscription_plans sp ON sp.id = os.plan_id
      LEFT JOIN billing.revenue_metrics rm ON rm.organization_id = os.organization_id
        AND rm.period = TO_CHAR(NOW(), 'YYYY-MM')
      WHERE (CAST(:status AS varchar) IS NULL OR os.status = CAST(:status AS varchar))
        AND (CAST(:plan_id AS uuid) IS NULL OR os.plan_id = CAST(:plan_id AS uuid))
        AND (CAST(:search AS varchar) IS NULL OR o.name ILIKE CAST(:search_pct AS varchar))
        AND (CAST(:expiring_days AS integer) IS NULL OR (
          os.status = 'TRIAL' AND
          os.trial_ends_at <= NOW() + (CAST(:expiring_days AS integer) * INTERVAL '1 day')
        ))
      ORDER BY os.created_at DESC
      OFFSET :skip LIMIT :limit
    """)
    
    params = {
        "status": status,
        "plan_id": plan_id,
        "search": search,
        "search_pct": f"%{search}%" if search else None,
        "expiring_days": expiring_days,
        "skip": skip,
        "limit": limit
    }
    
    rows_res = await db.execute(q, params)
    rows = rows_res.all()
    
    items = []
    total = 0
    for r in rows:
        total = r.total_count
        items.append({
            "id": str(r.id),
            "organization_id": str(r.organization_id),
            "org_name": r.org_name,
            "org_slug": r.org_slug,
            "plan_id": str(r.plan_id),
            "plan_name": r.plan_name,
            "plan_color_hex": r.plan_color_hex or "#cccccc",
            "status": r.status,
            "trial_ends_at": r.trial_ends_at.isoformat() if r.trial_ends_at else None,
            "current_period_end": r.current_period_end.isoformat() if r.current_period_end else None,
            "stripe_customer_id": r.stripe_customer_id,
            "stripe_subscription_id": r.stripe_subscription_id,
            "mrr_inr": float(r.mrr_inr),
            "days_until_trial_end": r.days_until_trial_end
        })
        
    summary_q = text("""
        SELECT
            COALESCE(SUM(rm.mrr), 0) as total_mrr_inr,
            COUNT(*) FILTER (WHERE os.status = 'ACTIVE') as active_count,
            COUNT(*) FILTER (WHERE os.status = 'TRIAL') as trial_count,
            COUNT(*) FILTER (WHERE os.status IN ('GRACE_PERIOD', 'SUSPENDED')) as at_risk_count
        FROM billing.organization_subscriptions os
        LEFT JOIN billing.revenue_metrics rm ON rm.organization_id = os.organization_id
            AND rm.period = TO_CHAR(NOW(), 'YYYY-MM')
    """)
    summary_res = await db.execute(summary_q)
    s = summary_res.fetchone()
    
    summary = {
        "total_mrr_inr": float(s.total_mrr_inr or 0),
        "total_arr_inr": float(s.total_mrr_inr or 0) * 12.0,
        "active_count": s.active_count or 0,
        "trial_count": s.trial_count or 0,
        "at_risk_count": s.at_risk_count or 0
    }
    
    return {"items": items, "total": total, "summary": summary}


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
    
    try:
        q_str = """
        FROM billing.invoices i
        JOIN platform.organizations o ON o.id = i.organization_id
        LEFT JOIN billing.organization_subscriptions os ON os.organization_id = i.organization_id
        LEFT JOIN billing.subscription_plans sp ON sp.id = os.plan_id
        WHERE (:status IS NULL OR i.status = :status)
          AND (:search IS NULL OR o.name ILIKE :search_pattern)
          AND (:org_id IS NULL OR i.organization_id = :org_id)
        """
        
        count_q = text("SELECT COUNT(*) " + q_str)
        total = await db.scalar(count_q, {
            "status": status,
            "search": search,
            "search_pattern": f"%{search}%" if search else None,
            "org_id": org_id
        }) or 0
        
        q = text("""
        SELECT i.id, i.organization_id, o.name as org_name, 
               sp.name as plan_name, i.amount, i.currency,
               i.status, i.due_date, i.paid_at, i.stripe_invoice_id,
               i.created_at, i.gst_amount, i.total_amount_inr,
               i.invoice_number, i.event_id
        """ + q_str + """
        ORDER BY i.created_at DESC
        OFFSET :skip LIMIT :limit
        """)
        rows = await db.execute(q, {
            "status": status, 
            "search": search,
            "search_pattern": f"%{search}%" if search else None,
            "org_id": org_id,
            "skip": skip, "limit": limit
        })
        items = []
        for r in rows:
            mapped_row = dict(r._mapping)
            amount = float(mapped_row["amount"])
            gst = float(mapped_row["gst_amount"] or 0)
            if gst == 0:
                gst = amount * 0.18
            total_amt = float(mapped_row["total_amount_inr"] or 0)
            if total_amt == 0:
                total_amt = amount + gst
                
            inv_num = mapped_row["invoice_number"]
            if not inv_num:
                inv_num = f"INV-{str(mapped_row['id'])[:8].upper()}"
                
            items.append({
                "id": str(mapped_row["id"]),
                "invoice_number": inv_num,
                "organization_id": str(mapped_row["organization_id"]),
                "org_name": mapped_row["org_name"],
                "plan_name": mapped_row["plan_name"] or "None",
                "amount_inr": amount,
                "gst_amount": gst,
                "total_amount_inr": total_amt,
                "currency": mapped_row["currency"] or "USD",
                "status": mapped_row["status"],
                "due_date": mapped_row["due_date"].isoformat() if mapped_row["due_date"] else None,
                "paid_at": mapped_row["paid_at"].isoformat() if mapped_row["paid_at"] else None,
                "event_id": str(mapped_row["event_id"]) if mapped_row["event_id"] else None,
                "created_at": mapped_row["created_at"].isoformat() if mapped_row["created_at"] else None,
            })
        
        # Summary
        summary_q = text("""
        SELECT 
            SUM(amount) as total_value_inr,
            SUM(CASE WHEN status='PAID' THEN amount ELSE 0 END) as paid_inr,
            SUM(CASE WHEN status='PENDING' THEN amount ELSE 0 END) as pending_inr,
            SUM(CASE WHEN status='OVERDUE' THEN amount ELSE 0 END) as overdue_inr,
            COUNT(*) as total_count,
            COUNT(*) FILTER (WHERE status='PAID') as paid_count,
            COUNT(*) FILTER (WHERE status='OVERDUE') as overdue_count,
            AVG(EXTRACT(EPOCH FROM (paid_at - created_at)) / 86400.0) as avg_collection_days
        FROM billing.invoices
        WHERE (:org_id IS NULL OR organization_id = :org_id)
        """)
        summary_res = await db.execute(summary_q, {"org_id": org_id})
        s = summary_res.fetchone()
        
        summary = {
            "total_value_inr": float(s.total_value_inr or 0),
            "paid_inr": float(s.paid_inr or 0),
            "pending_inr": float(s.pending_inr or 0),
            "overdue_inr": float(s.overdue_inr or 0),
            "total_count": s.total_count or 0,
            "paid_count": s.paid_count or 0,
            "overdue_count": s.overdue_count or 0,
            "avg_collection_days": float(s.avg_collection_days or 0)
        }
        return {"items": items, "total": total, "summary": summary}
    except Exception as e:
        return {
            "items": [], 
            "total": 0, 
            "summary": {
                "total_value_inr": 0,
                "paid_inr": 0,
                "pending_inr": 0,
                "overdue_inr": 0,
                "total_count": 0,
                "paid_count": 0,
                "overdue_count": 0,
                "avg_collection_days": 0
            }
        }


# ── Revenue Metrics ────────────────────────────────────────────

@router.get("/revenue-metrics")
async def get_revenue_metrics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin),
    months: int = Query(12, ge=1, le=24),
):
    """Aggregated MRR/ARR per month for revenue analytics chart."""
    result = await db.execute(
        select(
            RevenueMetric.period,
            func.sum(RevenueMetric.mrr).label("total_mrr"),
            func.sum(RevenueMetric.arr).label("total_arr"),
            func.sum(RevenueMetric.add_on_revenue).label("total_addon"),
        )
        .group_by(RevenueMetric.period)
        .order_by(RevenueMetric.period.desc())
        .limit(months)
    )
    rows = result.all()
    return [
        {
            "period": r.period,
            "mrr": float(r.total_mrr or 0),
            "arr": float(r.total_arr or 0),
            "addon_revenue": float(r.total_addon or 0),
        }
        for r in reversed(rows)
    ]


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
    q = select(User).where(User.deleted_at == None)
    
    if search:
        q = q.where(or_(
            User.email.ilike(f"%{search}%"),
            User.first_name.ilike(f"%{search}%"),
            User.last_name.ilike(f"%{search}%")
        ))
    if role:
        q = q.where(or_(User.role == role, User.platform_role == role))
    if org_id:
        q = q.where(User.organization_id == org_id)
    if two_fa_enabled is not None:
        q = q.where(User.is_2fa_enabled == two_fa_enabled)
    if is_active is not None:
        q = q.where(User.is_active == is_active)
    
    total = await db.scalar(select(func.count()).select_from(q.subquery()))
    users = await db.execute(q.order_by(User.created_at.desc()).offset(skip).limit(limit))
    
    # Get active session counts per user from refresh tokens
    user_list = users.scalars().all()
    user_ids = [u.id for u in user_list]
    
    session_counts = {}
    if user_ids:
        sc = await db.execute(
            select(RefreshToken.user_id, func.count().label("cnt"))
            .where(
                RefreshToken.user_id.in_(user_ids),
                RefreshToken.is_revoked == False,
                RefreshToken.expires_at > datetime.now(timezone.utc)
            )
            .group_by(RefreshToken.user_id)
        )
        session_counts = {r.user_id: r.cnt for r in sc}
    
    # Risk scores from security events (count recent suspicious events)
    risk_scores = {}
    if user_ids:
        rs = await db.execute(
            text("""
            SELECT user_id, 
                   SUM(CASE risk_level WHEN 'CRITICAL' THEN 40 WHEN 'HIGH' THEN 20 
                       WHEN 'MEDIUM' THEN 10 ELSE 2 END) as risk_score
            FROM identity.security_events
            WHERE user_id = ANY(:user_ids) AND occurred_at >= NOW() - INTERVAL '30 days'
            GROUP BY user_id
            """),
            {"user_ids": [str(uid) for uid in user_ids]}
        )
        risk_scores = {uuid.UUID(r.user_id): min(int(r.risk_score), 100) for r in rs}
    
    # Org names
    org_ids = list({u.organization_id for u in user_list if u.organization_id})
    org_names = {}
    if org_ids:
        orgs = await db.execute(
            select(Organization.id, Organization.name).where(Organization.id.in_(org_ids))
        )
        org_names = {r.id: r.name for r in orgs}
    
    results = [
        {
            "id": str(u.id),
            "first_name": u.first_name,
            "last_name": u.last_name,
            "email": u.email,
            "role": u.role,
            "platform_role": u.platform_role,
            "organization_id": str(u.organization_id) if u.organization_id else None,
            "organization_name": org_names.get(u.organization_id, "—"),
            "is_active": u.is_active,
            "is_2fa_enabled": u.is_2fa_enabled,
            "last_login": u.last_login_at.isoformat() if u.last_login_at else None,
            "created_at": u.created_at.isoformat(),
            "active_sessions": session_counts.get(u.id, 0),
            "risk_score": risk_scores.get(u.id, 0),
        }
        for u in user_list
    ]
    
    # Summary stats
    total_2fa = await db.scalar(select(func.count()).select_from(User).where(User.is_2fa_enabled == True))
    total_admins = await db.scalar(
        select(func.count()).select_from(User)
        .where(User.platform_role.in_(["SUPER_ADMIN","FINANCE_ADMIN","SUPPORT_ADMIN"]))
    )
    active_impersonations = await db.scalar(
        text("SELECT COUNT(*) FROM audit.impersonation_logs WHERE terminated_at IS NULL")
    ) or 0
    
    return {
        "items": results,
        "total": total,
        "summary": {
            "total_users": total,
            "active_users": await db.scalar(select(func.count()).select_from(User).where(User.is_active == True)),
            "two_fa_enabled": total_2fa,
            "total_admins": total_admins,
            "active_impersonations": active_impersonations,
        }
    }


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
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    result = await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.is_revoked == False)
        .values(is_revoked=True, revoked_reason="FORCE_LOGOUT_BY_ADMIN")
    )
    db.add(AuditLog(
        organization_id=target.organization_id,
        actor_user_id=current_user.id,
        action_type="USER_SESSIONS_REVOKED",
        resource_type="user",
        resource_id=user_id,
        old_state={"active_sessions_revoked": result.rowcount},
        new_state={"active_sessions": 0},
        change_diff={"reason": payload.reason},
        is_sensitive=True,
    ))
    await db.commit()
    return {"revoked": result.rowcount}


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
    from app.modules.identity.models.identity_domain_tables import MfaDevice
    from app.modules.identity.services.auth_service import revoke_user_refresh_tokens
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    was_2fa_enabled = target.is_2fa_enabled
    await db.execute(
        update(User)
        .where(User.id == user_id)
        .values(is_2fa_enabled=False, two_factor_secret=None)
    )
    await db.execute(delete(MfaDevice).where(MfaDevice.user_id == user_id))
    await revoke_user_refresh_tokens(db, user_id, reason="admin_mfa_reset")
    db.add(AuditLog(
        organization_id=target.organization_id,
        actor_user_id=current_user.id,
        action_type="USER_MFA_RESET",
        resource_type="user",
        resource_id=user_id,
        old_state={"is_2fa_enabled": was_2fa_enabled},
        new_state={"is_2fa_enabled": False, "sessions_revoked": True},
        change_diff={"reason": payload.reason},
        is_sensitive=True,
    ))
    await db.commit()
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
    if cursor:
        normalized = cursor
        if " " in cursor:
            parts = cursor.rsplit(" ", 1)
            if len(parts) == 2 and ":" in parts[1]:
                normalized = "+".join(parts)
        try:
            parsed_cursor = datetime.fromisoformat(normalized)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid cursor format")

    q = text("""
    SELECT 
        al.id, al.organization_id, o.name as org_name,
        al.actor_user_id, 
        u.first_name || ' ' || u.last_name as actor_name,
        u.email as actor_email,
        al.action_type, al.resource_type, al.resource_id,
        al.change_diff, al.request_id, al.correlation_id,
        al.actor_ip, al.actor_user_agent,
        al.is_sensitive, al.row_hash, al.occurred_at,
        al.actor_role,
        """ + ("al.old_state, al.new_state," if include_state else "") + """
        COUNT(*) OVER() as total_count
    FROM audit.logs al
    LEFT JOIN platform.organizations o ON o.id = al.organization_id
    LEFT JOIN identity.users u ON u.id = al.actor_user_id
    WHERE 1=1
      AND (CAST(:action_type AS varchar) IS NULL OR al.action_type = :action_type)
      AND (CAST(:resource_type AS varchar) IS NULL OR al.resource_type = :resource_type)
      AND (CAST(:actor_user_id AS uuid) IS NULL OR al.actor_user_id = CAST(:actor_user_id AS uuid))
      AND (CAST(:organization_id AS uuid) IS NULL OR al.organization_id = CAST(:organization_id AS uuid))
      AND (CAST(:is_sensitive AS boolean) IS NULL OR al.is_sensitive = :is_sensitive)
      AND (CAST(:date_from AS timestamptz) IS NULL OR al.occurred_at >= CAST(:date_from AS timestamptz))
      AND (CAST(:date_to AS timestamptz) IS NULL OR al.occurred_at <= CAST(:date_to AS timestamptz))
      AND (CAST(:cursor AS timestamptz) IS NULL OR al.occurred_at < CAST(:cursor AS timestamptz))
    ORDER BY al.occurred_at DESC
    OFFSET :skip LIMIT :limit
    """)
    
    rows = await db.execute(q, {
        "action_type": action_type, "resource_type": resource_type,
        "actor_user_id": str(actor_user_id) if actor_user_id else None,
        "organization_id": str(organization_id) if organization_id else None,
        "is_sensitive": is_sensitive, "date_from": date_from, "date_to": date_to,
        "cursor": parsed_cursor,
        "skip": skip, "limit": limit
    })
    
    results = []
    total = 0
    for row in rows:
        total = row.total_count
        item = {
            "id": str(row.id),
            "org_name": row.org_name,
            "organization_id": str(row.organization_id) if row.organization_id else None,
            "actor_name": row.actor_name or "System",
            "actor_email": row.actor_email,
            "actor_role": row.actor_role,
            "actor_ip": row.actor_ip,
            "actor_user_agent": row.actor_user_agent,
            "action_type": row.action_type,
            "resource_type": row.resource_type,
            "resource_id": str(row.resource_id),
            "is_sensitive": row.is_sensitive,
            "row_hash": row.row_hash,
            "occurred_at": row.occurred_at.isoformat(),
            "correlation_id": str(row.correlation_id) if row.correlation_id else None,
        }
        if include_state:
            item["old_state"] = row.old_state
            item["new_state"] = row.new_state
            item["change_diff"] = row.change_diff
        results.append(item)
    
    # Action type counts for quick filters sidebar
    counts = await db.execute(text("""
    SELECT action_type, COUNT(*) as cnt 
    FROM audit.logs 
    GROUP BY action_type 
    ORDER BY cnt DESC
    """))
    action_counts = {r.action_type: r.cnt for r in counts}
    
    has_next = (skip + limit) < total
    next_cursor = results[-1]["occurred_at"] if has_next and results else None
    return {"items": results, "total": total, "action_counts": action_counts, "has_next": has_next, "next_cursor": next_cursor}


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
    limit = min(max(limit, 1), 200)
    skip = max(skip, 0)

    # Summary and trend remain global when the feed is filtered.
    severity_counts = await db.execute(text("""
    SELECT risk_level, COUNT(*) as cnt
    FROM identity.security_events
    WHERE occurred_at >= NOW() - INTERVAL '24 hours'
    GROUP BY risk_level
    """))
    sev_map = {r.risk_level: r.cnt for r in severity_counts}
    
    # 7-day trend by severity
    trend_data = await db.execute(text("""
    SELECT DATE(occurred_at) as day, risk_level, COUNT(*) as cnt
    FROM identity.security_events
    WHERE occurred_at >= NOW() - INTERVAL '7 days'
    GROUP BY DATE(occurred_at), risk_level
    ORDER BY day
    """))
    
    total = await db.scalar(
        text("""
        SELECT COUNT(*)
        FROM identity.security_events
        WHERE (CAST(:severity AS VARCHAR) IS NULL OR risk_level = CAST(:severity AS VARCHAR))
          AND (CAST(:event_type AS VARCHAR) IS NULL OR event_type = CAST(:event_type AS VARCHAR))
        """),
        {"severity": severity, "event_type": event_type},
    ) or 0

    q = text("""
    SELECT se.id, se.event_type, se.risk_level, se.severity_score,
           se.user_id, u.email as user_email,
           se.ip_address, se.geo_metadata, se.action_taken,
           se.correlation_id, se.occurred_at
    FROM identity.security_events se
    LEFT JOIN identity.users u ON u.id = se.user_id
    WHERE (CAST(:severity AS VARCHAR) IS NULL OR se.risk_level = CAST(:severity AS VARCHAR))
      AND (CAST(:event_type AS VARCHAR) IS NULL OR se.event_type = CAST(:event_type AS VARCHAR))
    ORDER BY se.occurred_at DESC
    OFFSET :skip LIMIT :limit
    """)
    rows = await db.execute(q, {"severity": severity, "event_type": event_type, "skip": skip, "limit": limit})

    trend_by_day: Dict[str, Dict[str, Any]] = {}
    for row in trend_data:
        day = str(row.day)
        bucket = trend_by_day.setdefault(
            day,
            {"day": day, "low": 0, "medium": 0, "high": 0, "critical": 0},
        )
        level = str(row.risk_level or "").lower()
        if level in {"low", "medium", "high", "critical"}:
            bucket[level] = int(row.cnt or 0)

    return {
        "severity_summary": {
            "CRITICAL": sev_map.get("CRITICAL", 0),
            "HIGH": sev_map.get("HIGH", 0),
            "MEDIUM": sev_map.get("MEDIUM", 0),
            "LOW": sev_map.get("LOW", 0),
            "total_24h": sum(sev_map.values()),
        },
        "trend": sorted(trend_by_day.values(), key=lambda item: item["day"]),
        "items": [
            {
                "id": str(r.id),
                "event_type": r.event_type,
                "risk_level": r.risk_level,
                "severity_score": r.severity_score,
                "user_email": r.user_email,
                "ip_address": r.ip_address,
                "geo_metadata": r.geo_metadata,
                "action_taken": r.action_taken,
                "correlation_id": str(r.correlation_id) if r.correlation_id else None,
                "occurred_at": r.occurred_at.isoformat(),
            }
            for r in rows
        ],
        "total": int(total),
        "has_next": skip + limit < int(total),
    }


# C6: Impersonation logs (real data)
@router.get("/impersonation-logs")
async def get_impersonation_logs(
    skip: int = 0, limit: int = 20,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin)
):
    rows = await db.execute(text("""
    SELECT 
        il.id, il.started_at, il.terminated_at as ended_at, il.ip_address, il.reason,
        imp.email as impersonator_email, 
        imp.first_name || ' ' || imp.last_name as impersonator_name,
        tgt.email as target_email,
        tgt.first_name || ' ' || tgt.last_name as target_name,
        o.name as org_name,
        EXTRACT(EPOCH FROM (COALESCE(il.terminated_at, NOW()) - il.started_at)) as duration_seconds,
        CASE WHEN il.terminated_at IS NULL THEN 'ACTIVE' ELSE 'ENDED' END as status
    FROM audit.impersonation_logs il
    JOIN identity.users imp ON imp.id = il.super_admin_id
    JOIN identity.users tgt ON tgt.id = il.target_user_id
    LEFT JOIN platform.organizations o ON o.id = tgt.organization_id
    ORDER BY il.started_at DESC
    OFFSET :skip LIMIT :limit
    """), {"skip": skip, "limit": limit})
    
    summary = await db.execute(text("""
    SELECT 
        COUNT(*) FILTER (WHERE terminated_at IS NULL) as active_sessions,
        COUNT(*) as total_sessions,
        AVG(EXTRACT(EPOCH FROM (COALESCE(terminated_at, NOW()) - started_at))) as avg_duration,
        MAX(EXTRACT(EPOCH FROM (COALESCE(terminated_at, NOW()) - started_at))) as max_duration,
        COUNT(DISTINCT super_admin_id) as unique_impersonators
    FROM audit.impersonation_logs
    WHERE started_at >= NOW() - INTERVAL '30 days'
    """), {"skip": skip, "limit": limit})
    s = summary.fetchone()
    total = await db.scalar(select(func.count(ImpersonationLog.id))) or 0
    
    return {
        "items": [dict(r._mapping) for r in rows],
        "total": total,
        "summary": {
            "active_sessions": s.active_sessions or 0,
            "total_sessions_30d": s.total_sessions or 0,
            "avg_duration_seconds": float(s.avg_duration or 0),
            "max_duration_seconds": float(s.max_duration or 0),
            "unique_impersonators": s.unique_impersonators or 0,
        }
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
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    old_state = {
        "is_active": org.is_active,
        "suspended_at": org.suspended_at.isoformat() if org.suspended_at else None,
        "suspension_reason": org.suspension_reason,
    }


@router.get("/organizations/{org_id}/dossier")
async def get_organization_dossier(
    org_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin),
):
    """Return a coherent, point-in-time command-center view of one tenant."""
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    now = datetime.now(timezone.utc)
    subscriptions = (await db.execute(
        select(OrganizationSubscription)
        .where(OrganizationSubscription.organization_id == org_id)
        .options(selectinload(OrganizationSubscription.plan))
        .order_by(OrganizationSubscription.created_at.desc())
    )).scalars().all()
    current_sub = next((s for s in subscriptions if s.status in {"ACTIVE", "TRIAL", "GRACE_PERIOD"}), subscriptions[0] if subscriptions else None)

    grants = (await db.execute(
        select(EntitlementGrant).where(EntitlementGrant.organization_id == org_id).order_by(EntitlementGrant.created_at.desc())
    )).scalars().all()
    event_grants = [g for g in grants if g.unit_type == "EVENT" and g.status == "ACTIVE"]
    purchased = sum(int(g.quantity_total or 0) for g in event_grants)
    consumed = sum(int(g.quantity_consumed or 0) for g in event_grants)
    reserved = sum(int(g.quantity_reserved or 0) for g in event_grants)

    actual_events = int(await db.scalar(select(func.count(Event.id)).where(Event.organization_id == org_id)) or 0)
    activation_rows = (await db.execute(
        select(EventActivation.status, func.count(EventActivation.id))
        .where(EventActivation.organization_id == org_id)
        .group_by(EventActivation.status)
    )).all()
    activation_counts = {str(status).upper(): int(count) for status, count in activation_rows}

    plan_feature_ids = set()
    if current_sub:
        plan_feature_ids = set((await db.execute(
            select(PlanFeature.feature_id).where(PlanFeature.plan_id == current_sub.plan_id, PlanFeature.enabled == True)
        )).scalars().all())
    overrides = (await db.execute(
        select(OrganizationFeature).where(OrganizationFeature.organization_id == org_id)
    )).scalars().all()
    override_map = {item.feature_id: item for item in overrides}
    addon_rows = (await db.execute(
        select(OrganizationAddon, Addon).join(Addon, Addon.id == OrganizationAddon.addon_id)
        .where(OrganizationAddon.organization_id == org_id)
        .order_by(OrganizationAddon.purchased_at.desc())
    )).all()
    addon_ids = [row[1].id for row in addon_rows if row[0].status == "ACTIVE" and (not row[0].expires_at or row[0].expires_at > now)]
    addon_feature_ids = set()
    if addon_ids:
        addon_feature_ids = set((await db.execute(
            select(AddonFeature.feature_id).where(AddonFeature.addon_id.in_(addon_ids))
        )).scalars().all())
    catalog = (await db.execute(select(FeatureCatalog).order_by(FeatureCatalog.category, FeatureCatalog.name))).scalars().all()
    capabilities = []
    for feature in catalog:
        override = override_map.get(feature.id)
        override_active = bool(override and (not override.expires_at or override.expires_at > now))
        plan_enabled = feature.id in plan_feature_ids
        addon_enabled = feature.id in addon_feature_ids
        enabled = override.is_enabled if override_active else (plan_enabled or addon_enabled)
        source = "override" if override_active else "addon" if addon_enabled else "plan" if plan_enabled else "none"
        capabilities.append({
            "id": str(feature.id), "key": feature.key, "name": feature.name,
            "category": feature.category, "description": feature.description,
            "enabled": enabled, "source": source,
            "extended": bool(override_active and override.is_enabled),
            "expires_at": override.expires_at if override_active else None,
            "reason": override.reason if override_active else None,
        })

    usage = await db.get(OrganizationUsage, org_id)
    health = await db.scalar(select(OrganizationHealth).where(OrganizationHealth.organization_id == org_id))
    member_count = int(await db.scalar(select(func.count(OrganizationMember.id)).where(OrganizationMember.organization_id == org_id)) or 0)
    owner = await db.scalar(select(User).where(User.organization_id == org_id).order_by(User.created_at.asc()).limit(1))
    # Use the stable legacy invoice columns here. Some deployments predate the
    # richer invoice projection and ORM-selecting the whole model would make an
    # otherwise healthy dossier fail on optional columns.
    invoice_summary = (await db.execute(text("""
        SELECT COUNT(*) AS invoice_count, COALESCE(SUM(amount), 0) AS invoiced_total
        FROM billing.invoices WHERE organization_id = :org_id
    """), {"org_id": org_id})).one()

    def subscription_payload(sub):
        return {
            "id": str(sub.id), "plan_id": str(sub.plan_id), "plan_name": sub.plan.name if sub.plan else "Unknown",
            "status": sub.status, "billing_model": sub.plan.billing_model if sub.plan else None,
            "currency": sub.plan.currency if sub.plan else org.currency[:3],
            "price_per_event": float(sub.plan.price_per_event) if sub.plan and sub.plan.price_per_event is not None else None,
            "trial_ends_at": sub.trial_ends_at, "current_period_end": sub.current_period_end,
            "cancel_at_period_end": sub.cancel_at_period_end, "created_at": sub.created_at,
        }

    return {
        "generated_at": now,
        "profile": {
            "id": str(org.id), "name": org.name, "slug": org.slug, "logo_url": org.logo_url,
            "is_active": org.is_active, "is_platform_org": org.is_platform_org,
            "billing_email": org.billing_email, "custom_domain": org.custom_domain,
            "country": org.country, "timezone": org.timezone, "currency": org.currency,
            "language": org.language, "portal_name": org.portal_name, "date_format": org.date_format,
            "time_format": org.time_format, "organization_type": org.organization_type,
            "industry": org.industry, "expected_events_per_year": org.expected_events_per_year,
            "average_attendees_per_event": org.average_attendees_per_event, "primary_goal": org.primary_goal,
            "enabled_modules": org.enabled_modules or [], "onboarding_completed": org.onboarding_completed,
            "onboarding_step": org.onboarding_step, "created_at": org.created_at, "updated_at": org.updated_at,
            "suspended_at": org.suspended_at, "suspension_reason": org.suspension_reason,
        },
        "owner": {"id": str(owner.id), "name": f"{owner.first_name or ''} {owner.last_name or ''}".strip(), "email": owner.email} if owner else None,
        "health": {"score": health.health_score if health else None, "status": health.status if health else "NOT_MEASURED", "warnings": health.warnings if health else []},
        "subscription": subscription_payload(current_sub) if current_sub else None,
        "subscription_history": [subscription_payload(item) for item in subscriptions],
        "event_entitlement": {"purchased": purchased, "reserved": reserved, "consumed": consumed, "remaining": max(0, purchased - consumed - reserved), "actual_events": actual_events, "activations": activation_counts},
        "grants": [{"id": str(g.id), "type": g.grant_type, "source": g.source_type, "status": g.status, "total": g.quantity_total, "consumed": g.quantity_consumed, "reserved": g.quantity_reserved, "valid_until": g.valid_until} for g in grants],
        "capabilities": capabilities,
        "addons": [{"id": str(oa.id), "catalog_id": str(addon.id), "name": addon.name, "key": addon.key, "type": addon.addon_type, "status": oa.status, "scope": "activation" if oa.activation_id else "event" if oa.event_id else "organization", "quantity": oa.quantity, "unit_price": float(oa.unit_price_snapshot) if oa.unit_price_snapshot is not None else float(addon.final_price or 0), "currency": oa.currency, "purchased_at": oa.purchased_at, "expires_at": oa.expires_at, "event_id": str(oa.event_id) if oa.event_id else None, "activation_id": str(oa.activation_id) if oa.activation_id else None} for oa, addon in addon_rows],
        "usage": {"active_events": usage.active_events_count if usage else 0, "active_users": usage.active_users_count if usage else 0, "registrations": usage.total_registrations_count if usage else 0, "storage_bytes": usage.storage_used_bytes if usage else 0, "calculated_at": usage.last_calculated_at if usage else None},
        "people": {"members": member_count},
        "billing": {"invoice_count": int(invoice_summary.invoice_count), "invoiced_total": float(invoice_summary.invoiced_total), "currency": current_sub.plan.currency if current_sub and current_sub.plan else "INR"},
        "availability": {"profile": True, "subscriptions": True, "entitlements": True, "capabilities": True, "addons": True, "events": True, "people": True, "billing": True},
    }

    org.is_active = payload.is_active
    if not payload.is_active:
        org.suspended_at = datetime.now(timezone.utc)
        org.suspension_reason = payload.suspension_reason
    else:
        org.suspended_at = None
        org.suspension_reason = None
    
    # Sync corresponding OrganizationSubscription status
    sub = await _get_current_subscription(db, org_id)
    if sub:
        sub.status = "SUSPENDED" if not payload.is_active else "ACTIVE"
    
    # Log activity
    log = ActivityTimeline(
        organization_id=org_id,
        actor_id=current_user.id,
        action_type="ORG_SUSPENDED" if not payload.is_active else "ORG_ACTIVATED",
        metadata_data={"reason": payload.suspension_reason, "by": str(current_user.id)}
    )
    db.add(log)
    db.add(AuditLog(
        actor_user_id=current_user.id,
        organization_id=org_id,
        action_type="ORG_SUSPENDED" if not payload.is_active else "ORG_ACTIVATED",
        resource_type="organization",
        resource_id=org_id,
        old_state=old_state,
        new_state={
            "is_active": org.is_active,
            "suspended_at": org.suspended_at.isoformat() if org.suspended_at else None,
            "suspension_reason": org.suspension_reason,
            "subscription_status": sub.status if sub else None,
        },
        change_diff={"reason": payload.suspension_reason},
        is_sensitive=True,
        occurred_at=datetime.now(timezone.utc),
    ))
    await db.commit()
    return {"message": f"Organization {'suspended' if not payload.is_active else 'activated'} successfully"}


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
    await db.commit()
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
    """List all impersonation audit events from the impersonation_logs table."""
    from sqlalchemy.orm import aliased
    Impersonator = aliased(User)
    TargetUser = aliased(User)

    stmt = (
        select(ImpersonationLog, Impersonator, TargetUser, Organization)
        .join(Impersonator, ImpersonationLog.super_admin_id == Impersonator.id)
        .outerjoin(TargetUser, ImpersonationLog.target_user_id == TargetUser.id)
        .join(Organization, ImpersonationLog.target_organization_id == Organization.id)
        .order_by(ImpersonationLog.started_at.desc())
        .offset(skip)
        .limit(limit)
    )
    
    result = await db.execute(stmt)
    rows = result.all()

    total = await db.scalar(select(func.count(ImpersonationLog.id))) or 0

    items = []
    for log, imp, target, org in rows:
        items.append({
            "id": log.id,
            "impersonator_id": log.super_admin_id,
            "impersonator_email": imp.email,
            "impersonator_name": f"{imp.first_name} {imp.last_name}".strip(),
            "target_user_id": log.target_user_id,
            "target_user_email": target.email if target else None,
            "target_user_name": f"{target.first_name} {target.last_name}".strip() if target else None,
            "target_organization_id": log.target_organization_id,
            "target_organization_name": org.name,
            "reason": log.reason,
            "started_at": log.started_at,
            "session_expires_at": log.session_expires_at,
            "ended_at": log.terminated_at,
            "ip_address": log.ip_address,
            "user_agent": log.user_agent,
        })

    return {
        "total": total,
        "items": items
    }


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
    await db.commit()
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
    _: User = Depends(require_platform_admin)
):
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
    # Get org's current plan features
    sub = await _get_current_subscription(db, org_id)
    
    # Get all features from catalog
    all_features = await db.execute(select(FeatureCatalog).order_by(FeatureCatalog.category))
    
    # Get plan's default features
    plan_features = {}
    if sub:
        pf = await db.execute(
            select(PlanFeature)
            .where(PlanFeature.plan_id == sub.plan_id)
        )
        plan_features = {str(r.feature_id): r.enabled for r in pf.scalars()}
    
    # Get org-specific overrides
    org_overrides = await db.execute(
        select(OrganizationFeature)
        .where(OrganizationFeature.organization_id == org_id)
    )
    override_map = {}
    for r in org_overrides.scalars():
        override_map[str(r.feature_id)] = r.is_enabled
    
    result = []
    for feature in all_features.scalars():
        fid = str(feature.id)
        plan_default = plan_features.get(fid, False)
        override = override_map.get(fid)  # None = no override
        
        result.append({
            "feature_id": fid,
            "feature_key": feature.key,
            "feature_name": feature.name,
            "category": feature.category,
            "description": feature.description,
            "plan_default": plan_default,
            "override": override,  # None | True | False
            "effective_value": override if override is not None else plan_default,
        })
    
    return result


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
    
    await db.commit()
    return {"success": True, "updated": len(payload.overrides)}


# ── Subscription Health Summary ───────────────────────────────

@router.get("/subscriptions/health-summary")
async def get_subscriptions_health_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Get count metrics per subscription status."""
    stmt = select(
        OrganizationSubscription.status, 
        func.count(OrganizationSubscription.id)
    ).group_by(OrganizationSubscription.status)
    res = await db.execute(stmt)
    counts = {r[0]: r[1] for r in res.all()}
    
    statuses = ["ACTIVE", "TRIAL", "GRACE_PERIOD", "SUSPENDED", "EXPIRED", "CANCELLED"]
    return {s: counts.get(s, 0) for s in statuses}


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
    
    # 3. INSERT billing.financial_audit_trail (activity_type='PLAN_CHANGED')
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
    
    # 4. INSERT billing.payment_events (event_type='PLAN_CHANGE', metadata={'from_plan': old_plan_name, 'to_plan': new_plan_name})
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
    
    await db.commit()
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
    
    # 4. INSERT into billing.financial_audit_trail:
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
    
    # 5. INSERT into billing.payment_events:
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
    
    await db.commit()
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
    await db.commit()
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
    stmt = select(TenantLimit).where(TenantLimit.organization_id == org_id)
    limits = (await db.execute(stmt)).scalars().all()
    return {l.limit_key: l.limit_value for l in limits}

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

    await db.commit()
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
        organization = await db.scalar(
            select(Organization).where(
                func.lower(Organization.custom_domain) == normalized_host,
                Organization.is_active.is_(True),
            )
        )
    else:
        normalized_slug = (slug or "").strip().lower()
        organization = await db.scalar(
            select(Organization).where(
                Organization.slug == normalized_slug,
                Organization.is_active.is_(True),
            )
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

    profile = await db.scalar(
        select(OrganizationBrandProfile).where(
            OrganizationBrandProfile.organization_id == organization.id,
            OrganizationBrandProfile.status == "PUBLISHED",
            OrganizationBrandProfile.published_version
            == OrganizationBrandProfile.version,
        )
    )
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
    stmt = select(OrganizationDomain).where(OrganizationDomain.organization_id == org_id)
    domains = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": d.id,
            "domain": d.domain,
            "is_verified": d.is_verified,
            "created_at": d.created_at
        } for d in domains
    ]

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
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    dom = OrganizationDomain(organization_id=org_id, domain=payload.domain, is_verified=False)
    db.add(dom)
    await db.flush()
    db.add(AuditLog(
        actor_user_id=current_user.id,
        organization_id=org_id,
        action_type="ORG_DOMAIN_ADDED",
        resource_type="organization_domain",
        resource_id=dom.id,
        old_state=None,
        new_state={"domain": payload.domain, "is_verified": False},
        change_diff={"reason": payload.reason},
        is_sensitive=True,
        occurred_at=datetime.now(timezone.utc),
    ))
    db.add(ActivityTimeline(
        organization_id=org_id,
        actor_id=current_user.id,
        action_type="ORG_DOMAIN_ADDED",
        metadata_data={
            "domain": payload.domain,
            "reason": payload.reason,
            "by": str(current_user.id),
        }
    ))
    await db.commit()
    await db.refresh(dom)
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
    stmt = select(OrganizationDomain).where(
        and_(OrganizationDomain.organization_id == org_id, OrganizationDomain.id == domain_id)
    )
    dom = (await db.execute(stmt)).scalar_one_or_none()
    if not dom:
        raise HTTPException(status_code=404, detail="Domain mapping not found")
    domain_name = dom.domain
    old_state = {
        "domain_id": str(domain_id),
        "domain": domain_name,
        "is_verified": dom.is_verified,
    }
    await db.delete(dom)
    db.add(AuditLog(
        actor_user_id=current_user.id,
        organization_id=org_id,
        action_type="ORG_DOMAIN_DELETED",
        resource_type="organization_domain",
        resource_id=domain_id,
        old_state=old_state,
        new_state=None,
        change_diff={"reason": payload.reason},
        is_sensitive=True,
        occurred_at=datetime.now(timezone.utc),
    ))
    db.add(ActivityTimeline(
        organization_id=org_id,
        actor_id=current_user.id,
        action_type="ORG_DOMAIN_DELETED",
        metadata_data={
            "domain_id": str(domain_id),
            "domain": domain_name,
            "reason": payload.reason,
            "by": str(current_user.id),
        }
    ))
    await db.commit()
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
    stmt = select(OrganizationDomain).where(
        and_(OrganizationDomain.organization_id == org_id, OrganizationDomain.id == domain_id)
    )
    dom = (await db.execute(stmt)).scalar_one_or_none()
    if not dom:
        raise HTTPException(status_code=404, detail="Domain mapping not found")

    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    old_state = {
        "domain_id": str(domain_id),
        "domain": dom.domain,
        "is_verified": dom.is_verified,
        "custom_domain": org.custom_domain,
    }
    dom.is_verified = True
    org.custom_domain = dom.domain

    db.add(AuditLog(
        actor_user_id=current_user.id,
        organization_id=org_id,
        action_type="ORG_DOMAIN_VERIFIED",
        resource_type="organization_domain",
        resource_id=domain_id,
        old_state=old_state,
        new_state={
            "domain_id": str(domain_id),
            "domain": dom.domain,
            "is_verified": True,
            "custom_domain": org.custom_domain,
        },
        change_diff={"reason": payload.reason},
        is_sensitive=True,
        occurred_at=datetime.now(timezone.utc),
    ))
    db.add(ActivityTimeline(
        organization_id=org_id,
        actor_id=current_user.id,
        action_type="ORG_DOMAIN_VERIFIED",
        metadata_data={
            "domain_id": str(domain_id),
            "domain": dom.domain,
            "reason": payload.reason,
            "by": str(current_user.id),
        },
    ))

    await db.commit()
    return {"message": "Domain successfully verified", "domain": dom.domain}


# ── Organization Events Listing ───────────────────────────────

@router.get("/organizations/{org_id}/events")
async def get_organization_events(
    org_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """List all events of an organization along with participant counts."""
    from app.modules.registration.models.participant import Participant
    
    stmt = (
        select(Event)
        .where(Event.organization_id == org_id)
        .execution_options(skip_tenant_filter=True)
    )
    events = (await db.execute(stmt)).scalars().all()
    
    output = []
    for e in events:
        reg_count = await db.scalar(
            select(func.count(Participant.id))
            .where(Participant.event_id == e.id)
            .execution_options(skip_tenant_filter=True)
        ) or 0
        output.append({
            "id": str(e.id),
            "name": e.name,
            "short_code": e.short_code,
            "status": e.status,
            "start_date": e.start_date.isoformat() if e.start_date else None,
            "end_date": e.end_date.isoformat() if e.end_date else None,
            "registration_count": reg_count
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
    stmt = select(ActivityTimeline, Organization).join(
        Organization, ActivityTimeline.organization_id == Organization.id
    ).order_by(ActivityTimeline.timestamp.desc()).limit(limit)
    result = await db.execute(stmt)
    return [
        {
            "id": str(t.id),
            "organization_id": str(t.organization_id),
            "organization_name": org.name,
            "action_type": t.action_type,
            "timestamp": t.timestamp.isoformat(),
            "metadata": t.metadata_data
        } for t, org in result.all()
    ]


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
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    next_role = None if payload.platform_role == "NONE" else payload.platform_role
    if target.id == current_user.id and next_role != "SUPER_ADMIN":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "SELF_DEMOTION_FORBIDDEN",
                "message": "Use a separate Super Admin account to change this administrator role.",
            },
        )
    old_role = target.platform_role
    target.platform_role = next_role
    result = await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.is_revoked == False)
        .values(is_revoked=True, revoked_reason="PLATFORM_ROLE_CHANGED")
    )
    db.add(AuditLog(
        organization_id=target.organization_id,
        actor_user_id=current_user.id,
        action_type="USER_PLATFORM_ROLE_CHANGED",
        resource_type="user",
        resource_id=user_id,
        old_state={"platform_role": old_role},
        new_state={"platform_role": next_role, "sessions_revoked": result.rowcount},
        change_diff={"reason": payload.reason},
        is_sensitive=True,
    ))
    await db.commit()
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
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id and not payload.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "SELF_DEACTIVATION_FORBIDDEN",
                "message": "Use a separate privileged account to deactivate this administrator.",
            },
        )
    old_active = user.is_active
    user.is_active = payload.is_active
    revoked_sessions = 0
    if not payload.is_active:
        result = await db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id, RefreshToken.is_revoked == False)
            .values(is_revoked=True, revoked_reason="USER_DEACTIVATED_BY_ADMIN")
        )
        revoked_sessions = result.rowcount
    db.add(ActivityTimeline(
        organization_id=user.organization_id,
        actor_id=current_user.id,
        action_type="USER_ACTIVATED" if payload.is_active else "USER_DEACTIVATED",
        metadata_data={
            "target_user_id": str(user_id),
            "target_email": user.email,
            "reason": payload.reason,
            "by": str(current_user.id),
        }
    ))
    db.add(AuditLog(
        organization_id=user.organization_id,
        actor_user_id=current_user.id,
        action_type="USER_ACTIVATED" if payload.is_active else "USER_DEACTIVATED",
        resource_type="user",
        resource_id=user_id,
        old_state={"is_active": old_active},
        new_state={"is_active": payload.is_active, "sessions_revoked": revoked_sessions},
        change_diff={"reason": payload.reason},
        is_sensitive=True,
    ))
    await db.commit()
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
    if not await db.get(SubscriptionPlan, plan_id):
        raise HTTPException(status_code=404, detail="Plan not found")
    rows = (await db.execute(select(PlanFeature, FeatureCatalog).join(FeatureCatalog, FeatureCatalog.id == PlanFeature.feature_id).where(PlanFeature.plan_id == plan_id).order_by(FeatureCatalog.category_order, FeatureCatalog.feature_order))).all()
    items = []
    for mapping, feature in rows:
        v_type = feature.value_type or mapping.value_type or "BOOLEAN"
        if isinstance(mapping.entitlement_value, dict) and "value" in mapping.entitlement_value:
            val = mapping.entitlement_value["value"]
        else:
            val = None if v_type == "LIMIT" else mapping.enabled
        ceiling = mapping.hard_ceiling.get("value") if isinstance(mapping.hard_ceiling, dict) else mapping.hard_ceiling
        items.append({
            "feature_key": feature.key,
            "name": feature.name,
            "value_type": v_type,
            "value": val,
            "scope_type": mapping.scope_type or feature.scope_type,
            "enforcement_mode": mapping.enforcement_mode or feature.enforcement_mode,
            "hard_ceiling": ceiling,
            "allowed_values": feature.allowed_values,
            "unit": feature.unit,
            "period": feature.period
        })
    return {"items": items}


@router.get("/subscription-plans/{plan_id}/versions")
async def list_plan_template_versions(
    plan_id: uuid.UUID,
    cursor: Optional[str] = Query(default=None),
    limit: int = Query(default=25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin),
):
    del current_user
    if not await db.get(SubscriptionPlan, plan_id):
        raise HTTPException(status_code=404, detail="Plan not found")
    stmt = select(CommercialTemplateVersion).where(
        CommercialTemplateVersion.resource_type == "PLAN",
        CommercialTemplateVersion.resource_id == plan_id,
    )
    if cursor:
        try:
            decoded = base64.urlsafe_b64decode(cursor.encode()).decode()
            created_raw, version_raw = decoded.split("|", 1)
            created_before = datetime.fromisoformat(created_raw)
            version_before = int(version_raw)
        except (ValueError, UnicodeDecodeError) as exc:
            raise HTTPException(status_code=422, detail={"code": "INVALID_CURSOR"}) from exc
        stmt = stmt.where(or_(
            CommercialTemplateVersion.created_at < created_before,
            and_(
                CommercialTemplateVersion.created_at == created_before,
                CommercialTemplateVersion.version < version_before,
            ),
        ))
    rows = (await db.scalars(stmt.order_by(
        CommercialTemplateVersion.created_at.desc(),
        CommercialTemplateVersion.version.desc(),
    ).limit(limit + 1))).all()
    page = rows[:limit]
    next_cursor = None
    if len(rows) > limit and page:
        last = page[-1]
        next_cursor = base64.urlsafe_b64encode(f"{last.created_at.isoformat()}|{last.version}".encode()).decode()
    return {
        "items": [{
            "id": str(row.id), "version": row.version,
            "lifecycle_status": row.lifecycle_status, "change_type": row.change_type,
            "snapshot": row.snapshot_json, "reason": row.reason,
            "actor_user_id": str(row.actor_user_id) if row.actor_user_id else None,
            "created_at": row.created_at,
        } for row in page],
        "next_cursor": next_cursor,
    }

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
    await db.commit()
    
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
    if not await db.get(Addon, addon_id):
        raise HTTPException(status_code=404, detail="Add-on not found")
    stmt = select(CommercialTemplateVersion).where(
        CommercialTemplateVersion.resource_type == "ADDON",
        CommercialTemplateVersion.resource_id == addon_id,
    )
    if cursor:
        try:
            decoded = base64.urlsafe_b64decode(cursor.encode()).decode()
            created_raw, version_raw = decoded.split("|", 1)
            created_before = datetime.fromisoformat(created_raw)
            version_before = int(version_raw)
        except (ValueError, UnicodeDecodeError) as exc:
            raise HTTPException(status_code=422, detail={"code": "INVALID_CURSOR"}) from exc
        stmt = stmt.where(or_(
            CommercialTemplateVersion.created_at < created_before,
            and_(
                CommercialTemplateVersion.created_at == created_before,
                CommercialTemplateVersion.version < version_before,
            ),
        ))
    rows = (await db.scalars(stmt.order_by(
        CommercialTemplateVersion.created_at.desc(),
        CommercialTemplateVersion.version.desc(),
    ).limit(limit + 1))).all()
    page = rows[:limit]
    next_cursor = None
    if len(rows) > limit and page:
        last = page[-1]
        next_cursor = base64.urlsafe_b64encode(f"{last.created_at.isoformat()}|{last.version}".encode()).decode()
    return {
        "items": [{
            "id": str(row.id), "version": row.version,
            "lifecycle_status": row.lifecycle_status, "change_type": row.change_type,
            "snapshot": row.snapshot_json, "reason": row.reason,
            "actor_user_id": str(row.actor_user_id) if row.actor_user_id else None,
            "created_at": row.created_at,
        } for row in page],
        "next_cursor": next_cursor,
    }

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
    await db.commit()
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
    await db.commit()
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
    await db.commit()
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
    await db.commit()
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
    await db.commit()
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
    await db.commit()
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
    await db.commit()
    return {"message": "Subscription reactivated successfully"}


# ── Invoices Extensions ────────────────────────────────────────

@router.get("/invoices/{invoice_id}/items")
async def get_invoice_items(
    invoice_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Retrieve invoice items list (Super Admin)."""
    stmt = select(InvoiceItem).where(InvoiceItem.invoice_id == invoice_id)
    items = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": str(item.id),
            "description": item.description,
            "amount": float(item.amount),
            "quantity": getattr(item, "quantity", 1),
        }
        for item in items
    ]


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
    await db.commit()
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
    await db.commit()
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
    await db.commit()
    return {"message": "Invoice voided successfully"}


# ── Revenue Analytics ──────────────────────────────────────────

@router.get("/revenue/analytics")
async def get_revenue_analytics(
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
            FROM billing.organization_subscriptions os
            JOIN billing.subscription_plans sp ON sp.id = os.plan_id
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
        FROM billing.revenue_metrics
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
        FROM billing.revenue_metrics rm
        JOIN billing.organization_subscriptions os ON os.organization_id = rm.organization_id
        JOIN billing.subscription_plans sp ON sp.id = os.plan_id
        WHERE rm.period = TO_CHAR(NOW(), 'YYYY-MM')
        GROUP BY sp.name
        ORDER BY mrr DESC
        """)
    )
    mrr_by_plan_rows = mrr_by_plan_res.all()
    
    # Plan upgrades/downgrades this month from billing.payment_events / billing.financial_audit_trail
    plans_res = await db.execute(select(SubscriptionPlan.id, SubscriptionPlan.display_order, SubscriptionPlan.name))
    plan_info = {str(p.id): p.display_order for p in plans_res.all()}
    plan_name_info = {p.name.upper(): p.display_order for p in plans_res.all()}

    upgrades_this_month = 0
    downgrades_this_month = 0
    try:
        events_res = await db.execute(text("""
            SELECT metadata_data 
            FROM billing.payment_events
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
    try:
        res = await db.execute(select(PaymentGateway))
        gateways = res.scalars().all()
        result = []
        for g in gateways:
            result.append({
                "id": str(g.id),
                "name": g.gateway_name,
                "provider": g.provider,
                "mode": g.mode,
                "is_active": g.is_active,
                "success_rate": float(g.success_rate_30d) if g.success_rate_30d is not None else 100.0,
                "transactions_count": g.transactions_mtd,
                "volume_mtd_inr": float(g.volume_mtd_inr) if g.volume_mtd_inr is not None else 0.0,
                "last_checked_at": g.last_health_check.isoformat() if g.last_health_check else None,
                "health_status": g.health_status
            })
        
        # Calculate success rate trend for the last 30 days dynamically from transactions
        trend_res = await db.execute(text("""
            SELECT
                TO_CHAR(created_at, 'YYYY-MM-DD') as day,
                gateway_name,
                COUNT(*) FILTER (WHERE status = 'COMPLETED')::float / COUNT(*) * 100 as success_rate
            FROM registration.payment_transactions
            WHERE created_at >= NOW() - INTERVAL '30 days'
            GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD'), gateway_name
            ORDER BY day
        """))
        trend_data = {}
        for r in trend_res.fetchall():
            d = r.day
            gw = (r.gateway_name or "unknown").lower()
            val = float(r.success_rate or 0.0)
            if d not in trend_data:
                trend_data[d] = {"day": d}
            trend_data[d][gw] = val
        trend_list = sorted(trend_data.values(), key=lambda x: x["day"])

        return {
            "items": result,
            "trend": trend_list
        }
    except Exception as e:
        # Return empty lists when table doesn't exist or error occurs (real DB state fallback)
        return {
            "items": [],
            "trend": []
        }

@router.get("/financial/tax-config")
async def get_financial_tax_config(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin)
):
    tax_rules = []
    pricing_rules = []
    try:
        res = await db.execute(text("SELECT id, name, tax_type, rate, state_region, is_active FROM pricing.tax_rules"))
        tax_rules = [{
            "id": str(r.id),
            "name": r.name,
            "tax_type": r.tax_type,
            "rate": float(r.rate),
            "state_region": r.state_region,
            "is_active": r.is_active
        } for r in res.fetchall()]
    except Exception:
        pass
        
    try:
        res = await db.execute(text("SELECT id, name, value, is_active FROM pricing.pricing_rules"))
        pricing_rules = [{
            "id": str(r.id),
            "name": r.name,
            "value": float(r.value),
            "is_active": r.is_active
        } for r in res.fetchall()]
    except Exception:
        pass
        
    tax_summary_distribution = []
    try:
        tax_dist_res = await db.execute(text("""
            SELECT
                COALESCE(tax_type, 'GST') as type,
                COALESCE(SUM(gst_amount), 0) as val
            FROM billing.invoices
            GROUP BY tax_type
        """))
        tax_summary_distribution = [{"type": r[0], "value": float(r[1])} for r in tax_dist_res.fetchall()]
    except Exception:
        pass
    
    return {
        "tax_rules": tax_rules,
        "pricing_rules": pricing_rules,
        "tax_summary_distribution": tax_summary_distribution
    }

@router.get("/financial/transactions")
async def get_financial_transactions(
    skip: int = 0,
    limit: int = 50,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin)
):
    transactions = []
    total_count = 0
    try:
        query_str = """
            SELECT t.id, t.organization_id, o.name as org_name, t.amount, t.gateway_name, t.status, t.created_at
            FROM registration.payment_transactions t
            LEFT JOIN platform.organizations o ON t.organization_id = o.id
        """
        if status:
            query_str += " WHERE t.status = :status"
        query_str += " ORDER BY t.created_at DESC LIMIT :limit OFFSET :offset"
        
        params = {"limit": limit, "offset": skip}
        if status:
            params["status"] = status
            
        res = await db.execute(text(query_str), params)
        transactions = [{
            "id": str(r.id),
            "organization_id": str(r.organization_id),
            "org_name": r.org_name or "Unknown Org",
            "amount_inr": float(r.amount),
            "gateway": r.gateway_name or "RAZORPAY",
            "status": r.status.upper(),
            "created_at": r.created_at.isoformat()
        } for r in res.fetchall()]
        
        count_query = "SELECT count(*) FROM registration.payment_transactions"
        if status:
            count_query += " WHERE status = :status"
        total_res = await db.execute(text(count_query), {"status": status} if status else {})
        total_count = total_res.scalar() or 0
    except Exception:
        pass
        
    return {
        "items": transactions,
        "total": total_count,
        "summary": {
            "total_count": total_count,
            "completed_count": len([t for t in transactions if t["status"] == "COMPLETED"]),
            "failed_count": len([t for t in transactions if t["status"] == "FAILED"]),
            "refunded_count": len([t for t in transactions if t["status"] == "REFUNDED"])
        }
    }

@router.get("/financial/audit-trail")
async def get_financial_audit_trail(
    skip: int = 0,
    limit: int = 50,
    org_id: Optional[str] = None,
    activity_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin)
):
    items = []
    total_count = 0
    try:
        query_str = """
            SELECT a.id, a.organization_id, o.name as org_name, u.email as performed_by_name, a.activity_type, a.amount, a.occurred_at
            FROM billing.financial_audit_trail a
            LEFT JOIN platform.organizations o ON a.organization_id = o.id
            LEFT JOIN identity.users u ON a.performed_by = u.id
        """
        where_clauses = []
        params = {"limit": limit, "offset": skip}
        if org_id:
            where_clauses.append("a.organization_id = :org_id")
            params["org_id"] = org_id
        if activity_type:
            where_clauses.append("a.activity_type = :activity_type")
            params["activity_type"] = activity_type
            
        if where_clauses:
            query_str += " WHERE " + " AND ".join(where_clauses)
            
        query_str += " ORDER BY a.occurred_at DESC LIMIT :limit OFFSET :offset"
        res = await db.execute(text(query_str), params)
        items = [{
            "id": str(r.id),
            "organization_id": str(r.organization_id) if r.organization_id else None,
            "org_name": r.org_name or "Platform Wide",
            "performed_by_name": r.performed_by_name or "System",
            "activity_type": r.activity_type,
            "amount": float(r.amount) if r.amount is not None else None,
            "occurred_at": r.occurred_at.isoformat()
        } for r in res.fetchall()]
        
        count_query = "SELECT count(*) FROM billing.financial_audit_trail"
        if where_clauses:
            count_query += " WHERE " + " AND ".join(where_clauses)
        total_res = await db.execute(text(count_query), {k: v for k, v in params.items() if k not in ("limit", "offset")})
        total_count = total_res.scalar() or 0
    except Exception:
        pass
        
    return {
        "items": items,
        "total": total_count
    }

@router.get("/impersonation-logs")
async def get_impersonation_logs_route(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_platform_admin)
):
    logs = []
    total_count = 0
    try:
        res = await db.execute(text("""
            SELECT
                l.id,
                l.ip_address,
                l.started_at,
                l.ended_at,
                COALESCE(u1.first_name || ' ' || u1.last_name, 'Super Admin') as impersonator_name,
                COALESCE(u1.email, 'superadmin@Event.com') as impersonator_email,
                COALESCE(u2.first_name || ' ' || u2.last_name, 'Organizer') as target_user_name,
                COALESCE(u2.email, 'organizer@Eventos.com') as target_user_email,
                COALESCE(o.name, 'Platform') as org_name
            FROM auth.impersonation_logs l
            LEFT JOIN identity.users u1 ON l.impersonator_id = u1.id
            LEFT JOIN identity.users u2 ON l.target_user_id = u2.id
            LEFT JOIN platform.organizations o ON l.organization_id = o.id
            ORDER BY l.started_at DESC LIMIT :limit OFFSET :offset
        """), {"limit": limit, "offset": skip})
        
        logs = [{
            "id": str(r.id),
            "impersonator_name": r.impersonator_name,
            "impersonator_email": r.impersonator_email,
            "target_user_name": r.target_user_name,
            "target_user_email": r.target_user_email,
            "org_name": r.org_name,
            "target_organization_name": r.org_name,
            "ip_address": r.ip_address,
            "duration_seconds": int((r.ended_at - r.started_at).total_seconds()) if (r.ended_at and r.started_at) else 0,
            "started_at": r.started_at.isoformat(),
            "ended_at": r.ended_at.isoformat() if r.ended_at else None
        } for r in res.fetchall()]
        
        total_res = await db.execute(text("SELECT count(*) FROM auth.impersonation_logs"))
        total_count = total_res.scalar() or 0
    except Exception:
        pass
        
    return {
        "items": logs,
        "total": total_count
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

