from __future__ import annotations

import uuid
import hashlib
import json
import csv
import io
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, Response, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.modules.billing.services.entitlement_resolver import EntitlementResolver
from app.modules.billing.models.billing_domain_tables import Invoice, OrganizationBillingProfile, PaymentMethod
from app.modules.billing.models.org_credits import OrgCredit
from app.modules.billing.models.subscription import Addon, OrganizationAddon, SubscriptionTransaction
from app.modules.events.models.event import Event
from app.modules.events.services.event_mutation_service import EventMutationService
from app.modules.rbac.schemas.event import EventCreate
from app.modules.agenda.models import Session
from app.modules.events.models.speaker import Speaker
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.organization_console import (
    CommercialAccessRequest,
    OrganizationBrandProfile,
    OrganizationCustomField,
    OrganizationLocation,
    OrganizationNotificationChannelConfig,
    OrganizationNotificationRule,
    OrganizationSecurityPolicy,
    OrganizationTeam,
    OrganizationTeamEvent,
    OrganizationTeamMember,
    OrganizationDocument,
    OrganizationApprovalRule,
    OrganizationAttentionState,
)
from app.modules.files.models.file import Asset
from app.modules.files.services.file_service import FileService
from app.modules.audit.models.audit_log import AuditLog
from app.modules.developer.models.developer_registry import ApiKey
from app.modules.integrations.models.integrations_domain_tables import IntegrationConnection, IntegrationProvider
from app.modules.integrations.models.integrations_domain_tables import IntegrationWebhookDelivery
from app.modules.integrations.models.webhook import Webhook
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.rbac.models.rbac import Permission, Role, RolePermission, UserRoleAssignment
from app.modules.rbac.models.user_assignment import UserEventAssignment
from app.modules.identity.models.refresh_token import RefreshToken
from app.modules.presentations.models.presentation_file import PresentationFile
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.payment_transaction import PaymentTransaction
from app.modules.venue.models.room_device import RoomDevice
from app.modules.agenda.models import Room

router = APIRouter(prefix="/organiser", tags=["organiser"])


def _page(items: list[dict[str, Any]], total: int, page: int, page_size: int, source: str) -> dict[str, Any]:
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "freshness_at": datetime.now(timezone.utc).isoformat(),
        "source": source,
    }


class CustomFieldWrite(BaseModel):
    field_key: str = Field(min_length=2, max_length=100, pattern=r"^[a-z][a-z0-9_]*$")
    label: str = Field(min_length=2, max_length=160)
    field_type: str = Field(default="TEXT", pattern=r"^(TEXT|NUMBER|DATE|BOOLEAN|SELECT|MULTISELECT)$")
    required: bool = False
    options: list[str] = Field(default_factory=list, max_length=100)
    is_active: bool = True


class TeamWrite(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    owner_member_id: uuid.UUID | None = None


class MemberStatusWrite(BaseModel):
    is_active: bool
    reason: str = Field(min_length=3, max_length=500)


class MemberRoleWrite(BaseModel):
    org_role: str = Field(pattern=r"^(owner|admin|member|billing_only)$")
    reason: str = Field(min_length=3, max_length=500)


class BulkMemberRef(BaseModel):
    id: uuid.UUID
    version: int = Field(ge=1)


class BulkMemberStatusWrite(BaseModel):
    members: list[BulkMemberRef] = Field(min_length=1, max_length=100)
    is_active: bool
    reason: str = Field(min_length=3, max_length=500)


class TeamAssignmentWrite(BaseModel):
    permissions: dict[str, Any] = Field(default_factory=dict)


class NotificationRuleToggle(BaseModel):
    is_enabled: bool


class SecurityPolicyWrite(BaseModel):
    require_mfa: bool
    allowed_auth_methods: list[str] = Field(min_length=1)
    password_policy: dict[str, Any] = Field(default_factory=dict)
    session_policy: dict[str, Any] = Field(default_factory=dict)
    trusted_device_policy: dict[str, Any] = Field(default_factory=dict)
    sso_enforced: bool = False
    allowed_cidrs: list[str] = Field(default_factory=list, max_length=100)


class BrandingWrite(BaseModel):
    logo_url: str | None = Field(default=None, max_length=2000)
    primary_color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    secondary_color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")


class LocationWrite(BaseModel):
    location_type: str = Field(default="HEAD_OFFICE", pattern=r"^(HEAD_OFFICE|REGIONAL_OFFICE|VENUE|WAREHOUSE|OTHER)$")
    name: str = Field(min_length=2, max_length=160)
    address: dict[str, Any] = Field(default_factory=dict)
    timezone: str = Field(min_length=1, max_length=64)
    contact: dict[str, Any] = Field(default_factory=dict)
    manager_user_id: uuid.UUID | None = None
    team_id: uuid.UUID | None = None
    status: str = Field(default="ACTIVE", pattern=r"^(ACTIVE|INACTIVE)$")


class EventDuplicateWrite(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    short_code: str | None = Field(default=None, min_length=2, max_length=20, pattern=r"^[A-Z0-9-]+$")


class ReportExportWrite(BaseModel):
    domain: str = Field(pattern=r"^(overview|registrations|revenue|engagement|events)$")
    format: str = Field(default="csv", pattern=r"^csv$")


class CustomReportWrite(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    domain: str = Field(pattern=r"^(registrations|revenue|engagement|events)$")
    columns: list[str] = Field(min_length=1, max_length=30)
    filters: dict[str, Any] = Field(default_factory=dict)


class BillingProfileWrite(BaseModel):
    billing_name: str = Field(min_length=2, max_length=255)
    billing_email: str = Field(min_length=3, max_length=255)
    billing_phone: str | None = Field(default=None, max_length=50)
    gst_number: str | None = Field(default=None, max_length=40)
    country: str = Field(min_length=2, max_length=2)
    currency: str = Field(min_length=3, max_length=10)


class ApprovalRuleWrite(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    domain: str = Field(pattern=r"^(registration|finance|access)$")
    event_id: uuid.UUID | None = None
    approver_chain: list[dict[str, Any]] = Field(min_length=1, max_length=10)
    conditions: dict[str, Any] = Field(default_factory=dict)
    status: str = Field(default="ACTIVE", pattern=r"^(ACTIVE|INACTIVE)$")


class AttentionAssignWrite(BaseModel):
    owner_user_id: uuid.UUID | None = None


class AttentionSnoozeWrite(BaseModel):
    snoozed_until: datetime
    reason: str = Field(min_length=3, max_length=500)


class AttentionResolveWrite(BaseModel):
    resolution: str = Field(min_length=3, max_length=1000)


class OrganizationProfileWrite(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    legal_name: str | None = Field(default=None, max_length=255)
    registration_number: str | None = Field(default=None, max_length=100)
    organization_type: str | None = Field(default=None, max_length=50)
    industry: str | None = Field(default=None, max_length=50)
    billing_email: str | None = Field(default=None, max_length=255)
    contact_email: str | None = Field(default=None, max_length=255)
    contact_phone: str | None = Field(default=None, max_length=50)
    website_url: str | None = Field(default=None, max_length=2000)
    billing_address: dict[str, Any] = Field(default_factory=dict)
    portal_name: str | None = Field(default=None, max_length=255)
    country: str = Field(min_length=2, max_length=2)
    timezone: str = Field(min_length=1, max_length=50)
    language: str = Field(min_length=1, max_length=50)
    date_format: str = Field(min_length=1, max_length=20)
    time_format: str = Field(min_length=1, max_length=20)
    currency: str = Field(min_length=1, max_length=20)
    logo_url: str | None = Field(default=None, max_length=2000)
    primary_color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    secondary_color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")


def _organization_profile(org: Organization) -> dict[str, Any]:
    return {
        "id": str(org.id), "name": org.name, "legal_name": org.legal_name,
        "registration_number": org.registration_number, "organization_type": org.organization_type,
        "industry": org.industry, "billing_email": org.billing_email,
        "contact_email": org.contact_email, "contact_phone": org.contact_phone,
        "website_url": org.website_url, "billing_address": org.billing_address or {},
        "portal_name": org.portal_name, "country": org.country, "timezone": org.timezone,
        "language": org.language, "date_format": org.date_format, "time_format": org.time_format,
        "currency": org.currency, "logo_url": org.logo_url, "primary_color": org.primary_color,
        "secondary_color": org.secondary_color,
        "verification_status": org.verification_status, "version": org.profile_version,
        "updated_at": org.updated_at.isoformat(), "source": "platform.organizations",
    }


async def _current_org(db: AsyncSession, current_user: User) -> Organization:
    if not current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "ORGANIZATION_CONTEXT_REQUIRED"},
        )
    org = await db.get(Organization, current_user.organization_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return org


async def _require_org_admin(db: AsyncSession, current_user: User, organization_id: uuid.UUID) -> None:
    if current_user.role == "super_admin" or getattr(current_user, "is_platform_admin", False):
        return
    member = await db.scalar(select(OrganizationMember).where(
        OrganizationMember.organization_id == organization_id,
        OrganizationMember.user_id == current_user.id,
        OrganizationMember.is_active.is_(True),
    ))
    if not member or member.org_role not in {"owner", "admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"code": "ORGANIZATION_ADMIN_REQUIRED"})


@router.get("/organisation/profile")
async def get_organiser_profile(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    return _organization_profile(await _current_org(db, current_user))


@router.put("/organisation/profile")
async def update_organiser_profile(payload: OrganizationProfileWrite, if_match: int = Header(..., alias="If-Match", ge=1), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    if org.profile_version != if_match:
        raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "current_version": org.profile_version})
    old = _organization_profile(org)
    for key, value in payload.model_dump().items(): setattr(org, key, value)
    org.profile_version += 1; org.profile_updated_by = current_user.id
    db.add(AuditLog(organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="organization_profile", resource_id=org.id, action_type="ORGANIZATION_PROFILE_UPDATED", old_state=old, new_state={**payload.model_dump(), "version": org.profile_version}, is_sensitive=True))
    await db.commit(); await db.refresh(org)
    return _organization_profile(org)


def _custom_field_out(row: OrganizationCustomField) -> dict[str, Any]:
    return {"id": str(row.id), "field_key": row.field_key, "label": row.label, "field_type": row.field_type, "required": row.required, "options": row.options, "is_active": row.is_active, "version": row.version, "updated_at": row.updated_at.isoformat()}


@router.get("/teams")
async def organiser_teams(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    search: str | None = Query(default=None, max_length=160),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    filters = [OrganizationTeam.organization_id == org.id, OrganizationTeam.deleted_at.is_(None)]
    if search and search.strip():
        filters.append(OrganizationTeam.name.ilike(f"%{search.strip()}%"))
    total = int(await db.scalar(select(func.count(OrganizationTeam.id)).where(*filters)) or 0)
    teams = (await db.scalars(
        select(OrganizationTeam)
        .where(*filters)
        .order_by(OrganizationTeam.name.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )).all()
    items: list[dict[str, Any]] = []
    for team in teams:
        member_rows = (await db.execute(
            select(OrganizationMember.id, User.first_name, User.last_name, User.email)
            .join(OrganizationTeamMember, OrganizationTeamMember.organization_member_id == OrganizationMember.id)
            .join(User, User.id == OrganizationMember.user_id)
            .where(
                OrganizationTeamMember.organization_id == org.id,
                OrganizationTeamMember.team_id == team.id,
            )
            .order_by(User.last_name.asc(), User.first_name.asc(), User.email.asc())
        )).all()
        event_rows = (await db.execute(
            select(OrganizationTeamEvent.event_id, OrganizationTeamEvent.permissions, Event.name)
            .join(Event, Event.id == OrganizationTeamEvent.event_id)
            .where(
                OrganizationTeamEvent.organization_id == org.id,
                OrganizationTeamEvent.team_id == team.id,
                Event.deleted_at.is_(None),
            )
        )).all()
        items.append({
            "id": str(team.id),
            "name": team.name,
            "description": team.description,
            "owner_member_id": str(team.owner_member_id) if team.owner_member_id else None,
            "status": team.status,
            "version": team.version,
            "member_count": len(member_rows),
            "members": [
                {"member_id": str(member_id), "name": f"{first_name} {last_name}".strip(), "email": email}
                for member_id, first_name, last_name, email in member_rows
            ],
            "events": [
                {"event_id": str(event_id), "event_name": event_name, "permissions": permissions}
                for event_id, permissions, event_name in event_rows
            ],
            "updated_at": team.updated_at.isoformat() if team.updated_at else None,
        })
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "freshness_at": datetime.now(timezone.utc).isoformat(),
        "source": "organizer_access.organization_teams",
    }


@router.get("/members")
async def organiser_members(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    search: str | None = Query(default=None, max_length=160),
    member_status: str | None = Query(default=None, alias="status", pattern=r"^(active|inactive|pending|accepted)$"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    filters = [OrganizationMember.organization_id == org.id]
    if search and search.strip():
        term = f"%{search.strip()}%"
        filters.append(or_(
            User.first_name.ilike(term),
            User.last_name.ilike(term),
            User.email.ilike(term),
            OrganizationMember.invite_email.ilike(term),
        ))
    if member_status == "active":
        filters.extend([OrganizationMember.accepted_at.is_not(None), OrganizationMember.is_active.is_(True)])
    elif member_status == "inactive":
        filters.append(OrganizationMember.is_active.is_(False))
    elif member_status == "pending":
        filters.extend([OrganizationMember.accepted_at.is_(None), OrganizationMember.is_active.is_(True)])
    elif member_status == "accepted":
        filters.append(OrganizationMember.accepted_at.is_not(None))

    count_query = select(func.count(OrganizationMember.id)).outerjoin(User, OrganizationMember.user_id == User.id).where(*filters)
    total = int(await db.scalar(count_query) or 0)
    rows = (await db.execute(
        select(OrganizationMember, User)
        .outerjoin(User, OrganizationMember.user_id == User.id)
        .where(*filters)
        .order_by(OrganizationMember.invited_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )).all()
    user_ids = [user.id for _, user in rows if user]
    event_ids_by_user: dict[uuid.UUID, list[str]] = {}
    if user_ids:
        from app.modules.rbac.models.user_assignment import UserEventAssignment
        assignments = (await db.execute(
            select(UserEventAssignment.user_id, UserEventAssignment.event_id)
            .join(Event, Event.id == UserEventAssignment.event_id)
            .where(UserEventAssignment.user_id.in_(user_ids), Event.organization_id == org.id)
        )).all()
        for user_id, event_id in assignments:
            event_ids_by_user.setdefault(user_id, []).append(str(event_id))
    items = [{
        "id": str(member.id),
        "user_id": str(user.id) if user else None,
        "name": user.full_name if user else (member.invite_email or "Pending invite"),
        "email": user.email if user else member.invite_email,
        "org_role": member.org_role,
        "accepted_at": member.accepted_at.isoformat() if member.accepted_at else None,
        "invited_at": member.invited_at.isoformat() if member.invited_at else None,
        "is_active": member.is_active,
        "is_2fa_enabled": user.is_2fa_enabled if user else False,
        "last_login_at": user.last_login_at.isoformat() if user and user.last_login_at else None,
        "event_ids": event_ids_by_user.get(user.id, []) if user else [],
        "suspension_reason": member.suspension_reason,
        "version": member.version,
    } for member, user in rows]
    return _page(items, total, page, page_size, "organizer_access.organization_members")


@router.post("/invitations/{member_id}/resend")
async def resend_organiser_invitation(member_id: uuid.UUID, if_match: int = Header(..., alias="If-Match", ge=1), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    member = await db.scalar(select(OrganizationMember).where(OrganizationMember.id == member_id, OrganizationMember.organization_id == org.id))
    if not member or member.accepted_at is not None or not member.invite_email:
        raise HTTPException(status_code=404, detail={"code": "PENDING_INVITATION_NOT_FOUND"})
    if member.version != if_match: raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "current_version": member.version})
    member.invite_token = secrets.token_urlsafe(32)[:64]; member.invited_at = datetime.now(timezone.utc); member.version += 1
    db.add(AuditLog(organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="organization_member", resource_id=member.id, action_type="ORGANIZATION_INVITATION_RESENT", new_state={"invite_email": member.invite_email, "version": member.version}, is_sensitive=True))
    await db.commit()
    return {"id": str(member.id), "message": "Invitation resent", "version": member.version}


@router.delete("/invitations/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_organiser_invitation(member_id: uuid.UUID, if_match: int = Header(..., alias="If-Match", ge=1), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> Response:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    member = await db.scalar(select(OrganizationMember).where(OrganizationMember.id == member_id, OrganizationMember.organization_id == org.id))
    if not member or member.accepted_at is not None or not member.invite_email:
        raise HTTPException(status_code=404, detail={"code": "PENDING_INVITATION_NOT_FOUND"})
    if member.version != if_match: raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "current_version": member.version})
    old = {"invite_email": member.invite_email, "is_active": member.is_active, "version": member.version}
    member.is_active = False; member.invite_token = None; member.version += 1
    db.add(AuditLog(organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="organization_member", resource_id=member.id, action_type="ORGANIZATION_INVITATION_REVOKED", old_state=old, new_state={"is_active": False, "version": member.version}, is_sensitive=True))
    await db.commit(); return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/members/{member_id}/role")
async def update_organiser_member_role(member_id: uuid.UUID, payload: MemberRoleWrite, if_match: int = Header(..., alias="If-Match", ge=1), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    member = await db.scalar(select(OrganizationMember).where(OrganizationMember.id == member_id, OrganizationMember.organization_id == org.id, OrganizationMember.accepted_at.is_not(None)))
    if not member: raise HTTPException(status_code=404, detail={"code": "MEMBER_NOT_FOUND"})
    if member.version != if_match: raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "current_version": member.version})
    if member.org_role == "owner" and payload.org_role != "owner":
        owners = int(await db.scalar(select(func.count(OrganizationMember.id)).where(OrganizationMember.organization_id == org.id, OrganizationMember.org_role == "owner", OrganizationMember.is_active.is_(True))) or 0)
        if owners <= 1: raise HTTPException(status_code=422, detail={"code": "LAST_OWNER_CANNOT_BE_DEMOTED"})
    old_role = member.org_role; member.org_role = payload.org_role; member.version += 1
    db.add(AuditLog(organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="organization_member", resource_id=member.id, action_type="ORGANIZATION_MEMBER_ROLE_CHANGED", old_state={"org_role": old_role, "version": if_match}, new_state={"org_role": member.org_role, "reason": payload.reason, "version": member.version}, is_sensitive=True))
    await db.commit(); return {"id": str(member.id), "org_role": member.org_role, "version": member.version}


@router.patch("/members/{member_id}/status")
async def update_organiser_member_status(member_id: uuid.UUID, payload: MemberStatusWrite, if_match: int = Header(..., alias="If-Match", ge=1), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    member = await db.scalar(select(OrganizationMember).where(OrganizationMember.id == member_id, OrganizationMember.organization_id == org.id, OrganizationMember.accepted_at.is_not(None)))
    if not member: raise HTTPException(status_code=404, detail={"code": "MEMBER_NOT_FOUND"})
    if member.org_role == "owner" and not payload.is_active: raise HTTPException(status_code=422, detail={"code": "OWNER_CANNOT_BE_SUSPENDED"})
    if member.version != if_match: raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "current_version": member.version})
    old = {"is_active": member.is_active, "version": member.version}; member.is_active = payload.is_active; member.suspension_reason = None if payload.is_active else payload.reason; member.version += 1
    if member.user_id:
        user = await db.get(User, member.user_id)
        if user: user.is_active = payload.is_active
        if not payload.is_active:
            await db.execute(update(RefreshToken).where(RefreshToken.user_id == member.user_id, RefreshToken.is_revoked.is_(False)).values(is_revoked=True, revoked_at=datetime.now(timezone.utc)))
    db.add(AuditLog(organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="organization_member", resource_id=member.id, action_type="ORGANIZATION_MEMBER_REACTIVATED" if payload.is_active else "ORGANIZATION_MEMBER_SUSPENDED", old_state=old, new_state={"is_active": member.is_active, "reason": payload.reason, "version": member.version}, is_sensitive=True))
    await db.commit(); return {"id": str(member.id), "is_active": member.is_active, "version": member.version}


@router.patch("/members-bulk/status")
async def bulk_update_organiser_member_status(payload: BulkMemberStatusWrite, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    requested = {item.id: item.version for item in payload.members}
    if len(requested) != len(payload.members): raise HTTPException(status_code=422, detail={"code": "DUPLICATE_MEMBER_IDS"})
    rows = (await db.scalars(select(OrganizationMember).where(OrganizationMember.organization_id == org.id, OrganizationMember.id.in_(requested), OrganizationMember.accepted_at.is_not(None)).with_for_update())).all()
    if len(rows) != len(requested): raise HTTPException(status_code=404, detail={"code": "MEMBER_NOT_FOUND"})
    conflicts = [{"id": str(row.id), "current_version": row.version} for row in rows if row.version != requested[row.id]]
    if conflicts: raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "members": conflicts})
    if not payload.is_active and any(row.org_role == "owner" for row in rows): raise HTTPException(status_code=422, detail={"code": "OWNER_CANNOT_BE_SUSPENDED"})
    now = datetime.now(timezone.utc); updated = []
    for member in rows:
        old = {"is_active": member.is_active, "version": member.version}; member.is_active = payload.is_active; member.suspension_reason = None if payload.is_active else payload.reason; member.version += 1
        if member.user_id:
            user = await db.get(User, member.user_id)
            if user: user.is_active = payload.is_active
            if not payload.is_active: await db.execute(update(RefreshToken).where(RefreshToken.user_id == member.user_id, RefreshToken.is_revoked.is_(False)).values(is_revoked=True, revoked_at=now))
        db.add(AuditLog(organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="organization_member", resource_id=member.id, action_type="ORGANIZATION_MEMBER_REACTIVATED" if payload.is_active else "ORGANIZATION_MEMBER_SUSPENDED", old_state=old, new_state={"is_active": member.is_active, "reason": payload.reason, "version": member.version, "bulk": True}, is_sensitive=True))
        updated.append({"id": str(member.id), "is_active": member.is_active, "version": member.version})
    await db.commit(); return {"items": updated, "updated": len(updated)}


@router.post("/teams", status_code=status.HTTP_201_CREATED)
async def create_organiser_team(
    payload: TeamWrite,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=8, max_length=160),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    normalized = payload.name.strip()
    replay = await db.scalar(select(AuditLog).where(
        AuditLog.organization_id == org.id,
        AuditLog.action_type == "ORGANIZATION_TEAM_CREATED",
        AuditLog.new_state["idempotency_key"].astext == idempotency_key,
    ))
    if replay:
        row = await db.get(OrganizationTeam, replay.resource_id)
        if row and row.deleted_at is None:
            return {
                "id": str(row.id), "name": row.name, "description": row.description,
                "owner_member_id": str(row.owner_member_id) if row.owner_member_id else None,
                "status": row.status, "version": row.version,
            }
    existing = await db.scalar(select(OrganizationTeam).where(
        OrganizationTeam.organization_id == org.id,
        func.lower(OrganizationTeam.name) == normalized.lower(),
        OrganizationTeam.deleted_at.is_(None),
    ))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "ORGANIZATION_TEAM_NAME_EXISTS"})
    if payload.owner_member_id and not await db.scalar(select(OrganizationMember.id).where(OrganizationMember.id == payload.owner_member_id, OrganizationMember.organization_id == org.id, OrganizationMember.is_active.is_(True))):
        raise HTTPException(status_code=422, detail={"code": "TEAM_OWNER_NOT_ACTIVE_MEMBER"})
    row = OrganizationTeam(organization_id=org.id, name=normalized, description=payload.description, owner_member_id=payload.owner_member_id, created_by=current_user.id)
    db.add(row)
    await db.flush()
    db.add(AuditLog(
        organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role,
        resource_type="organization_team", resource_id=row.id, action_type="ORGANIZATION_TEAM_CREATED",
        new_state={
            "name": row.name, "description": row.description,
            "owner_member_id": str(row.owner_member_id) if row.owner_member_id else None,
            "status": row.status, "idempotency_key": idempotency_key,
        }, is_sensitive=False,
    ))
    await db.commit()
    return {"id": str(row.id), "name": row.name, "description": row.description, "owner_member_id": str(row.owner_member_id) if row.owner_member_id else None, "status": row.status, "version": row.version}


@router.patch("/teams/{team_id}")
async def update_organiser_team(
    team_id: uuid.UUID,
    payload: TeamWrite,
    expected_version: int = Header(alias="If-Match", ge=1),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    row = await db.scalar(select(OrganizationTeam).where(
        OrganizationTeam.id == team_id,
        OrganizationTeam.organization_id == org.id,
        OrganizationTeam.deleted_at.is_(None),
    ))
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "ORGANIZATION_TEAM_NOT_FOUND"})
    if row.version != expected_version:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "STALE_VERSION", "current_version": row.version})
    normalized = payload.name.strip()
    duplicate = await db.scalar(select(OrganizationTeam.id).where(
        OrganizationTeam.organization_id == org.id,
        OrganizationTeam.id != team_id,
        func.lower(OrganizationTeam.name) == normalized.lower(),
        OrganizationTeam.deleted_at.is_(None),
    ))
    if duplicate:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "ORGANIZATION_TEAM_NAME_EXISTS"})
    if payload.owner_member_id and not await db.scalar(select(OrganizationMember.id).where(OrganizationMember.id == payload.owner_member_id, OrganizationMember.organization_id == org.id, OrganizationMember.is_active.is_(True))):
        raise HTTPException(status_code=422, detail={"code": "TEAM_OWNER_NOT_ACTIVE_MEMBER"})
    old_state = {
        "name": row.name, "description": row.description,
        "owner_member_id": str(row.owner_member_id) if row.owner_member_id else None,
        "status": row.status, "version": row.version,
    }
    row.name = normalized
    row.description = payload.description
    row.owner_member_id = payload.owner_member_id
    row.version += 1
    db.add(AuditLog(
        organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role,
        resource_type="organization_team", resource_id=row.id, action_type="ORGANIZATION_TEAM_UPDATED",
        old_state=old_state, new_state={
            "name": row.name, "description": row.description,
            "owner_member_id": str(row.owner_member_id) if row.owner_member_id else None,
            "manager_user_id": str(row.manager_user_id) if row.manager_user_id else None,
            "team_id": str(row.team_id) if row.team_id else None,
            "status": row.status, "version": row.version,
        }, is_sensitive=False,
    ))
    await db.commit()
    return {"id": str(row.id), "name": row.name, "description": row.description, "owner_member_id": str(row.owner_member_id) if row.owner_member_id else None, "status": row.status, "version": row.version}


