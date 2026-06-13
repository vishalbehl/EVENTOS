from __future__ import annotations

import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db, require_active_user
from app.modules.identity.models.user import User
from app.modules.events.models.event import Event
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.platform.models.organization import Organization
from app.modules.rbac.schemas.organization import OrganizationResponse, OrganizationUpdate
from app.services import auth_service

router = APIRouter(tags=["organisations"])

SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$")


class SignupRequest(BaseModel):
    org_name: str = Field(min_length=2, max_length=100)
    slug: str = Field(min_length=3, max_length=50)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8)
    country: str = Field(default="IN", min_length=2, max_length=2)
    timezone: str = Field(default="Asia/Kolkata", max_length=50)


class InviteRequest(BaseModel):
    email: EmailStr
    org_role: str = Field(pattern="^(admin|member|billing_only)$")


class AcceptInviteRequest(BaseModel):
    token: str
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8)


class MemberRoleUpdate(BaseModel):
    org_role: str = Field(pattern="^(owner|admin|member|billing_only)$")


class PlatformOrgUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    custom_domain: Optional[str] = None
    billing_email: Optional[str] = None
    country: Optional[str] = None
    timezone: Optional[str] = None
    plan: Optional[str] = Field(None, pattern="^(trial|basic|pro|professional|enterprise)$")
    max_events: Optional[int] = Field(None, ge=1)
    max_users: Optional[int] = Field(None, ge=1)
    max_storage_gb: Optional[int] = Field(None, ge=1)
    is_active: Optional[bool] = None
    suspension_reason: Optional[str] = None



def _clean_slug(slug: str) -> str:
    return slug.strip().lower()


async def _org_role(db: AsyncSession, user: User) -> str:
    if user.role == "super_admin" or getattr(user, "is_platform_admin", False):
        return "owner"
    result = await db.execute(
        select(OrganizationMember.org_role).where(
            OrganizationMember.organization_id == user.organization_id,
            OrganizationMember.user_id == user.id,
            OrganizationMember.is_active.is_(True),
        )
    )
    return result.scalar_one_or_none() or ("owner" if user.role in ("organiser", "admin") else "member")


async def _require_org_admin(db: AsyncSession, user: User) -> None:
    if await _org_role(db, user) not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Owner or admin access required.")


async def _require_owner(db: AsyncSession, user: User) -> None:
    if await _org_role(db, user) != "owner":
        raise HTTPException(status_code=403, detail="Owner access required.")


def _token_response(user: User, access_token: str, organization: Organization) -> dict:
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "organization": OrganizationResponse.model_validate(organization).model_dump(mode="json"),
        "user": {
            "id": str(user.id),
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "full_name": user.full_name,
            "role": user.role,
            "organization_id": str(user.organization_id),
            "is_active": user.is_active,
            "is_platform_admin": getattr(user, "is_platform_admin", False),
        },
    }


async def _usage(db: AsyncSession, org_id: uuid.UUID) -> tuple[int, int]:
    events = await db.scalar(select(func.count(Event.id)).where(Event.organization_id == org_id))
    members = await db.scalar(select(func.count(OrganizationMember.id)).where(
        OrganizationMember.organization_id == org_id,
        OrganizationMember.is_active.is_(True),
    ))
    return int(events or 0), int(members or 0)


async def _member_rows(db: AsyncSession, org_id: uuid.UUID) -> list[dict]:
    result = await db.execute(
        select(OrganizationMember, User).outerjoin(User, OrganizationMember.user_id == User.id).where(
            OrganizationMember.organization_id == org_id
        ).order_by(OrganizationMember.invited_at.asc())
    )
    return [{
        "id": str(member.id),
        "user_id": str(user.id) if user else None,
        "name": user.full_name if user else (member.invite_email or "Pending invite"),
        "email": user.email if user else member.invite_email,
        "org_role": member.org_role,
        "accepted_at": member.accepted_at.isoformat() if member.accepted_at else None,
        "invited_at": member.invited_at.isoformat() if member.invited_at else None,
        "is_active": member.is_active,
    } for member, user in result.all()]


@router.get("/auth/check-slug")
async def check_slug(slug: str = Query(..., min_length=3, max_length=50), db: AsyncSession = Depends(get_db)) -> dict:
    slug = _clean_slug(slug)
    if not SLUG_RE.match(slug):
        return {"available": False}
    exists = await db.scalar(select(func.count(Organization.id)).where(Organization.slug == slug))
    return {"available": not bool(exists)}


