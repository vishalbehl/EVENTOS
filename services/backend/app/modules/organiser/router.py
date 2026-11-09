from __future__ import annotations

import asyncio
import uuid
import hashlib
import json
import csv
import io
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import and_, delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db, require_step_up, require_active_user, TokenDep
from app.modules.billing.services.entitlement_resolver import EntitlementResolver
from app.modules.billing.services.invoice_pdf_service import (
    InvoicePdfSigningConfig,
    render_invoice_pdf,
)
from app.modules.billing.services.invoice_snapshot_service import build_invoice_pdf_snapshot
from app.modules.billing.models.billing_domain_tables import Invoice, InvoiceItem, PaymentMethod, PaymentMethodSetup
from app.modules.events.models.event import Event
from app.modules.events.services.event_mutation_service import EventMutationService
from app.modules.rbac.schemas.event import EventCreate
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.organization_console import (
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
from app.modules.files.models.file import Asset, AssetTag
from app.modules.files.services.file_service import FileService
from app.modules.presentations.services.upload_service import create_presigned_download
from app.config import settings
from app.modules.organiser.application.member_commands import OrganizationMemberCommandService
from app.modules.organiser.application.organization_commands import OrganizerOrganizationCommandService
from app.modules.organiser.application.billing_commands import OrganizerBillingCommandService
from app.modules.organiser.application.payment_method_commands import OrganizerPaymentMethodCommandService
from app.modules.billing.services.payment_method_provider_service import PaymentMethodProviderService
from app.modules.rbac.services.access_contexts import selected_request_context
from app.modules.rbac.services.platform_permissions import require_platform_permission
from app.core.tenant_context import TenantContextGuard
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
    OrganiserDashboardQueryService,
    OrganiserBillingQueryService,
    OrganiserDocumentQueryService,
    OrganiserApprovalRuleQueryService,
    OrganiserAccessQueryService,
)
from app.modules.platform.application.organization_team_commands import OrganizationTeamCommandService
from app.modules.rbac.services.access_administration import (
    scoped_branding_administration,
    scoped_member_administration,
    scoped_organization_profile,
    scoped_role_administration,
    scoped_team_administration,
)
from app.modules.rbac.schemas.teams import TeamCreationResult, TeamMutationResult, TeamReason, TeamBindingReason, TeamMemberMutationResult, TeamEventBindingWrite, TeamEventMutationResult, TeamEventActionsResult
from app.schemas.cursor_pagination import CursorPage


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
    model_config = {"extra": "forbid", "str_strip_whitespace": True}
    name: str = Field(min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    owner_member_id: uuid.UUID | None = None
    reason: str = Field(min_length=3, max_length=500)


class MemberSummary(BaseModel):
    total: int = Field(ge=0)
    active: int = Field(ge=0)
    pending: int = Field(ge=0)
    teams: int = Field(ge=0)
    role_assignments: int = Field(ge=0)


class MemberStatusWrite(BaseModel):
    model_config = {"extra": "forbid", "str_strip_whitespace": True}
    is_active: bool
    reason: str = Field(min_length=3, max_length=500)


class MemberRoleWrite(BaseModel):
    model_config = {"extra": "forbid", "str_strip_whitespace": True}
    org_role: str = Field(pattern=r"^(owner|admin|member|billing_only)$")
    reason: str = Field(min_length=3, max_length=500)


class BulkMemberRef(BaseModel):
    model_config = {"extra": "forbid"}
    id: uuid.UUID
    version: int = Field(ge=1)


class BulkMemberStatusWrite(BaseModel):
    model_config = {"extra": "forbid", "str_strip_whitespace": True}
    members: list[BulkMemberRef] = Field(min_length=1, max_length=100)
    is_active: bool
    reason: str = Field(min_length=3, max_length=500)


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
    model_config = {"extra": "forbid"}
    logo_asset_id: uuid.UUID | None = None
    favicon_asset_id: uuid.UUID | None = None
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
    model_config = {"extra": "forbid", "str_strip_whitespace": True}
    billing_name: str = Field(min_length=2, max_length=255)
    billing_email: str = Field(min_length=3, max_length=255)
    billing_phone: str | None = Field(default=None, max_length=50)
    gst_number: str | None = Field(default=None, max_length=40)
    country: str = Field(min_length=2, max_length=2)
    currency: str = Field(min_length=3, max_length=10)


class PaymentMethodSetupWrite(BaseModel):
    model_config = {"extra": "forbid", "str_strip_whitespace": True}
    provider: str | None = Field(default="STRIPE", pattern=r"^(STRIPE|RAZORPAY)$")
    return_url: str = Field(min_length=8, max_length=2000)


class PaymentMethodRetireWrite(BaseModel):
    model_config = {"extra": "forbid", "str_strip_whitespace": True}
    reason: str = Field(min_length=12, max_length=500)


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


class BillingAddressWrite(BaseModel):
    model_config = {"extra": "forbid", "str_strip_whitespace": True}
    line1: str | None = Field(default=None, max_length=255)
    line2: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=120)
    state: str | None = Field(default=None, max_length=120)
    postal_code: str | None = Field(default=None, max_length=30)
    country: str | None = Field(default=None, max_length=100)


class OrganizationProfileWrite(BaseModel):
    model_config = {"extra": "forbid", "str_strip_whitespace": True}
    name: str = Field(min_length=2, max_length=255)
    description: str | None = Field(default=None, max_length=500)
    legal_name: str | None = Field(default=None, max_length=255)
    registration_number: str | None = Field(default=None, max_length=100)
    organization_type: str | None = Field(default=None, max_length=50)
    industry: str | None = Field(default=None, max_length=50)
    billing_email: str | None = Field(default=None, max_length=255)
    contact_email: str | None = Field(default=None, max_length=255)
    contact_phone: str | None = Field(default=None, max_length=50)
    website_url: str | None = Field(default=None, max_length=2000)
    billing_address: BillingAddressWrite = Field(default_factory=BillingAddressWrite)
    portal_name: str | None = Field(default=None, max_length=255)
    country: str = Field(min_length=2, max_length=2)
    timezone: str = Field(min_length=1, max_length=50)
    language: str = Field(min_length=1, max_length=50)
    date_format: str = Field(min_length=1, max_length=20)
    time_format: str = Field(min_length=1, max_length=20)
    currency: str = Field(min_length=1, max_length=20)


def _organization_profile(org: Organization) -> dict[str, Any]:
    address = org.billing_address or {}
    return {
        "id": str(org.id), "name": org.name, "description": org.description, "legal_name": org.legal_name,
        "registration_number": org.registration_number, "organization_type": org.organization_type,
        "industry": org.industry, "billing_email": org.billing_email,
        "contact_email": org.contact_email, "contact_phone": org.contact_phone,
        "website_url": org.website_url,
        "billing_address": {key: address.get(key) for key in ("line1", "line2", "city", "state", "postal_code", "country") if address.get(key) is not None},
        "portal_name": org.portal_name, "country": org.country, "timezone": org.timezone,
        "language": org.language, "date_format": org.date_format, "time_format": org.time_format,
        "currency": org.currency, "logo_url": org.logo_url, "primary_color": org.primary_color,
        "secondary_color": org.secondary_color,
        "verification_status": org.verification_status, "version": org.profile_version,
        "lifecycle_state": org.lifecycle_state, "member_since": org.created_at.isoformat(),
        "updated_at": org.updated_at.isoformat(), "source": "platform.organizations",
    }