@router.delete("/teams/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_organiser_team(
    team_id: uuid.UUID,
    expected_version: int = Header(alias="If-Match", ge=1),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    row = await db.scalar(select(OrganizationTeam).where(
        OrganizationTeam.id == team_id,
        OrganizationTeam.organization_id == org.id,
        OrganizationTeam.deleted_at.is_(None),
    ))
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "ORGANIZATION_TEAM_NOT_FOUND"})
    if row.version != expected_version:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "STALE_VERSION", "current_version": row.version})
    row.deleted_at = datetime.now(timezone.utc)
    row.status = "ARCHIVED"
    row.version += 1
    db.add(AuditLog(
        organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role,
        resource_type="organization_team", resource_id=row.id, action_type="ORGANIZATION_TEAM_DELETED",
        old_state={"name": row.name, "version": expected_version}, new_state={"deleted_at": row.deleted_at.isoformat(), "version": row.version}, is_sensitive=False,
    ))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/teams/{team_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def assign_organiser_team_member(
    team_id: uuid.UUID,
    member_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    team = await db.scalar(select(OrganizationTeam).where(OrganizationTeam.id == team_id, OrganizationTeam.organization_id == org.id, OrganizationTeam.deleted_at.is_(None)))
    member = await db.scalar(select(OrganizationMember).where(OrganizationMember.id == member_id, OrganizationMember.organization_id == org.id, OrganizationMember.is_active.is_(True)))
    if not team or not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "TEAM_OR_MEMBER_NOT_FOUND"})
    exists = await db.scalar(select(OrganizationTeamMember.id).where(OrganizationTeamMember.team_id == team_id, OrganizationTeamMember.organization_member_id == member_id))
    if not exists:
        db.add(OrganizationTeamMember(organization_id=org.id, team_id=team_id, organization_member_id=member_id, created_by=current_user.id))
        db.add(AuditLog(organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="organization_team_member", resource_id=team_id, action_type="ORGANIZATION_TEAM_MEMBER_ASSIGNED", new_state={"member_id": str(member_id)}, is_sensitive=False))
        await db.commit()


@router.delete("/teams/{team_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_organiser_team_member(
    team_id: uuid.UUID,
    member_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    team = await db.scalar(select(OrganizationTeam).where(
        OrganizationTeam.id == team_id, OrganizationTeam.organization_id == org.id, OrganizationTeam.deleted_at.is_(None)
    ))
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "ORGANIZATION_TEAM_NOT_FOUND"})
    if team.owner_member_id == member_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "TEAM_OWNER_REASSIGNMENT_REQUIRED"})
    result = await db.execute(delete(OrganizationTeamMember).where(
        OrganizationTeamMember.organization_id == org.id,
        OrganizationTeamMember.team_id == team_id,
        OrganizationTeamMember.organization_member_id == member_id,
    ))
    if not result.rowcount:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "ORGANIZATION_TEAM_MEMBER_NOT_FOUND"})
    db.add(AuditLog(organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="organization_team_member", resource_id=team_id, action_type="ORGANIZATION_TEAM_MEMBER_REMOVED", old_state={"member_id": str(member_id)}, is_sensitive=False))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/teams/{team_id}/members/{member_id}/access-loss-preview")
