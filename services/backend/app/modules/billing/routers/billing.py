import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, and_

from app.dependencies import ActiveUser, DB
from app.redis import coordination_client as redis_client
from app.modules.billing.models.subscription import OrganizationSubscription, SubscriptionPlan
from app.modules.analytics.application.queries import OrganizationUsageQueryService
from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.platform.models.organization import Organization
from app.modules.developer.models.developer_registry import RateLimit
from app.modules.superadmin.dependencies import require_super_admin
from app.modules.billing.services.entitlement_resolver import EntitlementResolver
from app.modules.billing.schemas.commercial import (
    CommercialPlanResponse, PlanFeatureSummary,
    CommercialSubscriptionItem, SubscriptionStatusSummary, PaginatedSubscriptions,
    CommercialInvoiceItem, InvoiceSummary, PaginatedInvoices,
    RevenueSummaryResponse, MrrHistoryPoint, PlanRevenue,
)

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/usage", response_model=Dict[str, Any])
async def get_billing_usage(user: ActiveUser, db: DB):
    org_id = user.organization_id
    if not org_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Organization context is required.")
    sub = await EntitlementResolver.get_active_subscription(db, org_id)
    plan = sub.plan if sub else None
    max_events = await EntitlementResolver.get_limit(db, org_id, "max_events")
    max_users = await EntitlementResolver.get_limit(db, org_id, "max_users")
    max_registrations = await EntitlementResolver.get_limit(db, org_id, "max_registrations")
    storage_quota_mb = await EntitlementResolver.get_limit(db, org_id, "storage_quota_mb")
    plan_name = plan.name if plan else None
    storage_quota_bytes = storage_quota_mb * 1024 * 1024 if storage_quota_mb is not None else None
    override_res = await db.execute(select(RateLimit.requests_per_day).where(
        RateLimit.organization_id == org_id).execution_options(skip_tenant_filter=True))
    daily_limit = override_res.scalar()
    if daily_limit is None and plan_name:
        plan_limit_res = await db.execute(select(RateLimit.requests_per_day).where(
            RateLimit.plan_tier.ilike(plan_name)).execution_options(skip_tenant_filter=True))
        daily_limit = plan_limit_res.scalar()
    events_used = await db.scalar(select(func.count(Event.id)).where(
        and_(Event.organization_id == org_id, Event.deleted_at == None))) or 0
    users_used = await db.scalar(select(func.count(User.id)).where(
        and_(User.organization_id == org_id, User.deleted_at == None))) or 0
    registrations_used = await db.scalar(
        select(func.count(ParticipantRegistration.id))
        .join(Event, Event.id == ParticipantRegistration.event_id)
        .where(and_(Event.organization_id == org_id, ParticipantRegistration.deleted_at == None))) or 0
    usage_rec = await OrganizationUsageQueryService(db).get(organization_id=org_id)
    storage_used_bytes = usage_rec.storage_used_bytes if usage_rec else 0
    api_calls_today = await redis_client.zcard(f"rl:{org_id}:day")
    measured_limits = [max_events, max_users, max_registrations, storage_quota_mb, daily_limit]
    availability = "AVAILABLE" if all(value is not None for value in measured_limits) else "PARTIAL" if any(value is not None for value in measured_limits) else "UNAVAILABLE"
    return {"plan_name": plan_name, "events_used": events_used, "events_max": max_events,
            "users_used": users_used, "users_max": max_users,
            "registrations_used": registrations_used, "registrations_max": max_registrations,
            "storage_used_bytes": storage_used_bytes, "storage_quota_bytes": storage_quota_bytes,
            "api_calls_today": api_calls_today, "daily_limit": daily_limit,
            "availability": availability,
            "freshness_at": datetime.now(timezone.utc),
            "source": "CANONICAL_ENTITLEMENT_RESOLVER",
            "denial_reason": "CONTRACT_REQUIRED" if not plan else None}


