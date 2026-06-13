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
        # Fallback to Basic plan defaults
        plan_name = "Basic"
        max_events = 1
        max_users = 2
        max_registrations = 150
        storage_quota_bytes = 10 * 1024 * 1024 * 1024  # 10 GB
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


@router.get("/plan", response_model=Dict[str, Any])
async def get_billing_plan(user: ActiveUser, db: DB):
    """
    Returns the organization's current plan details, status, and active usage meters.
    """
    org_id = user.organization_id
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization context is required."
        )

    # Fetch organization subscription
    stmt = (
        select(OrganizationSubscription)
        .where(OrganizationSubscription.organization_id == org_id)
    )
    sub = (await db.execute(stmt)).scalar_one_or_none()
    
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No subscription found for this organization."
        )
        
    plan = await db.get(SubscriptionPlan, sub.plan_id)
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscription plan not found."
        )

    # Total events
    events_used = await db.scalar(
        select(func.count(Event.id)).where(Event.organization_id == org_id, Event.deleted_at.is_(None))
    ) or 0

    # Total users
    users_used = await db.scalar(
        select(func.count(User.id)).where(User.organization_id == org_id, User.deleted_at.is_(None))
    ) or 0

    # Count registrations across all organization's events
    registrations_used = await db.scalar(
        select(func.count(ParticipantRegistration.id))
        .join(Event, Event.id == ParticipantRegistration.event_id)
        .where(Event.organization_id == org_id, ParticipantRegistration.deleted_at.is_(None))
    ) or 0

    # Storage bytes
    usage_rec = await db.get(OrganizationUsage, org_id)
    storage_used_bytes = usage_rec.storage_used_bytes if usage_rec else 0
    storage_used_mb = round(storage_used_bytes / (1024 * 1024), 2)

    return {
        "subscription_id": sub.id,
        "status": sub.status,
        "trial_ends_at": sub.trial_ends_at,
        "current_period_end": sub.current_period_end,
        "cancel_at_period_end": sub.cancel_at_period_end,
        "plan": {
            "id": plan.id,
            "name": plan.name,
            "tagline": plan.tagline,
            "description": plan.description,
            "billing_model": plan.billing_model,
            "currency": plan.currency,
            "price_per_event_min": float(plan.price_per_event_min) if plan.price_per_event_min is not None else None,
            "price_per_event_max": float(plan.price_per_event_max) if plan.price_per_event_max is not None else None,
            "price_display": plan.price_display,
            "max_events": plan.max_events,
            "max_users": plan.max_users,
            "max_registrations": plan.max_registrations,
            "max_speakers": plan.max_speakers,
            "max_sessions": plan.max_sessions,
            "max_rooms": plan.max_rooms,
            "max_ticket_categories": plan.max_ticket_categories,
            "storage_quota_mb": plan.storage_quota_mb,
            "color_hex": plan.color_hex
        },
        "usage": {
            "events": {
                "used": events_used,
                "max": plan.max_events
            },
            "users": {
                "used": users_used,
                "max": plan.max_users
            },
            "registrations": {
                "used": registrations_used,
                "max": plan.max_registrations
            },
            "storage": {
                "used_mb": storage_used_mb,
                "max_mb": plan.storage_quota_mb
            }
        }
    }