@router.post("/auth/signup", status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest, db: AsyncSession = Depends(get_db)) -> dict:
    slug = _clean_slug(payload.slug)
    if not SLUG_RE.match(slug):
        raise HTTPException(status_code=422, detail="Slug must be 3-50 lowercase letters, numbers, or hyphens.")
    if await db.scalar(select(func.count(Organization.id)).where(Organization.slug == slug)):
        raise HTTPException(status_code=409, detail="Organisation slug is already taken.")
    email = payload.email.lower()
    if await db.scalar(select(func.count(User.id)).where(User.email == email)):
        raise HTTPException(status_code=409, detail="Email is already registered.")

    org = Organization(
        name=payload.org_name,
        slug=slug,
        plan="trial",
        plan_expires_at=datetime.now(timezone.utc) + timedelta(days=14),
        country=payload.country.upper(),
        timezone=payload.timezone,
    )
    db.add(org)
    await db.flush()
    user = User(
        organization_id=org.id,
        email=email,
        password_hash=auth_service.hash_password(payload.password),
        first_name=payload.first_name,
        last_name=payload.last_name,
        role="organiser",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    db.add(OrganizationMember(organization_id=org.id, user_id=user.id, org_role="owner", accepted_at=datetime.now(timezone.utc)))
    access_token = auth_service.create_access_token(user)
    await db.commit()
    await db.refresh(org)
    await db.refresh(user)
    return _token_response(user, access_token, org)


@router.post("/auth/accept-invite")
async def accept_invite(payload: AcceptInviteRequest, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(select(OrganizationMember).where(OrganizationMember.invite_token == payload.token))
    member = result.scalar_one_or_none()
    if not member or not member.invite_email:
        raise HTTPException(status_code=404, detail="Invitation not found.")
    if member.invited_at < datetime.now(timezone.utc) - timedelta(days=7):
        raise HTTPException(status_code=410, detail="Invitation has expired.")
    if await db.scalar(select(func.count(User.id)).where(User.email == member.invite_email.lower())):
        raise HTTPException(status_code=409, detail="Email is already registered.")
    user = User(
        organization_id=member.organization_id,
        email=member.invite_email.lower(),
        password_hash=auth_service.hash_password(payload.password),
        first_name=payload.first_name,
        last_name=payload.last_name,
        role="admin" if member.org_role == "admin" else "session_manager",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    member.user_id = user.id
    member.accepted_at = datetime.now(timezone.utc)
    member.invite_token = None
    org = await db.get(Organization, member.organization_id)
    access_token = auth_service.create_access_token(user)
    await db.commit()
    return _token_response(user, access_token, org)


@router.get("/organisations/me")
async def get_my_org(current_user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)) -> dict:
    org = await db.get(Organization, current_user.organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found.")
    event_count, member_count = await _usage(db, org.id)
    return {
        "organization": OrganizationResponse.model_validate(org).model_dump(mode="json"),
        "member_count": member_count,
        "event_count": event_count,
        "storage_used_gb": 0,
        "plan_limits": {"events": org.max_events, "users": org.max_users, "storage_gb": org.max_storage_gb},
        "org_role": await _org_role(db, current_user),
    }


@router.put("/organisations/me")
async def update_my_org(payload: OrganizationUpdate, current_user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)) -> dict:
    await _require_org_admin(db, current_user)
    org = await db.get(Organization, current_user.organization_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(org, field, value)
    await db.commit()
    await db.refresh(org)
    return {"organization": OrganizationResponse.model_validate(org).model_dump(mode="json")}


@router.get("/organisations/me/members")
async def list_members(current_user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)) -> list[dict]:
    return await _member_rows(db, current_user.organization_id)


@router.post("/organisations/me/members/invite")
async def invite_member(payload: InviteRequest, current_user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)) -> dict:
    await _require_org_admin(db, current_user)
    org = await db.get(Organization, current_user.organization_id)
    _, member_count = await _usage(db, org.id)
    if member_count >= org.max_users:
        raise HTTPException(status_code=403, detail="Team member limit reached for your plan.")
    token = secrets.token_urlsafe(32)[:64]
    db.add(OrganizationMember(
        organization_id=org.id,
        org_role=payload.org_role,
        invited_by=current_user.id,
        invite_token=token,
        invite_email=payload.email.lower(),
    ))
    await db.commit()
    return {"message": "Invitation sent", "invite_token": token}


@router.put("/organisations/me/members/{member_id}")
async def update_member(member_id: uuid.UUID, payload: MemberRoleUpdate, current_user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)) -> dict:
    await _require_owner(db, current_user)
    member = await db.get(OrganizationMember, member_id)
    if not member or member.organization_id != current_user.organization_id:
        raise HTTPException(status_code=404, detail="Member not found.")
    if member.org_role == "owner" and payload.org_role != "owner":
        owners = await db.scalar(select(func.count(OrganizationMember.id)).where(
            OrganizationMember.organization_id == current_user.organization_id,
            OrganizationMember.org_role == "owner",
            OrganizationMember.is_active.is_(True),
        ))
        if int(owners or 0) <= 1:
            raise HTTPException(status_code=400, detail="Cannot demote the last owner.")
    member.org_role = payload.org_role
    await db.commit()
    return {"message": "Member updated"}