@router.get("/plan", response_model=Dict[str, Any])
async def get_billing_plan(user: ActiveUser, db: DB):
    org_id = user.organization_id
    if not org_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Organization context is required.")
    subs = await EntitlementResolver.get_active_subscriptions(db, org_id)
    sub = subs[0] if subs else None
    if not sub:
        organization = await db.get(Organization, org_id)
        if organization and organization.has_unrestricted_capabilities:
            events_used = await db.scalar(select(func.count(Event.id)).where(
                Event.organization_id == org_id, Event.deleted_at.is_(None))) or 0
            users_used = await db.scalar(select(func.count(User.id)).where(
                User.organization_id == org_id, User.deleted_at.is_(None))) or 0
            registrations_used = await db.scalar(
                select(func.count(ParticipantRegistration.id))
                .join(Event, Event.id == ParticipantRegistration.event_id)
                .where(Event.organization_id == org_id, ParticipantRegistration.deleted_at.is_(None))) or 0
            usage_rec = await OrganizationUsageQueryService(db).get(organization_id=org_id)
            storage_used_mb = round((usage_rec.storage_used_bytes if usage_rec else 0) / (1024 * 1024), 2)
            return {
                "subscription_id": None,
                "status": "INTERNAL_UNLIMITED",
                "trial_ends_at": None,
                "current_period_end": None,
                "cancel_at_period_end": False,
                "subscriptions": [],
                "plan": {
                    "id": None,
                    "name": "Eventos Internal",
                    "tagline": "Unrestricted internal organisation",
                    "description": "Internal verification organisation with unrestricted capabilities.",
                    "billing_model": "internal",
                    "currency": organization.currency,
                    "price_per_event": None,
                    "price_display": "Internal",
                    "max_events": None,
                    "max_users": None,
                    "max_registrations": None,
                    "max_speakers": None,
                    "max_sessions": None,
                    "max_rooms": None,
                    "max_ticket_categories": None,
                    "storage_quota_mb": None,
                    "color_hex": organization.primary_color,
                },
                "usage": {
                    "events": {"used": events_used, "max": None},
                    "users": {"used": users_used, "max": None},
                    "registrations": {"used": registrations_used, "max": None},
                    "storage": {"used_mb": storage_used_mb, "max_mb": None},
                },
                "limits": {},
                "availability": "AVAILABLE",
                "freshness_at": datetime.now(timezone.utc),
                "source": "INTERNAL_UNRESTRICTED_ORGANIZATION",
            }
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="No subscription found for this organization.")
    plan = await db.get(SubscriptionPlan, sub.plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Subscription plan not found.")
    events_used = await db.scalar(select(func.count(Event.id)).where(
        Event.organization_id == org_id, Event.deleted_at.is_(None))) or 0
    users_used = await db.scalar(select(func.count(User.id)).where(
        User.organization_id == org_id, User.deleted_at.is_(None))) or 0
    registrations_used = await db.scalar(
        select(func.count(ParticipantRegistration.id))
        .join(Event, Event.id == ParticipantRegistration.event_id)
        .where(Event.organization_id == org_id, ParticipantRegistration.deleted_at.is_(None))) or 0
    usage_rec = await OrganizationUsageQueryService(db).get(organization_id=org_id)
    storage_used_bytes = usage_rec.storage_used_bytes if usage_rec else 0
    storage_used_mb = round(storage_used_bytes / (1024 * 1024), 2)
    max_events = await EntitlementResolver.get_limit(db, org_id, "max_events")
    max_users = await EntitlementResolver.get_limit(db, org_id, "max_users")
    max_registrations = await EntitlementResolver.get_limit(db, org_id, "max_registrations")
    max_speakers = await EntitlementResolver.get_limit(db, org_id, "max_speakers")
    max_sessions = await EntitlementResolver.get_limit(db, org_id, "max_sessions")
    max_rooms = await EntitlementResolver.get_limit(db, org_id, "max_rooms")
    max_ticket_categories = await EntitlementResolver.get_limit(db, org_id, "max_ticket_categories")
    storage_quota_mb = await EntitlementResolver.get_limit(db, org_id, "storage_quota_mb")
    resolved_limits = {
        "max_events": max_events,
        "max_users": max_users,
        "max_registrations": max_registrations,
        "max_speakers": max_speakers,
        "max_sessions": max_sessions,
        "max_rooms": max_rooms,
        "max_ticket_categories": max_ticket_categories,
        "storage_quota_mb": storage_quota_mb,
    }
    return {
        "subscription_id": sub.id, "status": sub.status,
        "trial_ends_at": sub.trial_ends_at, "current_period_end": sub.current_period_end,
        "cancel_at_period_end": sub.cancel_at_period_end,
        "subscriptions": [{
            "subscription_id": item.id,
            "status": item.status,
            "plan_id": item.plan_id,
            "trial_ends_at": item.trial_ends_at,
            "current_period_end": item.current_period_end,
        } for item in subs],
        "plan": {"id": plan.id, "name": plan.name, "tagline": plan.tagline,
                 "description": plan.description, "billing_model": plan.billing_model,
                 "currency": plan.currency,
                 "price_per_event": float(plan.price_per_event) if plan.price_per_event is not None else None,
                 "price_display": plan.price_display, "max_events": max_events,
                 "max_users": max_users, "max_registrations": max_registrations,
                 "max_speakers": max_speakers, "max_sessions": max_sessions,
                 "max_rooms": max_rooms, "max_ticket_categories": max_ticket_categories,
                 "storage_quota_mb": storage_quota_mb, "color_hex": plan.color_hex},
        "usage": {"events": {"used": events_used, "max": max_events},
                  "users": {"used": users_used, "max": max_users},
                  "registrations": {"used": registrations_used, "max": max_registrations},
                  "storage": {"used_mb": storage_used_mb, "max_mb": storage_quota_mb}},
        "limits": resolved_limits,
        "availability": "AVAILABLE" if all(value is not None for value in (max_events, max_users, max_registrations, storage_quota_mb)) else "PARTIAL",
        "freshness_at": datetime.now(timezone.utc),
        "source": "CANONICAL_ENTITLEMENT_RESOLVER"}


# ── Super Admin Commercial Endpoints ─────────────────────────

@router.get("/superadmin/commercial/plans", response_model=List[CommercialPlanResponse],
            tags=["superadmin-commercial"])
async def superadmin_get_plans(db: DB, _: User = Depends(require_super_admin)):
    from app.modules.platform.models.feature import FeatureCatalog
    from app.modules.billing.models.subscription import SubscriptionPlan as SP, PlanFeature
    from app.modules.billing.models.subscription import SubscriptionTransaction
    from sqlalchemy import desc as _desc
    plans = (await db.execute(select(SP).order_by(SP.display_order.asc()))).scalars().all()
    result = []
    for p in plans:
        sub_count = (await db.scalar(select(func.count(OrganizationSubscription.id)).where(
            OrganizationSubscription.plan_id == p.id,
            OrganizationSubscription.status.in_(["ACTIVE", "TRIAL"])))) or 0
        orgs = (await db.execute(select(OrganizationSubscription.organization_id).where(
            OrganizationSubscription.plan_id == p.id,
            OrganizationSubscription.status.in_(["ACTIVE", "TRIAL"])))).scalars().all()
        total_mrr = 0.0
        for oid in orgs:
            v = await db.scalar(select(SubscriptionTransaction.amount).where(
                SubscriptionTransaction.organization_id == oid,
                SubscriptionTransaction.status == "SUCCESS"
            ).order_by(_desc(SubscriptionTransaction.created_at)).limit(1))
            total_mrr += float(v or 0.0)
        feats = (await db.execute(
            select(FeatureCatalog.name, FeatureCatalog.key)
            .join(PlanFeature, PlanFeature.feature_id == FeatureCatalog.id)
            .where(PlanFeature.plan_id == p.id, PlanFeature.enabled.is_(True)))).all()
        result.append(CommercialPlanResponse(
            id=p.id, name=p.name, tagline=p.tagline, description=p.description,
            billing_model=p.billing_model, currency=p.currency,
            price_per_event=float(p.price_per_event) if p.price_per_event else None,
            max_events=p.max_events, max_users=p.max_users,
            max_registrations=p.max_registrations, max_speakers=p.max_speakers,
            max_sessions=p.max_sessions, max_rooms=p.max_rooms,
            storage_quota_mb=p.storage_quota_mb, is_popular=p.is_popular,
            color_hex=p.color_hex, is_active=p.is_active, display_order=p.display_order,
            subscriber_count=sub_count, total_mrr=total_mrr,
            features=[PlanFeatureSummary(feature_name=r[0], feature_key=r[1], enabled=True) for r in feats]))
    return result


@router.get("/superadmin/commercial/subscriptions", response_model=PaginatedSubscriptions,
            tags=["superadmin-commercial"])
async def superadmin_get_subscriptions(
    db: DB,
    sub_status: Optional[str] = Query(default=None, alias="status"),
    plan_id: Optional[uuid.UUID] = Query(default=None),
    search: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    _: User = Depends(require_super_admin),
):
    from app.modules.billing.models.subscription import SubscriptionTransaction
    from app.modules.platform.models.organization import Organization
    from sqlalchemy import desc as _desc, or_
    q = (select(OrganizationSubscription, Organization, SubscriptionPlan)
         .join(Organization, Organization.id == OrganizationSubscription.organization_id)
         .join(SubscriptionPlan, SubscriptionPlan.id == OrganizationSubscription.plan_id))
    cq = (select(func.count(OrganizationSubscription.id))
          .join(Organization, Organization.id == OrganizationSubscription.organization_id))
    if sub_status:
        q = q.where(OrganizationSubscription.status == sub_status.upper())
        cq = cq.where(OrganizationSubscription.status == sub_status.upper())
    if plan_id:
        q = q.where(OrganizationSubscription.plan_id == plan_id)
        cq = cq.where(OrganizationSubscription.plan_id == plan_id)
    if search:
        t = f"%{search}%"
        q = q.where(or_(Organization.name.ilike(t), Organization.slug.ilike(t)))
        cq = cq.where(or_(Organization.name.ilike(t), Organization.slug.ilike(t)))
    total = (await db.scalar(cq)) or 0
    rows = (await db.execute(q.order_by(_desc(OrganizationSubscription.created_at))
                             .offset((page-1)*page_size).limit(page_size))).all()
    counts = {}
    for st in ["ACTIVE","TRIAL","GRACE_PERIOD","SUSPENDED","EXPIRED","CANCELLED"]:
        counts[st] = (await db.scalar(select(func.count(OrganizationSubscription.id))
                                      .where(OrganizationSubscription.status == st))) or 0
    items = []
    for sub, org, plan in rows:
        v = await db.scalar(select(SubscriptionTransaction.amount).where(
            SubscriptionTransaction.organization_id == org.id,
            SubscriptionTransaction.status == "SUCCESS"
        ).order_by(_desc(SubscriptionTransaction.created_at)).limit(1))
        items.append(CommercialSubscriptionItem(
            id=sub.id, organization_id=org.id, org_name=org.name, org_slug=org.slug,
            plan_id=plan.id, plan_name=plan.name, status=sub.status,
            trial_ends_at=sub.trial_ends_at, current_period_end=sub.current_period_end,
            cancel_at_period_end=sub.cancel_at_period_end,
            stripe_customer_id=sub.stripe_customer_id,
            stripe_subscription_id=sub.stripe_subscription_id,
            mrr=float(v or 0.0), created_at=sub.created_at))
    return PaginatedSubscriptions(items=items, total=total, page=page, page_size=page_size,
        summary=SubscriptionStatusSummary(
            ACTIVE=counts["ACTIVE"], TRIAL=counts["TRIAL"], GRACE_PERIOD=counts["GRACE_PERIOD"],
            SUSPENDED=counts["SUSPENDED"], EXPIRED=counts["EXPIRED"], CANCELLED=counts["CANCELLED"],
            total=sum(counts.values())))


@router.get("/superadmin/commercial/subscriptions/expiring-trials",
            response_model=List[CommercialSubscriptionItem], tags=["superadmin-commercial"])
async def superadmin_expiring_trials(
    db: DB,
    days: int = Query(default=7, ge=1, le=90),
    _: User = Depends(require_super_admin),
):
    from app.modules.billing.models.subscription import SubscriptionTransaction
    from app.modules.platform.models.organization import Organization
    from sqlalchemy import desc as _desc
    now = datetime.now(timezone.utc)
    cutoff = now + timedelta(days=days)
    q = (select(OrganizationSubscription, Organization, SubscriptionPlan)
         .join(Organization, Organization.id == OrganizationSubscription.organization_id)
         .join(SubscriptionPlan, SubscriptionPlan.id == OrganizationSubscription.plan_id)
         .where(OrganizationSubscription.status == "TRIAL",
                OrganizationSubscription.trial_ends_at.isnot(None),
                OrganizationSubscription.trial_ends_at >= now,
                OrganizationSubscription.trial_ends_at <= cutoff)
         .order_by(OrganizationSubscription.trial_ends_at.asc()))
    rows = (await db.execute(q)).all()
    result = []
    for sub, org, plan in rows:
        v = await db.scalar(select(SubscriptionTransaction.amount).where(
            SubscriptionTransaction.organization_id == org.id,
            SubscriptionTransaction.status == "SUCCESS"
        ).order_by(_desc(SubscriptionTransaction.created_at)).limit(1))
        result.append(CommercialSubscriptionItem(
            id=sub.id, organization_id=org.id, org_name=org.name, org_slug=org.slug,
            plan_id=plan.id, plan_name=plan.name, status=sub.status,
            trial_ends_at=sub.trial_ends_at, current_period_end=sub.current_period_end,
            cancel_at_period_end=sub.cancel_at_period_end,
            stripe_customer_id=sub.stripe_customer_id,
            stripe_subscription_id=sub.stripe_subscription_id,
            mrr=float(v or 0.0), created_at=sub.created_at))
    return result


@router.get("/superadmin/commercial/invoices", response_model=PaginatedInvoices,
            tags=["superadmin-commercial"])
async def superadmin_get_invoices(
    db: DB,
    inv_status: Optional[str] = Query(default=None, alias="status"),
    search: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    _: User = Depends(require_super_admin),
):
    from app.modules.billing.models.billing_domain_tables import Invoice
    from app.modules.platform.models.organization import Organization
    from sqlalchemy import desc as _desc, or_
    q = (select(Invoice, Organization)
         .join(Organization, Organization.id == Invoice.organization_id))
    cq = select(func.count(Invoice.id)).join(Organization, Organization.id == Invoice.organization_id)
    if inv_status and inv_status != "ALL":
        q = q.where(Invoice.status == inv_status.upper())
        cq = cq.where(Invoice.status == inv_status.upper())
    if search:
        t = f"%{search}%"
        q = q.where(Organization.name.ilike(t)); cq = cq.where(Organization.name.ilike(t))
    total = (await db.scalar(cq)) or 0
    rows = (await db.execute(q.order_by(_desc(Invoice.issued_at))
                             .offset((page-1)*page_size).limit(page_size))).all()
    now = datetime.now(timezone.utc)
    ms = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    paid_t = float((await db.scalar(select(func.coalesce(func.sum(Invoice.amount), 0.0))
                                    .where(Invoice.status == "PAID"))) or 0.0)
    pend_t = float((await db.scalar(select(func.coalesce(func.sum(Invoice.amount), 0.0))
                                    .where(Invoice.status.in_(["UNPAID","OPEN"])))) or 0.0)
    over_t = float((await db.scalar(select(func.coalesce(func.sum(Invoice.amount), 0.0))
                                    .where(Invoice.status == "OVERDUE"))) or 0.0)
    this_m = float((await db.scalar(select(func.coalesce(func.sum(Invoice.amount), 0.0))
                                    .where(Invoice.issued_at >= ms, Invoice.status == "PAID"))) or 0.0)
    org_plan_map: dict = {}
    for oid, pname in (await db.execute(
        select(OrganizationSubscription.organization_id, SubscriptionPlan.name)
        .join(SubscriptionPlan, SubscriptionPlan.id == OrganizationSubscription.plan_id))).all():
        org_plan_map[oid] = pname
    items = [CommercialInvoiceItem(
        id=inv.id, organization_id=org.id, organization_name=org.name,
        amount=float(inv.amount), currency=inv.currency, status=inv.status,
        due_date=inv.due_date, paid_at=inv.paid_at, issued_at=inv.issued_at,
        stripe_invoice_id=inv.stripe_invoice_id, plan_name=org_plan_map.get(org.id)
    ) for inv, org in rows]
    return PaginatedInvoices(items=items, total=total, page=page, page_size=page_size,
        summary=InvoiceSummary(total=paid_t+pend_t+over_t, paid=paid_t, pending=pend_t,
                               overdue=over_t, total_count=total, this_month=this_m))


@router.get("/superadmin/commercial/revenue/summary", response_model=RevenueSummaryResponse,
            tags=["superadmin-commercial"])
async def superadmin_revenue_summary(db: DB, _: User = Depends(require_super_admin)):
    from app.modules.billing.models.subscription import SubscriptionTransaction, RevenueMetric
    from sqlalchemy import desc as _desc, and_
    now = datetime.now(timezone.utc)
    ms = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    prev_end = ms - timedelta(seconds=1)
    rm = (await db.execute(select(func.sum(RevenueMetric.mrr), func.sum(RevenueMetric.arr))
                           .where(RevenueMetric.period == now.strftime("%Y-%m")))).first()
    if rm and rm[0]:
        mrr = float(rm[0]); arr = float(rm[1] or mrr * 12)
    else:
        lsq = (select(SubscriptionTransaction.organization_id,
                      func.max(SubscriptionTransaction.created_at).label("latest"))
               .where(SubscriptionTransaction.status == "SUCCESS")
               .group_by(SubscriptionTransaction.organization_id).subquery())
        mrr = float((await db.scalar(
            select(func.coalesce(func.sum(SubscriptionTransaction.amount), 0.0))
            .join(lsq, and_(SubscriptionTransaction.organization_id == lsq.c.organization_id,
                            SubscriptionTransaction.created_at == lsq.c.latest))
            .where(SubscriptionTransaction.status == "SUCCESS"))) or 0.0)
        arr = mrr * 12
    psq = (select(SubscriptionTransaction.organization_id,
                  func.max(SubscriptionTransaction.created_at).label("latest"))
           .where(SubscriptionTransaction.status == "SUCCESS",
                  SubscriptionTransaction.created_at <= prev_end)
           .group_by(SubscriptionTransaction.organization_id).subquery())
    prev_mrr = float((await db.scalar(
        select(func.coalesce(func.sum(SubscriptionTransaction.amount), 0.0))
        .join(psq, and_(SubscriptionTransaction.organization_id == psq.c.organization_id,
                        SubscriptionTransaction.created_at == psq.c.latest))
        .where(SubscriptionTransaction.status == "SUCCESS"))) or 0.0)
    new_orgs = (await db.execute(select(OrganizationSubscription.organization_id)
                                 .where(OrganizationSubscription.created_at >= ms))).scalars().all()
    net_new = sum(float((await db.scalar(
        select(SubscriptionTransaction.amount).where(
            SubscriptionTransaction.organization_id == oid,
            SubscriptionTransaction.status == "SUCCESS"
        ).order_by(_desc(SubscriptionTransaction.created_at)).limit(1))) or 0.0) for oid in new_orgs)
    churn_orgs = (await db.execute(select(OrganizationSubscription.organization_id).where(
        OrganizationSubscription.status.in_(["CANCELLED","EXPIRED"]),
        OrganizationSubscription.updated_at >= ms))).scalars().all()
    churned = sum(float((await db.scalar(
        select(SubscriptionTransaction.amount).where(
            SubscriptionTransaction.organization_id == oid,
            SubscriptionTransaction.status == "SUCCESS"
        ).order_by(_desc(SubscriptionTransaction.created_at)).limit(1))) or 0.0) for oid in churn_orgs)
    active_cnt = (await db.scalar(select(func.count(OrganizationSubscription.id)).where(
        OrganizationSubscription.status.in_(["ACTIVE","TRIAL"])))) or 1
    pct = round((mrr - prev_mrr) / prev_mrr * 100, 2) if prev_mrr > 0 else 0.0
    return RevenueSummaryResponse(mrr=mrr, arr=arr, net_new_mrr=net_new, churned_mrr=churned,
        expansion_mrr=max(0.0, net_new - churned), arpu=mrr/active_cnt,
        mrr_change_pct=pct, arr_change_pct=pct)


@router.get("/superadmin/commercial/revenue/mrr-history", response_model=List[MrrHistoryPoint],
            tags=["superadmin-commercial"])
async def superadmin_mrr_history(db: DB, months: int = Query(default=12, ge=1, le=36),
                                  _: User = Depends(require_super_admin)):
    from app.modules.billing.models.subscription import RevenueMetric, SubscriptionTransaction
    from sqlalchemy import text as sqlt
    from datetime import date as dc
    rm = (await db.execute(
        select(RevenueMetric.period, func.sum(RevenueMetric.mrr).label("mrr"),
               func.sum(RevenueMetric.arr).label("arr"))
        .group_by(RevenueMetric.period).order_by(RevenueMetric.period.desc()).limit(months))).all()
    if rm:
        out = []
        for r in reversed(rm):
            try: label = dc(int(r.period[:4]), int(r.period[5:7]), 1).strftime("%b %Y")
            except: label = r.period
            out.append(MrrHistoryPoint(month=label, period=r.period,
                                       mrr=float(r.mrr or 0), arr=float(r.arr or 0)))
        return out
    cutoff = datetime.now(timezone.utc) - timedelta(days=months*31)
    txn = (await db.execute(
        select(func.to_char(SubscriptionTransaction.created_at, "YYYY-MM").label("period"),
               func.sum(SubscriptionTransaction.amount).label("total"))
        .where(SubscriptionTransaction.status == "SUCCESS",
               SubscriptionTransaction.created_at >= cutoff)
        .group_by(sqlt("period")).order_by(sqlt("period")))).all()
    out = []
    for r in txn:
        try: label = dc(int(r.period[:4]), int(r.period[5:7]), 1).strftime("%b %Y")
        except: label = r.period
        v = float(r.total or 0)
        out.append(MrrHistoryPoint(month=label, period=r.period, mrr=v, arr=v*12))
    return out


@router.get("/superadmin/commercial/revenue/by-plan", response_model=List[PlanRevenue],
            tags=["superadmin-commercial"])
async def superadmin_revenue_by_plan(db: DB, _: User = Depends(require_super_admin)):
    from app.modules.billing.models.subscription import SubscriptionTransaction
    from sqlalchemy import desc as _desc
    plans = (await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.is_active.is_(True)))).scalars().all()
    out = []
    for p in plans:
        orgs = (await db.execute(select(OrganizationSubscription.organization_id).where(
            OrganizationSubscription.plan_id == p.id,
            OrganizationSubscription.status.in_(["ACTIVE","TRIAL"])))).scalars().all()
        pmrr = sum(float((await db.scalar(
            select(SubscriptionTransaction.amount).where(
                SubscriptionTransaction.organization_id == oid,
                SubscriptionTransaction.status == "SUCCESS"
            ).order_by(_desc(SubscriptionTransaction.created_at)).limit(1))) or 0.0) for oid in orgs)
        out.append(PlanRevenue(plan_id=str(p.id), plan_name=p.name,
                               mrr=pmrr, subscriber_count=len(orgs), pct=0.0))
    total = sum(x.mrr for x in out)
    for x in out:
        x.pct = round(x.mrr / total * 100, 2) if total > 0 else 0.0
    return sorted(out, key=lambda x: x.mrr, reverse=True)
