import uuid
import hashlib
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select, func, and_, or_, desc, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.dependencies import get_db
from app.modules.identity.models.user import User
from app.modules.audit.models.audit_domain_tables import ImpersonationLog
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.feature import FeatureCatalog
from app.modules.platform.models.health import OrganizationHealth
from app.modules.analytics.models.usage import OrganizationUsage
from app.modules.billing.models.subscription import (
    SubscriptionPlan, OrganizationSubscription, PlanFeature, 
    OrganizationFeature, Addon, OrganizationAddon, 
    ActivityTimeline, RevenueMetric
)
from app.modules.billing.models.billing_domain_tables import Invoice
from app.dependencies import get_current_user
from pydantic import BaseModel

router = APIRouter(prefix="/platform", tags=["Platform Admin CRM"])

# ── Dependencies ─────────────────────────────────────────

async def require_platform_admin(current_user: User = Depends(get_current_user)):
    is_admin = (
        (current_user.platform_role and current_user.platform_role in ["SUPER_ADMIN", "SUPPORT_ADMIN", "FINANCE_ADMIN"]) or
        current_user.role == "super_admin" or
        getattr(current_user, "is_platform_admin", False)
    )
    if not is_admin:
        raise HTTPException(status_code=403, detail="Platform Admin access required")
    return current_user

# ── Endpoints ────────────────────────────────────────────

@router.get("/dashboard")
async def get_dashboard_metrics(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_platform_admin)):
    """Fetch aggregated SaaS metrics for the Super Admin dashboard."""
    total_orgs = await db.scalar(select(func.count(Organization.id)))
    active_orgs = await db.scalar(select(func.count(Organization.id)).where(Organization.is_active == True))
    
    # Aggregated from denormalized usage metrics
    total_events = await db.scalar(select(func.sum(OrganizationUsage.active_events_count))) or 0
    total_regs = await db.scalar(select(func.sum(OrganizationUsage.total_registrations_count))) or 0
    total_storage = await db.scalar(select(func.sum(OrganizationUsage.storage_used_bytes))) or 0
    
    # Aggregated MRR from recent Revenue Metrics
    current_period = datetime.now(timezone.utc).strftime("%Y-%m")
    total_mrr = await db.scalar(select(func.sum(RevenueMetric.mrr)).where(RevenueMetric.period == current_period)) or 0.0
    
    return {
        "total_organizations": total_orgs,
        "active_organizations": active_orgs,
        "total_active_events": total_events,
        "total_registrations": total_regs,
        "storage_used_bytes": total_storage,
        "current_mrr": float(total_mrr),
        "venue_servers_online": 0, # Future placeholder
    }

@router.get("/organizations")
async def list_organizations(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_platform_admin), skip: int = 0, limit: int = 100):
    """List tenants with enriched health and billing state."""
    stmt = (
        select(Organization, OrganizationSubscription, OrganizationHealth)
        .outerjoin(OrganizationSubscription, Organization.id == OrganizationSubscription.organization_id)
        .outerjoin(OrganizationHealth, Organization.id == OrganizationHealth.organization_id)
        .options(selectinload(Organization.subscription).selectinload(OrganizationSubscription.plan))
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    
    response = []
    for org, sub, health in result.all():
        response.append({
            "id": org.id,
            "name": org.name,
            "slug": org.slug,
            "plan": sub.plan.name if sub and sub.plan else "NONE",
            "status": sub.status if sub else "TRIAL",
            "health_score": health.health_score if health else 100,
            "health_status": health.status if health else "HEALTHY",
            "created_at": org.created_at
        })
    return response

@router.get("/organizations/{org_id}")
async def get_organization_detail(org_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_platform_admin)):
    """Get full details for CRM Overview tab."""
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
        
    sub_stmt = select(OrganizationSubscription).options(selectinload(OrganizationSubscription.plan)).where(OrganizationSubscription.organization_id == org_id)
    sub = (await db.execute(sub_stmt)).scalar_one_or_none()
    
    health_stmt = select(OrganizationHealth).where(OrganizationHealth.organization_id == org_id)
    health = (await db.execute(health_stmt)).scalar_one_or_none()
    
    return {
        "id": org.id,
        "name": org.name,
        "domain": org.custom_domain,
        "created_at": org.created_at,
        "subscription": {
            "plan": sub.plan.name if sub and sub.plan else "NONE",
            "status": sub.status if sub else "TRIAL",
            "current_period_end": sub.current_period_end if sub else None,
            "stripe_customer_id": sub.stripe_customer_id if sub else None
        },
        "health": {
            "score": health.health_score if health else 100,
            "status": health.status if health else "HEALTHY",
            "warnings": health.warnings if health else []
        }
    }