async def _current_org(db: AsyncSession, current_user: User) -> Organization:
    token = getattr(current_user, "_request_token_data", None)
    if token is None or not token.active_organization_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "ORGANIZATION_CONTEXT_REQUIRED"},
        )
    if token.access_mode != "DIRECT":
        raise HTTPException(status_code=403, detail={"code": "DIRECT_MEMBERSHIP_REQUIRED"})
    from app.modules.rbac.services.access_contexts import selected_request_context
    async with selected_request_context(db, current_user, token):
        org = await db.get(Organization, token.active_organization_id)
        if not org:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
        return org


async def _require_org_admin(db: AsyncSession, current_user: User, organization_id: uuid.UUID) -> None:
    member = await db.scalar(select(OrganizationMember).where(
        OrganizationMember.organization_id == organization_id,
        OrganizationMember.user_id == current_user.id,
        OrganizationMember.is_active.is_(True),
        OrganizationMember.accepted_at.is_not(None),
    ))
    if not member or member.org_role not in {"owner", "admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"code": "ORGANIZATION_ADMIN_REQUIRED"})


@router.get("/organisation/profile", dependencies=[Depends(scoped_organization_profile)])
async def get_organiser_profile(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    return _organization_profile(await _current_org(db, current_user))


@router.put("/organisation/profile", dependencies=[Depends(scoped_organization_profile)])
async def update_organiser_profile(payload: OrganizationProfileWrite, if_match: int = Header(..., alias="If-Match", ge=1), idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    updated = await OrganizerOrganizationCommandService(db).update_profile(
        organization_id=org.id, actor=current_user, values=payload.model_dump(), if_match=if_match,
        idempotency_key=idempotency_key,
    )
    return _organization_profile(updated)


def _custom_field_out(row: OrganizationCustomField) -> dict[str, Any]:
    return {"id": str(row.id), "field_key": row.field_key, "label": row.label, "field_type": row.field_type, "required": row.required, "options": row.options, "is_active": row.is_active, "version": row.version, "updated_at": row.updated_at.isoformat()}


@router.get("/teams", dependencies=[Depends(scoped_team_administration)])
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


@router.get("/members", dependencies=[Depends(scoped_member_administration)])
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


@router.get("/members/summary", response_model=MemberSummary, dependencies=[Depends(scoped_member_administration)])
async def organiser_member_summary(current_user: User = Depends(require_active_user), db: AsyncSession = Depends(get_db)):
    org = await _current_org(db, current_user)
    # Count at the database; do not load a directory to manufacture totals.
    m = OrganizationMember.__table__
    row = (await db.execute(select(
        func.count(m.c.id).label("total"),
        func.count(m.c.id).filter(m.c.is_active.is_(True), m.c.accepted_at.is_not(None)).label("active"),
        func.count(m.c.id).filter(m.c.is_active.is_(True), m.c.accepted_at.is_(None)).label("pending"),
    ).where(m.c.organization_id == org.id))).one()
    teams = int(await db.scalar(select(func.count(OrganizationTeam.id)).where(
        OrganizationTeam.organization_id == org.id, OrganizationTeam.deleted_at.is_(None)
    )) or 0)
    role_assignments = int(await db.scalar(select(func.count(UserRoleAssignment.id)).where(
        UserRoleAssignment.organization_id == org.id, UserRoleAssignment.revoked_at.is_(None)
    )) or 0)
    return {"total": row.total, "active": row.active, "pending": row.pending, "teams": teams, "role_assignments": role_assignments}


@router.get("/members/cursor", response_model=CursorPage[dict], dependencies=[Depends(scoped_member_administration)])
async def organiser_members_cursor(
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    search: str | None = Query(default=None, max_length=160),
    member_status: str | None = Query(default=None, alias="status", pattern=r"^(active|inactive|pending|accepted)$"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CursorPage[dict]:
    """Stable seek pagination; the offset response remains for compatibility."""
    org = await _current_org(db, current_user)
    return await OrganiserMemberQueryService(db).list_members_cursor(
        organization_id=org.id,
        cursor=cursor,
        limit=limit,
        search=search,
        member_status=member_status,
    )


@router.post("/invitations/{member_id}/resend", dependencies=[Depends(scoped_member_administration)])
async def resend_organiser_invitation(member_id: uuid.UUID, response: Response, if_match: int = Header(..., alias="If-Match", ge=1), idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    response.headers["Cache-Control"] = "no-store"
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    member, token = await OrganizationMemberCommandService(db).resend_invitation(organization_id=org.id, member_id=member_id, actor=current_user, if_match=if_match, idempotency_key=idempotency_key)
    return {"id": str(member.id), "message": "Invitation link replaced. Share the new link; the previous one no longer works.", "version": member.version,
            "invite_token": token, "expires_at": member.invite_expires_at.isoformat(), "delivery_mode": "MANUAL", "replayed": token is None}


@router.delete("/invitations/{member_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response, response_model=None, dependencies=[Depends(scoped_member_administration)])
async def revoke_organiser_invitation(member_id: uuid.UUID, if_match: int = Header(..., alias="If-Match", ge=1), idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=16, max_length=160), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> Response:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    await OrganizationMemberCommandService(db).revoke_invitation(organization_id=org.id, member_id=member_id, actor=current_user, if_match=if_match, idempotency_key=idempotency_key)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/members/{member_id}/role", dependencies=[Depends(scoped_member_administration)])
async def update_organiser_member_role(member_id: uuid.UUID, payload: MemberRoleWrite, if_match: int = Header(..., alias="If-Match", ge=1), idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=16, max_length=160), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    member = await OrganizationMemberCommandService(db).update_role(organization_id=org.id, member_id=member_id, actor=current_user, org_role=payload.org_role, if_match=if_match, reason=payload.reason, idempotency_key=idempotency_key)
    return {"id": str(member.id), "org_role": member.org_role, "version": member.version}


@router.patch("/members/{member_id}/status", dependencies=[Depends(scoped_member_administration)])
async def update_organiser_member_status(member_id: uuid.UUID, payload: MemberStatusWrite, if_match: int = Header(..., alias="If-Match", ge=1), idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=16, max_length=160), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    member = await OrganizationMemberCommandService(db).update_status(organization_id=org.id, member_id=member_id, actor=current_user, is_active=payload.is_active, if_match=if_match, reason=payload.reason, idempotency_key=idempotency_key)
    return {"id": str(member.id), "is_active": member.is_active, "version": member.version}


@router.patch("/members-bulk/status", dependencies=[Depends(scoped_member_administration)])
async def bulk_update_organiser_member_status(payload: BulkMemberStatusWrite, idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=16, max_length=160), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    updated = await OrganizationMemberCommandService(db).bulk_update_status(
        organization_id=org.id,
        members=[(item.id, item.version) for item in payload.members],
        actor=current_user,
        is_active=payload.is_active,
        reason=payload.reason,
        idempotency_key=idempotency_key,
    )
    return {"items": updated, "updated": len(updated)}


@router.post("/teams", status_code=status.HTTP_201_CREATED, response_model=TeamCreationResult, dependencies=[Depends(scoped_team_administration)])
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
        reason=payload.reason,
        idempotency_key=idempotency_key,
    )
    return row


@router.patch("/teams/{team_id}", response_model=TeamMutationResult, dependencies=[Depends(scoped_team_administration)])
async def update_organiser_team(
    team_id: uuid.UUID,
    payload: TeamWrite,
    expected_version: int | None = Header(None, alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=160),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    row = await OrganizationTeamCommandService(db).update(
        organization_id=org.id, team_id=team_id, actor=current_user,
        name=payload.name, description=payload.description,
        owner_member_id=payload.owner_member_id, if_match=expected_version,
        reason=payload.reason, idempotency_key=idempotency_key,
    )
    return row


@router.delete("/teams/{team_id}", response_model=TeamMutationResult, dependencies=[Depends(scoped_team_administration)])
async def delete_organiser_team(
    team_id: uuid.UUID,
    payload: TeamReason,
    expected_version: int | None = Header(None, alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=160),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    result = await OrganizationTeamCommandService(db).archive(
        organization_id=org.id, team_id=team_id, actor=current_user,
        if_match=expected_version, reason=payload.reason, idempotency_key=idempotency_key,
        audit_action="ORGANIZATION_TEAM_DELETED",
    )
    return result


@router.post("/teams/{team_id}/members/{member_id}", response_model=TeamMemberMutationResult, dependencies=[Depends(scoped_team_administration)])
async def assign_organiser_team_member(
    team_id: uuid.UUID,
    member_id: uuid.UUID,
    payload: TeamBindingReason,
    expected_version: int | None = Header(None, alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=160),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    return await OrganizationTeamCommandService(db).assign_member(
        organization_id=org.id, team_id=team_id, member_id=member_id,
        actor=current_user, reason=payload.reason, if_match=expected_version,
        idempotency_key=idempotency_key,
    )


@router.delete("/teams/{team_id}/members/{member_id}", response_model=TeamMemberMutationResult, dependencies=[Depends(scoped_team_administration)])
async def remove_organiser_team_member(
    team_id: uuid.UUID,
    member_id: uuid.UUID,
    payload: TeamBindingReason,
    expected_version: int | None = Header(None, alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=160),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    return await OrganizationTeamCommandService(db).unassign_member(
        organization_id=org.id, team_id=team_id, member_id=member_id,
        actor=current_user, reason=payload.reason, if_match=expected_version,
        idempotency_key=idempotency_key,
        audit_action="ORGANIZATION_TEAM_MEMBER_REMOVED",
    )


@router.get("/teams/{team_id}/members/{member_id}/access-loss-preview", dependencies=[Depends(scoped_team_administration)])
async def preview_team_member_access_loss(team_id: uuid.UUID, member_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    preview = await OrganiserTeamQueryService(db).preview_member_access_loss(
        organization_id=org.id, team_id=team_id, member_id=member_id
    )
    if preview is None:
        raise HTTPException(status_code=404, detail={"code": "TEAM_MEMBERSHIP_NOT_FOUND"})
    return {**preview, "impact_status": "PARTIAL", "source": "organizer_access.team_binding_projection", "freshness_at": datetime.now(timezone.utc).isoformat()}


@router.get("/teams/event-actions", response_model=TeamEventActionsResult, dependencies=[Depends(scoped_team_administration)])
async def organiser_team_event_actions(event_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.modules.rbac.services.event_scope import customer_event
    from app.modules.rbac.services.permission_service import get_user_permissions
    from app.modules.rbac.services.permission_catalogue import OPERATIONAL_ACTIONS
    org = await _current_org(db, current_user)
    await customer_event(db, current_user, event_id)
    actions = set(await get_user_permissions(db, current_user.id, organization_id=org.id, event_id=event_id))
    return {"event_id": event_id, "actions": sorted(actions & OPERATIONAL_ACTIONS)}


@router.put("/teams/{team_id}/events/{event_id}", response_model=TeamEventMutationResult, dependencies=[Depends(scoped_team_administration)])
async def assign_organiser_team_event(
    team_id: uuid.UUID,
    event_id: uuid.UUID,
    payload: TeamEventBindingWrite,
    expected_version: int | None = Header(None, alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=160),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    return await OrganizationTeamCommandService(db).assign_event(
        organization_id=org.id, team_id=team_id, event_id=event_id,
        actor=current_user, permissions=payload.permissions,
        reason=payload.reason, if_match=expected_version, idempotency_key=idempotency_key,
    )


@router.delete("/teams/{team_id}/events/{event_id}", response_model=TeamEventMutationResult, dependencies=[Depends(scoped_team_administration)])
async def remove_organiser_team_event(
    team_id: uuid.UUID,
    event_id: uuid.UUID,
    payload: TeamBindingReason,
    expected_version: int | None = Header(None, alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=160),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    return await OrganizationTeamCommandService(db).unassign_event(
        organization_id=org.id, team_id=team_id, event_id=event_id,
        actor=current_user, reason=payload.reason, if_match=expected_version, idempotency_key=idempotency_key,
    )


@router.get("/teams/{team_id}/events/{event_id}/access-loss-preview", dependencies=[Depends(scoped_team_administration)])
async def preview_team_event_access_loss(team_id: uuid.UUID, event_id: uuid.UUID, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    preview = await OrganiserTeamQueryService(db).preview_event_access_loss(
        organization_id=org.id, team_id=team_id, event_id=event_id
    )
    if preview is None:
        raise HTTPException(status_code=404, detail={"code": "TEAM_EVENT_ASSIGNMENT_NOT_FOUND"})
    return {**preview, "impact_status": "PARTIAL", "source": "organizer_access.team_binding_projection", "freshness_at": datetime.now(timezone.utc).isoformat()}


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
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    return await OrganizerLocationCommandService(db).create(
        organization_id=org.id, actor=current_user, values=payload.model_dump(),
        idempotency_key=idempotency_key,
    )


@router.put("/locations/{location_id}")
async def update_organiser_location(
    location_id: uuid.UUID,
    payload: LocationWrite,
    if_match: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    return await OrganizerLocationCommandService(db).update(
        organization_id=org.id, location_id=location_id, actor=current_user,
        values=payload.model_dump(), if_match=if_match, idempotency_key=idempotency_key,
    )


@router.get("/events")
async def organiser_events(
    status_filter: str | None = Query(default=None, alias="status", pattern=r"^(live|upcoming|completed|draft|archived)$"),
    search: str | None = Query(default=None, max_length=120),
    year: int | None = Query(default=None, ge=2000, le=2200),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    from app.modules.rbac.services.event_scope import listed_event_predicate
    today = date.today()
    rows, total, summary = await OrganiserEventQueryService(db).list_events(
        organization_id=org.id,
        status_filter=status_filter,
        search=search,
        year=year,
        page=page,
        page_size=page_size,
        today=today,
        access_predicate=listed_event_predicate(db, current_user.id, org.id),
    )
    items: list[dict[str, Any]] = []
    for event in rows:
        display_status = "live" if event.status == "active" and event.start_date <= today <= event.end_date else "upcoming" if event.start_date > today and event.status != "draft" else event.status
        items.append({
            "id": str(event.id), "name": event.name, "short_code": event.short_code,
            "version": int(getattr(event, "version", 1) or 1),
            "start_date": event.start_date.isoformat() if hasattr(event.start_date, "isoformat") else str(event.start_date or ""),
            "end_date": event.end_date.isoformat() if hasattr(event.end_date, "isoformat") else str(event.end_date or ""),
            "venue": event.venue_name or event.location, "country": event.country,
            "timezone": event.timezone, "owner": event.organizer_name,
            "banner_url": event.banner_url,
            "status": display_status, "source_status": event.status,
            "registrations": event.registrations, "readiness_pct": event.readiness_pct,
            "created_at": event.created_at.isoformat() if hasattr(event.created_at, "isoformat") else str(event.created_at or ""),
            "updated_at": event.updated_at.isoformat() if hasattr(event.updated_at, "isoformat") else str(event.updated_at or ""),
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
    token: TokenDep,
    if_match: int = Header(..., alias="If-Match", ge=1),
    reason: str = Header(..., alias="X-Change-Reason", min_length=12, max_length=1000),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=16, max_length=160),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    async with selected_request_context(
        db, current_user, token, event_id=event_id, action="EVENTS:EDIT", write=True,
        include_archived_event=True,
    ) as context:
        return await OrganizerEventCommandService(db).restore(
            organization_id=context.organization_id, event_id=event_id, actor=current_user,
            reason=reason, expected_version=if_match, idempotency_key=idempotency_key,
        )


@router.get("/billing/summary")
async def organiser_billing_summary(
    token: TokenDep,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Bounded organiser billing header and overview projection."""
    org = await _current_org(db, current_user)
    await _require_billing_authority(db, current_user, token, action="billing:view")
    contract = await EntitlementResolver.get_active_contract(db, org.id)
    offer = contract.offer if contract else None
    invoice_rows, total_invoices = await OrganiserBillingQueryService(db).list_invoices(
        organization_id=org.id, page=1, page_size=5, receipts_only=False
    )
    outstanding = float(await db.scalar(select(func.coalesce(func.sum(Invoice.total_amount_inr), 0)).where(
        Invoice.organization_id == org.id,
        func.lower(Invoice.status).in_(["unpaid", "open", "overdue", "pending"]),
    )) or 0)
    payment_method = await db.scalar(select(PaymentMethod).where(
        PaymentMethod.organization_id == org.id,
        PaymentMethod.retired_at.is_(None),
    ).order_by(PaymentMethod.is_default.desc(), PaymentMethod.created_at.desc()).limit(1))
    dashboard_metrics = await OrganiserDashboardQueryService(db).metrics(organization_id=org.id)
    organization_email_usage = await OrganiserBillingQueryService(db).get_organization_email_usage(
        organization_id=org.id
    )
    unrestricted = bool(org.has_unrestricted_capabilities)
    limit_keys = ("max_events", "max_users", "max_registrations", "storage_quota_mb")
    limits = ({key: None for key in limit_keys} if unrestricted else
              await EntitlementResolver.get_org_limits(db, org.id, limit_keys))
    response.headers["Cache-Control"] = "no-store"
    return {
        "plan": {
            "name": "Enterprise" if unrestricted else (offer.name if offer else "Not configured"),
            "status": "ACTIVE" if unrestricted or contract else "UNAVAILABLE",
            "billing_cycle": "PLATFORM" if unrestricted else getattr(contract, "billing_interval", None),
            "renews_at": getattr(contract, "ends_at", None),
            "unrestricted": unrestricted,
        },
        "outstanding": outstanding,
        "invoice_count": total_invoices,
        "usage": {
            "registrations": {"used": dashboard_metrics["total_registrations"], "max": limits["max_registrations"]},
            "active_events": {"used": dashboard_metrics["active_events"], "max": limits["max_events"]},
            "team_members": {"used": dashboard_metrics["team_members"], "max": limits["max_users"]},
            "organization_email_credits": {
                "used": organization_email_usage["used"],
                "max": organization_email_usage["allowed"],
                "source": "active_workspace_plan_allocations",
            },
            "storage_gb": {
                "used": round(float(dashboard_metrics["storage_used_bytes"]) / (1024 ** 3), 2),
                "max": None if limits["storage_quota_mb"] is None else round(float(limits["storage_quota_mb"]) / 1024, 2),
            },
        },
        "recent_invoices": [{
            "id": str(row.id), "reference": row.invoice_number or row.stripe_invoice_id,
            "status": row.status, "amount": float(row.total_amount_inr or row.amount),
            "currency": row.currency, "issued_at": row.issued_at.isoformat(),
        } for row in invoice_rows],
        "default_payment_method": None if payment_method is None else {
            "id": str(payment_method.id), "provider": payment_method.provider,
            "card_brand": payment_method.card_brand, "card_last4": payment_method.card_last4,
            "expires_month": payment_method.expires_month, "expires_year": payment_method.expires_year,
            "version": payment_method.version,
        },
        "freshness_at": datetime.now(timezone.utc).isoformat(),
        "source": "commerce.organiser_billing_summary",
    }


@router.get("/internal-enterprise/summary")
async def internal_enterprise_summary(
    token: TokenDep,
    response: Response,
    current_user: User = Depends(require_platform_permission("platform:billing:view")),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Read-only self projection for the canonical Eventos platform tenant.

    Platform identities are deliberately not customer members and therefore
    cannot use customer commercial endpoints.  This endpoint exposes only the
    signed-in platform tenant's own unrestricted-plan and usage projection; it
    cannot select or inspect another customer organisation.
    """
    if (
        token.access_mode != "DIRECT"
        or token.active_organization_id != current_user.organization_id
    ):
        raise HTTPException(status_code=404, detail={"code": "INTERNAL_ENTERPRISE_CONTEXT_NOT_FOUND"})

    org = await db.scalar(
        select(Organization)
        .where(
            Organization.id == token.active_organization_id,
            Organization.is_platform_org.is_(True),
            Organization.is_internal_unrestricted.is_(True),
            Organization.is_active.is_(True),
            Organization.suspended_at.is_(None),
            Organization.archived_at.is_(None),
        )
        .execution_options(skip_tenant_filter=True)
    )
    if org is None or not org.has_unrestricted_capabilities:
        raise HTTPException(status_code=404, detail={"code": "INTERNAL_ENTERPRISE_CONTEXT_NOT_FOUND"})

    six_months_ago = datetime.now(timezone.utc) - timedelta(days=190)
    async with TenantContextGuard.scoped(db, org.id):
        metrics = await OrganiserDashboardQueryService(db).metrics(organization_id=org.id)
        recent_invoices = list((await db.scalars(
            select(Invoice)
            .where(Invoice.organization_id == org.id)
            .order_by(Invoice.issued_at.desc())
            .limit(8)
        )).all())
        trend_rows = (await db.execute(
            select(
                func.date_trunc("month", Invoice.issued_at).label("month"),
                func.coalesce(func.sum(Invoice.total_amount_inr), 0).label("amount"),
            )
            .where(
                Invoice.organization_id == org.id,
                Invoice.issued_at >= six_months_ago,
                func.lower(Invoice.status).not_in(["void", "cancelled"]),
            )
            .group_by("month")
            .order_by("month")
        )).all()

    usage_values = {
        "registrations": float(metrics["total_registrations"]),
        "active_events": float(metrics.get("active_events", metrics.get("total_events", 0))),
        "team_members": float(metrics["team_members"]),
        "organization_email_credits": 0,
        "storage_gb": round(float(metrics["storage_used_bytes"]) / (1024 ** 3), 2),
    }
    usage_items = [
        {
            "id": f"internal-enterprise:{key}",
            "entitlement_key": key,
            "total": None,
            "reserved": 0,
            "consumed": value,
            "remaining": None,
            "unit_type": "GB" if key == "storage_gb" else None,
            "status": "ACTIVE",
        }
        for key, value in usage_values.items()
    ]
    invoice_projection = [
        {
            "id": str(row.id),
            "reference": row.invoice_number or row.stripe_invoice_id,
            "status": row.status,
            "amount": float(row.total_amount_inr or row.amount),
            "currency": row.currency,
            "issued_at": row.issued_at.isoformat(),
        }
        for row in recent_invoices
    ]
    response.headers["Cache-Control"] = "no-store"
    return {
        "plan": {
            "name": "Enterprise",
            "status": "ACTIVE",
            "billing_cycle": "PLATFORM",
            "renews_at": None,
            "unrestricted": True,
        },
        "usage": {
            key: {"used": value, "max": None}
            for key, value in usage_values.items()
        },
        "recent_invoices": invoice_projection[:5],
        "outstanding": 0,
        "invoice_count": len(recent_invoices),
        "default_payment_method": None,
        "commercial": {
            "plan": {"name": "Enterprise", "status": "ACTIVE", "unrestricted": True},
            "account": {"account_type": "PLATFORM", "status": "ACTIVE", "currency": org.currency},
            "active_contracts": 0,
            "contracts": [],
            "usage": {"items": usage_items},
            "open_orders": 0,
            "recent_orders": [],
            "purchased_addons": 0,
            "recent_purchases": [],
            "commitment_trend": [
                {"month": row.month.isoformat(), "amount": float(row.amount or 0)}
                for row in trend_rows
            ],
            "recent_transactions": invoice_projection,
            "source": "platform.internal_enterprise_self_projection",
        },
        "freshness_at": datetime.now(timezone.utc).isoformat(),
        "source": "platform.internal_enterprise_self_projection",
    }


async def _require_billing_authority(
    db: AsyncSession, current_user: User, token: TokenDep, *, action: str, write: bool = False,
) -> None:
    if token.access_mode != "DIRECT":
        raise HTTPException(status_code=403, detail={"code": "DIRECT_BILLING_MEMBERSHIP_REQUIRED"})
    async with selected_request_context(
        db, current_user, token, action=action, write=write,
    ):
        return


async def _require_payment_method_authority(
    db: AsyncSession, current_user: User, token: TokenDep,
) -> None:
    await _require_billing_authority(
        db, current_user, token, action="billing:purchase", write=True,
    )


@router.post(
    "/billing/payment-methods/setup-session",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_step_up)],
)
async def create_organiser_payment_method_setup(
    payload: PaymentMethodSetupWrite,
    token: TokenDep,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=16, max_length=160),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_payment_method_authority(db, current_user, token)
    return await PaymentMethodProviderService.create_setup_session(
        db, organization=org, actor=current_user, provider=payload.provider,
        return_url=payload.return_url, idempotency_key=idempotency_key,
    )


@router.get("/billing/payment-method-setups/{setup_id}")
async def get_organiser_payment_method_setup(
    setup_id: uuid.UUID,
    token: TokenDep,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_billing_authority(db, current_user, token, action="billing:view")
    row = await db.scalar(select(PaymentMethodSetup).where(
        PaymentMethodSetup.id == setup_id,
        PaymentMethodSetup.organization_id == org.id,
    ))
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "PAYMENT_METHOD_SETUP_NOT_FOUND"})
    status_value = row.status
    if status_value == "PENDING" and row.expires_at <= datetime.now(timezone.utc):
        status_value = "EXPIRED"
    response.headers["Cache-Control"] = "no-store"
    return {
        "id": str(row.id), "status": status_value,
        "expires_at": row.expires_at.isoformat(),
        "completed_at": row.completed_at.isoformat() if row.completed_at else None,
    }


@router.patch(
    "/billing/payment-methods/{payment_method_id}/default",
    dependencies=[Depends(require_step_up)],
)
async def set_organiser_default_payment_method(
    payment_method_id: uuid.UUID,
    token: TokenDep,
    if_match: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=16, max_length=160),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_payment_method_authority(db, current_user, token)
    return await OrganizerPaymentMethodCommandService(db).set_default(
        organization_id=org.id, payment_method_id=payment_method_id,
        actor=current_user, if_match=if_match, idempotency_key=idempotency_key,
    )


@router.delete(
    "/billing/payment-methods/{payment_method_id}",
    dependencies=[Depends(require_step_up)],
)
async def retire_organiser_payment_method(
    payment_method_id: uuid.UUID,
    payload: PaymentMethodRetireWrite,
    token: TokenDep,
    if_match: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=16, max_length=160),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_payment_method_authority(db, current_user, token)
    return await OrganizerPaymentMethodCommandService(db).retire(
        organization_id=org.id, payment_method_id=payment_method_id,
        actor=current_user, if_match=if_match, idempotency_key=idempotency_key,
        reason=payload.reason,
    )


@router.get("/billing/{section}")
async def organiser_billing(
    section: str,
    token: TokenDep,
    response: Response,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_billing_authority(db, current_user, token, action="billing:view")
    response.headers["Cache-Control"] = "no-store"
    offset = (page - 1) * page_size

    if section in {"overview", "invoices", "receipts"}:
        rows, total = await OrganiserBillingQueryService(db).list_invoices(
            organization_id=org.id, page=page, page_size=page_size,
            receipts_only=section == "receipts",
        )
        invoice_ids = [row.id for row in rows]
        item_rows = list((await db.scalars(
            select(InvoiceItem).where(InvoiceItem.invoice_id.in_(invoice_ids))
            .order_by(InvoiceItem.invoice_id, InvoiceItem.id)
        )).all()) if invoice_ids else []
        items_by_invoice: dict[uuid.UUID, list[dict[str, Any]]] = {}
        for item in item_rows:
            items_by_invoice.setdefault(item.invoice_id, []).append({
                "id": str(item.id),
                "description": item.description,
                "offer_code": item.commercial_offer_code,
                "offer_version_id": str(item.commercial_offer_version_id) if item.commercial_offer_version_id else None,
                "contract_item_id": str(item.commercial_contract_item_id) if item.commercial_contract_item_id else None,
                "quantity": item.quantity,
                "amount": float(item.amount),
                "tax_rate": float(item.tax_rate or 0),
                "tax_amount": float(item.tax_amount or 0),
            })
        items = [{
            "id": str(row.id), "reference": row.invoice_number or row.stripe_invoice_id,
            "receipt_number": row.invoice_number if section == "receipts" and row.paid_at else None,
            "invoice_number": row.invoice_number or row.stripe_invoice_id,
            "payment_reference": row.stripe_invoice_id,
            "issued_at": row.issued_at.isoformat(), "due_date": row.due_date.isoformat() if row.due_date else None,
            "paid_at": row.paid_at.isoformat() if row.paid_at else None, "status": row.status,
            "amount": float(row.total_amount_inr or row.amount), "gst_amount": float(row.gst_amount or 0),
            "currency": row.currency, "version": row.version,
            "line_items": items_by_invoice.get(row.id, []),
        } for row in rows]
        return _page(items, total, page, page_size, "commerce.invoices")

    if section in {"transactions", "payments"}:
        rows, total = await OrganiserBillingQueryService(db).list_transactions(
            organization_id=org.id, page=page, page_size=page_size
        )
        items = [{
            "id": str(row.id), "reference": row.stripe_invoice_id or str(row.id),
            "created_at": row.issued_at.isoformat(), "provider": "INVOICE", "status": row.status,
            "amount": float(row.total_amount_inr or row.amount), "refunded_amount": 0,
            "currency": row.currency, "reconciliation_status": "RECONCILED" if row.paid_at else "PENDING",
        } for row in rows]
        return _page(items, total, page, page_size, "commerce.invoices")

    if section == "payment-methods":
        rows, total = await OrganiserBillingQueryService(db).list_payment_methods(
            organization_id=org.id, page=page, page_size=page_size
        )
        items = [{
            "id": str(row.id), "provider": row.provider, "card_brand": row.card_brand,
            "card_last4": row.card_last4, "is_default": row.is_default,
            "expires_month": row.expires_month, "expires_year": row.expires_year,
            "version": row.version, "created_at": row.created_at.isoformat(),
        } for row in rows]
        return _page(items, total, page, page_size, "commerce.payment_methods")

    if section == "credits":
        rows, total = await OrganiserBillingQueryService(db).list_credits(
            organization_id=org.id, page=page, page_size=page_size
        )
        items = [{
            "id": str(row.id), "amount": float(row.amount_inr), "currency": "INR",
            "credit_type": row.credit_type, "reason": row.reason, "is_used": row.is_used,
            "applied_at": row.applied_at.isoformat(), "expires_at": row.expires_at.isoformat() if row.expires_at else None,
        } for row in rows]
        return _page(items, total, page, page_size, "commerce.org_credits")

    if section == "tax":
        profile, latest = await OrganiserBillingQueryService(db).get_tax_profile(
            organization_id=org.id
        )
        return {
            "billing_name": profile.billing_name if profile else latest.billing_name if latest else org.name,
            "billing_email": profile.billing_email if profile else latest.billing_email if latest else org.billing_email,
            "billing_phone": profile.billing_phone if profile else latest.billing_phone if latest else None,
            "gst_number": profile.gst_number if profile else latest.gst_number if latest else None,
            "country": profile.country if profile else org.country,
            "currency": profile.currency if profile else latest.currency if latest else org.currency,
            "version": profile.version if profile else 0,
            "freshness_at": (profile.updated_at if profile else latest.updated_at if latest else org.updated_at).isoformat(),
            "source": "commerce.organization_billing_profiles" if profile else "platform.organizations",
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
    rows, total = await OrganiserDocumentQueryService(db).list_current(
        organization_id=org.id, page=page, page_size=page_size
    )
    items = [{"id": str(row.id), "document_group_id": str(row.document_group_id), "revision": row.revision, "name": row.name, "document_type": row.document_type, "owner_name": f"{row.first_name} {row.last_name}".strip() or row.email, "expires_at": row.expires_at.isoformat() if row.expires_at else None, "verification_status": row.verification_status, "processing_status": row.processing_status, "version": row.version, "download_url": f"/api/v1/files/{row.asset_id}/download" if row.processing_status == "READY" else None, "updated_at": row.updated_at.isoformat()} for row in rows]
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
    rows = await OrganiserDocumentQueryService(db).list_history(
        organization_id=org.id, document_id=document_id
    )
    if rows is None: raise HTTPException(status_code=404, detail={"code": "DOCUMENT_NOT_FOUND"})
    return {"items": [{"id": str(row.id), "revision": row.revision, "name": row.name, "owner_name": f"{row.first_name} {row.last_name}".strip() or row.email, "processing_status": row.asset_processing_status, "is_current": row.is_current, "created_at": row.created_at.isoformat(), "download_url": f"/api/v1/files/{row.asset_id}/download" if row.asset_processing_status == "READY" else None} for row in rows], "source": "platform.organization_documents+content.assets", "freshness_at": datetime.now(timezone.utc).isoformat()}


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
    rows, total = await OrganiserApprovalRuleQueryService(db).list_rules(
        organization_id=org.id, page=page, page_size=page_size
    )
    return _page([{"id": str(row.id), "name": row.name, "domain": row.domain, "scope": "event" if row.event_id else "workspace", "event_id": str(row.event_id) if row.event_id else None, "approver_count": len(row.approver_chain), "approver_chain": row.approver_chain, "conditions": row.conditions, "status": row.status, "version": row.version} for row in rows], total, page, page_size, "organizer_access.organization_approval_rules")


@router.post("/access/approval-rules", status_code=status.HTTP_201_CREATED)
async def create_organiser_approval_rule(payload: ApprovalRuleWrite, idempotency_key: str | None = Header(None, alias="Idempotency-Key"), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    row = await OrganizerApprovalRuleCommandService(db).create(
        organization_id=org.id, actor=current_user, values=payload.model_dump(),
        idempotency_key=idempotency_key,
    )
    return {"id": str(row.id), "name": row.name, "domain": row.domain, "version": row.version}


@router.put("/access/approval-rules/{rule_id}")
async def update_organiser_approval_rule(rule_id: uuid.UUID, payload: ApprovalRuleWrite, if_match: int = Header(..., alias="If-Match", ge=1), idempotency_key: str | None = Header(None, alias="Idempotency-Key"), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    org = await _current_org(db, current_user); await _require_org_admin(db, current_user, org.id)
    row = await OrganizerApprovalRuleCommandService(db).update(
        organization_id=org.id, rule_id=rule_id, actor=current_user,
        values=payload.model_dump(), if_match=if_match, idempotency_key=idempotency_key,
    )
    return {"id": str(row.id), "name": row.name, "domain": row.domain, "version": row.version}


@router.put("/billing/tax", dependencies=[Depends(require_step_up)])
async def update_organiser_billing_profile(
    payload: BillingProfileWrite,
    token: TokenDep,
    expected_version: int = Header(..., alias="If-Match", ge=0),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=16, max_length=160),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_billing_authority(db, current_user, token, action="billing:purchase", write=True)
    profile = await OrganizerBillingCommandService(db).update_profile(
        organization_id=org.id, actor=current_user, values=payload.model_dump(),
        expected_version=expected_version, idempotency_key=idempotency_key,
    )
    return {**payload.model_dump(), "id": str(profile.id), "version": profile.version, "source": "commerce.organization_billing_profiles", "freshness_at": profile.updated_at.isoformat()}


@router.get("/billing/invoices/{invoice_id}/download")
async def download_organiser_invoice(
    invoice_id: uuid.UUID,
    token: TokenDep,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    org = await _current_org(db, current_user)
    await _require_billing_authority(db, current_user, token, action="billing:view")
    invoice = await OrganiserBillingQueryService(db).get_invoice_for_download(
        organization_id=org.id, invoice_id=invoice_id
    )
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "INVOICE_NOT_FOUND"})
    snapshot = await build_invoice_pdf_snapshot(
        db,
        organization=org,
        invoice=invoice,
        settings=settings,
    )
    signing_config = InvoicePdfSigningConfig.from_settings(settings)
    try:
        pdf_bytes = await asyncio.to_thread(
            render_invoice_pdf,
            snapshot,
            signing_config=signing_config,
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "INVOICE_SIGNATURE_UNAVAILABLE",
                "message": "Signed invoice generation is temporarily unavailable.",
            },
        ) from exc
    await AuditService.write_log(AuditContext(
        organization_id=org.id,
        actor_user_id=current_user.id,
        actor_role=current_user.role,
        resource_type="invoice",
        resource_id=invoice.id,
        action_type="ORGANIZATION_INVOICE_DOWNLOADED",
        new_state={
            "format": "pdf",
            "invoice_version": invoice.version,
            "cryptographic_signature_required": signing_config.required,
            "cryptographic_signature_applied": bool(signing_config.pkcs12_path),
        },
        is_sensitive=True,
    ))
    reference = str(invoice.invoice_number or invoice.id)
    safe_reference = "".join(char for char in reference if char.isalnum() or char in {"-", "_"})[:120] or str(invoice.id)
    filename = f"invoice-{safe_reference}.pdf"
    return Response(content=pdf_bytes, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
    })


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
    search: str | None = Query(default=None, max_length=160),
    actor_role: str | None = Query(default=None, max_length=100),
    occurred_from: datetime | None = None,
    occurred_to: datetime | None = None,
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
        search=search,
        actor_role=actor_role,
        occurred_from=occurred_from,
        occurred_to=occurred_to,
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
    resource_types = [value.strip() for value in resource.split(",") if value.strip()] if resource else None
    rows = await AuditQueryService(db).list_organization_export(
        organization_id=org.id, resource_types=resource_types
    )
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "occurred_at", "action", "resource_type", "resource_id", "actor_role", "sensitive"])
    for row in rows:
        writer.writerow([row.id, row.occurred_at.isoformat(), row.action_type, row.resource_type, row.resource_id, row.actor_role or "", row.is_sensitive])
    filename = f"organiser-audit-{datetime.now(timezone.utc).date().isoformat()}.csv"
    return Response(content=output.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/access/roles", dependencies=[Depends(scoped_role_administration)])
async def organiser_user_roles(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    search: str | None = Query(default=None, max_length=160),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    rows, total = await OrganiserAccessQueryService(db).list_roles(
        organization_id=org.id, page=page, page_size=page_size, search=search
    )
    return _page([{
        "id": str(row.id), "name": row.name, "description": row.description,
        "is_system_role": row.is_system_role, "users_count": row.users_count,
        "scope": "Global" if row.is_system_role else "Organisation",
        "status": "Active", "version": row.version,
    } for row in rows], total, page, page_size, "organizer_access.user_roles")


@router.get("/access/roles/page", response_model=CursorPage[dict], dependencies=[Depends(scoped_role_administration)])
async def organiser_user_roles_cursor(
    cursor: str | None = Query(default=None, max_length=512),
    page_size: int = Query(default=50, ge=1, le=100),
    search: str | None = Query(default=None, max_length=160),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CursorPage[dict]:
    org = await _current_org(db, current_user)
    return await OrganiserAccessQueryService(db).list_roles_cursor(
        organization_id=org.id, cursor=cursor, limit=page_size, search=search
    )


@router.get("/access/assignments", dependencies=[Depends(scoped_role_administration)])
async def organiser_role_assignments(
    scope: str = Query(pattern=r"^(ORGANIZATION|EVENT)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    search: str | None = Query(default=None, max_length=160),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    rows, total = await OrganiserAccessQueryService(db).list_assignments(
        organization_id=org.id, actor_id=current_user.id, scope=scope, page=page, page_size=page_size, search=search
    )
    return _page([{
        "id": str(row.id), "user_id": str(row.user_id),
        "user_name": f"{row.user_first_name} {row.user_last_name}".strip(), "user_email": row.user_email,
        "role_id": str(row.role_id), "role_name": row.role_name, "scope": scope,
        "event_id": str(row.event_id) if row.event_id else None,
        "event_name": row.event_name, "assigned_at": row.assigned_at.isoformat(), "version": row.version,
    } for row in rows], total, page, page_size, "organizer_access.user_role_assignments")


@router.get("/access/assignments/page", response_model=CursorPage[dict], dependencies=[Depends(scoped_role_administration)])
async def organiser_role_assignments_cursor(
    scope: str = Query(pattern=r"^(ORGANIZATION|EVENT)$"),
    cursor: str | None = Query(default=None, max_length=512),
    page_size: int = Query(default=50, ge=1, le=100),
    search: str | None = Query(default=None, max_length=160),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CursorPage[dict]:
    org = await _current_org(db, current_user)
    return await OrganiserAccessQueryService(db).list_assignments_cursor(
        organization_id=org.id, actor_id=current_user.id, scope=scope, cursor=cursor, limit=page_size, search=search
    )


@router.get("/access/effective-preview", dependencies=[Depends(scoped_role_administration)])
async def organiser_effective_access_preview(
    user_id: uuid.UUID = Query(...), role_id: uuid.UUID = Query(...), event_id: uuid.UUID | None = Query(default=None),
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    # The old union-only preview omitted inherited grants and explicit denials.
    # No portal caller remains; do not present it as authoritative access.
    raise HTTPException(410, detail={"code": "ACCESS_PREVIEW_RETIRED",
        "message": "Use the versioned role assignment workflow. Effective access is validated by the command."})


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
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    row = await OrganizerCustomFieldCommandService(db).update(
        organization_id=org.id, field_id=field_id, actor=current_user,
        values=payload.model_dump(), if_match=if_match, idempotency_key=idempotency_key,
    )
    return _custom_field_out(row)


@router.patch("/settings/notification-rules/{rule_id}")
async def toggle_organiser_notification_rule(
    rule_id: uuid.UUID,
    payload: NotificationRuleToggle,
    if_match: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    row = await OrganizerNotificationCommandService(db).toggle_rule(
        organization_id=org.id, rule_id=rule_id, actor=current_user,
        is_enabled=payload.is_enabled, if_match=if_match, idempotency_key=idempotency_key,
    )
    return {"id": str(row.id), "is_enabled": row.is_enabled, "version": row.version}


@router.put("/settings/security")
async def update_organiser_security_policy(
    payload: SecurityPolicyWrite,
    if_match: int = Header(default=0, alias="If-Match", ge=0),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    return await OrganizerSecurityCommandService(db).update_policy(
        organization_id=org.id, actor=current_user, values=payload.model_dump(), if_match=if_match,
        idempotency_key=idempotency_key,
    )


@router.put("/settings/branding", dependencies=[Depends(scoped_branding_administration)])
async def update_organiser_branding(
    payload: BrandingWrite,
    if_match: int = Header(..., alias="If-Match", ge=0),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=16, max_length=160),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    org = await _current_org(db, current_user)
    await _require_org_admin(db, current_user, org.id)
    return await OrganizerBrandingCommandService(db).update(
        organization_id=org.id, actor=current_user, values=payload.model_dump(), if_match=if_match,
        idempotency_key=idempotency_key,
    )


@router.get("/public-brand-assets/{organization_id}/{kind}", include_in_schema=False)
async def public_organiser_brand_asset(
    organization_id: uuid.UUID,
    kind: str,
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """Deliver only a currently referenced, scan-ready public brand image."""
    if kind not in {"logo", "favicon"}:
        raise HTTPException(status_code=404, detail="Brand asset not found.")
    profile = await db.scalar(select(OrganizationBrandProfile).where(
        OrganizationBrandProfile.organization_id == organization_id,
    ))
    asset_key = f"{kind}_asset_id"
    try:
        asset_id = uuid.UUID(str((profile.assets or {}).get(asset_key))) if profile else None
    except (TypeError, ValueError):
        asset_id = None
    if asset_id is None:
        raise HTTPException(status_code=404, detail="Brand asset not found.")
    asset = await db.scalar(select(Asset).where(
        Asset.id == asset_id,
        Asset.organization_id == organization_id,
        Asset.processing_status == "READY",
        Asset.mime_type.in_(["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/x-icon"]),
    ))
    if asset is None:
        raise HTTPException(status_code=404, detail="Brand asset not found.")
    if asset.mime_type == "image/svg+xml" and await db.scalar(select(AssetTag.id).where(
        AssetTag.asset_id == asset.id,
        AssetTag.tag == "system:sanitized-svg-v1",
    ).limit(1)) is None:
        raise HTTPException(status_code=404, detail="Brand asset not found.")
    url = await asyncio.to_thread(
        create_presigned_download,
        bucket=settings.S3_BUCKET_ASSETS,
        storage_path=asset.file_path,
        expiry_seconds=300,
        inline=True,
        verified_organization_id=organization_id,
    )
    return RedirectResponse(url, headers={"Cache-Control": "public, max-age=300, must-revalidate"})


@router.get("/settings/{domain}", dependencies=[Depends(scoped_organization_profile)])
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


async def _attention_for_event(db: AsyncSession, event: Event) -> list[dict[str, Any]]:
    candidate = await OrganiserAttentionQueryService(db).get_candidate(
        organization_id=event.organization_id, event_id=event.id
    )
    if candidate is None:
        return []
    event_id = candidate.id
    tasks: list[dict[str, Any]] = []

    sessions_without_rooms = candidate.sessions_without_rooms or 0
    if sessions_without_rooms:
        tasks.append({
            "id": f"{event_id}:sessions_without_rooms",
            "title": "Sessions",
            "description": "Sessions without assigned rooms",
            "count": sessions_without_rooms,
            "severity": "warning",
            "href": f"/events/{event_id}/program/sessions",
        })

    pending_speakers = candidate.pending_speakers or 0
    if pending_speakers:
        tasks.append({
            "id": f"{event_id}:pending_speakers",
            "title": "Speakers",
            "description": "Speakers pending uploads",
            "count": pending_speakers,
            "severity": "critical" if pending_speakers > 10 else "warning",
            "href": f"/events/{event_id}/speakers/directory",
        })

    pending_registrations = candidate.pending_registrations or 0
    if pending_registrations:
        tasks.append({
            "id": f"{event_id}:pending_registrations",
            "title": "Pending Approvals",
            "description": "Registrations require review",
            "count": pending_registrations,
            "severity": "critical",
            "href": f"/events/{event_id}/registration/approvals",
        })

    payment_pending = candidate.payment_pending or 0
    if payment_pending:
        tasks.append({
            "id": f"{event_id}:payment_reconciliation",
            "title": "Payment Reconciliation",
            "description": "Transactions need attention",
            "count": payment_pending,
            "severity": "warning",
            "href": f"/events/{event_id}/payments/reconciliation",
        })

    total_rooms = candidate.total_rooms or 0
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
        task["age_seconds"] = max(0, int((datetime.now(timezone.utc) - candidate.updated_at).total_seconds()))
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
    state_rows = await OrganiserAttentionQueryService(db).list_task_states(
        organization_id=org.id,
        task_keys=[task["id"] for task in tasks],
        limit=limit,
    )
    state_by_key = {row.task_key: row for row in state_rows}
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
            task["owner"] = None if state_row.owner_id is None else {
                "id": str(state_row.owner_id),
                "name": f"{state_row.first_name or ''} {state_row.last_name or ''}".strip() or state_row.email,
            }
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

    dashboard_metrics = await OrganiserDashboardQueryService(db).metrics(
        organization_id=org.id
    )
    active_events = dashboard_metrics["active_events"]
    team_members = dashboard_metrics["team_members"]
    total_registrations = dashboard_metrics["total_registrations"]
    total_revenue = dashboard_metrics["total_revenue"]
    storage_used_mb = float(dashboard_metrics["storage_used_bytes"]) / (1024 * 1024)

    contract = await EntitlementResolver.get_active_contract(db, org.id)
    offer = contract.offer if contract else None
    limit_keys = ("max_events", "max_users", "max_registrations", "storage_quota_mb")
    limits = ({key: None for key in limit_keys} if unrestricted else
              await EntitlementResolver.get_org_limits(db, org.id, limit_keys))
    usage = {
        "events": {"used": dashboard_metrics["total_events"], "max": limits["max_events"]},
        "users": {"used": team_members, "max": limits["max_users"]},
        "registrations": {"used": total_registrations, "max": limits["max_registrations"]},
        "storage": {"used_mb": storage_used_mb, "max_mb": limits["storage_quota_mb"]},
    }

    today = date.today()
    trend = await OrganiserReportQueryService(db).registration_revenue_trend(
        organization_id=org.id, today=today
    )

    event_rows, _ = await OrganiserReportQueryService(db).list_event_reports(
        organization_id=org.id, page=1, page_size=6, search=None
    )
    session_distribution = await OrganiserDashboardQueryService(db).session_distribution(
        organization_id=org.id
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
            "lifecycle_state": org.lifecycle_state,
        },
        "metrics": {
            "active_events": active_events,
            "total_events": dashboard_metrics["total_events"],
            "team_members": team_members,
            "total_registrations": total_registrations,
            "total_sessions": dashboard_metrics["total_sessions"],
            "total_speakers": dashboard_metrics["total_speakers"],
            "total_checkins": dashboard_metrics["total_checkins"],
            "total_revenue": total_revenue,
        },
        "registration_overview": dashboard_metrics["registration_overview"],
        "commercial": {
            "offer_name": "Enterprise" if unrestricted else (offer.name if offer else "Not configured"),
            "status": "ACTIVE" if unrestricted or offer else "UNAVAILABLE",
            "billing_cycle": getattr(contract, "billing_interval", None),
            "valid_till": getattr(contract, "ends_at", None),
            "registrations_used": int(usage.get("registrations", {}).get("used") or total_registrations),
            "registrations_max": None if unrestricted else usage.get("registrations", {}).get("max"),
            "storage_used_gb": round((usage.get("storage", {}).get("used_mb") or storage_used_mb) / 1024, 2),
            "storage_max_gb": None if unrestricted else (round((usage.get("storage", {}).get("max_mb") or 0) / 1024, 2) if usage.get("storage", {}).get("max_mb") else None),
            "events_used": int(usage.get("events", {}).get("used") or dashboard_metrics["total_events"]),
            "events_max": None if unrestricted else usage.get("events", {}).get("max"),
            "unrestricted": unrestricted,
        },
        "trend": trend,
        "session_distribution": session_distribution,
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
    rows, total = await AuditQueryService(db).list_organization_entitlement_history(
        organization_id=org.id, page=page, page_size=page_size
    )
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
        rows, total = await AuditQueryService(db).list_organization_actions(
            organization_id=org.id, action_type=action, page=page, page_size=page_size
        )
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
    token = getattr(current_user, "_request_token_data", None)
    ws_id = getattr(token, "active_workspace_id", None) if token else None
    from app.modules.rbac.services.permission_service import get_user_permissions
    perms = await get_user_permissions(db, current_user.id, organization_id=org.id, workspace_id=ws_id)
    if "reports:view" not in perms and "reports:export" not in perms and "REPORTS:VIEW" not in perms and "REPORTS:EXPORT" not in perms:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"code": "PERMISSION_DENIED", "message": "Report viewing permission is required"})
    record = await AuditQueryService(db).get_organization_action(
        organization_id=org.id,
        resource_id=export_id,
        action_type="ORGANISER_REPORT_EXPORT_CREATED",
    )
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
    from app.modules.rbac.services.event_scope import customer_event
    token = getattr(current_user, "_request_token_data", None)
    if token is None:
        raise HTTPException(status_code=401, detail={"code": "SESSION_CONTEXT_REQUIRED"})
    event = await customer_event(db, current_user, event_id, token)
    if not event or event.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return await _attention_for_event(db, event)