@router.delete("/organisations/me/members/{member_id}")
async def remove_member(member_id: uuid.UUID, current_user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)) -> dict:
    await _require_owner(db, current_user)
    member = await db.get(OrganizationMember, member_id)
    if not member or member.organization_id != current_user.organization_id:
        raise HTTPException(status_code=404, detail="Member not found.")
    if member.org_role == "owner":
        raise HTTPException(status_code=400, detail="Cannot remove an owner.")
    member.is_active = False
    await db.commit()
    return {"message": "Member removed"}


async def _require_platform_admin(current_user: User = Depends(get_current_user)) -> User:
    if not getattr(current_user, "is_platform_admin", False) and current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Platform admin access required.")
    return current_user


@router.get("/platform/organisations")
async def platform_orgs(
    page: int = 1,
    per_page: int = 25,
    search: Optional[str] = None,
    plan: Optional[str] = None,
    is_active: Optional[bool] = None,
    _: User = Depends(_require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    query = select(Organization)
    if search:
        query = query.where(Organization.name.ilike(f"%{search}%") | Organization.slug.ilike(f"%{search}%") | Organization.billing_email.ilike(f"%{search}%"))
    if plan:
        query = query.where(Organization.plan == plan)
    if is_active is not None:
        query = query.where(Organization.is_active.is_(is_active))
    result = await db.execute(query.order_by(Organization.created_at.desc()).offset((page - 1) * per_page).limit(per_page))
    items = []
    for org in result.scalars().all():
        event_count, member_count = await _usage(db, org.id)
        last_event_at = await db.scalar(select(func.max(Event.start_date)).where(Event.organization_id == org.id))
        items.append({
            **OrganizationResponse.model_validate(org).model_dump(mode="json"),
            "event_count": event_count,
            "member_count": member_count,
            "storage_used_gb": 0,
            "last_event_at": last_event_at.isoformat() if last_event_at else None,
        })
    return {"items": items, "page": page, "per_page": per_page}


@router.get("/platform/organisations/{org_id}")
async def platform_org_detail(org_id: uuid.UUID, _: User = Depends(_require_platform_admin), db: AsyncSession = Depends(get_db)) -> dict:
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found.")
    members = await _member_rows(db, org_id)
    events = await db.execute(select(Event).where(Event.organization_id == org_id).order_by(Event.start_date.desc()))
    return {
        "organization": OrganizationResponse.model_validate(org).model_dump(mode="json"),
        "members": members,
        "events": [{"id": str(e.id), "name": e.name, "start_date": e.start_date.isoformat(), "end_date": e.end_date.isoformat()} for e in events.scalars().all()],
        "storage_breakdown": {"used_gb": 0},
    }


@router.put("/platform/organisations/{org_id}")
async def platform_update_org(org_id: uuid.UUID, payload: PlatformOrgUpdate, _: User = Depends(_require_platform_admin), db: AsyncSession = Depends(get_db)) -> dict:
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(org, field, value)
    if payload.is_active is False:
        org.suspended_at = datetime.now(timezone.utc)
    elif payload.is_active is True:
        org.suspended_at = None
        org.suspension_reason = None
    await db.commit()
    return {"organization": OrganizationResponse.model_validate(org).model_dump(mode="json")}


@router.post("/platform/organisations/{org_id}/impersonate")
async def impersonate(org_id: uuid.UUID, _: User = Depends(_require_platform_admin), db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(select(User).where(User.organization_id == org_id, User.is_active.is_(True)).order_by(User.created_at.asc()))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="No active user in this organisation.")
    return {"access_token": auth_service.create_access_token(user)}


class SubscribeRequest(BaseModel):
    plan_name: str
    cardholder_name: Optional[str] = None
    card_number: Optional[str] = None
    expiry: Optional[str] = None
    cvv: Optional[str] = None


@router.post("/organisations/me/subscribe")
async def subscribe_organization(
    payload: SubscribeRequest,
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Subscribe current organization to a plan with mock payment checkout."""
    await _require_org_admin(db, current_user)
    
    org = await db.get(Organization, current_user.organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found.")
        
    # Find the SubscriptionPlan
    search_name = payload.plan_name.strip().lower()
    if search_name == "starter":
        search_name = "basic"
    elif search_name == "pro":
        search_name = "professional"
        
    # Import billing models dynamically to prevent circular dependencies
    from app.modules.billing.models.subscription import SubscriptionPlan, OrganizationSubscription, ActivityTimeline
    
    stmt = select(SubscriptionPlan).where(func.lower(SubscriptionPlan.name) == search_name)
    plan = (await db.execute(stmt)).scalar_one_or_none()
    
    if not plan:
        raise HTTPException(status_code=404, detail=f"Subscription plan '{payload.plan_name}' not found.")
        
    # Check if subscription already exists
    sub_stmt = select(OrganizationSubscription).where(OrganizationSubscription.organization_id == org.id)
    sub = (await db.execute(sub_stmt)).scalar_one_or_none()
    
    if not sub:
        sub = OrganizationSubscription(
            organization_id=org.id,
            plan_id=plan.id,
            status="ACTIVE",
            current_period_end=datetime.now(timezone.utc) + timedelta(days=365) # 1 year
        )
        db.add(sub)
    else:
        sub.plan_id = plan.id
        sub.status = "ACTIVE"
        sub.current_period_end = datetime.now(timezone.utc) + timedelta(days=365)
        
    # Update Organization plan and limits
    org.plan = "pro" if plan.name.lower() == "professional" else plan.name.lower()
    org.max_events = plan.max_events
    org.max_users = plan.max_users
    org.max_storage_gb = max(1, plan.storage_quota_mb // 1024)
    org.plan_expires_at = sub.current_period_end
    
    # Save a timeline event or payment event
    payment_event = ActivityTimeline(
        organization_id=org.id,
        actor_id=current_user.id,
        action_type="SUBSCRIPTION_PURCHASED",
        metadata_data={
            "plan_id": str(plan.id),
            "plan_name": plan.name,
            "mock_cardholder": payload.cardholder_name,
            "mock_card_last4": payload.card_number[-4:] if payload.card_number and len(payload.card_number) >= 4 else "0000",
            "amount_paid": 0.0,
        }
    )
    db.add(payment_event)
    
    await db.commit()
    await db.refresh(org)
    
    return {
        "message": f"Successfully subscribed to {plan.name}.",
        "organization": OrganizationResponse.model_validate(org).model_dump(mode="json")
    }


@router.get("/organisations/plans")
async def list_available_plans(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_active_user)
):
    """List available subscription plans for organization signup."""
    from app.modules.billing.models.subscription import SubscriptionPlan, PlanFeature
    from app.modules.platform.models.feature import FeatureCatalog
    
    result = await db.execute(
        select(SubscriptionPlan).where(SubscriptionPlan.is_active == True).order_by(SubscriptionPlan.created_at.asc())
    )
    plans = result.scalars().all()
    
    plans_list = []
    for p in plans:
        stmt = select(FeatureCatalog.name).join(PlanFeature).where(
            and_(PlanFeature.plan_id == p.id, PlanFeature.enabled == True)
        )
        features_res = await db.execute(stmt)
        feats = features_res.scalars().all()
        
        plans_list.append({
            "id": str(p.id),
            "name": p.name,
            "description": p.description,
            "max_events": p.max_events,
            "max_users": p.max_users,
            "max_registrations": p.max_registrations,
            "max_rooms": p.max_rooms,
            "storage_quota_mb": p.storage_quota_mb,
            "features": feats
        })
        
    return plans_list


