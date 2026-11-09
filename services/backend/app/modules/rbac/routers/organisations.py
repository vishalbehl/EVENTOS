from __future__ import annotations

import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, func, select, update, and_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import StepUpAuth, get_current_user, get_db, require_active_user, require_step_up
from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_log import AuditLog
from app.modules.billing.services.admin_lifecycle_service import BillingAdminLifecycleService
from app.modules.billing.services.usage_reservation_service import UsageReservationService
from app.modules.identity.models.refresh_token import RefreshToken
from app.modules.identity.models.user import User
from app.modules.events.models.event import Event
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.organiser.application.member_commands import OrganizationMemberCommandService
from app.modules.rbac.services.access_foundation import accepted_member, lock_revision
from app.modules.rbac.services.access_administration import (
    current_administration_organization,
    scoped_billing_reader,
    scoped_member_administration,
    scoped_organization_profile,
)
from app.modules.rbac.services.platform_permissions import (
    platform_organization_reader, platform_organization_manager, platform_organization_provisioner,
    platform_member_reader, platform_member_manager, platform_member_grantor,
)
from app.modules.rbac.services import invitations
from app.modules.rbac.services.organization_foundation import initialize_new_organization
from app.modules.rbac.services.default_teams import ensure_default_organization_teams
from app.modules.rbac.models.user_assignment import UserEventAssignment
from app.modules.platform.models.organization import Organization
from app.modules.rbac.schemas.organization import OrganizationResponse, OrganizationUpdate
from app.services import auth_service
from app.modules.billing.services.entitlement_resolver import EntitlementResolver
from app.modules.billing.models.cloud_commercial import CommercialAccount, CommercialAccountWorkspace

from app.redis import coordination_client as redis_client
import json

router = APIRouter(tags=["organisations"])

SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$")


class SignupRequest(BaseModel):
    model_config = {"extra": "forbid"}
    org_name: str = Field(min_length=2, max_length=100)
    slug: str = Field(min_length=3, max_length=50)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8)
    country: str = Field(default="IN", min_length=2, max_length=2)
    timezone: str = Field(default="Asia/Kolkata", max_length=50)


class InviteRequest(BaseModel):
    model_config = {"extra": "forbid", "str_strip_whitespace": True}
    email: EmailStr
    org_role: str = Field(pattern="^(admin|member|billing_only)$")


