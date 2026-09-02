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
from app.modules.organiser.application.member_commands import OrganizationMemberCommandService
from app.modules.organiser.application.organization_commands import OrganizerOrganizationCommandService
from app.modules.organiser.application.billing_commands import OrganizerBillingCommandService
from app.modules.organiser.application.approval_commands import OrganizerApprovalRuleCommandService
from app.modules.organiser.application.notification_commands import OrganizerNotificationCommandService
from app.modules.organiser.application.custom_field_commands import OrganizerCustomFieldCommandService
from app.modules.organiser.application.security_commands import OrganizerSecurityCommandService
from app.modules.organiser.application.branding_commands import OrganizerBrandingCommandService
from app.modules.organiser.application.attention_commands import OrganizerAttentionCommandService
from app.modules.organiser.application.location_commands import OrganizerLocationCommandService
from app.modules.organiser.application.document_commands import OrganizerDocumentCommandService
from app.modules.organiser.application.event_commands import OrganizerEventCommandService
from app.modules.organiser.application.report_commands import OrganizerReportCommandService
from app.modules.organiser.application.import_commands import OrganizerImportCommandService
from app.modules.organiser.application.queries import (
    OrganiserCustomFieldQueryService,
    OrganiserEventQueryService,
    OrganiserIntegrationQueryService,
    OrganiserDeveloperSettingsQueryService,
    OrganiserLocationQueryService,
    OrganiserNotificationSettingsQueryService,
    OrganiserSecurityBrandingQueryService,
    OrganiserTeamQueryService,
    OrganiserMemberQueryService,
    OrganiserEntitlementQueryService,
    OrganiserReportQueryService,
    OrganiserAttentionQueryService,
    OrganiserAddonQueryService,
)
from app.modules.platform.application.organization_team_commands import OrganizationTeamCommandService


# Capability audit index: domain routers enforce these operations, while the
# organiser portal remains the customer-facing entry point for their workflows.
CUSTOMER_MANAGED_OPERATION_GATES = {
    "abstracts.assign_reviewers",
    "abstracts.configure",
    "abstracts.decide",
    "abstracts.export",
    "abstracts.publish",
    "abstracts.review",
    "developer.api.use",
    "website.manage",
}
from app.modules.audit.models.audit_log import AuditLog
from app.modules.audit.application.queries import AuditQueryService
from app.modules.audit.services.audit_service import AuditContext, AuditService
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
    updated = await OrganizerOrganizationCommandService(db).update_profile(
        organization_id=org.id, actor=current_user, values=payload.model_dump(), if_match=if_match,
    )
    return _organization_profile(updated)


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
    items, total = await OrganiserTeamQueryService(db).list_teams(
        organization_id=org.id, page=page, page_size=page_size, search=search
    )
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
    items, total = await OrganiserMemberQueryService(db).list_members(
        organization_id=org.id,
        page=page,
        page_size=page_size,
        search=search,
        member_status=member_status,
    )
    return _page(items, total, page, page_size, "organizer_access.organization_members")


