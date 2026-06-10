import uuid
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func, and_

from app.dependencies import ActiveUser, DB
from app.redis import redis_client
from app.modules.billing.models.subscription import OrganizationSubscription, SubscriptionPlan
from app.modules.analytics.models.usage import OrganizationUsage
from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.developer.models.developer_registry import RateLimit

router = APIRouter(prefix="/billing", tags=["billing"])

@router.get("/usage", response_model=Dict[str, Any])
async def get_billing_usage(user: ActiveUser, db: DB):
    """
    Returns the current period usage against the organization's subscription plan limits.
    """
    org_id = user.organization_id
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization context is required."
        )

    # 1. Fetch Plan Limits
    stmt = (
        select(SubscriptionPlan)
        .select_from(OrganizationSubscription)
        .join(SubscriptionPlan, SubscriptionPlan.id == OrganizationSubscription.plan_id)
        .where(OrganizationSubscription.organization_id == org_id)
    )
    res = await db.execute(stmt)
    plan = res.scalar_one_or_none()

    if not plan:
        # Fallback to Starter plan defaults
        plan_name = "Starter"
        max_events = 3
        max_users = 10
        max_registrations = 1000
        storage_quota_bytes = 10240 * 1024 * 1024  # 10 GB
        daily_limit = 10000
    else:
        plan_name = plan.name
        max_events = plan.max_events
        max_users = plan.max_users
        max_registrations = plan.max_registrations
        storage_quota_bytes = plan.storage_quota_mb * 1024 * 1024
        
        # Resolve daily rate limit (check org-specific override first)
        override_stmt = select(RateLimit.requests_per_day).where(RateLimit.organization_id == org_id).execution_options(skip_tenant_filter=True)
        override_res = await db.execute(override_stmt)
        daily_limit = override_res.scalar()
        
        if daily_limit is None:
            plan_limit_stmt = select(RateLimit.requests_per_day).where(RateLimit.plan_tier.ilike(plan_name)).execution_options(skip_tenant_filter=True)
            plan_limit_res = await db.execute(plan_limit_stmt)
            daily_limit = plan_limit_res.scalar() or 10000

    # 2. Query Live Used Metrics
    events_used = await db.scalar(
        select(func.count(Event.id)).where(
            and_(
                Event.organization_id == org_id,
                Event.deleted_at == None
            )
        )
    ) or 0

    users_used = await db.scalar(
        select(func.count(User.id)).where(
            and_(
                User.organization_id == org_id,
                User.deleted_at == None
            )
        )
    ) or 0

    registrations_used = await db.scalar(
        select(func.count(ParticipantRegistration.id))
        .join(Event, Event.id == ParticipantRegistration.event_id)
        .where(
            and_(
                Event.organization_id == org_id,
                ParticipantRegistration.deleted_at == None
            )
        )
    ) or 0

    # 3. Storage bytes from organization_usage
    usage_rec = await db.get(OrganizationUsage, org_id)
    storage_used_bytes = usage_rec.storage_used_bytes if usage_rec else 0

    # 4. API calls today from Redis sliding window key
    api_calls_today = await redis_client.zcard(f"rl:{org_id}:day")

    return {
        "plan_name": plan_name,
        "events_used": events_used,
        "events_max": max_events,
        "users_used": users_used,
        "users_max": max_users,
        "registrations_used": registrations_used,
        "registrations_max": max_registrations,
        "storage_used_bytes": storage_used_bytes,
        "storage_quota_bytes": storage_quota_bytes,
        "api_calls_today": api_calls_today,
        "daily_limit": daily_limit
    }