class AcceptInviteRequest(BaseModel):
    model_config = {"extra": "forbid"}
    token: str = Field(min_length=32, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")


class InvitationPreviewResponse(BaseModel):
    membership_id: uuid.UUID
    organization_id: uuid.UUID
    organization_name: str
    org_role: str
    version: int
    expires_at: datetime


class InvitationAcceptanceResponse(BaseModel):
    membership_id: uuid.UUID
    organization_id: uuid.UUID
    organization_name: str
    state: str
    version: int
    policy_revision: int


class InvitationIssueResponse(BaseModel):
    membership_id: uuid.UUID
    version: int
    expires_at: datetime
    delivery_mode: str
    message: str
    invite_token: str | None = Field(default=None, repr=False)
    replayed: bool


class MemberRoleUpdate(BaseModel):
    org_role: str = Field(pattern="^(owner|admin|member|billing_only)$")
    reason: str = Field(min_length=3, max_length=500)
    model_config = {"extra": "forbid", "str_strip_whitespace": True}


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
    is_active: Optional[bool] = None
    suspension_reason: Optional[str] = None
    reason: str = Field(..., min_length=12, max_length=1000)


class PlatformOrganizationProvision(BaseModel):
    model_config = {"extra": "forbid", "str_strip_whitespace": True}
    organization_kind: Literal["NORMAL", "EMC", "CLIENT"] = "NORMAL"
    name: str = Field(min_length=2, max_length=255)
    slug: str = Field(min_length=3, max_length=50)
    owner_email: EmailStr
    owner_first_name: str = Field(min_length=1, max_length=100)
    owner_last_name: str = Field(min_length=1, max_length=100)
    country: str = Field(default="IN", min_length=2, max_length=2)
    timezone: str = Field(default="Asia/Kolkata", max_length=50)
    reason: str = Field(min_length=12, max_length=1000)


class PlatformMemberInvite(BaseModel):
    model_config = {"extra": "forbid"}
    email: EmailStr
    org_role: str = Field(pattern="^(admin|member|billing_only)$")
    reason: str = Field(min_length=12, max_length=1000)


class PlatformMemberUpdate(BaseModel):
    model_config = {"extra": "forbid"}
    org_role: str = Field(pattern="^(owner|admin|member|billing_only)$")
    reason: str = Field(min_length=12, max_length=1000)


class PlatformReason(BaseModel):
    model_config = {"extra": "forbid"}
    reason: str = Field(min_length=12, max_length=1000)


class PlatformAssignmentUpdate(BaseModel):
    model_config = {"extra": "forbid"}
    permissions: dict = Field(default_factory=dict)
    reason: str = Field(min_length=12, max_length=1000)



def _clean_slug(slug: str) -> str:
    return slug.strip().lower()


async def _org_role(db: AsyncSession, user: User, organization_id: uuid.UUID | None = None) -> str:
    member = await accepted_member(db, user.id, organization_id or user.organization_id)
    return member.org_role


async def _require_org_admin(db: AsyncSession, user: User, organization_id: uuid.UUID | None = None) -> None:
    if await _org_role(db, user, organization_id) not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Owner or admin access required.")


async def _require_owner(db: AsyncSession, user: User, organization_id: uuid.UUID | None = None) -> None:
    if await _org_role(db, user, organization_id) != "owner":
        raise HTTPException(status_code=403, detail="Owner access required.")


def _token_response(
    user: User,
    access_token: str,
    refresh_token: str,
    organization: Organization,
) -> dict:
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
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


async def _member_rows(db: AsyncSession, org_id: uuid.UUID, *, response: Response | None = None,
                       cursor: str | None = None, limit: int = 50) -> list[dict]:
    from app.modules.organiser.application.queries import OrganiserMemberQueryService
    page = await OrganiserMemberQueryService(db).list_members_cursor(
        organization_id=org_id, cursor=cursor, limit=limit, search=None, member_status=None,
    )
    if response is not None:
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Page-Limit"] = str(limit)
        if page.next_cursor:
            response.headers["X-Next-Cursor"] = page.next_cursor
    elif page.next_cursor:
        # Embedded legacy detail cannot silently present a partial directory.
        raise HTTPException(503, detail={"code": "MEMBER_CURSOR_REQUIRED"})
    return page.items


@router.get("/auth/check-slug")
async def check_slug(slug: str = Query(..., min_length=3, max_length=50), db: AsyncSession = Depends(get_db)) -> dict:
    slug = _clean_slug(slug)
    if not SLUG_RE.match(slug):
        return {"available": False}
    exists = await db.scalar(select(func.count(Organization.id)).where(Organization.slug == slug))
    return {"available": not bool(exists)}


@router.post("/auth/signup", status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest, response: Response, db: AsyncSession = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    from app.config import settings

    if settings.is_production and not settings.PUBLIC_DEMO_SIGNUP_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "PUBLIC_SIGNUP_DISABLED", "message": "Public demo signup is not enabled."},
        )
    slug = _clean_slug(payload.slug)
    if not SLUG_RE.match(slug):
        raise HTTPException(status_code=422, detail="Slug must be 3-50 lowercase letters, numbers, or hyphens.")
    if await db.scalar(select(func.count(Organization.id)).where(Organization.slug == slug)):
        raise HTTPException(status_code=409, detail="Organisation slug is already taken.")
    email = payload.email.lower()
    if await db.scalar(select(func.count(User.id)).where(User.email == email)):
        raise HTTPException(status_code=409, detail="Email is already registered.")

    org = Organization(id=uuid.uuid4(), organization_kind="NORMAL", is_platform_org=False,
        name=payload.org_name, slug=slug, country=payload.country.upper(), timezone=payload.timezone)
    try:
        db.add(org)
        await initialize_new_organization(db, org)
        async with TenantContextGuard.scoped(db, org.id):
            user = User(organization_id=org.id, email=email,
                password_hash=auth_service.hash_password(payload.password),
                first_name=payload.first_name, last_name=payload.last_name,
                role="organiser", is_active=True)
            db.add(user)
            await db.flush()
            owner_member = OrganizationMember(organization_id=org.id, user_id=user.id, org_role="owner",
                accepted_at=datetime.now(timezone.utc))
            db.add(owner_member)
            await db.flush()
            await ensure_default_organization_teams(
                db, org.id, created_by=user.id, owner_member_id=owner_member.id,
            )
            account = CommercialAccount(account_type="ORGANIZER", owner_organization_id=org.id,
                status="ACTIVE", currency="INR", country=payload.country.upper())
            db.add(account)
            await db.flush()
            db.add(CommercialAccountWorkspace(commercial_account_id=account.id,
                organization_id=org.id, workspace_role="OWNER", status="ACTIVE"))
            db.add(AuditLog(organization_id=org.id, actor_user_id=user.id,
                action_type="ORGANIZATION_FOUNDED", resource_type="organization", resource_id=org.id,
                new_state={"organization_kind": "NORMAL", "owner_user_id": str(user.id),
                    "acting_organization_id": str(org.id), "target_organization_id": str(org.id)},
                change_diff={"reason": "Authenticated founder registration"}, is_sensitive=True))
            session_id = uuid.uuid4()
            refresh_token = auth_service.create_refresh_token_string()
            await auth_service.persist_refresh_token(
                db,
                user,
                refresh_token,
                family_id=session_id,
                active_organization_id=org.id,
                acting_organization_id=org.id,
            )
            access_token = auth_service.create_access_token(
                user,
                session_id=session_id,
                active_organization_id=org.id,
                acting_organization_id=org.id,
            )
            await db.commit()
            return _token_response(user, access_token, refresh_token, org)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, detail={"code": "SIGNUP_CONFLICT",
            "message": "Registration conflicts with an existing record."}) from None
    except Exception:
        await db.rollback()
        raise