async def preview_team_member_access_loss(team_id: uuid.UUID, member_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    team = await db.scalar(select(OrganizationTeam).where(OrganizationTeam.id == team_id, OrganizationTeam.organization_id == org.id, OrganizationTeam.deleted_at.is_(None)))
    member = await db.scalar(select(OrganizationMember).where(OrganizationMember.id == member_id, OrganizationMember.organization_id == org.id))
    membership = await db.scalar(select(OrganizationTeamMember.id).where(OrganizationTeamMember.organization_id == org.id, OrganizationTeamMember.team_id == team_id, OrganizationTeamMember.organization_member_id == member_id))
    if not team or not member or not membership: raise HTTPException(status_code=404, detail={"code": "TEAM_MEMBERSHIP_NOT_FOUND"})
    other_team_ids = (await db.scalars(select(OrganizationTeamMember.team_id).where(OrganizationTeamMember.organization_id == org.id, OrganizationTeamMember.organization_member_id == member_id, OrganizationTeamMember.team_id != team_id))).all()
    assignments = (await db.execute(select(OrganizationTeamEvent, Event.name).join(Event, Event.id == OrganizationTeamEvent.event_id).where(OrganizationTeamEvent.organization_id == org.id, OrganizationTeamEvent.team_id == team_id))).all()
    impacts = []
    for assignment, event_name in assignments:
        retained: set[str] = set()
        if other_team_ids:
            other_permissions = (await db.scalars(select(OrganizationTeamEvent.permissions).where(OrganizationTeamEvent.organization_id == org.id, OrganizationTeamEvent.event_id == assignment.event_id, OrganizationTeamEvent.team_id.in_(other_team_ids)))).all()
            retained = {key for permissions in other_permissions for key, enabled in (permissions or {}).items() if enabled}
        granted = {key for key, enabled in (assignment.permissions or {}).items() if enabled}
        lost = sorted(granted - retained)
        if lost: impacts.append({"event_id": str(assignment.event_id), "event_name": event_name, "lost_capabilities": lost})
    return {"team_id": str(team.id), "member_id": str(member.id), "requires_owner_reassignment": team.owner_member_id == member.id, "impacted_events": impacts, "source": "organizer_access.team_effective_access", "freshness_at": datetime.now(timezone.utc).isoformat()}


@router.put("/teams/{team_id}/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def assign_organiser_team_event(
    team_id: uuid.UUID,
    event_id: uuid.UUID,
    payload: TeamAssignmentWrite,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    team = await db.scalar(select(OrganizationTeam).where(OrganizationTeam.id == team_id, OrganizationTeam.organization_id == org.id, OrganizationTeam.deleted_at.is_(None)))
    event = await db.scalar(select(Event).where(Event.id == event_id, Event.organization_id == org.id, Event.deleted_at.is_(None)))
    if not team or not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "TEAM_OR_EVENT_NOT_FOUND"})
    row = await db.scalar(select(OrganizationTeamEvent).where(OrganizationTeamEvent.team_id == team_id, OrganizationTeamEvent.event_id == event_id))
    if row:
        row.permissions = payload.permissions
    else:
        db.add(OrganizationTeamEvent(organization_id=org.id, team_id=team_id, event_id=event_id, permissions=payload.permissions, created_by=current_user.id))
    db.add(AuditLog(organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="organization_team_event", resource_id=team_id, action_type="ORGANIZATION_TEAM_EVENT_ASSIGNED", new_state={"event_id": str(event_id), "permissions": payload.permissions}, is_sensitive=False))
    await db.commit()


@router.delete("/teams/{team_id}/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_organiser_team_event(
    team_id: uuid.UUID,
    event_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    team = await db.scalar(select(OrganizationTeam.id).where(
        OrganizationTeam.id == team_id, OrganizationTeam.organization_id == org.id, OrganizationTeam.deleted_at.is_(None)
    ))
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "ORGANIZATION_TEAM_NOT_FOUND"})
    result = await db.execute(delete(OrganizationTeamEvent).where(
        OrganizationTeamEvent.organization_id == org.id,
        OrganizationTeamEvent.team_id == team_id,
        OrganizationTeamEvent.event_id == event_id,
    ))
    if not result.rowcount:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "ORGANIZATION_TEAM_EVENT_NOT_FOUND"})
    db.add(AuditLog(organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="organization_team_event", resource_id=team_id, action_type="ORGANIZATION_TEAM_EVENT_REMOVED", old_state={"event_id": str(event_id)}, is_sensitive=False))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/teams/{team_id}/events/{event_id}/access-loss-preview")
async def preview_team_event_access_loss(team_id: uuid.UUID, event_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    assignment = await db.scalar(select(OrganizationTeamEvent).where(OrganizationTeamEvent.organization_id == org.id, OrganizationTeamEvent.team_id == team_id, OrganizationTeamEvent.event_id == event_id))
    event = await db.scalar(select(Event).where(Event.id == event_id, Event.organization_id == org.id))
    if not assignment or not event: raise HTTPException(status_code=404, detail={"code": "TEAM_EVENT_ASSIGNMENT_NOT_FOUND"})
    member_ids = (await db.scalars(select(OrganizationTeamMember.organization_member_id).where(OrganizationTeamMember.organization_id == org.id, OrganizationTeamMember.team_id == team_id))).all()
    granted = {key for key, enabled in (assignment.permissions or {}).items() if enabled}
    impacts = []
    for member_id in member_ids:
        other_team_ids = (await db.scalars(select(OrganizationTeamMember.team_id).where(OrganizationTeamMember.organization_id == org.id, OrganizationTeamMember.organization_member_id == member_id, OrganizationTeamMember.team_id != team_id))).all()
        retained: set[str] = set()
        if other_team_ids:
            other_permissions = (await db.scalars(select(OrganizationTeamEvent.permissions).where(OrganizationTeamEvent.organization_id == org.id, OrganizationTeamEvent.event_id == event_id, OrganizationTeamEvent.team_id.in_(other_team_ids)))).all()
            retained = {key for permissions in other_permissions for key, enabled in (permissions or {}).items() if enabled}
        lost = sorted(granted - retained)
        if lost: impacts.append({"member_id": str(member_id), "lost_capabilities": lost})
    return {"team_id": str(team_id), "event_id": str(event_id), "event_name": event.name, "impacted_members": impacts, "source": "organizer_access.team_effective_access", "freshness_at": datetime.now(timezone.utc).isoformat()}


@router.get("/locations")
async def organiser_locations(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    rows = (await db.scalars(select(OrganizationLocation).where(OrganizationLocation.organization_id == org.id).order_by(OrganizationLocation.name))).all()
    return {
        "items": [{
            "id": str(row.id), "name": row.name, "location_type": row.location_type,
            "address": row.address, "timezone": row.timezone, "contact": row.contact,
            "status": row.status, "version": row.version,
        } for row in rows],
        "total": len(rows), "page": 1, "page_size": len(rows) or 10,
        "freshness_at": datetime.now(timezone.utc).isoformat(), "source": "platform.organization_locations",
    }


@router.post("/locations", status_code=status.HTTP_201_CREATED)
async def create_organiser_location(
    payload: LocationWrite,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    duplicate = await db.scalar(select(OrganizationLocation.id).where(OrganizationLocation.organization_id == org.id, func.lower(OrganizationLocation.name) == payload.name.strip().lower()))
    if duplicate:
        raise HTTPException(status_code=409, detail={"code": "LOCATION_NAME_EXISTS"})
    if payload.manager_user_id and not await db.scalar(select(OrganizationMember.id).where(OrganizationMember.organization_id == org.id, OrganizationMember.user_id == payload.manager_user_id, OrganizationMember.is_active.is_(True))):
        raise HTTPException(status_code=422, detail={"code": "BRANCH_OWNER_NOT_ACTIVE_MEMBER"})
    if payload.team_id and not await db.scalar(select(OrganizationTeam.id).where(OrganizationTeam.organization_id == org.id, OrganizationTeam.id == payload.team_id, OrganizationTeam.deleted_at.is_(None), OrganizationTeam.status == "ACTIVE")):
        raise HTTPException(status_code=422, detail={"code": "BRANCH_TEAM_NOT_ACTIVE"})
    values = payload.model_dump()
    values["name"] = payload.name.strip()
    row = OrganizationLocation(organization_id=org.id, version=1, **values)
    db.add(row)
    await db.flush()
    db.add(AuditLog(organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="organization_location", resource_id=row.id, action_type="ORGANIZATION_LOCATION_CREATED", new_state={"name": row.name, "location_type": row.location_type, "manager_user_id": str(row.manager_user_id) if row.manager_user_id else None, "team_id": str(row.team_id) if row.team_id else None, "status": row.status}, is_sensitive=False))
    await db.commit()
    return {"id": str(row.id), "name": row.name, "location_type": row.location_type, "address": row.address, "timezone": row.timezone, "contact": row.contact, "manager_user_id": str(row.manager_user_id) if row.manager_user_id else None, "team_id": str(row.team_id) if row.team_id else None, "status": row.status, "version": row.version}


@router.put("/locations/{location_id}")
async def update_organiser_location(
    location_id: uuid.UUID,
    payload: LocationWrite,
    if_match: int = Header(..., alias="If-Match", ge=1),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    row = await db.scalar(select(OrganizationLocation).where(OrganizationLocation.id == location_id, OrganizationLocation.organization_id == org.id).with_for_update())
    if not row:
        raise HTTPException(status_code=404, detail="Location not found")
    if row.version != if_match:
        raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "current_version": row.version})
    duplicate = await db.scalar(select(OrganizationLocation.id).where(OrganizationLocation.organization_id == org.id, OrganizationLocation.id != row.id, func.lower(OrganizationLocation.name) == payload.name.strip().lower()))
    if duplicate:
        raise HTTPException(status_code=409, detail={"code": "LOCATION_NAME_EXISTS"})
    if payload.manager_user_id and not await db.scalar(select(OrganizationMember.id).where(OrganizationMember.organization_id == org.id, OrganizationMember.user_id == payload.manager_user_id, OrganizationMember.is_active.is_(True))):
        raise HTTPException(status_code=422, detail={"code": "BRANCH_OWNER_NOT_ACTIVE_MEMBER"})
    if payload.team_id and not await db.scalar(select(OrganizationTeam.id).where(OrganizationTeam.organization_id == org.id, OrganizationTeam.id == payload.team_id, OrganizationTeam.deleted_at.is_(None), OrganizationTeam.status == "ACTIVE")):
        raise HTTPException(status_code=422, detail={"code": "BRANCH_TEAM_NOT_ACTIVE"})
    old = {"name": row.name, "location_type": row.location_type, "manager_user_id": str(row.manager_user_id) if row.manager_user_id else None, "team_id": str(row.team_id) if row.team_id else None, "status": row.status, "version": row.version}
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    row.name = payload.name.strip()
    row.version += 1
    db.add(AuditLog(organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="organization_location", resource_id=row.id, action_type="ORGANIZATION_LOCATION_UPDATED", old_state=old, new_state={"name": row.name, "location_type": row.location_type, "manager_user_id": str(row.manager_user_id) if row.manager_user_id else None, "team_id": str(row.team_id) if row.team_id else None, "status": row.status, "version": row.version}, is_sensitive=False))
    await db.commit()
    return {"id": str(row.id), "name": row.name, "location_type": row.location_type, "address": row.address, "timezone": row.timezone, "contact": row.contact, "manager_user_id": str(row.manager_user_id) if row.manager_user_id else None, "team_id": str(row.team_id) if row.team_id else None, "status": row.status, "version": row.version}


@router.get("/events")
async def organiser_events(
    status_filter: str | None = Query(default=None, alias="status", pattern=r"^(live|upcoming|completed|draft|archived)$"),
    search: str | None = Query(default=None, max_length=120),
    year: int | None = Query(default=None, ge=2000, le=2200),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    today = date.today()
    conditions = [Event.organization_id == org.id]
    if status_filter == "archived":
        conditions.append(or_(Event.status == "archived", Event.deleted_at.is_not(None)))
    else:
        conditions.append(Event.deleted_at.is_(None))
    if search:
        conditions.append(Event.name.ilike(f"%{search.strip()}%"))
    if year:
        conditions.append(func.extract("year", Event.start_date) == year)
    if status_filter == "live":
        conditions.extend([Event.status == "active", Event.start_date <= today, Event.end_date >= today])
    elif status_filter == "upcoming":
        conditions.extend([Event.start_date > today, Event.status != "archived"])
    elif status_filter == "completed":
        conditions.append((Event.status == "completed") | (Event.end_date < today))
    elif status_filter == "draft":
        conditions.append(Event.status == "draft")
    total = await db.scalar(select(func.count(Event.id)).where(*conditions)) or 0
    rows = (await db.scalars(
        select(Event).where(*conditions).order_by(Event.start_date.desc(), Event.name).offset((page - 1) * page_size).limit(page_size)
    )).all()
    items: list[dict[str, Any]] = []
    for event in rows:
        registrations = await db.scalar(select(func.count(Participant.id)).where(Participant.event_id == event.id, Participant.deleted_at.is_(None))) or 0
        display_status = "live" if event.status == "active" and event.start_date <= today <= event.end_date else "upcoming" if event.start_date > today and event.status != "draft" else event.status
        items.append({
            "id": str(event.id), "name": event.name, "short_code": event.short_code,
            "start_date": event.start_date.isoformat(), "end_date": event.end_date.isoformat(),
            "venue": event.venue_name or event.location, "country": event.country,
            "timezone": event.timezone, "owner": event.organizer_name,
            "status": display_status, "source_status": event.status,
            "registrations": registrations, "readiness_pct": await _event_readiness(db, event.id),
            "created_at": event.created_at.isoformat(), "updated_at": event.updated_at.isoformat(),
        })
    base = [Event.organization_id == org.id, Event.deleted_at.is_(None)]
    summary = {
        "total": await db.scalar(select(func.count(Event.id)).where(*base)) or 0,
        "live": await db.scalar(select(func.count(Event.id)).where(*base, Event.status == "active", Event.start_date <= today, Event.end_date >= today)) or 0,
        "upcoming": await db.scalar(select(func.count(Event.id)).where(*base, Event.start_date > today, Event.status != "archived")) or 0,
        "completed": await db.scalar(select(func.count(Event.id)).where(*base, (Event.status == "completed") | (Event.end_date < today))) or 0,
        "draft": await db.scalar(select(func.count(Event.id)).where(*base, Event.status == "draft")) or 0,
        "archived": await db.scalar(select(func.count(Event.id)).where(
            Event.organization_id == org.id,
            or_(Event.status == "archived", Event.deleted_at.is_not(None)),
        )) or 0,
    }
    response = _page(items, total, page, page_size, "events.events+registration.participants")
    response["summary"] = summary
    return response


@router.post("/events/import", status_code=status.HTTP_201_CREATED)
async def import_organiser_events(
    file: UploadFile = File(...),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=16, max_length=160),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=422, detail={"code": "EVENT_IMPORT_CSV_REQUIRED", "message": "Upload a CSV file."})
    raw = await file.read(1_048_577)
    if len(raw) > 1_048_576:
        raise HTTPException(status_code=413, detail={"code": "EVENT_IMPORT_TOO_LARGE", "message": "CSV files are limited to 1 MB."})
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=422, detail={"code": "EVENT_IMPORT_ENCODING", "message": "CSV must use UTF-8 encoding."}) from exc
    reader = csv.DictReader(io.StringIO(text))
    required = {"name", "short_code", "start_date", "end_date"}
    headers = {str(value).strip().lower() for value in (reader.fieldnames or [])}
    missing = sorted(required - headers)
    if missing:
        raise HTTPException(status_code=422, detail={"code": "EVENT_IMPORT_COLUMNS", "message": f"Missing required columns: {', '.join(missing)}"})
    rows = list(reader)
    if not rows:
        raise HTTPException(status_code=422, detail={"code": "EVENT_IMPORT_EMPTY", "message": "CSV contains no event rows."})
    if len(rows) > 100:
        raise HTTPException(status_code=422, detail={"code": "EVENT_IMPORT_ROW_LIMIT", "message": "Import at most 100 events at a time."})

    payloads: list[EventCreate] = []
    seen_codes: set[str] = set()
    errors: list[dict[str, Any]] = []
    for index, source_row in enumerate(rows, start=2):
        row = {str(key).strip().lower(): (value or "").strip() for key, value in source_row.items() if key is not None}
        try:
            code = row["short_code"].upper()
            if code in seen_codes:
                raise ValueError(f"Duplicate short_code '{code}' in CSV")
            seen_codes.add(code)
            payloads.append(EventCreate(
                name=row["name"], short_code=code, status="draft",
                start_date=date.fromisoformat(row["start_date"]), end_date=date.fromisoformat(row["end_date"]),
                venue_name=row.get("venue_name") or None, location=row.get("location") or None,
                country=row.get("country") or None, timezone=row.get("timezone") or org.timezone or "Asia/Kolkata",
                currency=(row.get("currency") or (org.currency or "INR").split()[0]).upper(),
                tagline=row.get("tagline") or None, description=row.get("description") or None,
            ))
        except Exception as exc:
            errors.append({"row": index, "message": str(exc)})
    if errors:
        raise HTTPException(status_code=422, detail={"code": "EVENT_IMPORT_INVALID_ROWS", "errors": errors})

    created: list[dict[str, str]] = []
    for index, payload in enumerate(payloads):
        event = await EventMutationService.create(
            db, organization_id=org.id, actor_user_id=current_user.id, payload=payload,
            idempotency_key=f"{idempotency_key}:{index}", source="organizer_portal_csv_import",
        )
        created.append({"id": str(event.id), "name": event.name, "short_code": event.short_code, "status": event.status})
    db.add(AuditLog(
        organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role,
        resource_type="event_import", resource_id=uuid.UUID(created[0]["id"]), action_type="EVENTS_IMPORTED",
        new_state={"filename": file.filename, "count": len(created), "event_ids": [item["id"] for item in created]},
        is_sensitive=False,
    ))
    await db.commit()
    return {"items": created, "created": len(created), "source": "organizer_portal_csv_import", "freshness_at": datetime.now(timezone.utc).isoformat()}


@router.post("/events/{event_id}/duplicate", status_code=status.HTTP_201_CREATED)
async def duplicate_organiser_event(
    event_id: uuid.UUID,
    payload: EventDuplicateWrite,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=16, max_length=160),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    source = await db.scalar(select(Event).where(Event.id == event_id, Event.organization_id == org.id, Event.deleted_at.is_(None)))
    if not source:
        raise HTTPException(status_code=404, detail="Event not found")
    short_code = payload.short_code or f"{source.short_code[:13]}-{uuid.uuid4().hex[:6].upper()}"
    create_payload = EventCreate(
        name=payload.name or f"{source.name} Copy", short_code=short_code, status="draft",
        location=source.location, venue_name=source.venue_name, country=source.country, state=source.state,
        organizer_name=source.organizer_name, organizer_details=source.organizer_details,
        start_date=source.start_date, end_date=source.end_date, timezone=source.timezone,
        upload_deadline=source.upload_deadline, max_file_size_mb=source.max_file_size_mb,
        allowed_formats=source.allowed_formats, currency=source.currency, tagline=source.tagline,
        description=source.description, map_link=source.map_link, venue_images=source.venue_images,
        venue_details=source.venue_details, speaker_settings=source.speaker_settings,
        registration_settings=source.registration_settings, branding_settings=source.branding_settings,
    )
    duplicate = await EventMutationService.create(
        db, organization_id=org.id, actor_user_id=current_user.id, payload=create_payload,
        idempotency_key=idempotency_key, source="organizer_portal_duplicate",
    )
    db.add(AuditLog(organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="event", resource_id=duplicate.id, action_type="EVENT_DUPLICATED", old_state={"source_event_id": str(source.id)}, new_state={"name": duplicate.name, "short_code": duplicate.short_code}, is_sensitive=False))
    await db.commit()
    return {"id": str(duplicate.id), "name": duplicate.name, "short_code": duplicate.short_code, "status": duplicate.status}


@router.post("/events/{event_id}/restore")
async def restore_organiser_event(
    event_id: uuid.UUID,
    reason: str = Header(..., alias="X-Change-Reason", min_length=12, max_length=1000),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=16, max_length=160),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    event = await db.scalar(select(Event).where(
        Event.id == event_id,
        Event.organization_id == org.id,
    ).execution_options(include_deleted=True).with_for_update(of=Event))
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    replay = await db.scalar(select(AuditLog).where(
        AuditLog.organization_id == org.id,
        AuditLog.resource_type == "event",
        AuditLog.resource_id == event.id,
        AuditLog.action_type == "EVENT_RESTORED",
        AuditLog.new_state["idempotency_key"].astext == idempotency_key,
    ))
    if replay:
        return {"id": str(event.id), "status": event.status, "restored": event.deleted_at is None}
    if event.deleted_at is None and event.status != "archived":
        raise HTTPException(status_code=409, detail={"code": "EVENT_NOT_ARCHIVED", "message": "Only archived events can be restored."})
    previous = {"status": event.status, "deleted_at": event.deleted_at.isoformat() if event.deleted_at else None}
    event.deleted_at = None
    event.deleted_by = None
    event.status = "draft"
    db.add(AuditLog(
        organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role,
        resource_type="event", resource_id=event.id, action_type="EVENT_RESTORED",
        old_state=previous,
        new_state={"status": "draft", "deleted_at": None, "reason": reason, "idempotency_key": idempotency_key},
        is_sensitive=True,
    ))
    await db.commit()
    return {"id": str(event.id), "status": event.status, "restored": True}


@router.get("/billing/{section}")
async def organiser_billing(
    section: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    offset = (page - 1) * page_size

    if section in {"overview", "invoices", "receipts"}:
        invoice_filters = [Invoice.organization_id == org.id]
        if section == "receipts":
            invoice_filters.append(Invoice.paid_at.is_not(None))
        total = await db.scalar(select(func.count(Invoice.id)).where(*invoice_filters)) or 0
        rows = (await db.scalars(
            select(Invoice).where(*invoice_filters)
            .order_by(Invoice.issued_at.desc()).offset(offset).limit(page_size)
        )).all()
        items = [{
            "id": str(row.id), "reference": row.invoice_number or row.stripe_invoice_id,
            "receipt_number": row.invoice_number if section == "receipts" and row.paid_at else None,
            "invoice_number": row.invoice_number or row.stripe_invoice_id,
            "payment_reference": row.stripe_invoice_id,
            "issued_at": row.issued_at.isoformat(), "due_date": row.due_date.isoformat() if row.due_date else None,
            "paid_at": row.paid_at.isoformat() if row.paid_at else None, "status": row.status,
            "amount": float(row.total_amount_inr or row.amount), "gst_amount": float(row.gst_amount or 0),
            "currency": row.currency, "version": row.version,
        } for row in rows]
        return _page(items, total, page, page_size, "commerce.invoices")

    if section in {"transactions", "payments"}:
        total = await db.scalar(select(func.count(SubscriptionTransaction.id)).where(SubscriptionTransaction.organization_id == org.id)) or 0
        rows = (await db.scalars(
            select(SubscriptionTransaction).where(SubscriptionTransaction.organization_id == org.id)
            .order_by(SubscriptionTransaction.created_at.desc()).offset(offset).limit(page_size)
        )).all()
        items = [{
            "id": str(row.id), "reference": row.provider_transaction_id or str(row.id),
            "created_at": row.created_at.isoformat(), "provider": row.provider, "status": row.status,
            "amount": float(row.amount), "refunded_amount": float(row.refunded_amount or 0),
            "currency": row.currency, "reconciliation_status": row.reconciliation_status,
        } for row in rows]
        return _page(items, total, page, page_size, "commerce.subscription_transactions")

    if section == "payment-methods":
        total = await db.scalar(select(func.count(PaymentMethod.id)).where(PaymentMethod.organization_id == org.id)) or 0
        rows = (await db.scalars(
            select(PaymentMethod).where(PaymentMethod.organization_id == org.id)
            .order_by(PaymentMethod.is_default.desc(), PaymentMethod.created_at.desc()).offset(offset).limit(page_size)
        )).all()
        items = [{
            "id": str(row.id), "provider": row.provider, "card_brand": row.card_brand,
            "card_last4": row.card_last4, "is_default": row.is_default,
            "created_at": row.created_at.isoformat(),
        } for row in rows]
        return _page(items, total, page, page_size, "commerce.payment_methods")

    if section == "credits":
        total = await db.scalar(select(func.count(OrgCredit.id)).where(OrgCredit.organization_id == org.id)) or 0
        rows = (await db.scalars(
            select(OrgCredit).where(OrgCredit.organization_id == org.id)
            .order_by(OrgCredit.applied_at.desc()).offset(offset).limit(page_size)
        )).all()
        items = [{
            "id": str(row.id), "amount": float(row.amount_inr), "currency": "INR",
            "credit_type": row.credit_type, "reason": row.reason, "is_used": row.is_used,
            "applied_at": row.applied_at.isoformat(), "expires_at": row.expires_at.isoformat() if row.expires_at else None,
        } for row in rows]
        return _page(items, total, page, page_size, "commerce.org_credits")

    if section == "tax":
        profile = await db.scalar(select(OrganizationBillingProfile).where(OrganizationBillingProfile.organization_id == org.id))
        latest = None if profile else await db.scalar(select(SubscriptionTransaction).where(
            SubscriptionTransaction.organization_id == org.id
        ).order_by(SubscriptionTransaction.created_at.desc()).limit(1))
        return {
            "billing_name": profile.billing_name if profile else latest.billing_name if latest else org.name,
            "billing_email": profile.billing_email if profile else latest.billing_email if latest else org.billing_email,
            "billing_phone": profile.billing_phone if profile else latest.billing_phone if latest else None,
            "gst_number": profile.gst_number if profile else latest.gst_number if latest else None,
            "country": profile.country if profile else org.country,
            "currency": profile.currency if profile else latest.currency if latest else org.currency,
            "version": profile.version if profile else 0,
            "freshness_at": (profile.updated_at if profile else latest.updated_at if latest else org.updated_at).isoformat(),
            "source": "commerce.organization_billing_profiles" if profile else "commerce.subscription_transactions" if latest else "platform.organizations",
        }

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "BILLING_SECTION_NOT_FOUND"})