@router.get("/organizations/{org_id}/features")
async def get_organization_features(org_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_platform_admin)):
    """List all features and whether they are enabled by Plan or Override."""
    # This combines FeatureCatalog, PlanFeature, and OrganizationFeature
    # Skipping complex join for brevity, using EntitlementService logic
    from app.modules.rbac.services.entitlement_service import EntitlementService
    entitled_keys = await EntitlementService.resolve_entitlements(db, org_id)
    
    cat_stmt = select(FeatureCatalog)
    catalog = (await db.execute(cat_stmt)).scalars().all()
    
    return [
        {
            "id": f.id,
            "key": f.key,
            "name": f.name,
            "is_enabled": f.key in entitled_keys,
            "is_addon": f.is_addon
        } for f in catalog
    ]

class FeatureOverrideRequest(BaseModel):
    feature_id: uuid.UUID
    is_enabled: bool

@router.put("/organizations/{org_id}/features/overrides")
async def override_organization_feature(org_id: uuid.UUID, payload: FeatureOverrideRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_platform_admin)):
    """Manual feature unlock without upgrading plan."""
    if current_user.platform_role != "SUPER_ADMIN":
        raise HTTPException(status_code=403, detail="Super Admin required for overrides")
        
    stmt = select(OrganizationFeature).where(
        and_(OrganizationFeature.organization_id == org_id, OrganizationFeature.feature_id == payload.feature_id)
    )
    override = (await db.execute(stmt)).scalar_one_or_none()
    
    if override:
        override.is_enabled = payload.is_enabled
    else:
        new_override = OrganizationFeature(organization_id=org_id, feature_id=payload.feature_id, is_enabled=payload.is_enabled)
        db.add(new_override)
        
    # Log timeline event
    log = ActivityTimeline(organization_id=org_id, actor_id=current_user.id, action_type="FEATURE_OVERRIDE_CHANGED", metadata_data={"feature_id": str(payload.feature_id), "enabled": payload.is_enabled})
    db.add(log)
    
    await db.commit()
    return {"message": "Override applied successfully"}

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
    name: str
    description: Optional[str] = None
    max_events: int = 3
    max_users: int = 10
    max_registrations: int = 1000
    max_rooms: int = 10
    storage_quota_mb: int = 10240
    stripe_product_id: Optional[str] = None
    is_active: bool = True

class OrgStatusUpdate(BaseModel):
    is_active: bool
    suspension_reason: Optional[str] = None


# ── Subscription Plans CRUD ────────────────────────────────────

@router.get("/subscription-plans")
async def list_subscription_plans(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """List all subscription plans (Super Admin)."""
    result = await db.execute(
        select(SubscriptionPlan).order_by(SubscriptionPlan.created_at.asc())
    )
    plans = result.scalars().all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "max_events": p.max_events,
            "max_users": p.max_users,
            "max_registrations": p.max_registrations,
            "max_rooms": p.max_rooms,
            "storage_quota_mb": p.storage_quota_mb,
            "stripe_product_id": p.stripe_product_id,
            "is_active": p.is_active,
            "created_at": p.created_at,
        }
        for p in plans
    ]