@router.post("/auth/invitation", response_model=InvitationPreviewResponse)
async def invitation_preview(payload: AcceptInviteRequest, response: Response,
    actor: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return await invitations.preview(db, actor, payload.token)


@router.post("/auth/accept-invite", response_model=InvitationAcceptanceResponse, dependencies=[Depends(require_step_up)])
async def accept_invite(payload: AcceptInviteRequest, response: Response,
    if_match: int | None = Header(None, alias="If-Match", ge=1),
    key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    actor: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)) -> dict:
    if if_match is None:
        raise HTTPException(428, detail={"code": "VERSION_REQUIRED"})
    response.headers["Cache-Control"] = "no-store"
    return await invitations.accept(db, actor, payload.token, if_match, key)


@router.get("/organisations/me", dependencies=[Depends(scoped_organization_profile)])
async def get_my_org(current_user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)) -> dict:
    organization_id = current_administration_organization()
    org = await db.get(Organization, organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found.")
    event_count, member_count = await _usage(db, org.id)
    max_events = await EntitlementResolver.get_limit(db, org.id, "max_events")
    max_users = await EntitlementResolver.get_limit(db, org.id, "max_users")
    storage_quota_mb = await EntitlementResolver.get_limit(db, org.id, "storage_quota_mb")
    contract = await EntitlementResolver.get_active_contract(db, org.id)
    measured = [max_events, max_users, storage_quota_mb]
    availability = (
        "AVAILABLE"
        if all(value is not None for value in measured)
        else "PARTIAL"
        if any(value is not None for value in measured)
        else "UNAVAILABLE"
    )
    organization = OrganizationResponse.model_validate(org).model_dump(mode="json")
    return {
        "organization": organization,
        "member_count": member_count,
        "event_count": event_count,
        "storage_used_gb": 0,
        "entitlement_limits": {
            "events": max_events,
            "users": max_users,
            "storage_gb": round(storage_quota_mb / 1024, 3) if storage_quota_mb is not None else None,
        },
        "commercial": {
            "availability": availability,
            "freshness_at": datetime.now(timezone.utc).isoformat(),
            "source": "CANONICAL_ENTITLEMENT_RESOLVER",
            "contract_id": str(contract.id) if contract else None,
            "contract_status": contract.status if contract else None,
            "offer_id": str(contract.offer_id) if contract else None,
            "offer_name": contract.offer.name if contract and contract.offer else None,
        },
        "org_role": await _org_role(db, current_user, organization_id),
    }


@router.put("/organisations/me", dependencies=[Depends(scoped_organization_profile)])
async def update_my_org(payload: OrganizationUpdate, current_user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)) -> dict:
    organization_id = current_administration_organization()
    await _require_org_admin(db, current_user, organization_id)
    org = await db.get(Organization, organization_id)
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


@router.get("/organisations/me/members", dependencies=[Depends(scoped_member_administration)])
async def list_members(response: Response, cursor: str | None = Query(None, max_length=2048),
    limit: int = Query(50, ge=1, le=100), current_user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)) -> list[dict]:
    return await _member_rows(db, current_administration_organization(), response=response, cursor=cursor, limit=limit)


