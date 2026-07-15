from __future__ import annotations

import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, func, select, update, and_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import StepUpAuth, get_current_user, get_db, require_active_user
from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_log import AuditLog
from app.modules.billing.services.admin_lifecycle_service import BillingAdminLifecycleService
from app.modules.billing.services.limit_guard import LimitGuard
from app.modules.identity.models.refresh_token import RefreshToken
from app.modules.identity.models.user import User
from app.modules.events.models.event import Event
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.rbac.models.user_assignment import UserEventAssignment
from app.modules.platform.models.organization import Organization
from app.modules.rbac.schemas.organization import OrganizationResponse, OrganizationUpdate
from app.services import auth_service
from app.modules.billing.services.entitlement_resolver import EntitlementResolver

from app.redis import redis_client
import json

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
    reason: str = Field(..., min_length=12, max_length=1000)


class PlatformOrganizationProvision(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    slug: str = Field(min_length=3, max_length=50)
    owner_email: EmailStr
    owner_first_name: str = Field(min_length=1, max_length=100)
    owner_last_name: str = Field(min_length=1, max_length=100)
    country: str = Field(default="IN", min_length=2, max_length=2)
    timezone: str = Field(default="Asia/Kolkata", max_length=50)
    reason: str = Field(min_length=12, max_length=1000)


class PlatformMemberInvite(BaseModel):
    email: EmailStr
    org_role: str = Field(pattern="^(admin|member|billing_only)$")
    reason: str = Field(min_length=12, max_length=1000)


class PlatformMemberUpdate(BaseModel):
    org_role: str = Field(pattern="^(owner|admin|member|billing_only)$")
    reason: str = Field(min_length=12, max_length=1000)


class PlatformReason(BaseModel):
    reason: str = Field(min_length=12, max_length=1000)


class PlatformAssignmentUpdate(BaseModel):
    permissions: dict = Field(default_factory=dict)
    reason: str = Field(min_length=12, max_length=1000)



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
    rows = result.all()
    user_ids = [user.id for _, user in rows if user]
    assignments_by_user: dict[uuid.UUID, list[str]] = {}
    if user_ids:
        assignment_rows = await db.execute(
            select(UserEventAssignment.user_id, UserEventAssignment.event_id)
            .join(Event, Event.id == UserEventAssignment.event_id)
            .where(
                UserEventAssignment.user_id.in_(user_ids),
                Event.organization_id == org_id,
            )
        )
        for user_id, event_id in assignment_rows.all():
            assignments_by_user.setdefault(user_id, []).append(str(event_id))
    return [{
        "id": str(member.id),
        "user_id": str(user.id) if user else None,
        "name": user.full_name if user else (member.invite_email or "Pending invite"),
        "first_name": user.first_name if user else None,
        "last_name": user.last_name if user else None,
        "email": user.email if user else member.invite_email,
        "user_role": user.role if user else None,
        "org_role": member.org_role,
        "accepted_at": member.accepted_at.isoformat() if member.accepted_at else None,
        "invited_at": member.invited_at.isoformat() if member.invited_at else None,
        "is_active": member.is_active,
        "is_2fa_enabled": user.is_2fa_enabled if user else False,
        "last_login_at": user.last_login_at.isoformat() if user and user.last_login_at else None,
        "event_ids": assignments_by_user.get(user.id, []) if user else [],
    } for member, user in rows]


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
    max_events = await EntitlementResolver.get_limit(db, org.id, "max_events")
    max_users = await EntitlementResolver.get_limit(db, org.id, "max_users")
    max_storage_gb = await EntitlementResolver.get_limit(db, org.id, "max_storage_gb")
    return {
        "organization": OrganizationResponse.model_validate(org).model_dump(mode="json"),
        "member_count": member_count,
        "event_count": event_count,
        "storage_used_gb": 0,
        "plan_limits": {
            "events": max_events if max_events is not None else org.max_events,
            "users": max_users if max_users is not None else org.max_users,
            "storage_gb": max_storage_gb if max_storage_gb is not None else org.max_storage_gb,
        },
        "org_role": await _org_role(db, current_user),
    }


@router.put("/organisations/me")
async def update_my_org(payload: OrganizationUpdate, current_user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)) -> dict:
    await _require_org_admin(db, current_user)
    org = await db.get(Organization, current_user.organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found.")

    if payload.slug is not None:
        slug = _clean_slug(payload.slug)
        if not re.match(r"^[a-z0-9-]+$", slug):
            raise HTTPException(status_code=422, detail="Slug must be 2-100 lowercase letters, numbers, or hyphens.")
        if slug != org.slug:
            exists = await db.scalar(select(func.count(Organization.id)).where(Organization.slug == slug))
            if exists:
                raise HTTPException(status_code=409, detail="Organisation slug is already taken.")
            org.slug = slug

    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "slug":
            continue
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
    if member.user_id:
        user = await db.get(User, member.user_id)
        if user:
            user.is_active = False
        organization_event_ids = select(Event.id).where(
            Event.organization_id == current_user.organization_id
        )
        await db.execute(
            delete(UserEventAssignment).where(
                UserEventAssignment.user_id == member.user_id,
                UserEventAssignment.event_id.in_(organization_event_ids),
            )
        )
        await db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == member.user_id, RefreshToken.is_revoked.is_(False))
            .values(is_revoked=True, revoked_at=datetime.now(timezone.utc))
        )
    await db.commit()
    return {"message": "Member removed"}


async def _require_platform_admin(current_user: User = Depends(get_current_user)) -> User:
    if not getattr(current_user, "is_platform_admin", False) and current_user.role != "super_admin" and not (current_user.organization and current_user.organization.slug == "eventxos"):
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