@router.post("/invitations/{member_id}/resend")
async def resend_organiser_invitation(member_id: uuid.UUID, if_match: int = Header(..., alias="If-Match", ge=1), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    member = await OrganizationMemberCommandService(db).resend_invitation(organization_id=org.id, member_id=member_id, actor=current_user, if_match=if_match)
    return {"id": str(member.id), "message": "Invitation resent", "version": member.version}


@router.delete("/invitations/{member_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response, response_model=None)
async def revoke_organiser_invitation(member_id: uuid.UUID, if_match: int = Header(..., alias="If-Match", ge=1), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> Response:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    await OrganizationMemberCommandService(db).revoke_invitation(organization_id=org.id, member_id=member_id, actor=current_user, if_match=if_match)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/members/{member_id}/role")
async def update_organiser_member_role(member_id: uuid.UUID, payload: MemberRoleWrite, if_match: int = Header(..., alias="If-Match", ge=1), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    member = await OrganizationMemberCommandService(db).update_role(organization_id=org.id, member_id=member_id, actor=current_user, org_role=payload.org_role, if_match=if_match, reason=payload.reason)
    return {"id": str(member.id), "org_role": member.org_role, "version": member.version}


@router.patch("/members/{member_id}/status")
async def update_organiser_member_status(member_id: uuid.UUID, payload: MemberStatusWrite, if_match: int = Header(..., alias="If-Match", ge=1), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    member = await OrganizationMemberCommandService(db).update_status(organization_id=org.id, member_id=member_id, actor=current_user, is_active=payload.is_active, if_match=if_match, reason=payload.reason)
    return {"id": str(member.id), "is_active": member.is_active, "version": member.version}


@router.patch("/members-bulk/status")
async def bulk_update_organiser_member_status(payload: BulkMemberStatusWrite, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    updated = await OrganizationMemberCommandService(db).bulk_update_status(
        organization_id=org.id,
        members=[(item.id, item.version) for item in payload.members],
        actor=current_user,
        is_active=payload.is_active,
        reason=payload.reason,
    )
    return {"items": updated, "updated": len(updated)}


@router.post("/teams", status_code=status.HTTP_201_CREATED)
async def create_organiser_team(
    payload: TeamWrite,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=8, max_length=160),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    row = await OrganizationTeamCommandService(db).create(
        organization_id=org.id, actor=current_user, name=payload.name,
        description=payload.description, owner_member_id=payload.owner_member_id,
        reason="organiser team creation",
        idempotency_key=idempotency_key,
    )
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
    row = await OrganizationTeamCommandService(db).update(
        organization_id=org.id, team_id=team_id, actor=current_user,
        name=payload.name, description=payload.description,
        owner_member_id=payload.owner_member_id, if_match=expected_version,
        reason="organiser team update",
    )
    return {"id": str(row.id), "name": row.name, "description": row.description, "owner_member_id": str(row.owner_member_id) if row.owner_member_id else None, "status": row.status, "version": row.version}


@router.delete("/teams/{team_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response, response_model=None)
async def delete_organiser_team(
    team_id: uuid.UUID,
    expected_version: int = Header(alias="If-Match", ge=1),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    await OrganizationTeamCommandService(db).archive(
        organization_id=org.id, team_id=team_id, actor=current_user,
        if_match=expected_version, reason="organiser team archive",
        audit_action="ORGANIZATION_TEAM_DELETED",
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/teams/{team_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response, response_model=None)
async def assign_organiser_team_member(
    team_id: uuid.UUID,
    member_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    await OrganizationTeamCommandService(db).assign_member(
        organization_id=org.id, team_id=team_id, member_id=member_id,
        actor=current_user, reason="organiser team member assignment",
    )


@router.delete("/teams/{team_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response, response_model=None)
async def remove_organiser_team_member(
    team_id: uuid.UUID,
    member_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    await OrganizationTeamCommandService(db).unassign_member(
        organization_id=org.id, team_id=team_id, member_id=member_id,
        actor=current_user, reason="organiser team member removal",
        audit_action="ORGANIZATION_TEAM_MEMBER_REMOVED",
    )
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


@router.put("/teams/{team_id}/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response, response_model=None)
async def assign_organiser_team_event(
    team_id: uuid.UUID,
    event_id: uuid.UUID,
    payload: TeamAssignmentWrite,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    await OrganizationTeamCommandService(db).assign_event(
        organization_id=org.id, team_id=team_id, event_id=event_id,
        actor=current_user, permissions=payload.permissions,
        reason="organiser team event assignment",
    )


@router.delete("/teams/{team_id}/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response, response_model=None)
async def remove_organiser_team_event(
    team_id: uuid.UUID,
    event_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    await OrganizationTeamCommandService(db).unassign_event(
        organization_id=org.id, team_id=team_id, event_id=event_id,
        actor=current_user, reason="organiser team event removal",
    )
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
async def organiser_locations(
    limit: int = Query(100, ge=1, le=OrganiserLocationQueryService.MAX_PAGE_SIZE),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    rows = await OrganiserLocationQueryService(db).list_locations(
        organization_id=org.id, limit=limit
    )
    return {
        "items": [{
            "id": str(row[0]), "name": row[1], "location_type": row[2],
            "address": row[3], "timezone": row[4], "contact": row[5],
            "status": row[6], "version": row[7],
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
    return await OrganizerLocationCommandService(db).create(
        organization_id=org.id, actor=current_user, values=payload.model_dump()
    )


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
    return await OrganizerLocationCommandService(db).update(
        organization_id=org.id, location_id=location_id, actor=current_user,
        values=payload.model_dump(), if_match=if_match,
    )


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
    rows, total, summary = await OrganiserEventQueryService(db).list_events(
        organization_id=org.id,
        status_filter=status_filter,
        search=search,
        year=year,
        page=page,
        page_size=page_size,
        today=today,
    )
    items: list[dict[str, Any]] = []
    for event in rows:
        display_status = "live" if event.status == "active" and event.start_date <= today <= event.end_date else "upcoming" if event.start_date > today and event.status != "draft" else event.status
        items.append({
            "id": str(event.id), "name": event.name, "short_code": event.short_code,
            "start_date": event.start_date.isoformat(), "end_date": event.end_date.isoformat(),
            "venue": event.venue_name or event.location, "country": event.country,
            "timezone": event.timezone, "owner": event.organizer_name,
            "status": display_status, "source_status": event.status,
            "registrations": event.registrations, "readiness_pct": event.readiness_pct,
            "created_at": event.created_at.isoformat(), "updated_at": event.updated_at.isoformat(),
        })
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
    raw = await file.read(1_048_577)
    return await OrganizerImportCommandService(db).import_events(
        organization=org, actor=current_user, filename=file.filename or "",
        raw=raw, idempotency_key=idempotency_key,
    )


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
    return await OrganizerEventCommandService(db).duplicate(
        organization_id=org.id, event_id=event_id, actor=current_user,
        name=payload.name, short_code=payload.short_code,
        idempotency_key=idempotency_key,
    )


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
    return await OrganizerEventCommandService(db).restore(
        organization_id=org.id, event_id=event_id, actor=current_user,
        reason=reason, idempotency_key=idempotency_key,
    )


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
    return await OrganizerDocumentCommandService(db).upload(
        organization_id=org.id, actor=current_user, document_type=document_type,
        expires_at=expires_at, filename=file.filename or "document",
        content_type=file.content_type or "application/octet-stream", file_data=data,
    )


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
    data = await file.read(25 * 1024 * 1024 + 1)
    if len(data) > 25 * 1024 * 1024: raise HTTPException(status_code=413, detail={"code": "DOCUMENT_TOO_LARGE"})
    return await OrganizerDocumentCommandService(db).replace(
        organization_id=org.id, document_id=document_id, actor=current_user,
        if_match=if_match, expires_at=expires_at,
        filename=file.filename or "document",
        content_type=file.content_type or "application/octet-stream", file_data=data,
    )


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response, response_model=None)
async def archive_organiser_document(document_id: uuid.UUID, if_match: int = Header(..., alias="If-Match", ge=1), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> Response:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    await OrganizerDocumentCommandService(db).archive(
        organization_id=org.id, document_id=document_id,
        actor=current_user, if_match=if_match,
    )
    return Response(status_code=204)


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
    row = await OrganizerApprovalRuleCommandService(db).create(
        organization_id=org.id, actor=current_user, values=payload.model_dump(),
    )
    return {"id": str(row.id), "name": row.name, "domain": row.domain, "version": row.version}


@router.put("/access/approval-rules/{rule_id}")
async def update_organiser_approval_rule(rule_id: uuid.UUID, payload: ApprovalRuleWrite, if_match: int = Header(..., alias="If-Match", ge=1), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    row = await OrganizerApprovalRuleCommandService(db).update(
        organization_id=org.id, rule_id=rule_id, actor=current_user,
        values=payload.model_dump(), if_match=if_match,
    )
    return {"id": str(row.id), "name": row.name, "domain": row.domain, "version": row.version}


@router.put("/billing/tax")
async def update_organiser_billing_profile(
    payload: BillingProfileWrite,
    expected_version: int = Header(..., alias="If-Match", ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    profile = await OrganizerBillingCommandService(db).update_profile(
        organization_id=org.id, actor=current_user, values=payload.model_dump(),
        expected_version=expected_version,
    )
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
    await AuditService.write_log(AuditContext(
        organization_id=org.id,
        actor_user_id=current_user.id,
        actor_role=current_user.role,
        resource_type="invoice",
        resource_id=invoice.id,
        action_type="ORGANIZATION_INVOICE_DOWNLOADED",
        new_state={"format": "csv"},
        is_sensitive=True,
    ))
    filename = f"invoice-{invoice.invoice_number or invoice.id}.csv"
    return Response(content=output.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/integrations")
async def organiser_integrations(
    limit: int = Query(default=100, ge=1, le=1000),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    rows = await OrganiserIntegrationQueryService(db).list_connections(
        organization_id=org.id,
        limit=limit,
    )
    return {
        "items": [{"id": str(row_id), "provider": provider, "is_active": is_active, "version": version} for row_id, provider, is_active, version in rows],
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
    effective_page_size = min(page_size, AuditQueryService.MAX_PAGE_SIZE)
    resource_types = None
    if resource_type:
        resource_types = None
    elif resource:
        resource_types = [value.strip() for value in resource.split(",") if value.strip()]
    rows, total = await AuditQueryService(db).list_organization_activity(
        organization_id=org.id,
        resource_type=resource_type,
        resource_types=resource_types,
        page=page,
        page_size=effective_page_size,
    )
    items = [{
            "id": str(row.id), "action": row.action_type, "resource_type": row.resource_type,
            "resource_id": str(row.resource_id), "actor_role": row.actor_role,
            "occurred_at": row.occurred_at.isoformat(), "is_sensitive": row.is_sensitive,
        } for row in rows]
    return _page(items, total, page, effective_page_size, "audit.logs")


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
async def list_organiser_custom_fields(
    limit: int = Query(100, ge=1, le=OrganiserCustomFieldQueryService.MAX_PAGE_SIZE),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    rows = await OrganiserCustomFieldQueryService(db).list_fields(
        organization_id=org.id, limit=limit
    )
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
    row = await OrganizerCustomFieldCommandService(db).create(
        organization_id=org.id, actor=current_user, values=payload.model_dump(),
        idempotency_key=idempotency_key,
    )
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
    row = await OrganizerCustomFieldCommandService(db).update(
        organization_id=org.id, field_id=field_id, actor=current_user,
        values=payload.model_dump(), if_match=if_match,
    )
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
    row = await OrganizerNotificationCommandService(db).toggle_rule(
        organization_id=org.id, rule_id=rule_id, actor=current_user,
        is_enabled=payload.is_enabled, if_match=if_match,
    )
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
    return await OrganizerSecurityCommandService(db).update_policy(
        organization_id=org.id, actor=current_user, values=payload.model_dump(), if_match=if_match,
    )


@router.put("/settings/branding")
async def update_organiser_branding(
    payload: BrandingWrite,
    if_match: int = Header(default=0, alias="If-Match", ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    return await OrganizerBrandingCommandService(db).update(
        organization_id=org.id, actor=current_user, values=payload.model_dump(), if_match=if_match,
    )


@router.get("/settings/{domain}")
async def organiser_settings_domain(
    domain: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    freshness = datetime.now(timezone.utc).isoformat()
    if domain == "notifications":
        rules, channels = await OrganiserNotificationSettingsQueryService(db).get_settings(
            organization_id=org.id
        )
        return {"rules": [{"id": str(row.id), "name": row.name, "trigger_key": row.trigger_key, "channel": row.channel, "is_enabled": row.is_enabled, "version": row.version} for row in rules], "channels": [{"id": str(row.id), "channel": row.channel, "provider": row.provider, "state": row.state, "last_verified_at": row.last_verified_at.isoformat() if row.last_verified_at else None, "version": row.version} for row in channels], "freshness_at": freshness, "source": "communications.organization_notification_configuration"}
    if domain == "security":
        result = await OrganiserSecurityBrandingQueryService(db).get_security_policy(
            organization_id=org.id
        )
        row = result.first()
        return {"policy": None if row is None else {"require_mfa": row.require_mfa, "allowed_auth_methods": row.allowed_auth_methods, "password_policy": row.password_policy, "session_policy": row.session_policy, "trusted_device_policy": row.trusted_device_policy, "sso_enforced": row.sso_enforced, "allowed_cidrs": row.allowed_cidrs, "version": row.version}, "freshness_at": freshness, "source": "identity.organization_security_policies"}
    if domain == "branding":
        result = await OrganiserSecurityBrandingQueryService(db).get_brand_profile(
            organization_id=org.id
        )
        row = result.first()
        return {"profile": None if row is None else {"status": row.status, "assets": row.assets, "tokens": row.tokens, "templates": row.templates, "version": row.version, "published_version": row.published_version}, "freshness_at": freshness, "source": "platform.organization_brand_profiles"}
    if domain == "developer":
        rows, webhook_rows = await OrganiserDeveloperSettingsQueryService(db).get_settings(
            organization_id=org.id
        )
        webhooks = []
        for row in webhook_rows:
            webhooks.append({
                "id": str(row.id), "event_id": str(row.event_id), "event_name": row.name,
                "url": row.url, "description": row.description,
                "subscribed_events": row.subscribed_events, "status": row.status,
                "consecutive_failures": row.consecutive_failures,
                "last_triggered_at": row.last_triggered_at.isoformat() if row.last_triggered_at else None,
                "last_success_at": row.last_success_at.isoformat() if row.last_success_at else None,
                "last_failure_reason": row.last_failure_reason,
                "total_deliveries": row.total_deliveries, "total_failures": row.total_failures,
                "latest_delivery_status": row.latest_delivery_status,
                "latest_delivery_at": row.latest_delivery_at.isoformat() if row.latest_delivery_at else None,
                "version": row.version,
                "manage_href": f"/events/{row.event_id}/settings/integrations?highlight={row.id}",
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
    candidates = await OrganiserAttentionQueryService(db).list_candidates(
        organization_id=org.id
    )
    tasks: list[dict[str, Any]] = []
    for candidate in candidates:
        event_id = candidate.id
        event_updated_at = candidate.updated_at
        if candidate.sessions_without_rooms:
            tasks.append({"id": f"{event_id}:sessions_without_rooms", "title": "Sessions", "description": "Sessions without assigned rooms", "count": candidate.sessions_without_rooms, "severity": "warning", "href": f"/events/{event_id}/program/sessions"})
        if candidate.pending_speakers:
            tasks.append({"id": f"{event_id}:pending_speakers", "title": "Speakers", "description": "Speakers pending uploads", "count": candidate.pending_speakers, "severity": "critical" if candidate.pending_speakers > 10 else "warning", "href": f"/events/{event_id}/speakers/directory"})
        if candidate.pending_registrations:
            tasks.append({"id": f"{event_id}:pending_registrations", "title": "Pending Approvals", "description": "Registrations require review", "count": candidate.pending_registrations, "severity": "critical", "href": f"/events/{event_id}/registration/approvals"})
        if candidate.payment_pending:
            tasks.append({"id": f"{event_id}:payment_reconciliation", "title": "Payment Reconciliation", "description": "Transactions need attention", "count": candidate.payment_pending, "severity": "warning", "href": f"/events/{event_id}/payments/reconciliation"})
        if not candidate.total_rooms:
            tasks.append({"id": f"{event_id}:venue_setup", "title": "Venue Setup", "description": "Configuration incomplete", "count": 1, "severity": "critical", "href": f"/events/{event_id}/setup/rooms-tracks"})
        freshness = datetime.now(timezone.utc).isoformat()
        for task in tasks:
            if task["id"].startswith(f"{event_id}:"):
                task["module"] = task["id"].split(":", 1)[-1]
                task["category"] = task["module"].split("_", 1)[0]
                task["entity_id"] = str(event_id)
                task["owner"] = None
                task["age_seconds"] = max(0, int((datetime.now(timezone.utc) - event_updated_at).total_seconds()))
                task["status"] = "open"
                task["source"] = "ORGANISER_NEEDS_ATTENTION_READ_MODEL"
                task["freshness_at"] = freshness
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
    return await OrganizerAttentionCommandService(db).assign(
        organization_id=org.id, task_id=task_id, actor=current_user,
        owner_user_id=payload.owner_user_id, if_match=if_match,
    )


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
    return await OrganizerAttentionCommandService(db).snooze(
        organization_id=org.id, task_id=task_id, actor=current_user,
        snoozed_until=payload.snoozed_until, reason=payload.reason,
        if_match=if_match,
    )


@router.patch("/needs-attention/{task_id}/resolve")
async def resolve_attention_task(task_id: str, payload: AttentionResolveWrite, if_match: int = Header(default=0, alias="If-Match", ge=0), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    return await OrganizerAttentionCommandService(db).resolve(
        organization_id=org.id, task_id=task_id, actor=current_user,
        resolution=payload.resolution, if_match=if_match,
    )


@router.get("/dashboard")
async def organiser_dashboard(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    unrestricted = bool(getattr(org, "has_unrestricted_capabilities", False))

    all_event_refs = await OrganiserReportQueryService(db).list_dashboard_event_refs(
        organization_id=org.id
    )
    event_ids = [row.id for row in all_event_refs]

    active_events = sum(1 for row in all_event_refs if row.status not in {"archived", "completed"})
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
            "events": {"used": len(all_event_refs), "max": max_events},
            "users": {"used": team_members, "max": max_users},
            "registrations": {"used": total_registrations, "max": max_registrations},
            "storage": {"used_mb": storage_used_mb, "max_mb": storage_quota_mb},
        }
    except Exception:
        pass

    today = date.today()
    trend = await OrganiserReportQueryService(db).registration_revenue_trend(
        event_ids=event_ids, today=today
    )

    event_rows, _ = await OrganiserReportQueryService(db).list_event_reports(
        organization_id=org.id, page=1, page_size=6, search=None
    )

    activity_rows, _ = await AuditQueryService(db).list_organization_activity(
        organization_id=org.id,
        resource_type=None,
        resource_types=None,
        page=1,
        page_size=6,
    )

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
            "events_used": int(usage.get("events", {}).get("used") or len(all_event_refs)),
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
    addons, assignments, requested_addon_keys = await OrganiserAddonQueryService(db).get_status_data(
        organization_id=org.id
    )

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
        for keys in requested_addon_keys
        for key in keys
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
    org = await _current_org(db, current_user)
    unrestricted = bool(org.has_unrestricted_capabilities)
    items = await OrganiserEntitlementQueryService(db).list_effective_features(
        organization_id=org.id, unrestricted=unrestricted
    )
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
        event_rows, event_total = await OrganiserReportQueryService(db).list_event_reports(
            organization_id=org.id, page=page, page_size=page_size, search=search
        )
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
    snapshot = {
        "domain": payload.domain, "format": payload.format, "status": "COMPLETED",
        "row_count": len(export_rows), "source": report.get("source"),
        "freshness_at": report.get("freshness_at"), "metrics": report.get("metrics") or {},
        "rows": export_rows,
    }
    return await OrganizerReportCommandService(db).create_export(
        organization_id=org.id, actor=current_user, snapshot=snapshot,
        idempotency_key=idempotency_key,
    )


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
    return await OrganizerReportCommandService(db).create_custom_report(
        organization_id=org.id, actor=current_user,
        values=payload.model_dump(), idempotency_key=idempotency_key,
    )


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