@router.post("/organisations/me/members/invite", response_model=InvitationIssueResponse, dependencies=[Depends(scoped_member_administration)])
async def invite_member(
    payload: InviteRequest,
    response: Response,
    current_user: User = Depends(require_active_user),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db),
) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return await OrganizationMemberCommandService(db).create_invitation(
        organization_id=current_administration_organization(), actor=current_user, email=str(payload.email),
        org_role=payload.org_role, idempotency_key=idempotency_key)


@router.put("/organisations/me/members/{member_id}", dependencies=[Depends(scoped_member_administration)])
async def update_member(member_id: uuid.UUID, payload: MemberRoleUpdate, if_match: int = Header(..., alias="If-Match", ge=1), current_user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)) -> dict:
    organization_id = current_administration_organization()
    await _require_owner(db, current_user, organization_id)
    member = await OrganizationMemberCommandService(db).update_role(
        organization_id=organization_id, member_id=member_id,
        actor=current_user, org_role=payload.org_role, if_match=if_match, reason=payload.reason)
    return {"message": "Member updated", "version": member.version}


@router.delete("/organisations/me/members/{member_id}", dependencies=[Depends(scoped_member_administration)])
async def remove_member(member_id: uuid.UUID, reason: str = Query(..., min_length=3, max_length=500), if_match: int = Header(..., alias="If-Match", ge=1), current_user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)) -> dict:
    organization_id = current_administration_organization()
    await _require_owner(db, current_user, organization_id)
    member = await OrganizationMemberCommandService(db).update_status(
        organization_id=organization_id, member_id=member_id,
        actor=current_user, is_active=False, if_match=if_match, reason=reason)
    return {"message": "Membership suspended", "version": member.version}


_require_platform_admin = platform_organization_manager  # compatibility, no legacy wildcard


@router.get("/platform/organisations")
async def platform_orgs(
    page: int = 1,
    per_page: int = 25,
    search: Optional[str] = None,
    offer: Optional[str] = None,
    is_active: Optional[bool] = None,
    _: User = Depends(platform_organization_reader),
    db: AsyncSession = Depends(get_db),
) -> dict:
    query = select(Organization)
    if search:
        query = query.where(Organization.name.ilike(f"%{search}%") | Organization.slug.ilike(f"%{search}%") | Organization.billing_email.ilike(f"%{search}%"))
    del offer
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
    response: Response,
    step_up: StepUpAuth,
    actor: User = Depends(platform_organization_provisioner),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128),
    db: AsyncSession = Depends(get_db),
) -> dict:
    del step_up
    response.headers["Cache-Control"] = "no-store"
    slug = _clean_slug(payload.slug)
    if not SLUG_RE.match(slug):
        raise HTTPException(status_code=422, detail="Slug must be 3-50 lowercase letters, numbers, or hyphens.")
    operation_payload = {**payload.model_dump(mode="json"), "slug": slug}

    try:
        async with TenantContextGuard.scoped(db, actor.organization_id):
            from app.modules.rbac.services.platform_permissions import platform_permission_authority
            await lock_revision(db, actor.organization_id, write=False)
            await platform_permission_authority(db, actor.id, "platform:organizations:provision")
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
                        func.lower(OrganizationMember.invite_email) == payload.owner_email.lower(),
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
                    "token": None,
                    "link_available": False,
                },
                "replayed": True,
            }

        organization_id = uuid.uuid4()
        async with TenantContextGuard.scoped(db, organization_id):
            org = Organization(
                id=organization_id,
                organization_kind=payload.organization_kind,
                is_platform_org=False,
                name=payload.name.strip(),
                slug=slug,
                country=payload.country.upper(),
                timezone=payload.timezone,
            )
            member = OrganizationMember(
                organization_id=organization_id,
                org_role="owner",
                invited_by=actor.id,
                invite_email=payload.owner_email.lower(),
                invite_first_name=payload.owner_first_name.strip(),
                invite_last_name=payload.owner_last_name.strip(),
            )
            invitation_token = invitations.issue_token(member)
            await invitations.admission(actor.id, organization_id)
            db.add(org)
            await initialize_new_organization(db, org)
            db.add(member)
            await db.flush()
            await ensure_default_organization_teams(
                db, organization_id, created_by=actor.id,
            )
            db.add(AuditLog(
                organization_id=organization_id,
                actor_user_id=actor.id,
                action_type="ORGANIZATION_PROVISIONED",
                resource_type="organization",
                resource_id=organization_id,
                new_state={
                    "name": org.name,
                    "organization_kind": org.organization_kind,
                    "slug": org.slug,
                    "owner_email": member.invite_email,
                    "membership_id": str(member.id),
                },
                change_diff={"reason": payload.reason, "idempotency_key": idempotency_key},
                is_sensitive=True,
            ))
            await db.flush()
        async with TenantContextGuard.scoped(db, actor.organization_id):
            operation.status = "SUCCEEDED"
            operation.result_ref_type = "organization"
            operation.result_ref_id = organization_id
            await db.flush()
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
    response: Response,
    cursor: str | None = Query(None, max_length=2048),
    limit: int = Query(50, ge=1, le=100),
    _: User = Depends(platform_member_reader),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    async with TenantContextGuard.scoped(db, org_id):
        if await db.get(Organization, org_id) is None:
            raise HTTPException(status_code=404, detail="Organisation not found.")
        return await _member_rows(db, org_id, response=response, cursor=cursor, limit=limit)