@router.post("/platform/organisations", status_code=status.HTTP_201_CREATED)
async def platform_provision_org(
    payload: PlatformOrganizationProvision,
    step_up: StepUpAuth,
    actor: User = Depends(_require_platform_admin),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128),
    db: AsyncSession = Depends(get_db),
) -> dict:
    del step_up
    slug = _clean_slug(payload.slug)
    if not SLUG_RE.match(slug):
        raise HTTPException(status_code=422, detail="Slug must be 3-50 lowercase letters, numbers, or hyphens.")
    operation_payload = {**payload.model_dump(mode="json"), "slug": slug}

    try:
        async with TenantContextGuard.scoped(db, actor.organization_id):
            await db.scalar(
                select(Organization.id)
                .where(Organization.id == actor.organization_id)
                .with_for_update()
            )
            operation, replay = await BillingAdminLifecycleService._begin_operation(
                db,
                actor.organization_id,
                "PROVISION_ORGANIZATION",
                idempotency_key,
                operation_payload,
            )
        if replay:
            async with TenantContextGuard.scoped(db, operation.result_ref_id):
                org = await db.get(Organization, operation.result_ref_id)
                member = await db.scalar(
                    select(OrganizationMember).where(
                        OrganizationMember.organization_id == operation.result_ref_id,
                        OrganizationMember.org_role == "owner",
                    )
                )
            if org is None or member is None:
                raise HTTPException(status_code=409, detail={
                    "code": "IDEMPOTENCY_RESULT_MISSING",
                    "message": "The provisioning result requires administrative recovery.",
                })
            return {
                "organization": OrganizationResponse.model_validate(org).model_dump(mode="json"),
                "owner_invitation": {
                    "membership_id": str(member.id),
                    "email": member.invite_email,
                    "token": member.invite_token,
                },
                "replayed": True,
            }

        organization_id = uuid.uuid4()
        invitation_token = secrets.token_urlsafe(32)[:64]
        async with TenantContextGuard.scoped(db, organization_id):
            org = Organization(
                id=organization_id,
                name=payload.name.strip(),
                slug=slug,
                plan="trial",
                plan_expires_at=datetime.now(timezone.utc) + timedelta(days=14),
                country=payload.country.upper(),
                timezone=payload.timezone,
            )
            member = OrganizationMember(
                organization_id=organization_id,
                org_role="owner",
                invited_by=actor.id,
                invite_token=invitation_token,
                invite_email=payload.owner_email.lower(),
                invite_first_name=payload.owner_first_name.strip(),
                invite_last_name=payload.owner_last_name.strip(),
            )
            db.add_all([org, member])
            await db.flush()
            db.add(AuditLog(
                organization_id=organization_id,
                actor_user_id=actor.id,
                action_type="ORGANIZATION_PROVISIONED",
                resource_type="organization",
                resource_id=organization_id,
                new_state={
                    "name": org.name,
                    "slug": org.slug,
                    "owner_email": member.invite_email,
                    "membership_id": str(member.id),
                },
                change_diff={"reason": payload.reason, "idempotency_key": idempotency_key},
                is_sensitive=True,
            ))
        async with TenantContextGuard.scoped(db, actor.organization_id):
            operation.status = "SUCCEEDED"
            operation.result_ref_type = "organization"
            operation.result_ref_id = organization_id
        await db.commit()
        return {
            "organization": OrganizationResponse.model_validate(org).model_dump(mode="json"),
            "owner_invitation": {
                "membership_id": str(member.id),
                "email": member.invite_email,
                "token": invitation_token,
            },
            "replayed": False,
        }
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail={
            "code": "PROVISIONING_CONFLICT",
            "message": "The organization slug or owner invitation conflicts with an existing record.",
        }) from exc