@router.get("/documents")
async def organiser_documents(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    filters = [OrganizationDocument.organization_id == org.id, OrganizationDocument.archived_at.is_(None), OrganizationDocument.is_current.is_(True)]
    total = int(await db.scalar(select(func.count(OrganizationDocument.id)).where(*filters)) or 0)
    rows = (await db.execute(select(OrganizationDocument, Asset, User).join(Asset, Asset.id == OrganizationDocument.asset_id).join(User, User.id == OrganizationDocument.created_by).where(*filters).order_by(OrganizationDocument.updated_at.desc()).offset((page - 1) * page_size).limit(page_size))).all()
    items = [{"id": str(row.id), "document_group_id": str(row.document_group_id), "revision": row.revision, "name": row.name, "document_type": row.document_type, "owner_name": f"{owner.first_name} {owner.last_name}".strip() or owner.email, "expires_at": row.expires_at.isoformat() if row.expires_at else None, "verification_status": row.verification_status, "processing_status": asset.processing_status, "version": row.version, "download_url": f"/api/v1/files/{asset.id}/download" if asset.processing_status == "READY" else None, "updated_at": row.updated_at.isoformat()} for row, asset, owner in rows]
    return _page(items, total, page, page_size, "platform.organization_documents+content.assets")


@router.post("/documents", status_code=status.HTTP_201_CREATED)
async def upload_organiser_document(document_type: str = Query(..., min_length=2, max_length=60), expires_at: datetime | None = Query(default=None), file: UploadFile = File(...), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    data = await file.read(25 * 1024 * 1024 + 1)
    if len(data) > 25 * 1024 * 1024: raise HTTPException(status_code=413, detail={"code": "DOCUMENT_TOO_LARGE"})
    asset = await FileService.upload_asset(db, org.id, current_user.id, file.filename or "document", file.content_type or "application/octet-stream", data, ["organization-document", document_type])
    row = OrganizationDocument(organization_id=org.id, asset_id=asset.id, name=file.filename or "document", document_type=document_type, expires_at=expires_at, created_by=current_user.id); db.add(row); await db.flush()
    db.add(AuditLog(organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="organization_document", resource_id=row.id, action_type="ORGANIZATION_DOCUMENT_UPLOADED", new_state={"name": row.name, "document_type": document_type, "asset_id": str(asset.id)}, is_sensitive=True))
    await db.commit(); return {"id": str(row.id), "document_group_id": str(row.document_group_id), "revision": row.revision, "asset_id": str(asset.id), "name": row.name, "processing_status": asset.processing_status, "version": row.version}


@router.get("/documents/{document_id}/history")
async def organiser_document_history(document_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    document = await db.scalar(select(OrganizationDocument).where(OrganizationDocument.id == document_id, OrganizationDocument.organization_id == org.id))
    if not document: raise HTTPException(status_code=404, detail={"code": "DOCUMENT_NOT_FOUND"})
    rows = (await db.execute(select(OrganizationDocument, Asset, User).join(Asset, Asset.id == OrganizationDocument.asset_id).join(User, User.id == OrganizationDocument.created_by).where(OrganizationDocument.organization_id == org.id, OrganizationDocument.document_group_id == document.document_group_id).order_by(OrganizationDocument.revision.desc()))).all()
    return {"items": [{"id": str(row.id), "revision": row.revision, "name": row.name, "owner_name": f"{owner.first_name} {owner.last_name}".strip() or owner.email, "processing_status": asset.processing_status, "is_current": row.is_current, "created_at": row.created_at.isoformat(), "download_url": f"/api/v1/files/{asset.id}/download" if asset.processing_status == "READY" else None} for row, asset, owner in rows], "source": "platform.organization_documents+content.assets", "freshness_at": datetime.now(timezone.utc).isoformat()}


@router.post("/documents/{document_id}/replace", status_code=status.HTTP_201_CREATED)
async def replace_organiser_document(document_id: uuid.UUID, file: UploadFile = File(...), expires_at: datetime | None = Query(default=None), if_match: int = Header(..., alias="If-Match", ge=1), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    current = await db.scalar(select(OrganizationDocument).where(OrganizationDocument.id == document_id, OrganizationDocument.organization_id == org.id, OrganizationDocument.archived_at.is_(None), OrganizationDocument.is_current.is_(True)).with_for_update())
    if not current: raise HTTPException(status_code=404, detail={"code": "DOCUMENT_NOT_FOUND"})
    if current.version != if_match: raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "current_version": current.version})
    data = await file.read(25 * 1024 * 1024 + 1)
    if len(data) > 25 * 1024 * 1024: raise HTTPException(status_code=413, detail={"code": "DOCUMENT_TOO_LARGE"})
    asset = await FileService.upload_asset(db, org.id, current_user.id, file.filename or current.name, file.content_type or "application/octet-stream", data, ["organization-document", current.document_type, "replacement"])
    current.is_current = False; current.version += 1
    replacement = OrganizationDocument(organization_id=org.id, document_group_id=current.document_group_id, revision=current.revision + 1, asset_id=asset.id, name=file.filename or current.name, document_type=current.document_type, expires_at=expires_at if expires_at is not None else current.expires_at, created_by=current_user.id)
    db.add(replacement); await db.flush()
    db.add(AuditLog(organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="organization_document", resource_id=replacement.id, action_type="ORGANIZATION_DOCUMENT_REPLACED", old_state={"document_id": str(current.id), "revision": current.revision}, new_state={"document_id": str(replacement.id), "revision": replacement.revision, "asset_id": str(asset.id)}, is_sensitive=True))
    await db.commit(); return {"id": str(replacement.id), "document_group_id": str(replacement.document_group_id), "revision": replacement.revision, "asset_id": str(asset.id), "name": replacement.name, "processing_status": asset.processing_status, "version": replacement.version}


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_organiser_document(document_id: uuid.UUID, if_match: int = Header(..., alias="If-Match", ge=1), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> Response:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    row = await db.scalar(select(OrganizationDocument).where(OrganizationDocument.id == document_id, OrganizationDocument.organization_id == org.id, OrganizationDocument.archived_at.is_(None)))
    if not row: raise HTTPException(status_code=404, detail={"code": "DOCUMENT_NOT_FOUND"})
    if row.version != if_match: raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "current_version": row.version})
    row.archived_at = datetime.now(timezone.utc); row.version += 1
    db.add(AuditLog(organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="organization_document", resource_id=row.id, action_type="ORGANIZATION_DOCUMENT_ARCHIVED", old_state={"version": if_match}, new_state={"version": row.version}, is_sensitive=True))
    await db.commit(); return Response(status_code=204)


@router.get("/access/approval-rules")
async def organiser_approval_rules(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    filters = [OrganizationApprovalRule.organization_id == org.id, OrganizationApprovalRule.archived_at.is_(None)]
    total = int(await db.scalar(select(func.count(OrganizationApprovalRule.id)).where(*filters)) or 0)
    rows = (await db.scalars(select(OrganizationApprovalRule).where(*filters).order_by(OrganizationApprovalRule.name).offset((page - 1) * page_size).limit(page_size))).all()
    return _page([{"id": str(row.id), "name": row.name, "domain": row.domain, "scope": "event" if row.event_id else "workspace", "event_id": str(row.event_id) if row.event_id else None, "approver_count": len(row.approver_chain), "approver_chain": row.approver_chain, "conditions": row.conditions, "status": row.status, "version": row.version} for row in rows], total, page, page_size, "organizer_access.organization_approval_rules")


@router.post("/access/approval-rules", status_code=status.HTTP_201_CREATED)
async def create_organiser_approval_rule(payload: ApprovalRuleWrite, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    if payload.event_id and not await db.scalar(select(Event.id).where(Event.id == payload.event_id, Event.organization_id == org.id)): raise HTTPException(status_code=404, detail={"code": "EVENT_NOT_FOUND"})
    row = OrganizationApprovalRule(organization_id=org.id, created_by=current_user.id, **payload.model_dump()); db.add(row); await db.flush()
    db.add(AuditLog(organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="organization_approval_rule", resource_id=row.id, action_type="ORGANIZATION_APPROVAL_RULE_CREATED", new_state={"name": row.name, "domain": row.domain, "version": row.version}, is_sensitive=True))
    await db.commit(); return {"id": str(row.id), "name": row.name, "domain": row.domain, "version": row.version}


@router.put("/access/approval-rules/{rule_id}")
async def update_organiser_approval_rule(rule_id: uuid.UUID, payload: ApprovalRuleWrite, if_match: int = Header(..., alias="If-Match", ge=1), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    row = await db.scalar(select(OrganizationApprovalRule).where(OrganizationApprovalRule.id == rule_id, OrganizationApprovalRule.organization_id == org.id, OrganizationApprovalRule.archived_at.is_(None)))
    if not row: raise HTTPException(status_code=404, detail={"code": "APPROVAL_RULE_NOT_FOUND"})
    if row.version != if_match: raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "current_version": row.version})
    for key, value in payload.model_dump().items(): setattr(row, key, value)
    row.version += 1
    db.add(AuditLog(organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="organization_approval_rule", resource_id=row.id, action_type="ORGANIZATION_APPROVAL_RULE_UPDATED", old_state={"version": if_match}, new_state={"version": row.version}, is_sensitive=True))
    await db.commit(); return {"id": str(row.id), "name": row.name, "domain": row.domain, "version": row.version}


@router.put("/billing/tax")
async def update_organiser_billing_profile(
    payload: BillingProfileWrite,
    expected_version: int = Header(..., alias="If-Match", ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    profile = await db.scalar(select(OrganizationBillingProfile).where(OrganizationBillingProfile.organization_id == org.id))
    current_version = profile.version if profile else 0
    if current_version != expected_version:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "VERSION_CONFLICT", "current_version": current_version})
    old_state = None if profile is None else {
        "billing_name": profile.billing_name, "billing_email": profile.billing_email,
        "billing_phone": profile.billing_phone, "gst_number": profile.gst_number,
        "country": profile.country, "currency": profile.currency, "version": profile.version,
    }
    if profile is None:
        profile = OrganizationBillingProfile(organization_id=org.id, updated_by=current_user.id, **payload.model_dump())
        db.add(profile)
    else:
        for key, value in payload.model_dump().items():
            setattr(profile, key, value)
        profile.updated_by = current_user.id
        profile.version += 1
    await db.flush()
    db.add(AuditLog(
        organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role,
        resource_type="organization_billing_profile", resource_id=profile.id,
        action_type="ORGANIZATION_BILLING_PROFILE_UPDATED", old_state=old_state,
        new_state={**payload.model_dump(), "version": profile.version}, is_sensitive=True,
    ))
    await db.commit()
    return {**payload.model_dump(), "id": str(profile.id), "version": profile.version, "source": "commerce.organization_billing_profiles", "freshness_at": profile.updated_at.isoformat()}


@router.get("/billing/invoices/{invoice_id}/download")
async def download_organiser_invoice(
    invoice_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    org = await _current_org(db, current_user)
    invoice = await db.scalar(select(Invoice).where(Invoice.id == invoice_id, Invoice.organization_id == org.id))
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "INVOICE_NOT_FOUND"})
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["invoice_number", "issued_at", "due_date", "status", "subtotal", "gst_amount", "total", "currency"])
    writer.writerow([
        invoice.invoice_number or invoice.stripe_invoice_id or str(invoice.id),
        invoice.issued_at.isoformat(), invoice.due_date.isoformat() if invoice.due_date else "",
        invoice.status, float(invoice.amount), float(invoice.gst_amount or 0),
        float(invoice.total_amount_inr or invoice.amount), invoice.currency,
    ])
    db.add(AuditLog(
        organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role,
        resource_type="invoice", resource_id=invoice.id, action_type="ORGANIZATION_INVOICE_DOWNLOADED",
        new_state={"format": "csv"}, is_sensitive=True,
    ))
    await db.commit()
    filename = f"invoice-{invoice.invoice_number or invoice.id}.csv"
    return Response(content=output.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/integrations")
async def organiser_integrations(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    rows = (await db.execute(
        select(IntegrationConnection, IntegrationProvider.name)
        .join(IntegrationProvider, IntegrationProvider.id == IntegrationConnection.provider_id)
        .where(IntegrationConnection.organization_id == org.id)
        .order_by(IntegrationProvider.name)
    )).all()
    return {
        "items": [{"id": str(row.id), "provider": provider, "is_active": row.is_active, "version": row.version} for row, provider in rows],
        "total": len(rows), "page": 1, "page_size": len(rows) or 10,
        "freshness_at": datetime.now(timezone.utc).isoformat(), "source": "integrations.connections",
    }


@router.get("/audit")
async def organiser_audit(
    resource_type: str | None = None,
    resource: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=250),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    query = select(AuditLog).where(AuditLog.organization_id == org.id)
    count_query = select(func.count(AuditLog.id)).where(AuditLog.organization_id == org.id)
    if resource_type:
        query = query.where(AuditLog.resource_type == resource_type)
        count_query = count_query.where(AuditLog.resource_type == resource_type)
    elif resource:
        resource_types = [value.strip() for value in resource.split(",") if value.strip()]
        if resource_types:
            query = query.where(AuditLog.resource_type.in_(resource_types))
            count_query = count_query.where(AuditLog.resource_type.in_(resource_types))
    total = int(await db.scalar(count_query) or 0)
    rows = (await db.scalars(
        query.order_by(AuditLog.occurred_at.desc()).offset((page - 1) * page_size).limit(page_size)
    )).all()
    items = [{
            "id": str(row.id), "action": row.action_type, "resource_type": row.resource_type,
            "resource_id": str(row.resource_id), "actor_role": row.actor_role,
            "occurred_at": row.occurred_at.isoformat(), "is_sensitive": row.is_sensitive,
        } for row in rows]
    return _page(items, total, page, page_size, "audit.logs")


@router.get("/audit/export")
async def export_organiser_audit(
    resource: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    query = select(AuditLog).where(AuditLog.organization_id == org.id)
    if resource:
        resource_types = [value.strip() for value in resource.split(",") if value.strip()]
        if resource_types:
            query = query.where(AuditLog.resource_type.in_(resource_types))
    rows = (await db.scalars(query.order_by(AuditLog.occurred_at.desc()))).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "occurred_at", "action", "resource_type", "resource_id", "actor_role", "sensitive"])
    for row in rows:
        writer.writerow([row.id, row.occurred_at.isoformat(), row.action_type, row.resource_type, row.resource_id, row.actor_role or "", row.is_sensitive])
    filename = f"organiser-audit-{datetime.now(timezone.utc).date().isoformat()}.csv"
    return Response(content=output.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/access/roles")
async def organiser_user_roles(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    search: str | None = Query(default=None, max_length=160),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    filters = [Role.deleted_at.is_(None), or_(Role.organization_id == org.id, Role.organization_id.is_(None))]
    if search:
        term = f"%{search.strip()}%"
        filters.append(or_(Role.name.ilike(term), Role.description.ilike(term)))
    total = int(await db.scalar(select(func.count(Role.id)).where(*filters)) or 0)
    rows = (await db.execute(
        select(Role, func.count(UserRoleAssignment.id).label("users_count"))
        .outerjoin(
            UserRoleAssignment,
            and_(UserRoleAssignment.role_id == Role.id, UserRoleAssignment.organization_id == org.id),
        )
        .where(*filters)
        .group_by(Role.id)
        .order_by(Role.name.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )).all()
    return _page([{
        "id": str(role.id), "name": role.name, "description": role.description,
        "is_system_role": role.is_system_role, "users_count": users_count,
        "scope": "Global" if role.is_system_role else "Organisation",
        "status": "Active", "version": role.version,
    } for role, users_count in rows], total, page, page_size, "organizer_access.user_roles")


@router.get("/access/assignments")
async def organiser_role_assignments(
    scope: str = Query(pattern=r"^(ORGANIZATION|EVENT)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    search: str | None = Query(default=None, max_length=160),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    filters = [
        UserRoleAssignment.organization_id == org.id,
        Role.deleted_at.is_(None),
        or_(Role.organization_id == org.id, Role.organization_id.is_(None)),
        UserRoleAssignment.event_id.is_not(None) if scope == "EVENT" else UserRoleAssignment.event_id.is_(None),
    ]
    if search:
        term = f"%{search.strip()}%"
        filters.append(or_(User.email.ilike(term), User.first_name.ilike(term), User.last_name.ilike(term), Role.name.ilike(term), Event.name.ilike(term)))
    base = select(UserRoleAssignment.id).join(Role, Role.id == UserRoleAssignment.role_id).join(User, User.id == UserRoleAssignment.user_id).outerjoin(Event, Event.id == UserRoleAssignment.event_id).where(*filters)
    total = int(await db.scalar(select(func.count()).select_from(base.subquery())) or 0)
    rows = (await db.execute(
        select(UserRoleAssignment, Role, User, Event.name)
        .join(Role, Role.id == UserRoleAssignment.role_id)
        .join(User, User.id == UserRoleAssignment.user_id)
        .outerjoin(Event, Event.id == UserRoleAssignment.event_id)
        .where(*filters)
        .order_by(UserRoleAssignment.assigned_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )).all()
    return _page([{
        "id": str(assignment.id), "user_id": str(assignment.user_id),
        "user_name": user.full_name, "user_email": user.email,
        "role_id": str(role.id), "role_name": role.name, "scope": scope,
        "event_id": str(assignment.event_id) if assignment.event_id else None,
        "event_name": event_name, "assigned_at": assignment.assigned_at.isoformat(),
    } for assignment, role, user, event_name in rows], total, page, page_size, "organizer_access.user_role_assignments")


@router.get("/access/effective-preview")
async def organiser_effective_access_preview(
    user_id: uuid.UUID = Query(...), role_id: uuid.UUID = Query(...), event_id: uuid.UUID | None = Query(default=None),
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    member = await db.scalar(select(OrganizationMember).where(OrganizationMember.organization_id == org.id, OrganizationMember.user_id == user_id, OrganizationMember.is_active.is_(True)))
    role = await db.scalar(select(Role).where(Role.id == role_id, Role.deleted_at.is_(None), or_(Role.organization_id == org.id, Role.organization_id.is_(None))))
    if not member or not role: raise HTTPException(status_code=404, detail={"code": "MEMBER_OR_ROLE_NOT_FOUND"})
    if event_id and not await db.scalar(select(Event.id).where(Event.id == event_id, Event.organization_id == org.id, Event.deleted_at.is_(None))): raise HTTPException(status_code=404, detail={"code": "EVENT_NOT_FOUND"})
    proposed = set((await db.scalars(select(Permission.code).join(RolePermission, RolePermission.permission_id == Permission.id).where(RolePermission.role_id == role.id))).all())
    assignment_filters = [UserRoleAssignment.organization_id == org.id, UserRoleAssignment.user_id == user_id]
    assignment_filters.append(or_(UserRoleAssignment.event_id.is_(None), UserRoleAssignment.event_id == event_id) if event_id else UserRoleAssignment.event_id.is_(None))
    existing = set((await db.scalars(select(Permission.code).join(RolePermission, RolePermission.permission_id == Permission.id).join(UserRoleAssignment, UserRoleAssignment.role_id == RolePermission.role_id).where(*assignment_filters))).all())
    duplicate = bool(await db.scalar(select(UserRoleAssignment.id).where(UserRoleAssignment.organization_id == org.id, UserRoleAssignment.user_id == user_id, UserRoleAssignment.role_id == role_id, UserRoleAssignment.event_id == event_id)))
    return {"user_id": str(user_id), "role_id": str(role_id), "role_name": role.name, "scope": "EVENT" if event_id else "ORGANIZATION", "event_id": str(event_id) if event_id else None, "existing_permissions": sorted(existing), "added_permissions": sorted(proposed - existing), "effective_permissions": sorted(existing | proposed), "duplicate_assignment": duplicate, "source": "organizer_access.user_roles+role_permissions+user_role_assignments", "freshness_at": datetime.now(timezone.utc).isoformat()}


@router.get("/settings/custom-fields")
async def list_organiser_custom_fields(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    rows = (await db.scalars(select(OrganizationCustomField).where(OrganizationCustomField.organization_id == org.id).order_by(OrganizationCustomField.label))).all()
    return {"items": [_custom_field_out(row) for row in rows], "total": len(rows), "page": 1, "page_size": len(rows) or 10, "freshness_at": datetime.now(timezone.utc).isoformat(), "source": "organizer_access.organization_custom_fields"}


@router.post("/settings/custom-fields", status_code=status.HTTP_201_CREATED)
async def create_organiser_custom_field(
    payload: CustomFieldWrite,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    request_hash = hashlib.sha256(json.dumps(payload.model_dump(), sort_keys=True).encode()).hexdigest()
    replay = await db.scalar(select(OrganizationCustomField).where(OrganizationCustomField.organization_id == org.id, OrganizationCustomField.idempotency_key == idempotency_key))
    if replay:
        if replay.request_hash != request_hash:
            raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT"})
        return _custom_field_out(replay)
    duplicate = await db.scalar(select(OrganizationCustomField.id).where(OrganizationCustomField.organization_id == org.id, OrganizationCustomField.field_key == payload.field_key))
    if duplicate:
        raise HTTPException(status_code=409, detail="A custom field with this key already exists")
    row = OrganizationCustomField(organization_id=org.id, created_by=current_user.id, idempotency_key=idempotency_key, request_hash=request_hash, **payload.model_dump())
    db.add(row); await db.flush()
    db.add(AuditLog(organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="organization_custom_field", resource_id=row.id, action_type="ORGANIZATION_CUSTOM_FIELD_CREATED", new_state={"field_key": row.field_key, "label": row.label, "field_type": row.field_type}, is_sensitive=False))
    await db.commit(); await db.refresh(row)
    return _custom_field_out(row)


@router.put("/settings/custom-fields/{field_id}")
async def update_organiser_custom_field(
    field_id: uuid.UUID,
    payload: CustomFieldWrite,
    if_match: int = Header(..., alias="If-Match", ge=1),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    row = await db.scalar(select(OrganizationCustomField).where(OrganizationCustomField.id == field_id, OrganizationCustomField.organization_id == org.id).with_for_update())
    if not row:
        raise HTTPException(status_code=404, detail="Custom field not found")
    if row.version != if_match:
        raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "current_version": row.version})
    duplicate = await db.scalar(select(OrganizationCustomField.id).where(OrganizationCustomField.organization_id == org.id, OrganizationCustomField.field_key == payload.field_key, OrganizationCustomField.id != row.id))
    if duplicate:
        raise HTTPException(status_code=409, detail="A custom field with this key already exists")
    old = _custom_field_out(row)
    for key, value in payload.model_dump().items(): setattr(row, key, value)
    row.version += 1
    db.add(AuditLog(organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="organization_custom_field", resource_id=row.id, action_type="ORGANIZATION_CUSTOM_FIELD_UPDATED", old_state=old, new_state=_custom_field_out(row), is_sensitive=False))
    await db.commit(); await db.refresh(row)
    return _custom_field_out(row)


@router.patch("/settings/notification-rules/{rule_id}")
async def toggle_organiser_notification_rule(
    rule_id: uuid.UUID,
    payload: NotificationRuleToggle,
    if_match: int = Header(..., alias="If-Match", ge=1),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    row = await db.scalar(select(OrganizationNotificationRule).where(
        OrganizationNotificationRule.id == rule_id,
        OrganizationNotificationRule.organization_id == org.id,
        OrganizationNotificationRule.deleted_at.is_(None),
    ).with_for_update())
    if not row:
        raise HTTPException(status_code=404, detail="Notification rule not found")
    if row.version != if_match:
        raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "current_version": row.version})
    old_enabled = row.is_enabled
    row.is_enabled = payload.is_enabled
    row.version += 1
    db.add(AuditLog(organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="organization_notification_rule", resource_id=row.id, action_type="ORGANIZATION_NOTIFICATION_RULE_UPDATED", old_state={"is_enabled": old_enabled, "version": if_match}, new_state={"is_enabled": row.is_enabled, "version": row.version}, is_sensitive=False))
    await db.commit()
    return {"id": str(row.id), "is_enabled": row.is_enabled, "version": row.version}


@router.put("/settings/security")
async def update_organiser_security_policy(
    payload: SecurityPolicyWrite,
    if_match: int = Header(default=0, alias="If-Match", ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    allowed = {"PASSWORD", "TOTP", "SSO"}
    methods = list(dict.fromkeys(method.upper() for method in payload.allowed_auth_methods))
    if not set(methods).issubset(allowed):
        raise HTTPException(status_code=422, detail={"code": "INVALID_AUTH_METHOD"})
    password_policy = {
        "minimum_length": max(8, min(128, int(payload.password_policy.get("minimum_length", 12)))),
        "require_uppercase": bool(payload.password_policy.get("require_uppercase", True)),
        "require_lowercase": bool(payload.password_policy.get("require_lowercase", True)),
        "require_number": bool(payload.password_policy.get("require_number", True)),
        "require_symbol": bool(payload.password_policy.get("require_symbol", False)),
    }
    session_policy = {
        "idle_timeout_minutes": max(5, min(1440, int(payload.session_policy.get("idle_timeout_minutes", 60)))),
        "maximum_session_hours": max(1, min(720, int(payload.session_policy.get("maximum_session_hours", 24)))),
        "maximum_active_sessions": max(1, min(50, int(payload.session_policy.get("maximum_active_sessions", 5)))),
    }
    trusted_device_policy = {
        "enabled": bool(payload.trusted_device_policy.get("enabled", True)),
        "lifetime_days": max(1, min(365, int(payload.trusted_device_policy.get("lifetime_days", 30)))),
    }
    allowed_cidrs = list(dict.fromkeys(value.strip() for value in payload.allowed_cidrs if value.strip()))
    row = await db.scalar(select(OrganizationSecurityPolicy).where(OrganizationSecurityPolicy.organization_id == org.id).with_for_update())
    if row and row.version != if_match:
        raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "current_version": row.version})
    old = None if row is None else {"require_mfa": row.require_mfa, "allowed_auth_methods": row.allowed_auth_methods, "password_policy": row.password_policy, "session_policy": row.session_policy, "trusted_device_policy": row.trusted_device_policy, "sso_enforced": row.sso_enforced, "allowed_cidrs": row.allowed_cidrs, "version": row.version}
    if row is None:
        row = OrganizationSecurityPolicy(organization_id=org.id, require_mfa=payload.require_mfa, allowed_auth_methods=methods, password_policy=password_policy, session_policy=session_policy, trusted_device_policy=trusted_device_policy, sso_enforced=payload.sso_enforced, allowed_cidrs=allowed_cidrs, updated_by=current_user.id)
        db.add(row)
        await db.flush()
    else:
        row.require_mfa = payload.require_mfa
        row.allowed_auth_methods = methods
        row.password_policy = password_policy
        row.session_policy = session_policy
        row.trusted_device_policy = trusted_device_policy
        row.sso_enforced = payload.sso_enforced
        row.allowed_cidrs = allowed_cidrs
        row.updated_by = current_user.id
        row.version += 1
    new_state = {"require_mfa": row.require_mfa, "allowed_auth_methods": row.allowed_auth_methods, "password_policy": row.password_policy, "session_policy": row.session_policy, "trusted_device_policy": row.trusted_device_policy, "sso_enforced": row.sso_enforced, "allowed_cidrs": row.allowed_cidrs, "version": row.version}
    db.add(AuditLog(organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="organization_security_policy", resource_id=row.id, action_type="ORGANIZATION_SECURITY_POLICY_UPDATED", old_state=old, new_state=new_state, is_sensitive=True))
    await db.commit()
    return new_state


@router.put("/settings/branding")
async def update_organiser_branding(
    payload: BrandingWrite,
    if_match: int = Header(default=0, alias="If-Match", ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    row = await db.scalar(select(OrganizationBrandProfile).where(OrganizationBrandProfile.organization_id == org.id).with_for_update())
    if row and row.version != if_match:
        raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "current_version": row.version})
    old = {"logo_url": org.logo_url, "primary_color": org.primary_color, "secondary_color": org.secondary_color, "version": row.version if row else 0}
    org.logo_url = payload.logo_url
    org.primary_color = payload.primary_color.lower()
    org.secondary_color = payload.secondary_color.lower()
    if row is None:
        row = OrganizationBrandProfile(organization_id=org.id, status="DRAFT", assets={"logo_url": org.logo_url}, tokens={"primary_color": org.primary_color, "secondary_color": org.secondary_color}, templates={})
        db.add(row)
        await db.flush()
    else:
        row.assets = {**(row.assets or {}), "logo_url": org.logo_url}
        row.tokens = {**(row.tokens or {}), "primary_color": org.primary_color, "secondary_color": org.secondary_color}
        row.status = "DRAFT"
        row.version += 1
    db.add(AuditLog(organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="organization_brand_profile", resource_id=row.id, action_type="ORGANIZATION_BRAND_DRAFT_UPDATED", old_state=old, new_state={"logo_url": org.logo_url, "primary_color": org.primary_color, "secondary_color": org.secondary_color, "version": row.version}, is_sensitive=False))
    await db.commit()
    return {"status": row.status, "assets": row.assets, "tokens": row.tokens, "version": row.version, "published_version": row.published_version}


@router.get("/settings/{domain}")
async def organiser_settings_domain(
    domain: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    freshness = datetime.now(timezone.utc).isoformat()
    if domain == "notifications":
        rules = (await db.scalars(select(OrganizationNotificationRule).where(OrganizationNotificationRule.organization_id == org.id, OrganizationNotificationRule.deleted_at.is_(None)))).all()
        channels = (await db.scalars(select(OrganizationNotificationChannelConfig).where(OrganizationNotificationChannelConfig.organization_id == org.id, OrganizationNotificationChannelConfig.deleted_at.is_(None)))).all()
        return {"rules": [{"id": str(row.id), "name": row.name, "trigger_key": row.trigger_key, "channel": row.channel, "is_enabled": row.is_enabled, "version": row.version} for row in rules], "channels": [{"id": str(row.id), "channel": row.channel, "provider": row.provider, "state": row.state, "last_verified_at": row.last_verified_at.isoformat() if row.last_verified_at else None, "version": row.version} for row in channels], "freshness_at": freshness, "source": "communications.organization_notification_configuration"}
    if domain == "security":
        row = await db.scalar(select(OrganizationSecurityPolicy).where(OrganizationSecurityPolicy.organization_id == org.id))
        return {"policy": None if row is None else {"require_mfa": row.require_mfa, "allowed_auth_methods": row.allowed_auth_methods, "password_policy": row.password_policy, "session_policy": row.session_policy, "trusted_device_policy": row.trusted_device_policy, "sso_enforced": row.sso_enforced, "allowed_cidrs": row.allowed_cidrs, "version": row.version}, "freshness_at": freshness, "source": "identity.organization_security_policies"}
    if domain == "branding":
        row = await db.scalar(select(OrganizationBrandProfile).where(OrganizationBrandProfile.organization_id == org.id))
        return {"profile": None if row is None else {"status": row.status, "assets": row.assets, "tokens": row.tokens, "templates": row.templates, "version": row.version, "published_version": row.published_version}, "freshness_at": freshness, "source": "platform.organization_brand_profiles"}
    if domain == "developer":
        rows = (await db.scalars(select(ApiKey).where(ApiKey.organization_id == org.id).order_by(ApiKey.created_at.desc()))).all()
        webhook_rows = (await db.execute(
            select(Webhook, Event.name)
            .join(Event, Event.id == Webhook.event_id)
            .where(Event.organization_id == org.id, Event.deleted_at.is_(None))
            .order_by(Webhook.updated_at.desc())
        )).all()
        webhooks = []
        for webhook, event_name in webhook_rows:
            latest = await db.scalar(
                select(IntegrationWebhookDelivery)
                .where(IntegrationWebhookDelivery.webhook_id == webhook.id)
                .order_by(IntegrationWebhookDelivery.delivered_at.desc())
                .limit(1)
            )
            webhooks.append({
                "id": str(webhook.id), "event_id": str(webhook.event_id), "event_name": event_name,
                "url": webhook.url, "description": webhook.description,
                "subscribed_events": webhook.subscribed_events, "status": webhook.status,
                "consecutive_failures": webhook.consecutive_failures,
                "last_triggered_at": webhook.last_triggered_at.isoformat() if webhook.last_triggered_at else None,
                "last_success_at": webhook.last_success_at.isoformat() if webhook.last_success_at else None,
                "last_failure_reason": webhook.last_failure_reason,
                "total_deliveries": webhook.total_deliveries, "total_failures": webhook.total_failures,
                "latest_delivery_status": latest.response_status if latest else None,
                "latest_delivery_at": latest.delivered_at.isoformat() if latest else None,
                "version": webhook.version,
                "manage_href": f"/events/{webhook.event_id}/settings/integrations?highlight={webhook.id}",
            })
        return {
            "items": [{"id": str(row.id), "name": row.name, "prefix": row.prefix, "is_active": row.is_active, "expires_at": row.expires_at.isoformat() if row.expires_at else None, "last_used_at": row.last_used_at.isoformat() if row.last_used_at else None, "created_at": row.created_at.isoformat()} for row in rows],
            "webhooks": webhooks,
            "freshness_at": freshness,
            "source": "developer.developer_api_keys+integrations.webhooks+integrations.webhook_deliveries",
        }
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown organiser settings domain")


def _format_dates(event: Event) -> str:
    start = event.start_date.strftime("%d %b, %Y")
    end = event.end_date.strftime("%d %b, %Y")
    return start if start == end else f"{start} - {end}"


async def _event_readiness(db: AsyncSession, event_id: uuid.UUID) -> int:
    total_sessions = await db.scalar(select(func.count(Session.id)).where(Session.event_id == event_id)) or 0
    total_speakers = await db.scalar(select(func.count(Speaker.id)).where(Speaker.event_id == event_id)) or 0
    total_rooms = await db.scalar(select(func.count(Room.id)).where(Room.event_id == event_id, Room.is_active.is_(True))) or 0
    total_files = await db.scalar(
        select(func.count(PresentationFile.id)).where(
            PresentationFile.event_id == event_id,
            PresentationFile.is_current_version.is_(True),
        )
    ) or 0
    configured_rooms = await db.scalar(
        select(func.count(func.distinct(Room.id)))
        .join(RoomDevice, RoomDevice.room_id == Room.id)
        .where(Room.event_id == event_id, Room.is_active.is_(True))
    ) or 0
    scored = []
    if total_sessions:
        sessions_with_speaker = await db.scalar(
            select(func.count(Session.id)).where(Session.event_id == event_id, Session.session_people.any())
        ) or 0
        scored.append(sessions_with_speaker / total_sessions * 100)
    if total_speakers:
        confirmed_speakers = await db.scalar(
            select(func.count(Speaker.id)).where(Speaker.event_id == event_id, Speaker.upload_status != "pending")
        ) or 0
        scored.append(confirmed_speakers / total_speakers * 100)
    if total_rooms:
        scored.append(configured_rooms / total_rooms * 100)
    if total_files:
        scored.append(100)
    return round(sum(scored) / len(scored)) if scored else 0


async def _attention_for_event(db: AsyncSession, event: Event) -> list[dict[str, Any]]:
    event_id = event.id
    tasks: list[dict[str, Any]] = []

    sessions_without_rooms = await db.scalar(
        select(func.count(Session.id)).where(Session.event_id == event_id, Session.room_id.is_(None))
    ) or 0
    if sessions_without_rooms:
        tasks.append({
            "id": f"{event_id}:sessions_without_rooms",
            "title": "Sessions",
            "description": "Sessions without assigned rooms",
            "count": sessions_without_rooms,
            "severity": "warning",
            "href": f"/events/{event_id}/program/sessions",
        })

    pending_speakers = await db.scalar(
        select(func.count(Speaker.id)).where(Speaker.event_id == event_id, Speaker.upload_status == "pending")
    ) or 0
    if pending_speakers:
        tasks.append({
            "id": f"{event_id}:pending_speakers",
            "title": "Speakers",
            "description": "Speakers pending uploads",
            "count": pending_speakers,
            "severity": "critical" if pending_speakers > 10 else "warning",
            "href": f"/events/{event_id}/speakers/directory",
        })

    pending_registrations = await db.scalar(
        select(func.count(Participant.id)).where(
            Participant.event_id == event_id,
            Participant.approval_status.in_(["PENDING_REVIEW", "Pending"]),
        )
    ) or 0
    if pending_registrations:
        tasks.append({
            "id": f"{event_id}:pending_registrations",
            "title": "Pending Approvals",
            "description": "Registrations require review",
            "count": pending_registrations,
            "severity": "critical",
            "href": f"/events/{event_id}/registration/approvals",
        })

    payment_pending = await db.scalar(
        select(func.count(PaymentTransaction.id)).where(
            PaymentTransaction.event_id == event_id,
            PaymentTransaction.status.in_(["pending", "failed"]),
        )
    ) or 0
    if payment_pending:
        tasks.append({
            "id": f"{event_id}:payment_reconciliation",
            "title": "Payment Reconciliation",
            "description": "Transactions need attention",
            "count": payment_pending,
            "severity": "warning",
            "href": f"/events/{event_id}/payments/reconciliation",
        })

    total_rooms = await db.scalar(select(func.count(Room.id)).where(Room.event_id == event_id, Room.is_active.is_(True))) or 0
    if total_rooms == 0:
        tasks.append({
            "id": f"{event_id}:venue_setup",
            "title": "Venue Setup",
            "description": "Configuration incomplete",
            "count": 1,
            "severity": "critical",
            "href": f"/events/{event_id}/setup/rooms-tracks",
        })

    freshness = datetime.now(timezone.utc).isoformat()
    for task in tasks:
        task["module"] = task["id"].split(":", 1)[-1]
        task["category"] = task["module"].split("_", 1)[0]
        task["entity_id"] = str(event_id)
        task["owner"] = None
        task["age_seconds"] = max(0, int((datetime.now(timezone.utc) - event.updated_at).total_seconds()))
        task["status"] = "open"
        task["source"] = "ORGANISER_NEEDS_ATTENTION_READ_MODEL"
        task["freshness_at"] = freshness
    return tasks


@router.get("/needs-attention")
async def organiser_needs_attention(
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    org = await _current_org(db, current_user)
    events = (await db.execute(
        select(Event)
        .where(Event.organization_id == org.id, Event.deleted_at.is_(None), Event.status != "archived")
        .order_by(Event.start_date.asc())
        .limit(25)
    )).scalars().all()
    tasks: list[dict[str, Any]] = []
    for event in events:
        tasks.extend(await _attention_for_event(db, event))
        if len(tasks) >= limit:
            break
    states = (await db.scalars(select(OrganizationAttentionState).where(OrganizationAttentionState.organization_id == org.id, OrganizationAttentionState.task_key.in_([task["id"] for task in tasks])))).all() if tasks else []
    state_by_key = {row.task_key: row for row in states}
    owner_ids = {row.owner_user_id for row in states if row.owner_user_id}
    owners = (await db.scalars(select(User).where(User.id.in_(owner_ids)))).all() if owner_ids else []
    owner_by_id = {row.id: row for row in owners}
    visible: list[dict[str, Any]] = []
    now = datetime.now(timezone.utc)
    for task in tasks:
        state_row = state_by_key.get(task["id"])
        if state_row and state_row.status == "RESOLVED":
            continue
        if state_row and state_row.status == "SNOOZED" and state_row.snoozed_until and state_row.snoozed_until > now:
            continue
        if state_row:
            task["status"] = "open" if state_row.status == "SNOOZED" else state_row.status.lower()
            task["version"] = state_row.version
            owner = owner_by_id.get(state_row.owner_user_id)
            task["owner"] = None if owner is None else {"id": str(owner.id), "name": f"{owner.first_name} {owner.last_name}".strip() or owner.email}
        else:
            task["version"] = 0
        visible.append(task)
    return visible[:limit]


async def _attention_state(db: AsyncSession, org_id: uuid.UUID, task_id: str, actor_id: uuid.UUID) -> tuple[OrganizationAttentionState, bool]:
    row = await db.scalar(select(OrganizationAttentionState).where(OrganizationAttentionState.organization_id == org_id, OrganizationAttentionState.task_key == task_id))
    if row is None:
        row = OrganizationAttentionState(organization_id=org_id, task_key=task_id, updated_by=actor_id)
        db.add(row); await db.flush()
        return row, True
    return row, False


@router.patch("/needs-attention/{task_id}/assign")
async def assign_attention_task(task_id: str, payload: AttentionAssignWrite, if_match: int = Header(default=0, alias="If-Match", ge=0), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    if payload.owner_user_id and not await db.scalar(select(OrganizationMember.id).where(OrganizationMember.organization_id == org.id, OrganizationMember.user_id == payload.owner_user_id, OrganizationMember.is_active.is_(True))): raise HTTPException(status_code=422, detail={"code": "OWNER_NOT_IN_ORGANIZATION"})
    row, created = await _attention_state(db, org.id, task_id, current_user.id)
    current_version = 0 if created else row.version
    if current_version != if_match: raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "current_version": row.version})
    row.owner_user_id = payload.owner_user_id; row.status = "ASSIGNED" if payload.owner_user_id else "OPEN"; row.updated_by = current_user.id; row.version = 1 if if_match == 0 else row.version + 1
    db.add(AuditLog(organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="organization_attention", resource_id=row.id, action_type="ATTENTION_TASK_ASSIGNED", new_state={"task_id": task_id, "owner_user_id": str(payload.owner_user_id) if payload.owner_user_id else None, "version": row.version}, is_sensitive=False))
    await db.commit(); return {"id": task_id, "status": row.status.lower(), "owner_user_id": str(row.owner_user_id) if row.owner_user_id else None, "version": row.version}


@router.patch("/needs-attention/{task_id}/snooze")
async def snooze_attention_task(task_id: str, payload: AttentionSnoozeWrite, if_match: int = Header(default=0, alias="If-Match", ge=0), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    if payload.snoozed_until <= datetime.now(timezone.utc): raise HTTPException(status_code=422, detail={"code": "SNOOZE_MUST_BE_FUTURE"})
    event_id_text = task_id.split(":", 1)[0]
    try: event_id = uuid.UUID(event_id_text)
    except ValueError: raise HTTPException(status_code=404, detail={"code": "ATTENTION_TASK_NOT_FOUND"})
    event = await db.scalar(select(Event).where(Event.id == event_id, Event.organization_id == org.id))
    current_task = next((item for item in await _attention_for_event(db, event) if item["id"] == task_id), None) if event else None
    if not current_task: raise HTTPException(status_code=404, detail={"code": "ATTENTION_TASK_NOT_FOUND"})
    if current_task["severity"] == "critical": raise HTTPException(status_code=422, detail={"code": "CRITICAL_TASK_CANNOT_BE_SNOOZED"})
    row, created = await _attention_state(db, org.id, task_id, current_user.id)
    if if_match != (0 if created else row.version): raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "current_version": row.version})
    row.status = "SNOOZED"; row.snoozed_until = payload.snoozed_until; row.resolution = payload.reason; row.updated_by = current_user.id; row.version = 1 if if_match == 0 else row.version + 1
    db.add(AuditLog(organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="organization_attention", resource_id=row.id, action_type="ATTENTION_TASK_SNOOZED", new_state={"task_id": task_id, "until": payload.snoozed_until.isoformat(), "reason": payload.reason, "version": row.version}, is_sensitive=False))
    await db.commit(); return {"id": task_id, "status": "snoozed", "snoozed_until": payload.snoozed_until.isoformat(), "version": row.version}


@router.patch("/needs-attention/{task_id}/resolve")
async def resolve_attention_task(task_id: str, payload: AttentionResolveWrite, if_match: int = Header(default=0, alias="If-Match", ge=0), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    row, created = await _attention_state(db, org.id, task_id, current_user.id)
    if if_match != (0 if created else row.version): raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "current_version": row.version})
    row.status = "RESOLVED"; row.resolution = payload.resolution; row.snoozed_until = None; row.updated_by = current_user.id; row.version = 1 if if_match == 0 else row.version + 1
    db.add(AuditLog(organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="organization_attention", resource_id=row.id, action_type="ATTENTION_TASK_RESOLVED", new_state={"task_id": task_id, "resolution": payload.resolution, "version": row.version}, is_sensitive=False))
    await db.commit(); return {"id": task_id, "status": "resolved", "version": row.version}


@router.get("/dashboard")
async def organiser_dashboard(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    unrestricted = bool(getattr(org, "has_unrestricted_capabilities", False))

    all_events = (await db.execute(
        select(Event)
        .where(Event.organization_id == org.id, Event.deleted_at.is_(None))
        .order_by(Event.start_date.desc())
    )).scalars().all()
    event_ids = [event.id for event in all_events]

    active_events = sum(1 for event in all_events if event.status not in {"archived", "completed"})
    team_members = await db.scalar(
        select(func.count(OrganizationMember.id)).where(
            OrganizationMember.organization_id == org.id,
            OrganizationMember.user_id.is_not(None),
            OrganizationMember.is_active.is_(True),
        )
    ) or 0

    total_registrations = 0
    total_revenue = 0.0
    if event_ids:
        total_registrations = await db.scalar(select(func.count(Participant.id)).where(Participant.event_id.in_(event_ids))) or 0
        total_revenue = float(await db.scalar(
            select(func.coalesce(func.sum(PaymentTransaction.amount), 0.0)).where(
                PaymentTransaction.event_id.in_(event_ids),
                PaymentTransaction.status.in_(["completed", "captured", "success", "paid"]),
            )
        ) or 0.0)

    storage_used_mb = 0.0
    if event_ids:
        storage_used_bytes = await db.scalar(
            select(func.coalesce(func.sum(PresentationFile.file_size_bytes), 0)).where(
                PresentationFile.event_id.in_(event_ids),
                PresentationFile.deleted_at.is_(None),
            )
        ) or 0
        storage_used_mb = float(storage_used_bytes) / (1024 * 1024)

    plan = None
    usage = {"events": {}, "users": {}, "registrations": {}, "storage": {}}
    try:
        sub = await EntitlementResolver.get_active_subscription(db, org.id)
        plan = sub.plan if sub else None
        max_events = None if unrestricted else await EntitlementResolver.get_limit(db, org.id, "max_events")
        max_users = None if unrestricted else await EntitlementResolver.get_limit(db, org.id, "max_users")
        max_registrations = None if unrestricted else await EntitlementResolver.get_limit(db, org.id, "max_registrations")
        storage_quota_mb = None if unrestricted else await EntitlementResolver.get_limit(db, org.id, "storage_quota_mb")
        usage = {
            "events": {"used": len(all_events), "max": max_events},
            "users": {"used": team_members, "max": max_users},
            "registrations": {"used": total_registrations, "max": max_registrations},
            "storage": {"used_mb": storage_used_mb, "max_mb": storage_quota_mb},
        }
    except Exception:
        pass

    today = date.today()
    trend = []
    for i in range(7):
        day = today - timedelta(days=6 - i)
        next_day = day + timedelta(days=1)
        registered = 0
        revenue = 0.0
        if event_ids:
            registered = await db.scalar(
                select(func.count(Participant.id)).where(
                    Participant.event_id.in_(event_ids),
                    Participant.registered_at >= datetime.combine(day, datetime.min.time(), timezone.utc),
                    Participant.registered_at < datetime.combine(next_day, datetime.min.time(), timezone.utc),
                )
            ) or 0
            revenue = float(await db.scalar(
                select(func.coalesce(func.sum(PaymentTransaction.amount), 0.0)).where(
                    PaymentTransaction.event_id.in_(event_ids),
                    PaymentTransaction.created_at >= datetime.combine(day, datetime.min.time(), timezone.utc),
                    PaymentTransaction.created_at < datetime.combine(next_day, datetime.min.time(), timezone.utc),
                    PaymentTransaction.status.in_(["completed", "captured", "success", "paid"]),
                )
            ) or 0.0)
        trend.append({"label": day.strftime("%a"), "registrations": registered, "revenue": revenue})

    event_rows = []
    for event in all_events[:6]:
        registrations = await db.scalar(select(func.count(Participant.id)).where(Participant.event_id == event.id)) or 0
        revenue = float(await db.scalar(
            select(func.coalesce(func.sum(PaymentTransaction.amount), 0.0)).where(
                PaymentTransaction.event_id == event.id,
                PaymentTransaction.status.in_(["completed", "captured", "success", "paid"]),
            )
        ) or 0.0)
        event_rows.append({
            "id": str(event.id),
            "name": event.name,
            "short_code": event.short_code,
            "dates": _format_dates(event),
            "venue": event.venue_name or event.location or "Venue not set",
            "registrations": registrations,
            "revenue": revenue,
            "readiness_pct": await _event_readiness(db, event.id),
            "status": event.status,
        })

    activity_rows = (await db.scalars(
        select(AuditLog)
        .where(AuditLog.organization_id == org.id)
        .order_by(AuditLog.occurred_at.desc())
        .limit(6)
    )).all()

    return {
        "organization": {
            "id": str(org.id),
            "name": org.name,
            "slug": org.slug,
            "is_internal_unrestricted": unrestricted,
        },
        "metrics": {
            "active_events": active_events,
            "team_members": team_members,
            "total_registrations": total_registrations,
            "total_revenue": total_revenue,
        },
        "plan": {
            "name": "Internal Unlimited" if unrestricted else (plan.name if plan else org.plan.title()),
            "status": "ACTIVE" if unrestricted or plan else "UNAVAILABLE",
            "registrations_used": int(usage.get("registrations", {}).get("used") or total_registrations),
            "registrations_max": None if unrestricted else usage.get("registrations", {}).get("max"),
            "storage_used_gb": round((usage.get("storage", {}).get("used_mb") or storage_used_mb) / 1024, 2),
            "storage_max_gb": None if unrestricted else (round((usage.get("storage", {}).get("max_mb") or 0) / 1024, 2) if usage.get("storage", {}).get("max_mb") else None),
            "events_used": int(usage.get("events", {}).get("used") or len(all_events)),
            "events_max": None if unrestricted else usage.get("events", {}).get("max"),
            "unrestricted": unrestricted,
        },
        "trend": trend,
        "events": event_rows,
        "recent_activity": [{
            "id": str(row.id),
            "action": row.action_type,
            "resource_type": row.resource_type,
            "resource_id": str(row.resource_id),
            "actor_role": row.actor_role,
            "occurred_at": row.occurred_at.isoformat(),
        } for row in activity_rows],
        "needs_attention": await organiser_needs_attention(limit=20, current_user=current_user, db=db),
        "freshness_at": datetime.now(timezone.utc).isoformat(),
        "source": "ORGANISER_DASHBOARD_READ_MODEL",
    }


@router.get("/addons/status")
async def organiser_addon_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Return the catalogue with this organisation's effective add-on state."""
    org = await _current_org(db, current_user)
    unrestricted = bool(getattr(org, "has_unrestricted_capabilities", False))
    now = datetime.now(timezone.utc)
    addons = (await db.scalars(
        select(Addon).where(Addon.is_active.is_(True)).order_by(Addon.name.asc())
    )).all()
    assignments = (await db.scalars(
        select(OrganizationAddon)
        .where(OrganizationAddon.organization_id == org.id)
        .order_by(OrganizationAddon.updated_at.desc())
    )).all()
    requests = (await db.scalars(
        select(CommercialAccessRequest).where(
            CommercialAccessRequest.organization_id == org.id,
            CommercialAccessRequest.status.in_(["PENDING", "APPROVED"]),
        )
    )).all()

    plan_name: str | None = None
    if not unrestricted:
        try:
            subscription = await EntitlementResolver.get_active_subscription(db, org.id)
            plan_name = subscription.plan.name if subscription and subscription.plan else None
        except Exception:
            plan_name = None

    assignments_by_addon: dict[uuid.UUID, list[OrganizationAddon]] = {}
    for assignment in assignments:
        assignments_by_addon.setdefault(assignment.addon_id, []).append(assignment)
    pending_keys = {
        str(key).upper()
        for request in requests
        for key in (request.requested_addon_keys or [])
    }

    items: list[dict[str, Any]] = []
    for addon in addons:
        addon_assignments = assignments_by_addon.get(addon.id, [])
        active = [
            row for row in addon_assignments
            if row.status.upper() == "ACTIVE" and (row.expires_at is None or row.expires_at > now)
        ]
        expired = [
            row for row in addon_assignments
            if row.expires_at is not None and row.expires_at <= now
        ]
        included = bool(
            plan_name
            and addon.included_in_plan
            and addon.included_in_plan.lower() == plan_name.lower()
        )
        if unrestricted:
            effective_status = "UNRESTRICTED"
        elif active:
            effective_status = "ACTIVE"
        elif included:
            effective_status = "INCLUDED"
        elif addon.key.upper() in pending_keys:
            effective_status = "PENDING"
        elif expired:
            effective_status = "EXPIRED"
        else:
            effective_status = "AVAILABLE"

        expires_at = max(
            (row.expires_at for row in active if row.expires_at is not None),
            default=None,
        )
        scopes = sorted({
            "event" if row.event_id else "activation" if row.activation_id else "organisation"
            for row in active
        })
        items.append({
            "id": str(addon.id),
            "key": addon.key,
            "name": addon.name,
            "description": addon.short_description or addon.description,
            "addon_type": addon.addon_type,
            "status": effective_status,
            "quantity": sum(row.quantity for row in active),
            "scopes": scopes,
            "expires_at": expires_at.isoformat() if expires_at else None,
            "included_in_plan": addon.included_in_plan,
            "price_inr": float(addon.final_price if addon.final_price is not None else addon.price_inr) if (addon.final_price is not None or addon.price_inr is not None) else None,
        })

    return _page(items, len(items), 1, max(len(items), 1), "ORGANISER_ADDON_STATUS_READ_MODEL")


@router.get("/entitlements/features")
async def organiser_effective_features(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Return the effective organisation feature catalogue with source evidence."""
    from app.modules.platform.models.feature import FeatureCatalog

    org = await _current_org(db, current_user)
    catalogue = (await db.scalars(
        select(FeatureCatalog)
        .where(FeatureCatalog.is_active.is_(True))
        .order_by(FeatureCatalog.category_order, FeatureCatalog.feature_order, FeatureCatalog.name)
    )).all()
    unrestricted = bool(org.has_unrestricted_capabilities)
    resolved = {} if unrestricted else await EntitlementResolver.resolve_org_entitlements(db, org.id, explain=True)
    resolved_features = resolved.get("features", resolved) if isinstance(resolved, dict) else {}
    items = []
    for feature in catalogue:
        effective = resolved_features.get(feature.key, {}) if isinstance(resolved_features, dict) else {}
        enabled = True if unrestricted else bool(effective.get("enabled", False))
        items.append({
            "id": str(feature.id),
            "key": feature.key,
            "name": feature.name,
            "description": feature.description,
            "category": feature.category or "General",
            "scope_type": feature.scope_type,
            "enabled": enabled,
            "value": True if unrestricted else effective.get("value", enabled),
            "value_type": effective.get("value_type", "BOOLEAN"),
            "source_type": "INTERNAL_UNRESTRICTED" if unrestricted else effective.get("source_type", "CONTRACT_REQUIRED"),
            "source_ref": str(org.id) if unrestricted else effective.get("source_ref"),
            "denial_reason": None if enabled else effective.get("denial_reason") or "Not included in the active entitlement contract",
            "resolution_path": None if enabled or unrestricted else "/plans-entitlements/addons",
        })
    return _page(items, len(items), 1, max(len(items), 1), "ORGANISER_EFFECTIVE_ENTITLEMENTS")


@router.get("/entitlements/history")
async def organiser_entitlement_history(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Return immutable commercial and entitlement changes for the current tenant."""
    org = await _current_org(db, current_user)
    resource_types = (
        "commercial_access_request", "organization_subscription", "organization_addon",
        "entitlement_grant", "entitlement_override", "plan_feature", "organization_feature",
    )
    condition = and_(
        AuditLog.organization_id == org.id,
        or_(
            AuditLog.resource_type.in_(resource_types),
            AuditLog.action_type.ilike("%ENTITLEMENT%"),
            AuditLog.action_type.ilike("%SUBSCRIPTION%"),
            AuditLog.action_type.ilike("%ADDON%"),
            AuditLog.action_type.ilike("%COMMERCIAL_ACCESS%"),
        ),
    )
    total = int(await db.scalar(select(func.count(AuditLog.id)).where(condition)) or 0)
    rows = (await db.scalars(
        select(AuditLog).where(condition)
        .order_by(AuditLog.occurred_at.desc())
        .offset((page - 1) * page_size).limit(page_size)
    )).all()
    return _page([{
        "id": str(row.id),
        "action": row.action_type,
        "resource_type": row.resource_type,
        "resource_id": str(row.resource_id),
        "actor_user_id": str(row.actor_user_id) if row.actor_user_id else None,
        "actor_role": row.actor_role,
        "source": row.resource_type,
        "version": (row.new_state or {}).get("version"),
        "occurred_at": row.occurred_at.isoformat(),
    } for row in rows], total, page, page_size, "IMMUTABLE_ENTITLEMENT_AUDIT")


@router.get("/reports/{domain}")
async def organiser_report(
    domain: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    search: str | None = Query(default=None, max_length=160),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    supported = {"overview", "registrations", "revenue", "engagement", "events", "exports", "custom"}
    if domain not in supported:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown organiser report")

    org = await _current_org(db, current_user)
    if domain in {"exports", "custom"}:
        action = "ORGANISER_REPORT_EXPORT_CREATED" if domain == "exports" else "ORGANISER_CUSTOM_REPORT_CREATED"
        filters = [AuditLog.organization_id == org.id, AuditLog.action_type == action]
        total = await db.scalar(select(func.count(AuditLog.id)).where(*filters)) or 0
        rows = (await db.scalars(select(AuditLog).where(
            *filters,
        ).order_by(AuditLog.occurred_at.desc()).offset((page - 1) * page_size).limit(page_size))).all()
        return {
            "domain": domain,
            "metrics": {"total_registrations": None, "total_revenue": None, "active_events": None, "engagement_pct": None},
            "trend": [],
            "events": [{"id": str(row.resource_id), **(row.new_state or {}), "created_at": row.occurred_at.isoformat()} for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
            "freshness_at": datetime.now(timezone.utc).isoformat(),
            "source": "audit.logs",
        }

    dashboard = await organiser_dashboard(current_user=current_user, db=db)
    metrics = dashboard["metrics"]
    event_rows: list[dict[str, Any]] = []
    event_total = 0
    if domain in {"overview", "registrations", "revenue", "events"}:
        event_filters = [Event.organization_id == org.id, Event.deleted_at.is_(None)]
        if search:
            term = f"%{search.strip()}%"
            event_filters.append(or_(Event.name.ilike(term), Event.short_code.ilike(term), Event.venue_name.ilike(term)))
        event_total = await db.scalar(select(func.count(Event.id)).where(*event_filters)) or 0
        events = (await db.scalars(
            select(Event).where(*event_filters).order_by(Event.start_date.desc()).offset((page - 1) * page_size).limit(page_size)
        )).all()
        for event in events:
            registrations = await db.scalar(select(func.count(Participant.id)).where(Participant.event_id == event.id)) or 0
            revenue = float(await db.scalar(
                select(func.coalesce(func.sum(PaymentTransaction.amount), 0.0)).where(
                    PaymentTransaction.event_id == event.id,
                    PaymentTransaction.status.in_(["completed", "captured", "success", "paid"]),
                )
            ) or 0.0)
            event_rows.append({
                "id": str(event.id), "name": event.name, "short_code": event.short_code,
                "dates": _format_dates(event), "venue": event.venue_name or event.location or "Venue not set",
                "registrations": registrations, "revenue": revenue,
                "readiness_pct": await _event_readiness(db, event.id), "status": event.status,
            })
    return {
        "domain": domain,
        "metrics": {
            "total_registrations": metrics["total_registrations"],
            "total_revenue": metrics["total_revenue"],
            "active_events": metrics["active_events"],
            "engagement_pct": None,
        },
        "trend": dashboard["trend"] if domain in {"overview", "registrations", "revenue"} else [],
        "events": event_rows if domain in {"overview", "registrations", "revenue", "events"} else [],
        "total": event_total,
        "page": page,
        "page_size": page_size,
        "freshness_at": dashboard["freshness_at"],
        "source": "ORGANISER_REPORT_READ_MODEL",
    }


@router.post("/reports/exports", status_code=status.HTTP_201_CREATED)
async def create_organiser_report_export(
    payload: ReportExportWrite,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=160),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    prior = (await db.scalars(select(AuditLog).where(
        AuditLog.organization_id == org.id,
        AuditLog.action_type == "ORGANISER_REPORT_EXPORT_CREATED",
    ).order_by(AuditLog.occurred_at.desc()).limit(100))).all()
    existing = next((row for row in prior if (row.new_state or {}).get("idempotency_key") == idempotency_key), None)
    if existing:
        return {"id": str(existing.resource_id), **(existing.new_state or {})}
    report = await organiser_report(payload.domain, page=1, page_size=100, search=None, current_user=current_user, db=db)
    export_rows = list(report.get("events") or [])
    total_rows = int(report.get("total") or len(export_rows))
    for report_page in range(2, ((total_rows + 99) // 100) + 1):
        next_page = await organiser_report(
            payload.domain,
            page=report_page,
            page_size=100,
            search=None,
            current_user=current_user,
            db=db,
        )
        export_rows.extend(next_page.get("events") or [])
    export_id = uuid.uuid4()
    snapshot = {
        "domain": payload.domain, "format": payload.format, "status": "COMPLETED",
        "row_count": len(export_rows), "source": report.get("source"),
        "freshness_at": report.get("freshness_at"), "metrics": report.get("metrics") or {},
        "rows": export_rows, "idempotency_key": idempotency_key,
    }
    db.add(AuditLog(organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="organiser_report_export", resource_id=export_id, action_type="ORGANISER_REPORT_EXPORT_CREATED", new_state=snapshot, is_sensitive=True))
    await db.commit()
    return {"id": str(export_id), **snapshot}


@router.get("/reports/exports/{export_id}/download")
async def download_organiser_report_export(
    export_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    org = await _current_org(db, current_user)
    record = await db.scalar(select(AuditLog).where(
        AuditLog.organization_id == org.id,
        AuditLog.resource_id == export_id,
        AuditLog.action_type == "ORGANISER_REPORT_EXPORT_CREATED",
    ))
    if not record:
        raise HTTPException(status_code=404, detail="Report export not found")
    state = record.new_state or {}
    rows = state.get("rows") or []
    columns = sorted({key for row in rows for key in row.keys()}) if rows else sorted((state.get("metrics") or {}).keys())
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    if rows:
        writer.writerows(rows)
    elif state.get("metrics"):
        writer.writerow(state["metrics"])
    filename = f"organiser-{state.get('domain', 'report')}-{export_id}.csv"
    return Response(buffer.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.post("/reports/custom", status_code=status.HTTP_201_CREATED)
async def create_organiser_custom_report(
    payload: CustomReportWrite,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=160),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    prior = (await db.scalars(select(AuditLog).where(
        AuditLog.organization_id == org.id,
        AuditLog.action_type == "ORGANISER_CUSTOM_REPORT_CREATED",
    ).order_by(AuditLog.occurred_at.desc()).limit(100))).all()
    existing = next((row for row in prior if (row.new_state or {}).get("idempotency_key") == idempotency_key), None)
    if existing:
        return {"id": str(existing.resource_id), **(existing.new_state or {})}
    report_id = uuid.uuid4()
    state = {**payload.model_dump(), "status": "ACTIVE", "idempotency_key": idempotency_key}
    db.add(AuditLog(organization_id=org.id, actor_user_id=current_user.id, actor_role=current_user.role, resource_type="organiser_custom_report", resource_id=report_id, action_type="ORGANISER_CUSTOM_REPORT_CREATED", new_state=state, is_sensitive=False))
    await db.commit()
    return {"id": str(report_id), **state}


@router.get("/events/{event_id}/needs-attention")
async def event_needs_attention(
    event_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    event = await db.get(Event, event_id)
    if not event or event.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    if current_user.role != "super_admin" and event.organization_id != current_user.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return await _attention_for_event(db, event)