@router.get("/platform/organisations/{org_id}/member-directory")
async def platform_member_directory(
    org_id: uuid.UUID, response: Response,
    cursor: str | None = Query(None, max_length=2048), limit: int = Query(50, ge=1, le=100),
    _: User = Depends(platform_member_reader), db: AsyncSession = Depends(get_db),
) -> dict:
    from app.modules.organiser.application.queries import OrganiserMemberQueryService
    response.headers["Cache-Control"] = "no-store"
    async with TenantContextGuard.scoped(db, org_id):
        if await db.get(Organization, org_id) is None:
            raise HTTPException(404, detail={"code": "RESOURCE_NOT_FOUND"})
        page = await OrganiserMemberQueryService(db).list_members_cursor(
            organization_id=org_id, cursor=cursor, limit=limit, search=None, member_status=None)
        return {"items": page.items, "next_cursor": page.next_cursor, "has_next": page.has_next}


@router.post("/platform/organisations/{org_id}/members", status_code=status.HTTP_201_CREATED)
async def platform_invite_org_member(
    org_id: uuid.UUID, payload: PlatformMemberInvite, response: Response, step_up: StepUpAuth,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    actor: User = Depends(platform_member_manager), db: AsyncSession = Depends(get_db),
) -> dict:
    del step_up
    response.headers["Cache-Control"] = "no-store"
    async with TenantContextGuard.scoped(db, org_id):
        result = await OrganizationMemberCommandService(db, platform_administration=True).create_invitation(
            organization_id=org_id, actor=actor, email=payload.email, org_role=payload.org_role,
            idempotency_key=idempotency_key, reason=payload.reason)
        return {**result, "email": payload.email}