@router.get("/platform/organisations/{org_id}/members")
async def platform_org_members(
    org_id: uuid.UUID,
    _: User = Depends(_require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    async with TenantContextGuard.scoped(db, org_id):
        if await db.get(Organization, org_id) is None:
            raise HTTPException(status_code=404, detail="Organisation not found.")
        return await _member_rows(db, org_id)


@router.post("/platform/organisations/{org_id}/members", status_code=status.HTTP_201_CREATED)
async def platform_invite_org_member(
    org_id: uuid.UUID,
    payload: PlatformMemberInvite,
    step_up: StepUpAuth,
    actor: User = Depends(_require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    del step_up
    async with TenantContextGuard.scoped(db, org_id):
        if await db.get(Organization, org_id) is None:
            raise HTTPException(status_code=404, detail="Organisation not found.")
        existing = await db.scalar(select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            func.lower(OrganizationMember.invite_email) == payload.email.lower(),
            OrganizationMember.is_active.is_(True),
        ))
        if existing:
            raise HTTPException(status_code=409, detail={"code": "MEMBERSHIP_EXISTS", "message": "An active membership or invitation already exists."})
        member = OrganizationMember(
            organization_id=org_id,
            org_role=payload.org_role,
            invited_by=actor.id,
            invite_token=secrets.token_urlsafe(32)[:64],
            invite_email=payload.email.lower(),
        )
        db.add(member)
        await db.flush()
        db.add(AuditLog(
            organization_id=org_id,
            actor_user_id=actor.id,
            action_type="ORGANIZATION_MEMBER_INVITED",
            resource_type="organization_member",
            resource_id=member.id,
            new_state={"email": member.invite_email, "org_role": member.org_role},
            change_diff={"reason": payload.reason},
            is_sensitive=True,
        ))
        await db.commit()
        return {"membership_id": str(member.id), "email": member.invite_email, "invite_token": member.invite_token}


@router.patch("/platform/organisations/{org_id}/members/{member_id}")
async def platform_update_org_member(
    org_id: uuid.UUID,
    member_id: uuid.UUID,
    payload: PlatformMemberUpdate,
    step_up: StepUpAuth,
    actor: User = Depends(_require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    del step_up
    async with TenantContextGuard.scoped(db, org_id):
        member = await db.scalar(select(OrganizationMember).where(
            OrganizationMember.id == member_id,
            OrganizationMember.organization_id == org_id,
            OrganizationMember.is_active.is_(True),
        ).with_for_update())
        if member is None:
            raise HTTPException(status_code=404, detail="Member not found.")
        if member.org_role == "owner" and payload.org_role != "owner":
            owners = await db.scalar(select(func.count(OrganizationMember.id)).where(
                OrganizationMember.organization_id == org_id,
                OrganizationMember.org_role == "owner",
                OrganizationMember.is_active.is_(True),
            ))
            if int(owners or 0) <= 1:
                raise HTTPException(status_code=409, detail={"code": "LAST_OWNER", "message": "The last active owner cannot be demoted."})
        old_role = member.org_role
        member.org_role = payload.org_role
        db.add(AuditLog(
            organization_id=org_id,
            actor_user_id=actor.id,
            action_type="ORGANIZATION_MEMBER_ROLE_CHANGED",
            resource_type="organization_member",
            resource_id=member.id,
            old_state={"org_role": old_role},
            new_state={"org_role": member.org_role},
            change_diff={"reason": payload.reason},
            is_sensitive=True,
        ))
        await db.commit()
        return {"message": "Member role updated", "org_role": member.org_role}


@router.delete("/platform/organisations/{org_id}/members/{member_id}")
async def platform_remove_org_member(
    org_id: uuid.UUID,
    member_id: uuid.UUID,
    payload: PlatformReason,
    step_up: StepUpAuth,
    actor: User = Depends(_require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    del step_up
    async with TenantContextGuard.scoped(db, org_id):
        member = await db.scalar(select(OrganizationMember).where(
            OrganizationMember.id == member_id,
            OrganizationMember.organization_id == org_id,
            OrganizationMember.is_active.is_(True),
        ).with_for_update())
        if member is None:
            raise HTTPException(status_code=404, detail="Member not found.")
        if member.org_role == "owner":
            raise HTTPException(status_code=409, detail={"code": "OWNER_REMOVAL_FORBIDDEN", "message": "Transfer or demote ownership before removal."})
        member.is_active = False
        revoked_sessions = 0
        removed_assignments = 0
        if member.user_id:
            user = await db.get(User, member.user_id)
            if user:
                user.is_active = False
            organization_event_ids = select(Event.id).where(Event.organization_id == org_id)
            assignment_result = await db.execute(
                delete(UserEventAssignment).where(
                    UserEventAssignment.user_id == member.user_id,
                    UserEventAssignment.event_id.in_(organization_event_ids),
                )
            )
            removed_assignments = assignment_result.rowcount or 0
            session_result = await db.execute(
                update(RefreshToken)
                .where(RefreshToken.user_id == member.user_id, RefreshToken.is_revoked.is_(False))
                .values(is_revoked=True, revoked_at=datetime.now(timezone.utc))
            )
            revoked_sessions = session_result.rowcount or 0
        db.add(AuditLog(
            organization_id=org_id,
            actor_user_id=actor.id,
            action_type="ORGANIZATION_MEMBER_REMOVED",
            resource_type="organization_member",
            resource_id=member.id,
            old_state={"is_active": True, "org_role": member.org_role},
            new_state={"is_active": False},
            change_diff={
                "reason": payload.reason,
                "sessions_revoked": revoked_sessions,
                "event_assignments_removed": removed_assignments,
            },
            is_sensitive=True,
        ))
        await db.commit()
        return {"message": "Member removed", "sessions_revoked": revoked_sessions, "event_assignments_removed": removed_assignments}


@router.put("/platform/organisations/{org_id}/members/{member_id}/events/{event_id}")
async def platform_assign_member_event(
    org_id: uuid.UUID,
    member_id: uuid.UUID,
    event_id: uuid.UUID,
    payload: PlatformAssignmentUpdate,
    step_up: StepUpAuth,
    actor: User = Depends(_require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    del step_up
    async with TenantContextGuard.scoped(db, org_id):
        member = await db.scalar(select(OrganizationMember).where(
            OrganizationMember.id == member_id,
            OrganizationMember.organization_id == org_id,
            OrganizationMember.is_active.is_(True),
        ))
        event = await db.scalar(select(Event).where(Event.id == event_id, Event.organization_id == org_id))
        if member is None or member.user_id is None or event is None:
            raise HTTPException(status_code=404, detail="Member or event not found.")
        existing = await db.scalar(select(UserEventAssignment).where(
            UserEventAssignment.user_id == member.user_id,
            UserEventAssignment.event_id == event_id,
        ).with_for_update())
        if existing is None:
            await LimitGuard.check_event_team_members(db, org_id, event_id)
            existing = UserEventAssignment(user_id=member.user_id, event_id=event_id, permissions=payload.permissions)
            db.add(existing)
            action = "EVENT_WORKSPACE_MEMBER_ASSIGNED"
        else:
            existing.permissions = payload.permissions
            action = "EVENT_WORKSPACE_ASSIGNMENT_UPDATED"
        await db.flush()
        db.add(AuditLog(
            organization_id=org_id,
            actor_user_id=actor.id,
            action_type=action,
            resource_type="user_event_assignment",
            resource_id=existing.id,
            new_state={"user_id": str(member.user_id), "event_id": str(event_id), "permissions": payload.permissions},
            change_diff={"reason": payload.reason},
            is_sensitive=True,
        ))
        await db.commit()
        return {"assignment_id": str(existing.id), "event_id": str(event_id), "permissions": existing.permissions}


@router.delete("/platform/organisations/{org_id}/members/{member_id}/events/{event_id}")
async def platform_unassign_member_event(
    org_id: uuid.UUID,
    member_id: uuid.UUID,
    event_id: uuid.UUID,
    payload: PlatformReason,
    step_up: StepUpAuth,
    actor: User = Depends(_require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    del step_up
    async with TenantContextGuard.scoped(db, org_id):
        member = await db.scalar(select(OrganizationMember).where(
            OrganizationMember.id == member_id,
            OrganizationMember.organization_id == org_id,
        ))
        if member is None or member.user_id is None:
            raise HTTPException(status_code=404, detail="Member not found.")
        assignment = await db.scalar(select(UserEventAssignment).where(
            UserEventAssignment.user_id == member.user_id,
            UserEventAssignment.event_id == event_id,
        ))
        if assignment is None:
            raise HTTPException(status_code=404, detail="Event assignment not found.")
        assignment_id = assignment.id
        await db.delete(assignment)
        db.add(AuditLog(
            organization_id=org_id,
            actor_user_id=actor.id,
            action_type="EVENT_WORKSPACE_MEMBER_UNASSIGNED",
            resource_type="user_event_assignment",
            resource_id=assignment_id,
            old_state={"user_id": str(member.user_id), "event_id": str(event_id)},
            change_diff={"reason": payload.reason},
            is_sensitive=True,
        ))
        await db.commit()
        return {"message": "Event workspace assignment removed"}


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
async def platform_update_org(
    org_id: uuid.UUID,
    payload: PlatformOrgUpdate,
    step_up: StepUpAuth,
    actor: User = Depends(_require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    del step_up
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found.")
    changes = payload.model_dump(exclude_unset=True, exclude={"reason"})
    if "slug" in changes:
        changes["slug"] = _clean_slug(changes["slug"])
        if not SLUG_RE.match(changes["slug"]):
            raise HTTPException(status_code=422, detail="Slug must be 3-50 lowercase letters, numbers, or hyphens.")
        duplicate = await db.scalar(select(Organization.id).where(
            Organization.slug == changes["slug"],
            Organization.id != org_id,
        ))
        if duplicate:
            raise HTTPException(status_code=409, detail={"code": "SLUG_CONFLICT", "message": "Organisation slug is already in use."})
    old_state = {field: getattr(org, field) for field in changes}
    for field, value in changes.items():
        setattr(org, field, value)
    if payload.is_active is False:
        org.suspended_at = datetime.now(timezone.utc)
    elif payload.is_active is True:
        org.suspended_at = None
        org.suspension_reason = None
    db.add(AuditLog(
        organization_id=org_id,
        actor_user_id=actor.id,
        action_type="ORGANIZATION_DETAILS_UPDATED",
        resource_type="organization",
        resource_id=org_id,
        old_state=old_state,
        new_state={field: getattr(org, field) for field in changes},
        change_diff={"reason": payload.reason, "fields": sorted(changes)},
        is_sensitive=True,
    ))
    await db.commit()
    return {"organization": OrganizationResponse.model_validate(org).model_dump(mode="json")}


@router.post("/platform/organisations/{org_id}/impersonate")
async def impersonate(org_id: uuid.UUID, _: User = Depends(_require_platform_admin), db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(select(User).where(User.organization_id == org_id, User.is_active.is_(True)).order_by(User.created_at.asc()))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="No active user in this organisation.")
    return {"access_token": auth_service.create_access_token(user)}


class CalculatePriceRequest(BaseModel):
    plan_name: str
    is_custom: bool = False
    custom_limits: Optional[dict[str, int]] = None
    addon_keys: Optional[list[str]] = None
    promo_code: Optional[str] = None


async def _calculate_price_logic(
    db: AsyncSession,
    plan_name: str,
    is_custom: bool,
    custom_limits: Optional[dict[str, int]],
    addon_keys: Optional[list[str]],
    promo_code: Optional[str]
) -> dict:
    from app.modules.billing.models.subscription import SubscriptionPlan, Addon
    
    # 1. Fetch base plan
    search_name = plan_name.strip().lower()
    if search_name == "starter":
        search_name = "basic"
    elif search_name == "pro":
        search_name = "professional"
        
    stmt = select(SubscriptionPlan).where(func.lower(SubscriptionPlan.name) == search_name)
    plan = (await db.execute(stmt)).scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail=f"Plan '{plan_name}' not found.")
        
    base_price_per_event = float(plan.price_per_event_min or 0)
    
    # Quota additions
    extra_quota_price_per_event = 0.0
    number_of_events = 1
    
    limits_breakdown = []
    
    if is_custom and custom_limits:
        number_of_events = max(1, custom_limits.get("max_events", 1))
        
        # Calculate extra users
        if "max_users" in custom_limits:
            target_users = custom_limits["max_users"]
            base_users = plan.max_users or 0
            if target_users > base_users:
                extra = target_users - base_users
                cost = extra * 1500.0
                extra_quota_price_per_event += cost
                limits_breakdown.append({"key": "max_users", "extra": extra, "cost": cost})
                
        # Calculate extra registrations
        if "max_registrations" in custom_limits:
            target_reg = custom_limits["max_registrations"]
            base_reg = plan.max_registrations or 0
            if target_reg > base_reg:
                extra = target_reg - base_reg
                cost = extra * 5.0
                extra_quota_price_per_event += cost
                limits_breakdown.append({"key": "max_registrations", "extra": extra, "cost": cost})

        # Calculate extra speakers
        if "max_speakers" in custom_limits:
            target_speakers = custom_limits["max_speakers"]
            base_speakers = plan.max_speakers or 0
            if target_speakers > base_speakers:
                extra = target_speakers - base_speakers
                cost = extra * 100.0
                extra_quota_price_per_event += cost
                limits_breakdown.append({"key": "max_speakers", "extra": extra, "cost": cost})

        # Calculate extra rooms
        if "max_rooms" in custom_limits:
            target_rooms = custom_limits["max_rooms"]
            base_rooms = plan.max_rooms or 0
            if target_rooms > base_rooms:
                extra = target_rooms - base_rooms
                cost = extra * 1000.0
                extra_quota_price_per_event += cost
                limits_breakdown.append({"key": "max_rooms", "extra": extra, "cost": cost})

        # Calculate extra storage
        if "max_storage_gb" in custom_limits:
            target_storage = custom_limits["max_storage_gb"]
            base_storage = max(1, (plan.storage_quota_mb or 0) // 1024)
            if target_storage > base_storage:
                extra = target_storage - base_storage
                cost = extra * 200.0
                extra_quota_price_per_event += cost
                limits_breakdown.append({"key": "max_storage_gb", "extra": extra, "cost": cost})

    # Addons pricing
    addons_price_per_event = 0.0
    addons_breakdown = []
    if addon_keys:
        for key in addon_keys:
            addon_stmt = select(Addon).where(Addon.key == key)
            addon = (await db.execute(addon_stmt)).scalar_one_or_none()
            if addon:
                if addon.included_in_plan and addon.included_in_plan.lower() == plan.name.lower():
                    price = 0.0
                else:
                    price = float(addon.price_inr or 0)
                
                addons_price_per_event += price
                addons_breakdown.append({"name": addon.name, "key": addon.key, "price": price})

    # Subtotal
    subtotal_per_event = base_price_per_event + extra_quota_price_per_event + addons_price_per_event
    subtotal = subtotal_per_event * number_of_events
    
    # Promo code discount
    discount = 0.0
    discount_percent = 0
    if promo_code:
        code = promo_code.strip().upper()
        if code == "EVENTOS50":
            discount_percent = 50
            discount = subtotal * 0.50
        elif code == "WELCOME20":
            discount_percent = 20
            discount = subtotal * 0.20
            
    total = max(0.0, subtotal - discount)
    
    return {
        "plan_name": plan.name,
        "base_price_per_event": base_price_per_event,
        "extra_quota_price_per_event": extra_quota_price_per_event,
        "addons_price_per_event": addons_price_per_event,
        "price_per_event": subtotal_per_event,
        "number_of_events": number_of_events,
        "subtotal": subtotal,
        "discount": discount,
        "discount_percent": discount_percent,
        "total": total,
        "limits_breakdown": limits_breakdown,
        "addons_breakdown": addons_breakdown
    }


@router.post("/organisations/calculate-price")
async def calculate_price(
    payload: CalculatePriceRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_active_user)
) -> dict:
    """Calculate checkout price for subscription dynamically based on DB records."""
    await _require_org_admin(db, current_user)
    res = await _calculate_price_logic(
        db,
        plan_name=payload.plan_name,
        is_custom=payload.is_custom,
        custom_limits=payload.custom_limits,
        addon_keys=payload.addon_keys,
        promo_code=payload.promo_code
    )
    # Save to redis cart
    cart_key = f"cart:{current_user.organization_id}"
    await redis_client.setex(cart_key, 3600, json.dumps(payload.model_dump()))
    return res


@router.get("/organisations/calculate-price")
async def get_calculate_price(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_active_user)
) -> dict:
    """Fetch the current tentative billing cart from Redis."""
    cart_key = f"cart:{current_user.organization_id}"
    data = await redis_client.get(cart_key)
    if data:
        try:
            payload_dict = json.loads(data)
            return await _calculate_price_logic(db, **payload_dict)
        except Exception:
            pass
            
    # Fallback: Current active plan
    org = await db.get(Organization, current_user.organization_id)
    return await _calculate_price_logic(
        db,
        plan_name=org.plan or "basic",
        is_custom=False,
        custom_limits=None,
        addon_keys=None,
        promo_code=None
    )


@router.get("/organisations/addons")
async def list_available_addons(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_active_user)
) -> list[dict]:
    """List all active addons from the DB."""
    from app.modules.billing.models.subscription import Addon
    result = await db.execute(
        select(Addon).where(Addon.is_active == True).order_by(Addon.name.asc())
    )
    addons = result.scalars().all()
    return [
        {
            "id": str(addon.id),
            "name": addon.name,
            "key": addon.key,
            "description": addon.description,
            "addon_type": addon.addon_type,
            "short_description": addon.short_description,
            "image_url": addon.image_url,
            "price_inr": float(addon.price_inr) if addon.price_inr is not None else None,
            "min_price_inr": float(addon.min_price_inr) if addon.min_price_inr is not None else None,
            "max_price_inr": float(addon.max_price_inr) if addon.max_price_inr is not None else None,
            "billing_unit": addon.billing_unit,
            "price_unit": addon.price_unit,
            "final_price": float(addon.final_price) if addon.final_price is not None else None,
            "available_for_plans": addon.available_for_plans,
            "is_optional_for_plan": addon.is_optional_for_plan,
            "included_in_plan": addon.included_in_plan,
            "is_active": addon.is_active,
            "inclusions": addon.inclusions or [],
            "exclusions": addon.exclusions or [],
            "consumables_cost": float(addon.consumables_cost) if addon.consumables_cost is not None else 0.0,
            "template_types": addon.template_types or [],
            "hardware_spec": addon.hardware_spec or [],
            "staff_spec": addon.staff_spec or [],
        }
        for addon in addons
    ]


@router.get("/organisations/plans/{plan_id}")
async def get_plan_details(
    plan_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_active_user)
) -> dict:
    """Fetch details of a single subscription plan by ID or name."""
    from app.modules.billing.models.subscription import SubscriptionPlan, PlanFeature
    from app.modules.platform.models.feature import FeatureCatalog
    import uuid
    
    try:
        plan_uuid = uuid.UUID(plan_id)
        stmt = select(SubscriptionPlan).where(SubscriptionPlan.id == plan_uuid)
    except ValueError:
        stmt = select(SubscriptionPlan).where(SubscriptionPlan.name.ilike(plan_id))
        
    res = await db.execute(stmt)
    p = res.scalars().first()
    if not p:
        raise HTTPException(status_code=404, detail="Plan not found")
        
    stmt_feats = select(FeatureCatalog.name).join(PlanFeature).where(
        and_(PlanFeature.plan_id == p.id, PlanFeature.enabled == True)
    )
    features_res = await db.execute(stmt_feats)
    feats = features_res.scalars().all()
    
    return {
        "id": str(p.id),
        "name": p.name,
        "tagline": p.tagline,
        "description": p.description,
        "billing_model": p.billing_model,
        "currency": p.currency,
        "price_per_event_min": float(p.price_per_event_min) if p.price_per_event_min is not None else None,
        "price_per_event_max": float(p.price_per_event_max) if p.price_per_event_max is not None else None,
        "price_per_event": float(p.price_per_event) if p.price_per_event is not None else None,
        "max_events": p.max_events,
        "max_users": p.max_users,
        "max_registrations": p.max_registrations,
        "max_speakers": p.max_speakers,
        "max_sessions": p.max_sessions,
        "max_rooms": p.max_rooms,
        "max_ticket_categories": p.max_ticket_categories,
        "max_badge_templates": p.max_badge_templates,
        "max_certificate_templates": p.max_certificate_templates,
        "storage_quota_mb": p.storage_quota_mb,
        "is_popular": p.is_popular,
        "color_hex": p.color_hex,
        "features": feats
    }


@router.get("/organisations/addons/{addon_id}")
async def get_addon_details(
    addon_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_active_user)
) -> dict:
    """Fetch details of a single addon by ID or key."""
    from app.modules.billing.models.subscription import Addon
    import uuid
    
    try:
        addon_uuid = uuid.UUID(addon_id)
        stmt = select(Addon).where(Addon.id == addon_uuid)
    except ValueError:
        stmt = select(Addon).where(Addon.key == addon_id)
        
    res = await db.execute(stmt)
    addon = res.scalars().first()
    if not addon:
        raise HTTPException(status_code=404, detail="Addon not found")
        
    return {
        "id": str(addon.id),
        "name": addon.name,
        "key": addon.key,
        "description": addon.description,
        "addon_type": addon.addon_type,
        "short_description": addon.short_description,
        "image_url": addon.image_url,
        "price_inr": float(addon.price_inr) if addon.price_inr is not None else None,
        "min_price_inr": float(addon.min_price_inr) if addon.min_price_inr is not None else None,
        "max_price_inr": float(addon.max_price_inr) if addon.max_price_inr is not None else None,
        "billing_unit": addon.billing_unit,
        "price_unit": addon.price_unit,
        "final_price": float(addon.final_price) if addon.final_price is not None else None,
        "available_for_plans": addon.available_for_plans,
        "is_optional_for_plan": addon.is_optional_for_plan,
        "included_in_plan": addon.included_in_plan,
        "is_active": addon.is_active,
        "inclusions": addon.inclusions or [],
        "exclusions": addon.exclusions or [],
        "consumables_cost": float(addon.consumables_cost) if addon.consumables_cost is not None else 0.0,
        "template_types": addon.template_types or [],
        "hardware_spec": addon.hardware_spec or [],
        "staff_spec": addon.staff_spec or [],
    }


class SubscribeRequest(BaseModel):
    plan_name: str
    is_custom: bool = False
    custom_limits: Optional[dict[str, int]] = None
    addon_keys: Optional[list[str]] = None
    promo_code: Optional[str] = None
    billing_name: str
    billing_email: EmailStr
    billing_phone: str
    gst_number: Optional[str] = None
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
    """Subscribe current organization to a plan with custom limits, addons, and invoice logging."""
    await _require_org_admin(db, current_user)
    
    org = await db.get(Organization, current_user.organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found.")
        
    # Calculate price based on DB rules
    price_info = await _calculate_price_logic(
        db,
        plan_name=payload.plan_name,
        is_custom=payload.is_custom,
        custom_limits=payload.custom_limits,
        addon_keys=payload.addon_keys,
        promo_code=payload.promo_code
    )
    
    # Import billing models
    from app.modules.billing.models.subscription import (
        SubscriptionPlan, OrganizationSubscription, ActivityTimeline, 
        Addon, OrganizationAddon, SubscriptionTransaction
    )
    from app.modules.platform.models.platform_domain_tables import TenantLimit
    from sqlalchemy import delete
    
    # Resolve plan
    search_name = payload.plan_name.strip().lower()
    if search_name == "starter":
        search_name = "basic"
    elif search_name == "pro":
        search_name = "professional"
        
    stmt = select(SubscriptionPlan).where(func.lower(SubscriptionPlan.name) == search_name)
    plan = (await db.execute(stmt)).scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail=f"Plan '{payload.plan_name}' not found.")
        
    # Ensure payment transaction is logged
    transaction = SubscriptionTransaction(
        organization_id=org.id,
        plan_name=plan.name,
        amount=price_info["total"],
        promo_code=payload.promo_code,
        gst_number=payload.gst_number,
        billing_name=payload.billing_name,
        billing_email=payload.billing_email,
        billing_phone=payload.billing_phone,
        status="SUCCESS",
        is_custom_plan=payload.is_custom,
        custom_limits=payload.custom_limits,
        addon_keys=payload.addon_keys
    )
    db.add(transaction)
    await db.flush()
    
    current_period_end = datetime.now(timezone.utc) + timedelta(days=365) # 1 year

    sub = OrganizationSubscription(
        organization_id=org.id,
        plan_id=plan.id,
        status="ACTIVE",
        current_period_end=current_period_end
    )
    db.add(sub)
    await db.flush()
    from app.modules.billing.services.activation_service import ActivationService
    await ActivationService.ensure_subscription_grant(db, sub)

    # Clear old custom limits if not custom, otherwise set them
    await db.execute(delete(TenantLimit).where(TenantLimit.organization_id == org.id))
    
    final_max_events = plan.max_events
    final_max_users = plan.max_users
    final_max_storage_gb = max(1, plan.storage_quota_mb // 1024)
    
    if payload.is_custom and payload.custom_limits:
        for k, v in payload.custom_limits.items():
            if v is not None:
                limit_override = TenantLimit(
                    organization_id=org.id,
                    limit_key=k,
                    limit_value=v
                )
                db.add(limit_override)
                
        # Sync Organization fields with custom selections
        final_max_events = payload.custom_limits.get("max_events", final_max_events)
        final_max_users = payload.custom_limits.get("max_users", final_max_users)
        final_max_storage_gb = payload.custom_limits.get("max_storage_gb", final_max_storage_gb)
        
    # Handle Addons
    if payload.addon_keys:
        for addon_key in payload.addon_keys:
            addon_stmt = select(Addon).where(Addon.key == addon_key)
            addon_obj = (await db.execute(addon_stmt)).scalar_one_or_none()
            if addon_obj:
                org_addon = OrganizationAddon(
                    organization_id=org.id,
                    addon_id=addon_obj.id,
                    status="ACTIVE",
                    purchased_at=datetime.now(timezone.utc),
                    expires_at=current_period_end
                )
                db.add(org_addon)
                
    # Check for venue add-ons and create a support callback if the organiser
    # has selected operational services that need manual coordination.
    selected_venue_addons = []
    if payload.addon_keys:
        venue_stmt = select(Addon).where(
            Addon.key.in_(payload.addon_keys),
            Addon.addon_type == "VENUE"
        )
        selected_venue_addons = (await db.execute(venue_stmt)).scalars().all()

    if selected_venue_addons:
        from app.modules.support.models.ticket import SupportTicket
        venue_addon_names = ", ".join(a.name for a in selected_venue_addons)
        callback_ticket = SupportTicket(
            organization_id=org.id,
            creator_id=current_user.id,
            subject="Venue Add-on Callback Request",
            description=f"The organiser has subscribed to the {plan.name} plan and selected venue add-ons: {venue_addon_names}. Please contact them at {payload.billing_phone} or {payload.billing_email} to discuss delivery and pricing.",
            priority="HIGH",
            status="OPEN"
        )
        db.add(callback_ticket)
                
    # Update Organization core values
    effective_max_events = await EntitlementResolver.get_limit(db, org.id, "max_events")
    effective_max_users = await EntitlementResolver.get_limit(db, org.id, "max_users")
    effective_max_storage_gb = await EntitlementResolver.get_limit(db, org.id, "max_storage_gb")
    org.plan = "custom" if payload.is_custom else plan.name.lower()
    org.max_events = effective_max_events if effective_max_events is not None else final_max_events
    org.max_users = effective_max_users if effective_max_users is not None else final_max_users
    org.max_storage_gb = effective_max_storage_gb if effective_max_storage_gb is not None else final_max_storage_gb
    org.plan_expires_at = current_period_end
    
    # Save standard ActivityTimeline event
    payment_event = ActivityTimeline(
        organization_id=org.id,
        actor_id=current_user.id,
        action_type="SUBSCRIPTION_PURCHASED",
        metadata_data={
            "plan_id": str(plan.id),
            "plan_name": plan.name,
            "transaction_id": str(transaction.id),
            "amount_paid": price_info["total"],
            "is_custom": payload.is_custom,
            "gst_number": payload.gst_number,
        }
    )
    db.add(payment_event)
    
    await db.commit()
    await db.refresh(org)
    
    return {
        "message": f"Successfully subscribed to {plan.name} (Custom={payload.is_custom}).",
        "organization": OrganizationResponse.model_validate(org).model_dump(mode="json"),
        "subscription_id": str(sub.id),
        "plan_id": str(plan.id),
        "transaction_id": str(transaction.id),
        "amount_paid": price_info["total"],
    }


@router.get("/organisations/plans")
async def list_available_plans(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_active_user)
) -> list[dict]:
    """List available subscription plans for organization signup."""
    from app.modules.billing.models.subscription import SubscriptionPlan, PlanFeature
    from app.modules.platform.models.feature import FeatureCatalog
    
    result = await db.execute(
        select(SubscriptionPlan).where(SubscriptionPlan.is_active == True).order_by(SubscriptionPlan.display_order.asc())
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
            "tagline": p.tagline,
            "description": p.description,
            "billing_model": p.billing_model,
            "currency": p.currency,
            "price_per_event_min": float(p.price_per_event_min) if p.price_per_event_min is not None else None,
            "price_per_event_max": float(p.price_per_event_max) if p.price_per_event_max is not None else None,
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
            "storage_quota_mb": p.storage_quota_mb,
            "is_popular": p.is_popular,
            "color_hex": p.color_hex,
            "features": feats
        })
        
    return plans_list


@router.get("/organisations/features/matrix")
async def get_org_features_matrix(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_active_user)
):
    """Get grouped feature catalog matrix for plan comparison (Organizer Facing)."""
    from app.modules.platform.models.feature import FeatureCatalog
    from app.modules.billing.models.subscription import SubscriptionPlan, PlanFeature

    stmt = select(FeatureCatalog).where(FeatureCatalog.is_active == True).order_by(
        FeatureCatalog.category_order.asc(),
        FeatureCatalog.feature_order.asc()
    )
    features = (await db.execute(stmt)).scalars().all()
    
    plans_stmt = select(SubscriptionPlan).where(SubscriptionPlan.is_active == True).order_by(SubscriptionPlan.display_order.asc())
    plans = (await db.execute(plans_stmt)).scalars().all()
    plans_map = {p.name.upper(): p for p in plans}
    
    pf_stmt = select(PlanFeature).where(PlanFeature.enabled == True)
    pf_results = (await db.execute(pf_stmt)).scalars().all()
    enabled_plan_features = {(pf.plan_id, pf.feature_id) for pf in pf_results}
    
    categories = {}
    for f in features:
        cat = f.category or "General"
        if cat not in categories:
            categories[cat] = {
                "id": cat,
                "category": cat,
                "category_name": cat.replace("_", " ").title(),
                "features": []
            }
            
        plan_values = {}
        for p_name, p in plans_map.items():
            val = "-"
            if f.key == "LIMIT_ORGANIZER_USERS":
                val = str(p.max_users) if p.max_users is not None else "Unlimited"
            elif f.key == "LIMIT_REGISTRATIONS":
                val = f"Up to {p.max_registrations:,}" if p.max_registrations is not None else "Unlimited"
            elif f.key == "LIMIT_SPEAKERS":
                val = f"Up to {p.max_speakers}" if p.max_speakers is not None else "Unlimited"
            elif f.key == "LIMIT_STORAGE":
                val = f"{p.storage_quota_mb // 1024} GB" if p.storage_quota_mb is not None else "Unlimited"
            else:
                is_enabled = (p.id, f.id) in enabled_plan_features
                val = "Yes" if is_enabled else "No"
            plan_values[p.name] = val # Using plan name as key for frontend mapping

        categories[cat]["features"].append({
            "id": str(f.id),
            "key": f.key,
            "name": f.name,
            "label": f.name,
            "description": f.description,
            "plans": plan_values
        })
        
    return {"categories": list(categories.values()), "plans": [{"key": p.name, "name": p.name} for p in plans]}


@router.get("/organisations/me/billing-history")
async def get_billing_history(
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db)
) -> list[dict]:
    """List subscription purchase history for the current organization."""
    from app.modules.billing.models.subscription import SubscriptionTransaction
    
    stmt = (
        select(SubscriptionTransaction)
        .where(SubscriptionTransaction.organization_id == current_user.organization_id)
        .order_by(SubscriptionTransaction.created_at.desc())
    )
    res = await db.execute(stmt)
    transactions = res.scalars().all()
    
    return [
        {
            "id": str(t.id),
            "plan_name": t.plan_name,
            "amount_paid": float(t.amount),
            "purchase_date": t.created_at.isoformat() if t.created_at else None,
            "status": t.status,
            "addons_purchased": t.addon_keys or [],
            "event_name": "Workspace Subscription",
            "actions": []
        }
        for t in transactions
    ]




# =============================================================
# Super Admin Organization Endpoints
# Added below existing platform admin routes.
# All four endpoints require SUPER_ADMIN via require_super_admin.
# =============================================================

from app.modules.superadmin.dependencies import require_super_admin
from app.modules.rbac.schemas.organization import (
    EnrichedOrgResponse,
    PaginatedOrgsResponse,
    FeatureOverrideItem,
    FeatureOverrideUpsert,
    OrgUserRow,
    PaginatedOrgUsersResponse,
)
from app.modules.rbac.services.health_service import OrganizationHealthService
from app.modules.analytics.models.usage import OrganizationUsage


@router.get(
    "/superadmin/organisations",
    response_model=PaginatedOrgsResponse,
    summary="Super Admin — Paginated enriched organization list",
    tags=["superadmin-organisations"],
)
async def superadmin_list_organisations(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    search: Optional[str] = Query(default=None, description="Filter by name, slug, or billing_email"),
    plan: Optional[str] = Query(default=None, description="Filter by plan name (trial, basic, professional, enterprise)"),
    status: Optional[str] = Query(default=None, description="Filter by subscription status (ACTIVE, TRIAL, SUSPENDED, EXPIRED)"),
    country: Optional[str] = Query(default=None, description="Filter by country ISO code"),
    sort_by: str = Query(default="created_at", description="Sort field: created_at | name | health_score | mrr"),
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> PaginatedOrgsResponse:
    """
    Paginated, filterable, sortable organization list for the Super Admin registry.
    Enriches each row with health score, live usage counts, subscription status, and MRR.
    """
    from app.modules.billing.models.subscription import (
        OrganizationSubscription, SubscriptionTransaction,
    )
    from app.modules.platform.models.health import OrganizationHealth
    from sqlalchemy import and_, or_, desc, asc

    # ── Base query ─────────────────────────────────────────────
    q = select(Organization)

    if search:
        term = f"%{search}%"
        q = q.where(
            or_(
                Organization.name.ilike(term),
                Organization.slug.ilike(term),
                Organization.billing_email.ilike(term),
            )
        )
    if plan:
        q = q.where(Organization.plan.ilike(plan))
    if country:
        q = q.where(Organization.country.ilike(country))
    if status:
        # status is on OrganizationSubscription, handled post-fetch
        pass

    # Sort: name and created_at can be applied at SQL level
    if sort_by == "name":
        q = q.order_by(asc(Organization.name))
    else:
        q = q.order_by(desc(Organization.created_at))

    # Count total (before pagination)
    count_q = select(func.count(Organization.id))
    if search:
        term = f"%{search}%"
        count_q = count_q.where(
            or_(
                Organization.name.ilike(term),
                Organization.slug.ilike(term),
                Organization.billing_email.ilike(term),
            )
        )
    if plan:
        count_q = count_q.where(Organization.plan.ilike(plan))
    if country:
        count_q = count_q.where(Organization.country.ilike(country))

    total_unfiltered = (await db.scalar(count_q)) or 0

    # Paginate
    offset = (page - 1) * page_size
    q = q.offset(offset).limit(page_size)
    orgs = (await db.execute(q)).scalars().all()

    # ── Enrich each org ────────────────────────────────────────
    items: list[EnrichedOrgResponse] = []
    for org in orgs:
        # Subscription status
        sub = (await db.execute(
            select(OrganizationSubscription)
            .where(OrganizationSubscription.organization_id == org.id)
            .order_by(OrganizationSubscription.created_at.desc())
            .limit(1)
        )).scalar_one_or_none()
        sub_status = sub.status if sub else "TRIAL"

        # Filter by status if requested
        if status and sub_status.upper() != status.upper():
            continue

        # Health (from cache table, no recompute on list)
        health_rec = await db.get(OrganizationHealth, org.id)
        health_score = health_rec.health_score if health_rec else 100
        health_status = health_rec.status if health_rec else "HEALTHY"

        # Usage
        usage_rec = await db.get(OrganizationUsage, org.id)
        storage_bytes = usage_rec.storage_used_bytes if usage_rec else 0
        user_count = usage_rec.active_users_count if usage_rec else 0
        event_count_val = usage_rec.active_events_count if usage_rec else 0

        # MRR: latest successful transaction amount
        latest_txn = (await db.execute(
            select(SubscriptionTransaction.amount)
            .where(
                SubscriptionTransaction.organization_id == org.id,
                SubscriptionTransaction.status == "SUCCESS",
            )
            .order_by(desc(SubscriptionTransaction.created_at))
            .limit(1)
        )).scalar()
        mrr = float(latest_txn or 0.0)

        items.append(EnrichedOrgResponse(
            id=org.id,
            name=org.name,
            slug=org.slug,
            logo_url=org.logo_url,
            plan=org.plan,
            country=org.country,
            timezone=org.timezone,
            billing_email=org.billing_email,
            custom_domain=org.custom_domain,
            is_active=org.is_active,
            suspension_reason=org.suspension_reason,
            created_at=org.created_at,
            subscription_status=sub_status,
            health_score=health_score,
            health_status=health_status,
            user_count=user_count,
            event_count=event_count_val,
            storage_used_bytes=storage_bytes,
            mrr=mrr,
        ))

    # Sort enriched items for health_score and mrr (cannot be done at SQL level)
    if sort_by == "health_score":
        items.sort(key=lambda x: x.health_score, reverse=True)
    elif sort_by == "mrr":
        items.sort(key=lambda x: x.mrr, reverse=True)

    # Recalculate total accounting for status filter
    total = len(items) if status else total_unfiltered
    total_pages = max(1, (total + page_size - 1) // page_size)

    return PaginatedOrgsResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get(
    "/superadmin/organisations/{org_id}/feature-overrides",
    response_model=List[FeatureOverrideItem],
    summary="Super Admin — Get feature overrides for an organization",
    tags=["superadmin-organisations"],
)
async def superadmin_get_feature_overrides(
    org_id: uuid.UUID,
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> List[FeatureOverrideItem]:
    """
    Returns all features from the catalog with:
    - The plan default (whether this org's current plan enables it)
    - Any override set specifically for this org
    - The effective resolved value

    Joins:
      platform.feature_catalog
      billing.plan_features (for plan default)
      billing.organization_feature_overrides (for org-specific override)
    """
    from app.modules.platform.models.feature import FeatureCatalog
    from app.modules.billing.models.subscription import (
        OrganizationSubscription, PlanFeature, OrganizationFeature,
    )

    # Get org's current plan
    sub = (await db.execute(
        select(OrganizationSubscription)
        .where(OrganizationSubscription.organization_id == org_id)
        .order_by(OrganizationSubscription.created_at.desc())
        .limit(1)
    )).scalar_one_or_none()
    plan_id = sub.plan_id if sub else None

    # Load all features
    features = (await db.execute(
        select(FeatureCatalog).where(FeatureCatalog.is_active.is_(True)).order_by(
            FeatureCatalog.category_order.asc(), FeatureCatalog.feature_order.asc()
        )
    )).scalars().all()

    # Plan features enabled set
    plan_enabled: set[uuid.UUID] = set()
    if plan_id:
        pf_rows = (await db.execute(
            select(PlanFeature.feature_id).where(
                PlanFeature.plan_id == plan_id, PlanFeature.enabled.is_(True)
            )
        )).scalars().all()
        plan_enabled = set(pf_rows)

    # Org-level overrides
    org_overrides: dict[uuid.UUID, bool] = {}
    ov_rows = (await db.execute(
        select(OrganizationFeature).where(OrganizationFeature.organization_id == org_id)
    )).scalars().all()
    for ov in ov_rows:
        org_overrides[ov.feature_id] = ov.is_enabled

    result = []
    for f in features:
        plan_default = f.id in plan_enabled
        override = org_overrides.get(f.id)  # None if not set
        effective = override if override is not None else plan_default

        result.append(FeatureOverrideItem(
            feature_id=f.id,
            feature_key=f.key,
            feature_name=f.name,
            category=f.category,
            description=f.description,
            is_addon=False,  # Could extend with Addon join if needed
            plan_default=plan_default,
            override=override,
            effective_value=effective,
        ))
    return result


@router.put(
    "/superadmin/organisations/{org_id}/feature-overrides",
    response_model=FeatureOverrideItem,
    summary="Super Admin — Upsert a feature override for an organization",
    tags=["superadmin-organisations"],
)
async def superadmin_upsert_feature_override(
    org_id: uuid.UUID,
    payload: FeatureOverrideUpsert,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> FeatureOverrideItem:
    """
    Upsert a feature override for a specific organization.

    Body: { feature_key, override: true | false | null }
    - null → removes override, restores plan default
    - true → force-enables regardless of plan
    - false → force-disables regardless of plan
    """
    from app.modules.platform.models.feature import FeatureCatalog
    from app.modules.billing.models.subscription import (
        OrganizationSubscription, PlanFeature, OrganizationFeature,
    )
    from sqlalchemy import delete as sql_delete

    # Resolve feature by key
    feature = (await db.execute(
        select(FeatureCatalog).where(FeatureCatalog.key == payload.feature_key)
    )).scalar_one_or_none()
    if not feature:
        raise HTTPException(status_code=404, detail=f"Feature '{payload.feature_key}' not found.")

    # Get plan default for this org
    sub = (await db.execute(
        select(OrganizationSubscription)
        .where(OrganizationSubscription.organization_id == org_id)
        .order_by(OrganizationSubscription.created_at.desc())
        .limit(1)
    )).scalar_one_or_none()
    plan_default = False
    if sub:
        pf = (await db.execute(
            select(PlanFeature).where(
                PlanFeature.plan_id == sub.plan_id,
                PlanFeature.feature_id == feature.id,
                PlanFeature.enabled.is_(True),
            )
        )).scalar_one_or_none()
        plan_default = pf is not None

    if payload.override is None:
        # Remove the override entirely — revert to plan default
        await db.execute(
            sql_delete(OrganizationFeature).where(
                OrganizationFeature.organization_id == org_id,
                OrganizationFeature.feature_id == feature.id,
            )
        )
        await db.commit()
        override_val = None
    else:
        # Upsert the override
        existing = (await db.execute(
            select(OrganizationFeature).where(
                OrganizationFeature.organization_id == org_id,
                OrganizationFeature.feature_id == feature.id,
            )
        )).scalar_one_or_none()

        if existing:
            existing.is_enabled = payload.override
            existing.override_by = current_user.id
            from datetime import datetime, timezone as tz
            existing.override_at = datetime.now(tz.utc)
        else:
            db.add(OrganizationFeature(
                organization_id=org_id,
                feature_id=feature.id,
                is_enabled=payload.override,
                override_by=current_user.id,
            ))
        await db.commit()
        override_val = payload.override

    effective = override_val if override_val is not None else plan_default

    return FeatureOverrideItem(
        feature_id=feature.id,
        feature_key=feature.key,
        feature_name=feature.name,
        category=feature.category,
        description=feature.description,
        is_addon=False,
        plan_default=plan_default,
        override=override_val,
        effective_value=effective,
    )


@router.get(
    "/superadmin/organisations/{org_id}/users",
    response_model=PaginatedOrgUsersResponse,
    summary="Super Admin — List users for an organization",
    tags=["superadmin-organisations"],
)
async def superadmin_list_org_users(
    org_id: uuid.UUID,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    role: Optional[str] = Query(default=None, description="Filter by role"),
    is_active: Optional[bool] = Query(default=None, description="Filter by active status"),
    search: Optional[str] = Query(default=None, description="Filter by name or email"),
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> PaginatedOrgUsersResponse:
    """
    Returns paginated users belonging to the given organization.
    Includes role, last_login_at, and 2FA status for the users tab.
    """
    from sqlalchemy import or_, desc

    q = select(User).where(
        User.organization_id == org_id,
        User.deleted_at.is_(None),
    )

    if role:
        q = q.where(User.role == role)
    if is_active is not None:
        q = q.where(User.is_active.is_(is_active))
    if search:
        term = f"%{search}%"
        q = q.where(
            or_(
                User.email.ilike(term),
                User.first_name.ilike(term),
                User.last_name.ilike(term),
            )
        )

    # Count total
    count_q = select(func.count(User.id)).where(
        User.organization_id == org_id,
        User.deleted_at.is_(None),
    )
    if role:
        count_q = count_q.where(User.role == role)
    if is_active is not None:
        count_q = count_q.where(User.is_active.is_(is_active))
    if search:
        term = f"%{search}%"
        count_q = count_q.where(
            or_(
                User.email.ilike(term),
                User.first_name.ilike(term),
                User.last_name.ilike(term),
            )
        )
    total = (await db.scalar(count_q)) or 0

    # Apply ordering and pagination
    q = q.order_by(desc(User.created_at)).offset((page - 1) * page_size).limit(page_size)
    users = (await db.execute(q)).scalars().all()

    return PaginatedOrgUsersResponse(
        items=[
            OrgUserRow(
                id=u.id,
                email=u.email,
                first_name=u.first_name,
                last_name=u.last_name,
                role=u.role,
                is_active=u.is_active,
                is_2fa_enabled=u.is_2fa_enabled,
                last_login_at=u.last_login_at,
                created_at=u.created_at,
            )
            for u in users
        ],
        total=total,
        page=page,
        page_size=page_size,
    )