@router.post("/subscription-plans", status_code=201)
async def create_subscription_plan(
    payload: SubscriptionPlanIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Create a new subscription plan (SUPER_ADMIN only)."""
    is_super = current_user.platform_role == "SUPER_ADMIN" or current_user.role == "super_admin" or getattr(current_user, "is_platform_admin", False)
    if not is_super:
        raise HTTPException(status_code=403, detail="SUPER_ADMIN required")
    plan = SubscriptionPlan(
        name=payload.name,
        description=payload.description,
        max_events=payload.max_events,
        max_users=payload.max_users,
        max_registrations=payload.max_registrations,
        max_rooms=payload.max_rooms,
        storage_quota_mb=payload.storage_quota_mb,
        stripe_product_id=payload.stripe_product_id,
        is_active=payload.is_active,
    )
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return {"id": plan.id, "name": plan.name, "message": "Plan created"}


@router.patch("/subscription-plans/{plan_id}")
async def update_subscription_plan(
    plan_id: uuid.UUID,
    payload: SubscriptionPlanIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Update a subscription plan (SUPER_ADMIN only)."""
    is_super = current_user.platform_role == "SUPER_ADMIN" or current_user.role == "super_admin" or getattr(current_user, "is_platform_admin", False)
    if not is_super:
        raise HTTPException(status_code=403, detail="SUPER_ADMIN required")
    plan = await db.get(SubscriptionPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(plan, field, val)
    await db.commit()
    return {"message": "Plan updated"}


class PlanFeaturesUpdate(BaseModel):
    feature_keys: List[str]


@router.get("/features")
async def list_features_catalog(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """List all feature catalog items."""
    result = await db.execute(select(FeatureCatalog).order_by(FeatureCatalog.category.asc()))
    catalog = result.scalars().all()
    return [
        {
            "id": f.id,
            "key": f.key,
            "name": f.name,
            "description": f.description,
            "category": f.category,
            "is_addon": f.is_addon
        }
        for f in catalog
    ]


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


@router.put("/subscription-plans/{plan_id}/features")
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

@router.get("/subscriptions")
async def list_all_subscriptions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin),
    status: Optional[str] = Query(None),
    plan_id: Optional[uuid.UUID] = Query(None),
    skip: int = 0,
    limit: int = 50,
):
    """List all organization subscriptions across platform (Super Admin)."""
    stmt = (
        select(OrganizationSubscription, Organization, SubscriptionPlan)
        .join(Organization, OrganizationSubscription.organization_id == Organization.id)
        .join(SubscriptionPlan, OrganizationSubscription.plan_id == SubscriptionPlan.id)
    )
    filters = []
    if status:
        filters.append(OrganizationSubscription.status == status)
    if plan_id:
        filters.append(OrganizationSubscription.plan_id == plan_id)
    if filters:
        stmt = stmt.where(*filters)
    
    total = await db.scalar(
        select(func.count(OrganizationSubscription.id)).where(*filters)
    ) or 0
    
    result = await db.execute(
        stmt.order_by(OrganizationSubscription.created_at.desc()).offset(skip).limit(limit)
    )
    rows = result.all()
    return {
        "total": total,
        "items": [
            {
                "id": sub.id,
                "organization_id": sub.organization_id,
                "organization_name": org.name,
                "organization_slug": org.slug,
                "plan_id": sub.plan_id,
                "plan_name": plan.name,
                "status": sub.status,
                "stripe_customer_id": sub.stripe_customer_id,
                "stripe_subscription_id": sub.stripe_subscription_id,
                "trial_ends_at": sub.trial_ends_at,
                "current_period_end": sub.current_period_end,
                "cancel_at_period_end": sub.cancel_at_period_end,
                "created_at": sub.created_at,
            }
            for sub, org, plan in rows
        ]
    }


# ── Invoices List ──────────────────────────────────────────────

@router.get("/invoices")
async def list_all_invoices(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin),
    status: Optional[str] = Query(None),
    org_id: Optional[uuid.UUID] = Query(None),
    skip: int = 0,
    limit: int = 50,
):
    """List all invoices across platform (Super Admin)."""
    filters = []
    if status:
        filters.append(Invoice.status == status)
    if org_id:
        filters.append(Invoice.organization_id == org_id)
    
    total = await db.scalar(
        select(func.count(Invoice.id)).where(*filters)
    ) or 0
    
    stmt = select(Invoice, Organization).join(
        Organization, Invoice.organization_id == Organization.id
    ).where(*filters).order_by(Invoice.issued_at.desc()).offset(skip).limit(limit)
    
    result = await db.execute(stmt)
    return {
        "total": total,
        "items": [
            {
                "id": inv.id,
                "organization_id": inv.organization_id,
                "organization_name": org.name,
                "amount": float(inv.amount),
                "status": inv.status,
                "stripe_invoice_id": inv.stripe_invoice_id,
                "issued_at": inv.issued_at,
            }
            for inv, org in result.all()
        ]
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

@router.get("/global-users")
async def list_global_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin),
    search: Optional[str] = Query(None),
    org_id: Optional[uuid.UUID] = Query(None),
    is_active: Optional[bool] = Query(None),
    skip: int = 0,
    limit: int = 50,
):
    """List all users across the platform (Super Admin)."""
    filters = [User.deleted_at == None]
    if search:
        filters.append(or_(
            User.email.ilike(f"%{search}%"),
            User.first_name.ilike(f"%{search}%"),
            User.last_name.ilike(f"%{search}%"),
        ))
    if org_id:
        filters.append(User.organization_id == org_id)
    if is_active is not None:
        filters.append(User.is_active == is_active)

    total = await db.scalar(
        select(func.count(User.id)).where(*filters)
    ) or 0

    stmt = (
        select(User, Organization)
        .join(Organization, User.organization_id == Organization.id)
        .where(*filters)
        .order_by(User.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return {
        "total": total,
        "items": [
            {
                "id": u.id,
                "email": u.email,
                "first_name": u.first_name,
                "last_name": u.last_name,
                "role": u.role,
                "platform_role": u.platform_role,
                "is_active": u.is_active,
                "is_platform_admin": u.is_platform_admin,
                "is_2fa_enabled": u.is_2fa_enabled,
                "organization_id": u.organization_id,
                "organization_name": org.name,
                "last_login_at": u.last_login_at,
                "created_at": u.created_at,
            }
            for u, org in result.all()
        ]
    }


# ── Organization Status Update (Suspend / Activate) ────────────

@router.patch("/organizations/{org_id}/status")
async def update_organization_status(
    org_id: uuid.UUID,
    payload: OrgStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """Suspend or activate an organization (SUPER_ADMIN only)."""
    is_auth = (current_user.platform_role in ["SUPER_ADMIN", "SUPPORT_ADMIN"]) or current_user.role == "super_admin" or getattr(current_user, "is_platform_admin", False)
    if not is_auth:
        raise HTTPException(status_code=403, detail="SUPER_ADMIN or SUPPORT_ADMIN required")
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    org.is_active = payload.is_active
    if not payload.is_active:
        org.suspended_at = datetime.now(timezone.utc)
        org.suspension_reason = payload.suspension_reason
    else:
        org.suspended_at = None
        org.suspension_reason = None
    
    # Log activity
    log = ActivityTimeline(
        organization_id=org_id,
        actor_id=current_user.id,
        action_type="ORG_SUSPENDED" if not payload.is_active else "ORG_ACTIVATED",
        metadata_data={"reason": payload.suspension_reason, "by": str(current_user.id)}
    )
    db.add(log)
    await db.commit()
    return {"message": f"Organization {'suspended' if not payload.is_active else 'activated'} successfully"}


# ── Applications Registry ──────────────────────────────────────

PLATFORM_APPLICATIONS = [
    {"id": "organizer-portal", "name": "Organizer Portal", "description": "Main event management workspace for organizers", "category": "core", "version": "3.0.0", "status": "active"},
    {"id": "registration-portal", "name": "Registration Portal", "description": "Attendee-facing registration and check-in system", "category": "core", "version": "2.5.0", "status": "active"},
    {"id": "speaker-portal", "name": "Speaker Portal", "description": "Speaker-facing file upload and session management", "category": "core", "version": "2.0.0", "status": "active"},
    {"id": "venue-portal", "name": "Venue Portal", "description": "On-site kiosk and venue operations interface", "category": "operations", "version": "1.5.0", "status": "active"},
    {"id": "developer-portal", "name": "Developer Portal", "description": "API gateway, OAuth2 and developer tools", "category": "platform", "version": "1.0.0", "status": "active"},
    {"id": "ai-assistant", "name": "AI Assistant", "description": "RAG-powered event intelligence assistant", "category": "ai", "version": "1.0.0", "status": "beta"},
]

@router.get("/applications")
async def list_platform_applications(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_platform_admin)
):
    """List the platform application registry (Super Admin)."""
    return PLATFORM_APPLICATIONS


# ── Impersonation Logs ─────────────────────────────────────────

class ImpersonateStartRequest(BaseModel):
    reason: str

@router.post("/impersonate/{user_id}")
async def start_impersonation(
    user_id: uuid.UUID,
    payload: ImpersonateStartRequest,
    request: Request,
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
    token = auth_service.create_access_token(target_user)
    token_hash = hashlib.sha256(token.encode()).hexdigest()

    # 3. Create ImpersonationLog row
    started_at = datetime.now(timezone.utc)
    session_expires_at = started_at + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
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
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
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
            item["diff"] = log.diff
        items.append(item)

    return {
        "items": items,
        "next_cursor": next_cursor,
        "has_next": has_next
    }