@router.post("/platform/organisations/{org_id}/members/{member_id}/invitation/resend")
async def platform_resend_org_invitation(
    org_id: uuid.UUID, member_id: uuid.UUID, payload: PlatformReason, response: Response,
    step_up: StepUpAuth,
    if_match: int | None = Header(None, alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    actor: User = Depends(platform_member_manager), db: AsyncSession = Depends(get_db),
) -> dict:
    del step_up
    response.headers["Cache-Control"] = "no-store"
    if if_match is None:
        raise HTTPException(428, detail={"code": "PRECONDITION_REQUIRED"})
    async with TenantContextGuard.scoped(db, org_id):
        member, token = await OrganizationMemberCommandService(db, platform_administration=True).resend_invitation(
            organization_id=org_id, member_id=member_id, actor=actor, if_match=if_match,
            idempotency_key=idempotency_key, reason=payload.reason)
        return {"membership_id": str(member.id), "version": member.version,
            "invite_token": token, "replayed": token is None, "delivery_mode": "MANUAL"}


@router.patch("/platform/organisations/{org_id}/members/{member_id}")
async def platform_update_org_member(
    org_id: uuid.UUID, member_id: uuid.UUID, payload: PlatformMemberUpdate, response: Response,
    step_up: StepUpAuth,
    if_match: int | None = Header(None, alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    actor: User = Depends(platform_member_manager), db: AsyncSession = Depends(get_db),
) -> dict:
    del step_up
    response.headers["Cache-Control"] = "no-store"
    if if_match is None:
        raise HTTPException(428, detail={"code": "PRECONDITION_REQUIRED"})
    async with TenantContextGuard.scoped(db, org_id):
        member = await OrganizationMemberCommandService(db, platform_administration=True).update_role(
            organization_id=org_id, member_id=member_id, actor=actor, org_role=payload.org_role,
            if_match=if_match, reason=payload.reason, idempotency_key=idempotency_key)
        return {"message": "Member role updated", "org_role": member.org_role, "version": member.version}


@router.delete("/platform/organisations/{org_id}/members/{member_id}")
async def platform_remove_org_member(
    org_id: uuid.UUID, member_id: uuid.UUID, payload: PlatformReason, response: Response,
    step_up: StepUpAuth,
    if_match: int | None = Header(None, alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    actor: User = Depends(platform_member_manager), db: AsyncSession = Depends(get_db),
) -> dict:
    del step_up
    response.headers["Cache-Control"] = "no-store"
    if if_match is None:
        raise HTTPException(428, detail={"code": "PRECONDITION_REQUIRED"})
    async with TenantContextGuard.scoped(db, org_id):
        # Tenant revocation is not global identity deactivation. Preserve existing
        # assignments/history; accepted active membership remains their live gate.
        member = await OrganizationMemberCommandService(db, platform_administration=True).update_status(
            organization_id=org_id, member_id=member_id, actor=actor, is_active=False,
            if_match=if_match, reason=payload.reason, idempotency_key=idempotency_key)
        return {"message": "Membership suspended", "version": member.version}


@router.put("/platform/organisations/{org_id}/members/{member_id}/events/{event_id}")
async def platform_assign_member_event(
    org_id: uuid.UUID, member_id: uuid.UUID, event_id: uuid.UUID, payload: PlatformAssignmentUpdate,
    response: Response, step_up: StepUpAuth,
    if_match: int | None = Header(None, alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    actor: User = Depends(platform_member_grantor), db: AsyncSession = Depends(get_db),
) -> dict:
    del step_up
    response.headers["Cache-Control"] = "no-store"
    if if_match is None:
        raise HTTPException(428, detail={"code": "PRECONDITION_REQUIRED"})
    async with TenantContextGuard.scoped(db, org_id):
        return await OrganizationMemberCommandService(db, platform_administration=True).set_platform_event_assignment(
            organization_id=org_id, member_id=member_id, event_id=event_id, actor=actor,
            permissions=payload.permissions, assigned=True, if_match=if_match,
            reason=payload.reason, idempotency_key=idempotency_key)


@router.delete("/platform/organisations/{org_id}/members/{member_id}/events/{event_id}")
async def platform_unassign_member_event(
    org_id: uuid.UUID, member_id: uuid.UUID, event_id: uuid.UUID, payload: PlatformReason,
    response: Response, step_up: StepUpAuth,
    if_match: int | None = Header(None, alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    actor: User = Depends(platform_member_grantor), db: AsyncSession = Depends(get_db),
) -> dict:
    del step_up
    response.headers["Cache-Control"] = "no-store"
    if if_match is None:
        raise HTTPException(428, detail={"code": "PRECONDITION_REQUIRED"})
    async with TenantContextGuard.scoped(db, org_id):
        return await OrganizationMemberCommandService(db, platform_administration=True).set_platform_event_assignment(
            organization_id=org_id, member_id=member_id, event_id=event_id, actor=actor,
            permissions={}, assigned=False, if_match=if_match,
            reason=payload.reason, idempotency_key=idempotency_key)


@router.get("/platform/organisations/{org_id}", dependencies=[Depends(platform_member_reader)])
async def platform_org_detail(org_id: uuid.UUID, _: User = Depends(platform_organization_reader), db: AsyncSession = Depends(get_db)) -> dict:
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
    governed_fields = {"is_active", "suspension_reason"}
    attempted_governed_fields = sorted(governed_fields.intersection(changes))
    if attempted_governed_fields:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "DUAL_APPROVAL_REQUIRED",
                "workflow": "organizer-console-commercial-or-lifecycle",
                "fields": attempted_governed_fields,
                "message": "Commercial limits and lifecycle state cannot be edited through organization metadata.",
            },
        )
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
    # A platform role cannot silently become a customer identity. Approved,
    # scoped support sessions are a later category; never mint a normal login.
    raise HTTPException(503, detail={"code": "SUPPORT_SESSION_REQUIRED",
        "message": "This legacy impersonation route is disabled. Use an approved scoped support-access workflow."},
        headers={"Cache-Control": "no-store"})




@router.get("/organisations/me/billing-history", dependencies=[Depends(scoped_billing_reader)])
async def get_billing_history(
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """List invoices and immutable commercial contract references."""
    organization_id = current_administration_organization()
    rows = (await db.execute(text("""
        SELECT i.id, i.invoice_number, i.amount, i.gst_amount, i.total_amount_inr,
               i.currency, i.status, i.issued_at, i.paid_at, i.event_id,
               i.commercial_contract_id,
               COALESCE(jsonb_agg(jsonb_build_object(
                   'description', ii.description,
                   'amount', ii.amount,
                   'quantity', ii.quantity,
                   'offer_code', ii.commercial_offer_code,
                   'offer_version_id', ii.commercial_offer_version_id
               ) ORDER BY ii.id) FILTER (WHERE ii.id IS NOT NULL), '[]'::jsonb) AS items
        FROM commerce.invoices i
        LEFT JOIN commerce.invoice_items ii ON ii.invoice_id = i.id
        WHERE i.organization_id = :organization_id
        GROUP BY i.id
        ORDER BY i.issued_at DESC
        LIMIT 100
    """), {"organization_id": organization_id})).mappings().all()
    return [{
        "id": str(row["id"]),
        "invoice_number": row["invoice_number"],
        "amount": float(row["amount"] or 0),
        "gst_amount": float(row["gst_amount"] or 0),
        "total_amount_inr": float(row["total_amount_inr"] or 0),
        "currency": row["currency"],
        "status": row["status"],
        "purchase_date": row["issued_at"].isoformat() if row["issued_at"] else None,
        "paid_at": row["paid_at"].isoformat() if row["paid_at"] else None,
        "event_id": str(row["event_id"]) if row["event_id"] else None,
        "commercial_contract_id": str(row["commercial_contract_id"]) if row["commercial_contract_id"] else None,
        "items": row["items"] or [],
    } for row in rows]







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
from app.modules.platform.models.health import OrganizationHealth


@router.get(
    "/superadmin/organisations",
    response_model=PaginatedOrgsResponse,
    summary="Super Admin - paginated commercial organization list",
    tags=["superadmin-organisations"],
)
async def superadmin_list_organisations(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    search: Optional[str] = Query(default=None),
    offer: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    country: Optional[str] = Query(default=None),
    sort_by: str = Query(default="created_at"),
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> PaginatedOrgsResponse:
    del sort_by
    filters = []
    params: dict[str, object] = {}
    if search:
        filters.append("(o.name ILIKE :search OR o.slug ILIKE :search OR o.billing_email ILIKE :search)")
        params["search"] = f"%{search}%"
    if country:
        filters.append("o.country ILIKE :country")
        params["country"] = country
    if offer:
        filters.append("(co.code ILIKE :offer OR co.display_name ILIKE :offer)")
        params["offer"] = f"%{offer}%"
    if status:
        filters.append("cc.status = :status")
        params["status"] = status
    where = " AND ".join(filters) or "TRUE"
    count = int(await db.scalar(text(f"""
        SELECT COUNT(DISTINCT o.id)
        FROM platform.organizations o
        LEFT JOIN commerce.billing_accounts ca ON ca.owner_organization_id = o.id
        LEFT JOIN commerce.plan_contracts cc ON cc.commercial_account_id = ca.id
        LEFT JOIN commerce.contract_items ci ON ci.contract_id = cc.id
        LEFT JOIN commerce.plans co ON co.id = ci.offer_id
        WHERE {where}
    """), params) or 0)
    params.update({"offset": (page - 1) * page_size, "limit": page_size})
    rows = (await db.execute(text(f"""
        SELECT o.id, o.name, o.slug, o.logo_url, o.country, o.timezone, o.billing_email,
               o.custom_domain, o.is_active, o.suspension_reason, o.created_at,
               COALESCE(MAX(co.display_name), 'NOT_CONFIGURED') AS offer_name,
               COALESCE(MAX(cc.status), 'NOT_CONFIGURED') AS contract_status,
               COALESCE(MAX(ou.active_users_count), 0) AS user_count,
               COALESCE(MAX(ou.active_events_count), 0) AS event_count,
               COALESCE(MAX(ou.storage_used_bytes), 0) AS storage_used_bytes,
               COALESCE(SUM(rm.mrr), 0) AS mrr
        FROM platform.organizations o
        LEFT JOIN commerce.billing_accounts ca ON ca.owner_organization_id = o.id
        LEFT JOIN commerce.plan_contracts cc ON cc.commercial_account_id = ca.id
        LEFT JOIN commerce.contract_items ci ON ci.contract_id = cc.id
        LEFT JOIN commerce.plans co ON co.id = ci.offer_id
        LEFT JOIN analytics.organization_usage ou ON ou.organization_id = o.id
        LEFT JOIN commerce.revenue_metrics rm ON rm.organization_id = o.id
             AND rm.period = TO_CHAR(NOW(), 'YYYY-MM')
        WHERE {where}
        GROUP BY o.id
        ORDER BY o.created_at DESC, o.id DESC
        OFFSET :offset LIMIT :limit
    """), params)).mappings().all()
    items = []
    for row in rows:
        health = await db.get(OrganizationHealth, row["id"])
        items.append(EnrichedOrgResponse(
            id=row["id"], name=row["name"], slug=row["slug"], logo_url=row["logo_url"],
            offer_name=row["offer_name"], country=row["country"], timezone=row["timezone"],
            billing_email=row["billing_email"], custom_domain=row["custom_domain"],
            is_active=row["is_active"], suspension_reason=row["suspension_reason"],
            created_at=row["created_at"], contract_status=row["contract_status"],
            health_score=health.health_score if health else None,
            health_status=health.status if health else "NOT_MEASURED",
            user_count=int(row["user_count"] or 0), event_count=int(row["event_count"] or 0),
            storage_used_bytes=int(row["storage_used_bytes"] or 0),
            mrr=float(row["mrr"] or 0),
        ))
    total_pages = max(1, (count + page_size - 1) // page_size)
    return PaginatedOrgsResponse(items=items, total=count, page=page, page_size=page_size, total_pages=total_pages)





@router.get(
    "/superadmin/organisations/{org_id}/feature-overrides",
    response_model=List[FeatureOverrideItem],
    summary="Super Admin - get explicit entitlement overrides",
    tags=["superadmin-organisations"],
)
async def superadmin_get_feature_overrides(
    org_id: uuid.UUID,
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> List[FeatureOverrideItem]:
    from app.modules.platform.models.feature import FeatureCatalog
    from app.modules.billing.models.commercial_support import OrganizationFeature
    features = (await db.scalars(select(FeatureCatalog).where(
        FeatureCatalog.is_active.is_(True)
    ).order_by(FeatureCatalog.category_order.asc(), FeatureCatalog.feature_order.asc()))).all()
    overrides = {
        row.feature_id: row.is_enabled
        for row in (await db.scalars(select(OrganizationFeature).where(
            OrganizationFeature.organization_id == org_id
        ))).all()
    }
    return [FeatureOverrideItem(
        feature_id=feature.id,
        feature_key=feature.key,
        feature_name=feature.name,
        category=feature.category,
        description=feature.description,
        is_addon=False,
        offer_default=False,
        override=overrides.get(feature.id),
        effective_value=overrides.get(feature.id, False),
    ) for feature in features]


@router.put(
    "/superadmin/organisations/{org_id}/feature-overrides",
    response_model=FeatureOverrideItem,
    summary="Super Admin - update explicit entitlement override",
    tags=["superadmin-organisations"],
    deprecated=True,
    include_in_schema=False,
)
async def superadmin_upsert_feature_override(
    org_id: uuid.UUID,
    payload: FeatureOverrideUpsert,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> FeatureOverrideItem:
    from app.modules.platform.models.feature import FeatureCatalog
    from app.modules.billing.models.commercial_support import OrganizationFeature
    feature = await db.scalar(select(FeatureCatalog).where(
        FeatureCatalog.key == payload.feature_key,
        FeatureCatalog.is_active.is_(True),
    ))
    if not feature:
        raise HTTPException(status_code=404, detail=f"Feature '{payload.feature_key}' not found.")
    existing = await db.scalar(select(OrganizationFeature).where(
        OrganizationFeature.organization_id == org_id,
        OrganizationFeature.feature_id == feature.id,
    ))
    if payload.override is None:
        if existing:
            await db.delete(existing)
    elif existing:
        existing.is_enabled = payload.override
        existing.override_by = current_user.id
        existing.override_at = datetime.now(timezone.utc)
    else:
        db.add(OrganizationFeature(
            organization_id=org_id,
            feature_id=feature.id,
            is_enabled=payload.override,
            override_by=current_user.id,
        ))
    await db.commit()
    return FeatureOverrideItem(
        feature_id=feature.id,
        feature_key=feature.key,
        feature_name=feature.name,
        category=feature.category,
        description=feature.description,
        is_addon=False,
        offer_default=False,
        override=payload.override,
        effective_value=payload.override if payload.override is not None else False,
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
