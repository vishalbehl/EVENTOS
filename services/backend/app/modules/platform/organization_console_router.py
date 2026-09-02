"""Privileged, tenant-safe Organization Console API."""

from __future__ import annotations

import ipaddress
import base64
import hashlib
import json
import secrets
import uuid
import asyncio
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, Request, status
from fastapi.encoders import jsonable_encoder
from pydantic import ValidationError
from sqlalchemy import and_, delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.client_ip import resolve_client_ip
from app.core.tenant_context import TenantContextGuard
from app.dependencies import StepUpAuth, get_db
from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash
from app.modules.audit.models.audit_domain_tables import DataExport
from app.modules.audit.services.audit_service import AuditContext, AuditService
from app.modules.identity.models.refresh_token import RefreshToken
from app.modules.identity.models.user import User
from app.modules.events.models.event import Event
from app.modules.events.services.event_mutation_service import EventMutationService
from app.modules.events.services.event_resource_mutation_service import (
    EventResourceMutationService,
)
from app.modules.events.services.event_template_mutation_service import (
    EventTemplateMutationService,
)
from app.modules.events.services.event_campaign_mutation_service import (
    EventCampaignMutationService,
)
from app.modules.events.services.event_participant_mutation_service import (
    EventParticipantMutationService,
)
from app.modules.analytics.services.projection_dispatch import (
    enqueue_event_registration_projection_refresh,
    enqueue_event_attendance_projection_refresh,
)
from app.modules.events.services.event_job_control_service import (
    EventJobControlService,
)
from app.modules.platform.application.organization_team_commands import OrganizationTeamCommandService
from app.modules.platform.application.location_commands import OrganizationLocationCommandService
from app.modules.platform.application.security_commands import OrganizationSecurityCommandService
from app.modules.platform.application.governance_commands import OrganizationGovernanceCommandService
from app.modules.platform.application.branding_commands import PlatformBrandingCommandService
from app.modules.platform.application.impersonation_commands import ImpersonationCommandService
from app.modules.platform.application.rollout_commands import OrganizationRolloutCommandService
from app.modules.platform.application.lifecycle_commands import OrganizationLifecycleCommandService
from app.modules.platform.application.api_key_commands import OrganizationApiKeyCommandService
from app.modules.platform.application.notification_rule_commands import OrganizationNotificationRuleCommandService
from app.modules.platform.application.notification_channel_commands import OrganizationNotificationChannelCommandService
from app.modules.platform.application.privileged_access_commands import PrivilegedAccessCommandService
from app.modules.platform.application.usage_commands import OrganizationUsageCommandService
from app.modules.platform.application.financial_adjustment_commands import FinancialAdjustmentCommandService
from app.modules.platform.application.integration_commands import IntegrationConnectionCommandService
from app.modules.platform.application.export_commands import OrganizationExportCommandService
from app.modules.platform.application.commercial_access_commands import CommercialAccessCommandService
from app.modules.platform.application.event_control_commands import EventOperationalControlCommandService
from app.modules.platform.application.event_settings_commands import EventSettingsCommandService
from app.modules.platform.application.registration_correction_commands import RegistrationCorrectionCommandService
from app.modules.platform.application.event_contract_commands import EventContractCommandService
from app.modules.platform.application.event_workspace_commands import EventWorkspaceCommandService
from app.modules.platform.application.governed_mutation_commands import GovernedMutationCommandService
from app.modules.platform.application.organization_team_commands import OrganizationTeamCommandService
from app.modules.rbac.schemas.event import EventCreate, EventUpdate
from app.modules.platform.models.organization_console import (
    OrganizationBrandProfile,
    OrganizationLifecycleJob,
    OrganizationLocation,
    OrganizationSecurityPolicy,
    OrganizationTrustedDevice,
    EventCommercialContract,
    EntitlementOverrideRequest,
    UsageLedgerEntry,
    UsageReconciliationRun,
    PrivilegedAccessSession,
    OrganizationFinancialAdjustment,
    OrganizationNotificationRule,
    OrganizationNotificationChannelConfig,
    OrganizationTeam,
    OrganizationTeamMember,
    OrganizationTeamEvent,
    CapabilityRestriction,
    CapabilityDiagnosticEvent,
    CommercialAccessRequest,
    PrivilegedMutationReceipt,
    OrganizationComplianceControl,
    OrganizationComplianceEvidence,
    OrganizationPrivacyRequest,
    OrganizationRetentionPolicy,
    OrganizationLegalHold,
)
from app.modules.platform.models.feature import FeatureCatalog
from app.modules.platform.schemas.organization_console import (
    BrandProfileUpdate,
    LifecycleJobCreate,
    LifecycleJobOut,
    LifecycleApprovalDecision,
    OrganizationConsoleSummary,
    OrganizationDomainSnapshot,
    OrganizationLocationCreate,
    OrganizationLocationOut,
    OrganizationLocationUpdate,
    SecurityPolicyUpdate,
    EventContractCreate,
    OverrideRequestCreate,
    ApprovalDecision,
    UsageAdjustmentCreate,
    PrivilegedAccessCreate,
    FinancialAdjustmentCreate,
    RegistrationAdministrativeCorrection,
    EventWorkspaceMutation,
    EventOperationalControlUpdate,
    EventWorkspaceDelete,
    EventWorkspaceAction,
    ConsoleExportCreate,
    ConsoleExportOut,
    OrganizationApiKeyCreate,
    IntegrationConnectionCreate,
    IntegrationConnectionUpdate,
    OrganizationTeamCreate,
    OrganizationTeamUpdate,
    OrganizationTeamAssignment,
    NotificationRuleWrite,
    NotificationChannelWrite,
    NotificationChannelVerification,
    ImpersonationHandoffCreate,
    OrganizerRolloutUpdate,
    CapabilityRestrictionCreate,
    CommercialAccessDecision,
    LegalHoldCreate,
    LegalHoldRelease,
    ComplianceControlCreate,
    ComplianceEvidenceCreate,
    ControlRevocationRequest,
    RetentionPolicyWrite,
    PrivacyRequestCreate,
    PrivacyRequestUpdate,
)
from app.modules.audit.models.audit_domain_tables import ImpersonationLog
from app.modules.platform.services.organization_console_service import OrganizationConsoleService
from app.modules.platform.services.capability_rollout_preflight_service import (
    CapabilityRolloutPreflightService,
)
from app.modules.platform.services.metering_service import MeteringService
from app.modules.platform.services.lifecycle_service import OrganizationLifecycleService
from app.modules.superadmin.dependencies import require_super_admin
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.confirmation_qr import RegistrationConfirmationQR
from app.modules.registration.services.confirmation_qr_service import (
    RegistrationConfirmationQRService,
    build_confirmation_image_url,
    build_confirmation_token,
)
from app.modules.events.models.capacity_rule import CapacityRule
from app.modules.events.models.speaker import Speaker
from app.modules.agenda.models import Session
from app.modules.agenda.models import Room
from app.modules.agenda.models import SessionPerson as SessionSpeaker
from app.modules.communications.models.email_template import EmailTemplate
from app.modules.communications.models.email_campaign import EmailCampaign
from app.modules.communications.models.email_log import EmailLog
from app.modules.registration.models.print_template import PrintTemplate
from app.modules.registration.models.payment_transaction import PaymentTransaction
from app.modules.registration.models.ticket_type import TicketType
from app.modules.registration.models.check_in import CheckIn
from app.modules.registration.models.import_job import ImportJob
from app.modules.rbac.models.user_assignment import UserEventAssignment
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.venue.models.venue_sync_job import VenueSyncJob
from app.modules.presentations.models.presentations_domain_tables import PresentationProcessingJob
from app.modules.presentations.models.presentation_file import PresentationFile
from app.modules.integrations.models.webhook import Webhook, WebhookMutation
from app.modules.speakers.schemas.speaker import SpeakerCreate, SpeakerUpdate
from app.modules.speakers.schemas.session import SessionCreate, SessionUpdate
from app.modules.venue.schemas.room import RoomCreate, RoomUpdate
from app.modules.notifications.schemas.webhook import WebhookCreate, WebhookUpdate
from app.modules.notifications.schemas.notification import CampaignCreate, CampaignUpdate, EmailTemplateCreate, EmailTemplateUpdate
from app.modules.notifications.services.channel_provider_service import (
    ChannelProviderError,
    ChannelProviderService,
    SUPPORTED_PROVIDERS,
)
from app.modules.registration.schemas.print_template import PrintTemplateCreate, PrintTemplateUpdate
from app.modules.registration.schemas.participant import ParticipantCreate, ParticipantUpdate
from app.modules.billing.capability_registry import LIMIT_DEFINITIONS, registry_coverage
from app.modules.billing.services.event_entitlement_service import EventEntitlementService
from app.modules.billing.services.entitlement_resolver import EntitlementResolver
from app.modules.billing.services.capability_service import CapabilityService
from app.modules.registration.routers.registrations import helper_approve_registration
from app.modules.presentations.services.file_administration_service import PresentationFileAdministrationService
from app.modules.registration.services.ticket_pricing_service import TicketPricingService
from app.modules.registration.services.checkin_service import CheckInService
from app.modules.commercial.quote_service import request_fingerprint
from app.modules.presentations.services.upload_service import create_presigned_download
from app.config import settings
from app.worker import celery_app
from app.modules.analytics.services.analytics_service import build_analytics_snapshot
from app.modules.developer.models.developer_registry import ApiKey
from app.modules.developer.services.developer_service import DeveloperService
from app.modules.integrations.models.integrations_domain_tables import IntegrationConnection, IntegrationProvider
from app.modules.platform.models.platform_domain_tables import (
    FeatureFlag,
    PlatformFlagDefinition,
    PlatformFlagOverride,
)
from app.modules.platform.models.organization_console import EntitlementShadowComparison
from app.core.dependencies.feature_gate import enforce_event_operation, enforce_org_operation
from app.modules.billing.services.usage_reservation_service import UsageReservationService
from app.modules.billing.models.subscription import Addon, OrganizationAddon, OrganizationSubscription, SubscriptionPlan
from app.modules.billing.models.event_activation import EventActivation


async def _selected_organization_scope(
    organization_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Run every console query under the selected tenant's RLS context.

    Authentication still resolves the real platform actor before this
    dependency enters the selected organization scope. The context changes
    database visibility only; it never impersonates the actor recorded by
    privileged-action audits.
    """
    async with TenantContextGuard.scoped(db, organization_id):
        yield


router = APIRouter(
    prefix="/platform/organizations/{organization_id}/console",
    tags=["organization-console"],
    dependencies=[
        Depends(require_super_admin),
        Depends(_selected_organization_scope),
    ],
)

SEARCH_DOMAINS = {"events", "speakers", "sessions", "registrations", "files", "campaigns", "users"}


async def _require_scoped_event(db: AsyncSession, organization_id: uuid.UUID, event_id: uuid.UUID) -> Event:
    event = await db.scalar(select(Event).where(Event.id == event_id, Event.organization_id == organization_id))
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


def _console_event_out(event: Event) -> dict:
    return {
        "id": event.id,
        "organization_id": event.organization_id,
        "name": event.name,
        "short_code": event.short_code,
        "status": event.status,
        "location": event.location,
        "venue_name": event.venue_name,
        "country": event.country,
        "state": event.state,
        "start_date": event.start_date,
        "end_date": event.end_date,
        "timezone": event.timezone,
        "currency": event.currency,
        "is_maintenance": event.is_maintenance,
        "is_read_only": event.is_read_only,
        "created_at": event.created_at,
        "updated_at": event.updated_at,
    }


async def _governed_mutation_replay(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    actor_id: uuid.UUID,
    operation_key: str,
    idempotency_key: str,
    request_hash: str,
) -> dict | None:
    receipt = await db.scalar(
        select(PrivilegedMutationReceipt)
        .where(
            PrivilegedMutationReceipt.organization_id == organization_id,
            PrivilegedMutationReceipt.idempotency_key == idempotency_key,
        )
        .with_for_update()
    )
    if receipt is None:
        return None
    if (
        receipt.actor_user_id != actor_id
        or receipt.operation_key != operation_key
        or receipt.request_hash != request_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "IDEMPOTENCY_CONFLICT"},
        )
    return receipt.response_json


def _governed_mutation_receipt(
    *,
    organization_id: uuid.UUID,
    actor_id: uuid.UUID,
    operation_key: str,
    idempotency_key: str,
    request_hash: str,
    resource_type: str,
    resource_id: uuid.UUID | None,
    response: dict,
) -> PrivilegedMutationReceipt:
    return PrivilegedMutationReceipt(
        organization_id=organization_id,
        actor_user_id=actor_id,
        operation_key=operation_key,
        idempotency_key=idempotency_key,
        request_hash=request_hash,
        resource_type=resource_type,
        resource_id=resource_id,
        response_json=jsonable_encoder(response),
    )


async def _webhook_mutation_replay(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    event_id: uuid.UUID,
    actor_id: uuid.UUID,
    idempotency_key: str,
    request_hash: str,
) -> dict | None:
    mutation = await db.scalar(
        select(WebhookMutation)
        .where(
            WebhookMutation.organization_id == organization_id,
            WebhookMutation.idempotency_key == idempotency_key,
        )
        .with_for_update()
    )
    if mutation is None:
        return None
    if (
        mutation.event_id != event_id
        or mutation.requested_by != actor_id
        or mutation.request_hash != request_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "IDEMPOTENCY_CONFLICT"},
        )
    return mutation.response_json


def _webhook_mutation(
    *,
    organization_id: uuid.UUID,
    event_id: uuid.UUID,
    webhook_id: uuid.UUID,
    actor_id: uuid.UUID,
    operation_type: str,
    idempotency_key: str,
    request_hash: str,
    response: dict,
) -> WebhookMutation:
    return WebhookMutation(
        organization_id=organization_id,
        event_id=event_id,
        webhook_id=webhook_id,
        requested_by=actor_id,
        operation_type=operation_type,
        idempotency_key=idempotency_key,
        request_hash=request_hash,
        response_json=jsonable_encoder(response),
    )


def _search_cursor(value: str | None) -> int:
    if not value:
        return 0
    try:
        decoded = base64.urlsafe_b64decode(value.encode()).decode()
        prefix, offset = decoded.split(":", 1)
        if prefix != "search" or int(offset) < 0:
            raise ValueError
        return int(offset)
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=422, detail="Invalid search cursor") from exc


def _console_export_out(row: DataExport) -> ConsoleExportOut:
    metadata = row.request_metadata or {}
    return ConsoleExportOut(id=row.id, organization_id=row.organization_id, event_id=row.event_id, status=row.status, domains=metadata.get("domains", []), include_sensitive=bool(metadata.get("include_sensitive")), created_at=row.created_at, completed_at=row.completed_at, expires_at=row.expires_at, failure_reason=row.failure_reason)


def _mask_email(value: object) -> str | None:
    if not isinstance(value, str) or "@" not in value: return None
    local, domain = value.split("@", 1)
    return f"{local[:1]}***@{domain}"


def _mask_phone(value: object) -> str | None:
    if not isinstance(value, str) or not value: return None
    return f"***{value[-4:]}" if len(value) >= 4 else "***"


def _masked_registration_data(data: dict) -> dict:
    result = {key: value for key, value in data.items() if key not in {"email", "phone", "address", "custom_fields", "first_name", "last_name", "name"}}
    name = str(data.get("name") or f"{data.get('first_name', '')} {data.get('last_name', '')}").strip()
    result.update({"name": f"{name[:1]}***" if name else None, "email": _mask_email(data.get("email")), "phone": _mask_phone(data.get("phone")), "sensitive_fields_masked": True})
    return result


async def _require_privileged_access(db: AsyncSession, organization_id: uuid.UUID, actor_id: uuid.UUID, session_id: uuid.UUID | None, categories: set[str]) -> PrivilegedAccessSession:
    if not session_id: raise HTTPException(status_code=403, detail="An active privileged access session is required")
    now = datetime.now(timezone.utc)
    row = await db.scalar(select(PrivilegedAccessSession).where(PrivilegedAccessSession.id == session_id, PrivilegedAccessSession.organization_id == organization_id, PrivilegedAccessSession.actor_user_id == actor_id, PrivilegedAccessSession.revoked_at.is_(None), PrivilegedAccessSession.expires_at > now))
    if not row or not categories.issubset(set(row.field_categories)):
        raise HTTPException(status_code=403, detail="Privileged access session is missing or does not cover the requested fields")
    return row


def _audit(
    request: Request,
    actor: User,
    organization_id: uuid.UUID,
    action: str,
    resource_type: str,
    resource_id: uuid.UUID,
    *,
    old_state: dict | None = None,
    new_state: dict | None = None,
    sensitive: bool = False,
) -> AuditLog:
    def normalize(value):
        sensitive_names = {"secret", "secret_hash", "password", "password_hash", "token", "access_token", "refresh_token", "credential", "credentials", "private_key", "api_key"}
        if isinstance(value, dict):
            return {str(key): "[REDACTED]" if str(key).lower() in sensitive_names or any(marker in str(key).lower() for marker in ("password", "secret", "token", "credential", "private_key")) else normalize(item) for key, item in value.items()}
        if isinstance(value, (list, tuple, set)):
            return [normalize(item) for item in value]
        if isinstance(value, (uuid.UUID, datetime)):
            return str(value)
        try:
            json.dumps(value)
            return value
        except (TypeError, ValueError):
            return str(value)
    return AuditLog(
        organization_id=organization_id,
        actor_user_id=actor.id,
        actor_role=actor.platform_role or actor.role,
        resource_type=resource_type,
        resource_id=resource_id,
        action_type=action,
        old_state=normalize(old_state) if old_state is not None else None,
        new_state=normalize(new_state) if new_state is not None else None,
        change_diff={"request_path": request.url.path},
        actor_ip=resolve_client_ip(request),
        actor_user_agent=request.headers.get("user-agent"),
        is_sensitive=sensitive,
        occurred_at=datetime.now(timezone.utc),
    )


async def _dispatch_read_audit(
    request: Request,
    actor: User,
    organization_id: uuid.UUID,
    action: str,
    resource_type: str,
    resource_id: uuid.UUID,
    *,
    new_state: dict | None = None,
) -> None:
    """Record a privileged read without committing the read transaction."""
    row = _audit(
        request,
        actor,
        organization_id,
        action,
        resource_type,
        resource_id,
        new_state=new_state,
        sensitive=True,
    )
    await AuditService.write_log(AuditContext(
        request_id=row.request_id,
        correlation_id=row.correlation_id,
        organization_id=row.organization_id,
        actor_user_id=row.actor_user_id,
        resource_type=row.resource_type,
        resource_id=row.resource_id,
        action_type=row.action_type,
        actor_role=row.actor_role,
        old_state=row.old_state,
        new_state=row.new_state,
        change_diff=row.change_diff,
        actor_ip=row.actor_ip,
        actor_user_agent=row.actor_user_agent,
        is_sensitive=row.is_sensitive,
        occurred_at=row.occurred_at,
    ))


@router.get("/audit")
async def list_organization_audit(
    organization_id: uuid.UUID,
    cursor: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    action_type: str | None = None,
    resource_type: str | None = None,
    actor_user_id: uuid.UUID | None = None,
    sensitive: bool | None = None,
    actor: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    await OrganizationConsoleService(db).require_organization(organization_id)
    query = select(AuditLog).where(AuditLog.organization_id == organization_id)
    if action_type: query = query.where(AuditLog.action_type == action_type)
    if resource_type: query = query.where(AuditLog.resource_type == resource_type)
    if actor_user_id: query = query.where(AuditLog.actor_user_id == actor_user_id)
    if sensitive is not None: query = query.where(AuditLog.is_sensitive.is_(sensitive))
    if cursor:
        try:
            cursor_time_raw, cursor_id_raw = cursor.rsplit("|", 1)
            cursor_time, cursor_id = datetime.fromisoformat(cursor_time_raw), uuid.UUID(cursor_id_raw)
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=422, detail="Invalid audit cursor") from exc
        query = query.where(or_(AuditLog.occurred_at < cursor_time, and_(AuditLog.occurred_at == cursor_time, AuditLog.id < cursor_id)))
    rows = (await db.scalars(query.order_by(AuditLog.occurred_at.desc(), AuditLog.id.desc()).limit(limit + 1))).all()
    page, has_more = rows[:limit], len(rows) > limit
    items = []
    for row in page:
        expected_hash = compute_audit_hash(row, version=row.hash_version or 1)
        items.append({
            "id": row.id, "request_id": row.request_id, "correlation_id": row.correlation_id,
            "actor_user_id": row.actor_user_id, "impersonated_by": row.impersonated_by,
            "actor_role": row.actor_role, "resource_type": row.resource_type,
            "resource_id": row.resource_id, "action_type": row.action_type,
            "old_state": row.old_state, "new_state": row.new_state, "change_diff": row.change_diff,
            "actor_ip": row.actor_ip, "is_sensitive": row.is_sensitive, "occurred_at": row.occurred_at,
            "row_hash": row.row_hash, "hash_version": row.hash_version, "integrity_valid": row.row_hash == expected_hash,
        })
    next_cursor = f"{page[-1].occurred_at.isoformat()}|{page[-1].id}" if has_more and page else None
    return {"items": items, "next_cursor": next_cursor, "has_more": has_more, "integrity": {"verified": sum(1 for item in items if item["integrity_valid"]), "failed": sum(1 for item in items if not item["integrity_valid"])}}


@router.post("/impersonation-handoffs", status_code=status.HTTP_201_CREATED)
async def create_impersonation_handoff(
    organization_id: uuid.UUID,
    payload: ImpersonationHandoffCreate,
    request: Request,
    step_up: StepUpAuth,
    actor: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    await OrganizationConsoleService(db).require_organization(organization_id)
    return await ImpersonationCommandService(db).create_handoff(
        organization_id=organization_id, actor=actor, target_user_id=payload.target_user_id,
        reason=payload.reason, case_reference=payload.case_reference,
        ip_address=resolve_client_ip(request), user_agent=request.headers.get("user-agent"),
    )


@router.get("/rollout")
async def get_organizer_rollout(organization_id: uuid.UUID, actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    await OrganizationConsoleService(db).require_organization(organization_id)
    preflight = await CapabilityRolloutPreflightService.evaluate(
        db, organization_id
    )
    events = preflight["events"]
    return {
        "shadow_enabled": preflight["rollout"]["shadow_enabled"],
        "enforcement_enabled": preflight["rollout"]["enforcement_enabled"],
        "activated_events": events["activated"],
        "contracted_events": events["contracted"],
        "missing_contracts": max(events["activated"] - events["contracted"], 0),
        "comparisons": {
            "sample_size": events["compared"],
            "matched": events["matched"],
            "diverged": events["diverged"],
            "stale": events["stale"],
            "freshness_cutoff": preflight["freshness_cutoff"],
            "latest_at": (
                preflight["items"][0]["compared_at"]
                if preflight["items"]
                else None
            ),
        },
        "items": preflight["items"],
        "preflight": preflight,
    }


@router.patch("/rollout")
async def update_organizer_rollout(organization_id: uuid.UUID, payload: OrganizerRolloutUpdate, request: Request, step_up: StepUpAuth, actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    await OrganizationConsoleService(db).require_organization(organization_id)
    preflight = await CapabilityRolloutPreflightService.evaluate(
        db, organization_id
    )
    missing_contract_count = max(
        preflight["events"]["activated"] - preflight["events"]["contracted"],
        0,
    )
    if payload.enforcement_enabled:
        if missing_contract_count:
            raise HTTPException(status_code=409, detail={"code": "EVENT_CONTRACTS_REQUIRED", "missing_contracts": missing_contract_count})
        if not preflight["ready_for_enforcement"]:
            raise HTTPException(
                status_code=409,
                detail=jsonable_encoder(
                    {
                        "code": "ROLLOUT_PREFLIGHT_FAILED",
                        "message": "Canonical enforcement requires a passing tenant preflight.",
                        "blockers": preflight["blockers"],
                        "generated_at": preflight["generated_at"],
                    }
                ),
            )
    return await OrganizationRolloutCommandService(db).update(
        organization_id=organization_id, actor=actor,
        shadow_enabled=payload.shadow_enabled,
        enforcement_enabled=payload.enforcement_enabled,
        missing_contract_count=missing_contract_count, reason=payload.reason,
    )


@router.get("/diagnostics")
async def get_capability_diagnostics(
    organization_id: uuid.UUID,
    event_type: str | None = Query(default=None, max_length=40),
    reason_code: str | None = Query(default=None, max_length=60),
    since_hours: int = Query(default=24, ge=1, le=24 * 90),
    limit: int = Query(default=100, ge=1, le=200),
    actor: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return tenant-scoped capability health evidence for operator remediation."""
    await OrganizationConsoleService(db).require_organization(organization_id)
    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=since_hours)

    scoped = select(CapabilityDiagnosticEvent).where(
        CapabilityDiagnosticEvent.organization_id == organization_id,
        CapabilityDiagnosticEvent.occurred_at >= since,
    )
    if event_type:
        scoped = scoped.where(CapabilityDiagnosticEvent.event_type == event_type.upper())
    if reason_code:
        scoped = scoped.where(CapabilityDiagnosticEvent.reason_code == reason_code)
    events = (
        await db.scalars(
            scoped.order_by(
                CapabilityDiagnosticEvent.occurred_at.desc(),
                CapabilityDiagnosticEvent.id.desc(),
            ).limit(limit)
        )
    ).all()

    type_counts = dict(
        (
            await db.execute(
                select(
                    CapabilityDiagnosticEvent.event_type,
                    func.count(CapabilityDiagnosticEvent.id),
                )
                .where(
                    CapabilityDiagnosticEvent.organization_id == organization_id,
                    CapabilityDiagnosticEvent.occurred_at >= since,
                )
                .group_by(CapabilityDiagnosticEvent.event_type)
            )
        ).all()
    )
    reason_counts = dict(
        (
            await db.execute(
                select(
                    CapabilityDiagnosticEvent.reason_code,
                    func.count(CapabilityDiagnosticEvent.id),
                )
                .where(
                    CapabilityDiagnosticEvent.organization_id == organization_id,
                    CapabilityDiagnosticEvent.occurred_at >= since,
                    CapabilityDiagnosticEvent.reason_code.is_not(None),
                )
                .group_by(CapabilityDiagnosticEvent.reason_code)
            )
        ).all()
    )

    rollout_flags = (
        await db.scalars(
            select(FeatureFlag).where(
                FeatureFlag.organization_id == organization_id,
                FeatureFlag.flag_key.in_(
                    [
                        "organizer_console_entitlement_shadow",
                        "organizer_console_entitlement_enforce",
                    ]
                ),
            )
        )
    ).all()
    rollout_values = {row.flag_key: row.is_enabled for row in rollout_flags}
    rollout_mode = (
        "ENFORCED"
        if rollout_values.get("organizer_console_entitlement_enforce", False)
        else "SHADOW"
        if rollout_values.get("organizer_console_entitlement_shadow", False)
        else "LEGACY"
    )

    latest_comparison_at = await db.scalar(
        select(func.max(EntitlementShadowComparison.compared_at)).where(
            EntitlementShadowComparison.organization_id == organization_id
        )
    )
    latest_reconciliation_at = await db.scalar(
        select(func.max(UsageReconciliationRun.reconciled_at)).where(
            UsageReconciliationRun.organization_id == organization_id
        )
    )

    registry = registry_coverage()
    catalogue_keys = set(
        (
            await db.scalars(
                select(FeatureCatalog.key).where(FeatureCatalog.is_active.is_(True))
            )
        ).all()
    )
    registered_keys = set(registry["features"]) | set(registry["catalog_limit_keys"])
    missing_catalogue_keys = sorted(registered_keys - catalogue_keys)
    unknown_catalogue_keys = sorted(catalogue_keys - registered_keys)
    ungated_operations = sorted(
        operation
        for operation, sites in registry["operation_enforcement_sites"].items()
        if not sites
    )
    feature_backend_modes = {
        mode: sorted(
            key
            for key, definition in registry["features"].items()
            if definition.get("backend_mode") == mode
        )
        for mode in {
            definition.get("backend_mode", "NOT_IMPLEMENTED")
            for definition in registry["features"].values()
        }
    }
    unenforced_limits = sorted(
        key
        for key, mapping in registry["limit_enforcement_sites"].items()
        if mapping.get("status") == "ENFORCED" and not mapping.get("sites")
    )

    stale_cutoff = now - timedelta(days=90)
    flag_definitions = (
        await db.scalars(select(PlatformFlagDefinition).order_by(PlatformFlagDefinition.updated_at))
    ).all()
    override_counts = dict(
        (
            await db.execute(
                select(
                    PlatformFlagOverride.flag_id,
                    func.count(PlatformFlagOverride.id),
                )
                .where(
                    or_(
                        PlatformFlagOverride.organization_id == organization_id,
                        PlatformFlagOverride.organization_id.is_(None),
                    )
                )
                .group_by(PlatformFlagOverride.flag_id)
            )
        ).all()
    )
    stale_flags = []
    for definition in flag_definitions:
        reasons: list[str] = []
        if definition.expires_at and definition.expires_at <= now:
            reasons.append("EXPIRED")
        if not definition.is_active:
            reasons.append("INACTIVE")
        if definition.updated_at <= stale_cutoff:
            reasons.append("STALE")
        if int(override_counts.get(definition.id, 0)) == 0 and definition.rollout_percentage == 0:
            reasons.append("UNUSED")
        if reasons:
            stale_flags.append(
                {
                    "id": definition.id,
                    "flag_key": definition.flag_key,
                    "owner_team": definition.owner_team,
                    "updated_at": definition.updated_at,
                    "expires_at": definition.expires_at,
                    "reasons": reasons,
                }
            )

    return {
        "organization_id": organization_id,
        "generated_at": now,
        "window": {"since": since, "hours": since_hours},
        "availability": {
            "available": True,
            "source": "platform.capability_diagnostic_events",
            "freshness_at": events[0].occurred_at if events else None,
            "reason": None,
        },
        "rollout": {
            "mode": rollout_mode,
            "latest_comparison_at": latest_comparison_at,
            "latest_reconciliation_at": latest_reconciliation_at,
        },
        "summary": {
            "total": sum(int(value) for value in type_counts.values()),
            "by_type": {str(key): int(value) for key, value in type_counts.items()},
            "by_reason": {str(key): int(value) for key, value in reason_counts.items()},
            "gate_denials": int(type_counts.get("GATE_DENIAL", 0)),
            "resolution_failures": int(type_counts.get("RESOLUTION_FAILURE", 0)),
            "shadow_divergences": int(type_counts.get("SHADOW_DIVERGENCE", 0)),
            "metering_drift": int(type_counts.get("METERING_DRIFT", 0)),
            "legacy_resolver_calls": int(type_counts.get("LEGACY_RESOLVER_CALL", 0)),
        },
        "coverage": {
            "feature_count": registry["feature_count"],
            "limit_count": registry["limit_count"],
            "missing_catalogue_keys": missing_catalogue_keys,
            "unknown_catalogue_keys": unknown_catalogue_keys,
            "ungated_operations": ungated_operations,
            "unenforced_limits": unenforced_limits,
            "feature_backend_modes": feature_backend_modes,
        },
        "flag_hygiene": {
            "total_flags": len(flag_definitions),
            "attention_count": len(stale_flags),
            "items": stale_flags,
        },
        "items": [
            {
                "id": row.id,
                "event_id": row.event_id,
                "actor_user_id": row.actor_user_id,
                "event_type": row.event_type,
                "severity": row.severity,
                "reason_code": row.reason_code,
                "capability_key": row.capability_key,
                "operation_key": row.operation_key,
                "limit_key": row.limit_key,
                "source": row.source,
                "request_id": row.request_id,
                "correlation_id": row.correlation_id,
                "metadata": row.metadata_json,
                "occurred_at": row.occurred_at,
            }
            for row in events
        ],
    }


@router.get("/summary", response_model=OrganizationConsoleSummary)
async def get_summary(
    organization_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> OrganizationConsoleSummary:
    return await OrganizationConsoleService(db).summary(organization_id)


@router.post("/locations", response_model=OrganizationLocationOut, status_code=status.HTTP_201_CREATED)
async def create_location(
    organization_id: uuid.UUID,
    payload: OrganizationLocationCreate,
    request: Request,
    actor: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> OrganizationLocationOut:
    service = OrganizationConsoleService(db)
    await service.require_organization(organization_id)
    row = await OrganizationLocationCommandService(db).create(
        organization_id=organization_id, actor=actor, values=payload.model_dump()
    )
    return OrganizationLocationOut.model_validate(row)


@router.put("/locations/{location_id}", response_model=OrganizationLocationOut)
async def update_location(
    organization_id: uuid.UUID,
    location_id: uuid.UUID,
    payload: OrganizationLocationUpdate,
    request: Request,
    if_match: str | None = Header(default=None, alias="If-Match"),
    actor: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> OrganizationLocationOut:
    expected = str(payload.version)
    if if_match is None or if_match.strip('"') != expected:
        raise HTTPException(status_code=status.HTTP_412_PRECONDITION_FAILED, detail="Location version is stale")
    row = await OrganizationLocationCommandService(db).update(
        organization_id=organization_id, location_id=location_id, actor=actor,
        values=payload.model_dump(exclude={"version"}), if_match=payload.version,
    )
    return OrganizationLocationOut.model_validate(row)


@router.put("/security/policy")
async def update_security_policy(
    organization_id: uuid.UUID,
    payload: SecurityPolicyUpdate,
    request: Request,
    step_up: StepUpAuth,
    if_match: str | None = Header(default=None, alias="If-Match"),
    actor: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    await OrganizationConsoleService(db).require_organization(organization_id)
    if if_match is None or if_match.strip('"') != str(payload.version):
        raise HTTPException(status_code=412, detail="Security policy version is stale")
    return await OrganizationSecurityCommandService(db).update_policy(
        organization_id=organization_id, actor=actor,
        values=payload.model_dump(exclude={"version", "reason"}),
        if_match=payload.version, reason=payload.reason,
    )


@router.post("/security/trusted-devices/{device_id}/revoke")
async def revoke_trusted_device(organization_id: uuid.UUID, device_id: uuid.UUID, payload: LegalHoldRelease, request: Request, step_up: StepUpAuth, actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    return await OrganizationSecurityCommandService(db).revoke_trusted_device(
        organization_id=organization_id, device_id=device_id, actor=actor,
        reason=payload.reason,
    )


@router.post("/security/sessions/revoke-all")
async def revoke_organization_sessions(organization_id: uuid.UUID, payload: LegalHoldRelease, request: Request, step_up: StepUpAuth, actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    await OrganizationConsoleService(db).require_organization(organization_id)
    return await OrganizationSecurityCommandService(db).revoke_all_sessions(
        organization_id=organization_id, actor=actor, reason=payload.reason,
    )


@router.post("/governance/privacy-requests", status_code=status.HTTP_201_CREATED)
async def create_privacy_request(organization_id: uuid.UUID, payload: PrivacyRequestCreate, request: Request, step_up: StepUpAuth, actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    await OrganizationConsoleService(db).require_organization(organization_id)
    return await OrganizationGovernanceCommandService(db).create_privacy_request(
        organization_id=organization_id, actor=actor, request_type=payload.request_type,
        subject_reference=payload.subject_reference, due_at=payload.due_at,
        assigned_to=payload.assigned_to, reason=payload.reason,
        case_reference=payload.case_reference,
    )


@router.patch("/governance/privacy-requests/{privacy_request_id}")
async def update_privacy_request(organization_id: uuid.UUID, privacy_request_id: uuid.UUID, payload: PrivacyRequestUpdate, request: Request, step_up: StepUpAuth, actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    return await OrganizationGovernanceCommandService(db).update_privacy_request(
        organization_id=organization_id, privacy_request_id=privacy_request_id,
        actor=actor, status_value=payload.status, version=payload.version,
        result_reference=payload.result_reference, reason=payload.reason,
        case_reference=payload.case_reference,
    )


@router.put("/governance/retention-policies")
async def upsert_retention_policy(organization_id: uuid.UUID, payload: RetentionPolicyWrite, request: Request, step_up: StepUpAuth, actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    await OrganizationConsoleService(db).require_organization(organization_id)
    return await OrganizationGovernanceCommandService(db).upsert_retention_policy(
        organization_id=organization_id, actor=actor, data_category=payload.data_category,
        retention_days=payload.retention_days, disposition_action=payload.disposition_action,
        is_enabled=payload.is_enabled, version=payload.version, reason=payload.reason,
    )


@router.post("/governance/legal-holds", status_code=status.HTTP_201_CREATED)
async def create_legal_hold(organization_id: uuid.UUID, payload: LegalHoldCreate, request: Request, step_up: StepUpAuth, actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    await OrganizationConsoleService(db).require_organization(organization_id)
    return await OrganizationGovernanceCommandService(db).create_legal_hold(
        organization_id=organization_id, actor=actor, name=payload.name, scope=payload.scope,
        reason=payload.reason, starts_at=payload.starts_at, ends_at=payload.ends_at,
    )


@router.post("/governance/legal-holds/{hold_id}/release")
async def release_legal_hold(organization_id: uuid.UUID, hold_id: uuid.UUID, payload: LegalHoldRelease, request: Request, step_up: StepUpAuth, actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    return await OrganizationGovernanceCommandService(db).release_legal_hold(
        organization_id=organization_id, hold_id=hold_id, actor=actor, reason=payload.reason,
    )


def _validate_brand_references(organization_id: uuid.UUID, payload: BrandProfileUpdate) -> None:
    prefix = f"{organization_id}/"
    for value in payload.assets.values():
        if value is None:
            continue
        if not isinstance(value, str) or not value.lstrip("/").startswith(prefix):
            raise HTTPException(status_code=422, detail="Brand assets must use an organization-scoped storage reference")
    login_page = payload.login_page
    if login_page:
        for value in (login_page.logo_asset_ref, login_page.background_asset_ref):
            if value is not None and not value.lstrip("/").startswith(prefix):
                raise HTTPException(
                    status_code=422,
                    detail="Login-page assets must use an organization-scoped storage reference",
                )
    reserved = {"white_label", "login_page"}.intersection(payload.templates)
    if reserved:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "RESERVED_BRAND_TEMPLATE_KEYS",
                "keys": sorted(reserved),
            },
        )


async def _enforce_brand_capabilities(
    db: AsyncSession,
    organization_id: uuid.UUID,
    actor_id: uuid.UUID,
    templates: dict,
) -> None:
    white_label = templates.get("white_label")
    if isinstance(white_label, dict) and white_label.get("enabled"):
        await enforce_org_operation(
            db,
            organization_id,
            "branding.white_label.publish",
            user_id=actor_id,
        )
    login_page = templates.get("login_page")
    if isinstance(login_page, dict) and login_page.get("enabled"):
        await enforce_org_operation(
            db,
            organization_id,
            "branding.custom_login.publish",
            user_id=actor_id,
        )


@router.put("/branding")
async def update_branding(
    organization_id: uuid.UUID,
    payload: BrandProfileUpdate,
    request: Request,
    if_match: str | None = Header(default=None, alias="If-Match"),
    actor: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    await OrganizationConsoleService(db).require_organization(organization_id)
    _validate_brand_references(organization_id, payload)
    templates = dict(payload.templates)
    if payload.white_label is not None:
        templates["white_label"] = payload.white_label.model_dump(mode="json")
    if payload.login_page is not None:
        templates["login_page"] = payload.login_page.model_dump(mode="json")
    await _enforce_brand_capabilities(db, organization_id, actor.id, templates)
    return await PlatformBrandingCommandService(db).update(
        organization_id=organization_id, actor=actor, assets=payload.assets,
        tokens=payload.tokens, templates=templates, version=payload.version,
        if_match=if_match, reason=payload.reason,
    )


@router.post("/branding/publish")
async def publish_branding(
    organization_id: uuid.UUID,
    request: Request,
    step_up: StepUpAuth,
    if_match: str = Header(alias="If-Match"),
    actor: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    return await PlatformBrandingCommandService(db).publish(
        organization_id=organization_id, actor=actor, if_match=if_match,
    )


@router.post("/compliance/controls", status_code=status.HTTP_201_CREATED)
async def create_compliance_control(
    organization_id: uuid.UUID,
    payload: ComplianceControlCreate,
    request: Request,
    step_up: StepUpAuth,
    actor: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    await OrganizationConsoleService(db).require_organization(organization_id)
    return await OrganizationGovernanceCommandService(db).create_compliance_control(
        organization_id=organization_id, actor=actor,
        values=payload.model_dump(exclude={"reason"}),
    )


@router.patch("/compliance/controls/{control_id}")
async def update_compliance_control(organization_id: uuid.UUID, control_id: uuid.UUID, payload: ComplianceControlCreate, request: Request, step_up: StepUpAuth, if_match: int = Header(alias="If-Match", ge=1), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    return await OrganizationGovernanceCommandService(db).update_compliance_control(
        organization_id=organization_id, control_id=control_id, actor=actor,
        values=payload.model_dump(exclude={"reason"}), if_match=if_match,
        reason=payload.reason,
    )


@router.get("/compliance/controls/{control_id}/evidence")
async def list_compliance_evidence(organization_id: uuid.UUID, control_id: uuid.UUID, actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    control = await db.scalar(select(OrganizationComplianceControl.id).where(OrganizationComplianceControl.id == control_id, OrganizationComplianceControl.organization_id == organization_id))
    if not control: raise HTTPException(status_code=404, detail="Compliance control not found")
    rows = (await db.scalars(select(OrganizationComplianceEvidence).where(OrganizationComplianceEvidence.organization_id == organization_id, OrganizationComplianceEvidence.control_id == control_id).order_by(OrganizationComplianceEvidence.collected_at.desc()))).all()
    return {"items": [OrganizationConsoleService._model_dict(row) for row in rows], "freshness_at": datetime.now(timezone.utc), "source": "platform_compliance.organization_compliance_evidence"}


@router.post("/compliance/controls/{control_id}/evidence", status_code=status.HTTP_201_CREATED)
async def create_compliance_evidence(organization_id: uuid.UUID, control_id: uuid.UUID, payload: ComplianceEvidenceCreate, request: Request, step_up: StepUpAuth, actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    return await OrganizationGovernanceCommandService(db).create_compliance_evidence(
        organization_id=organization_id, control_id=control_id, actor=actor,
        values=payload.model_dump(exclude={"reason"}), reason=payload.reason,
    )


@router.post("/advanced/jobs", response_model=LifecycleJobOut, status_code=status.HTTP_202_ACCEPTED)
async def create_lifecycle_job(
    organization_id: uuid.UUID,
    payload: LifecycleJobCreate,
    request: Request,
    step_up: StepUpAuth,
    idempotency_key: str = Header(min_length=16, max_length=120, alias="Idempotency-Key"),
    actor: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> LifecycleJobOut:
    service = OrganizationConsoleService(db)
    await service.require_organization(organization_id)
    if payload.job_type in {"CLONE", "MERGE"} and not payload.target_organization_id:
        raise HTTPException(status_code=422, detail="A target organization is required")
    if payload.target_organization_id:
        if payload.target_organization_id == organization_id:
            raise HTTPException(status_code=422, detail="Source and target organizations must differ")
        await service.require_organization(payload.target_organization_id)
    normalized_type = "PURGE" if payload.job_type == "DELETE" else payload.job_type
    manifest, manifest_checksum = await OrganizationLifecycleService.build_manifest(
        db, organization_id, normalized_type, payload.target_organization_id
    )
    if manifest["blocked"]:
        raise HTTPException(status_code=409, detail="An active legal hold prevents this lifecycle operation")
    requires_approval = bool(manifest["requires_two_person_approval"])
    job = await OrganizationLifecycleCommandService(db).create(
        organization_id=organization_id, actor=actor,
        target_organization_id=payload.target_organization_id, job_type=normalized_type,
        manifest=manifest, manifest_checksum=manifest_checksum, reason=payload.reason,
        idempotency_key=idempotency_key, requires_approval=requires_approval,
    )
    return LifecycleJobOut.model_validate(job)


@router.get("/advanced/jobs", response_model=list[LifecycleJobOut])
async def list_lifecycle_jobs(
    organization_id: uuid.UUID,
    status_filter: str | None = None,
    actor: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> list[LifecycleJobOut]:
    await OrganizationConsoleService(db).require_organization(organization_id)
    query = select(OrganizationLifecycleJob).where(OrganizationLifecycleJob.organization_id == organization_id)
    if status_filter:
        query = query.where(OrganizationLifecycleJob.status == status_filter.upper())
    rows = (await db.scalars(query.order_by(OrganizationLifecycleJob.created_at.desc()).limit(100))).all()
    return [LifecycleJobOut.model_validate(row) for row in rows]


@router.get("/advanced/jobs/{job_id}", response_model=LifecycleJobOut)
async def get_lifecycle_job(
    organization_id: uuid.UUID,
    job_id: uuid.UUID,
    actor: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> LifecycleJobOut:
    row = await db.scalar(select(OrganizationLifecycleJob).where(OrganizationLifecycleJob.id == job_id, OrganizationLifecycleJob.organization_id == organization_id))
    if not row:
        raise HTTPException(status_code=404, detail="Lifecycle job not found")
    return LifecycleJobOut.model_validate(row)


@router.post("/advanced/jobs/{job_id}/approval", response_model=LifecycleJobOut)
async def decide_lifecycle_job(
    organization_id: uuid.UUID,
    job_id: uuid.UUID,
    payload: LifecycleApprovalDecision,
    request: Request,
    step_up: StepUpAuth,
    actor: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> LifecycleJobOut:
    job = await OrganizationLifecycleCommandService(db).decide(
        organization_id=organization_id, job_id=job_id, actor=actor,
        decision=payload.decision, reason=payload.reason, version=payload.version,
    )
    return LifecycleJobOut.model_validate(job)


@router.post("/advanced/jobs/{job_id}/retry", response_model=LifecycleJobOut)
async def retry_lifecycle_job(
    organization_id: uuid.UUID,
    job_id: uuid.UUID,
    payload: LifecycleApprovalDecision,
    request: Request,
    step_up: StepUpAuth,
    actor: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
) -> LifecycleJobOut:
    if payload.decision != "APPROVED":
        raise HTTPException(status_code=409, detail="Only failed jobs can be approved for retry")
    job = await OrganizationLifecycleCommandService(db).retry(
        organization_id=organization_id, job_id=job_id, actor=actor,
        reason=payload.reason, version=payload.version,
    )
    return LifecycleJobOut.model_validate(job)


@router.get("/commercial/access-requests")
async def list_commercial_access_requests(
    organization_id: uuid.UUID,
    request_status: str | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_db),
):
    await OrganizationConsoleService(db).require_organization(organization_id)
    filters = [CommercialAccessRequest.organization_id == organization_id]
    if request_status:
        filters.append(CommercialAccessRequest.status == request_status.upper())
    rows = (await db.scalars(
        select(CommercialAccessRequest)
        .where(*filters)
        .order_by(CommercialAccessRequest.created_at.desc())
        .limit(200)
    )).all()
    plans = {
        row.id: row for row in (await db.scalars(select(SubscriptionPlan).where(
            SubscriptionPlan.id.in_({item.requested_plan_id for item in rows})
        ))).all()
    } if rows else {}
    return {"items": [{
        "id": row.id,
        "event_id": row.event_id,
        "request_type": row.request_type,
        "requested_plan_id": row.requested_plan_id,
        "requested_plan_name": plans[row.requested_plan_id].name if row.requested_plan_id in plans else None,
        "requested_plan_version": plans[row.requested_plan_id].version if row.requested_plan_id in plans else None,
        "requested_addon_keys": row.requested_addon_keys,
        "billing_profile": row.billing_profile,
        "quoted_amount": row.quoted_amount,
        "currency": row.currency,
        "reason": row.reason,
        "case_reference": row.case_reference,
        "status": row.status,
        "requested_by": row.requested_by,
        "decided_by": row.decided_by,
        "decision_reason": row.decision_reason,
        "decided_at": row.decided_at,
        "applied_subscription_id": row.applied_subscription_id,
        "version": row.version,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    } for row in rows], "freshness_at": datetime.now(timezone.utc)}


@router.post("/commercial/access-requests/{access_request_id}/decision")
async def decide_commercial_access_request(
    organization_id: uuid.UUID,
    access_request_id: uuid.UUID,
    payload: CommercialAccessDecision,
    request: Request,
    step_up: StepUpAuth,
    expected_version: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=16, max_length=160),
    actor: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    await OrganizationConsoleService(db).require_organization(organization_id)
    fingerprint = request_fingerprint(payload.model_dump(mode="json"))
    return await CommercialAccessCommandService(db).decide(
        organization_id=organization_id, access_request_id=access_request_id,
        actor=actor, decision=payload.decision, reason=payload.reason,
        case_reference=payload.case_reference, effective_at=payload.effective_at,
        ends_at=payload.ends_at, expected_version=expected_version,
        idempotency_key=idempotency_key, request_hash=fingerprint,
    )


@router.get("/events")
async def list_organization_console_events(
    organization_id: uuid.UUID,
    include_archived: bool = False,
    limit: int = Query(default=100, ge=1, le=200),
    actor: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    await OrganizationConsoleService(db).require_organization(organization_id)
    filters = [Event.organization_id == organization_id]
    if not include_archived:
        filters.extend(
            (
                Event.deleted_at.is_(None),
                ~func.lower(Event.status).in_(["archived", "cancelled"]),
            )
        )
    rows = (
        await db.scalars(
            select(Event)
            .where(*filters)
            .order_by(Event.start_date.desc(), Event.id.desc())
            .limit(limit)
        )
    ).all()
    return {
        "items": [_console_event_out(row) for row in rows],
        "has_more": len(rows) == limit,
        "availability": "AVAILABLE",
        "freshness_at": datetime.now(timezone.utc),
        "source": "events.events",
    }


@router.post("/events", status_code=status.HTTP_201_CREATED)
async def provision_organization_event(
    organization_id: uuid.UUID,
    payload: EventWorkspaceMutation,
    request: Request,
    step_up: StepUpAuth,
    idempotency_key: str = Header(
        ...,
        alias="Idempotency-Key",
        min_length=16,
        max_length=160,
    ),
    actor: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    command = GovernedMutationCommandService(db)
    await OrganizationConsoleService(db).require_organization(organization_id)
    event_payload = EventCreate.model_validate(payload.data)
    operation_key = "event.provision"
    request_hash = request_fingerprint(
        {
            "operation": operation_key,
            "organization_id": str(organization_id),
            "payload": payload.model_dump(mode="json"),
        }
    )
    replay = await _governed_mutation_replay(
        db,
        organization_id=organization_id,
        actor_id=actor.id,
        operation_key=operation_key,
        idempotency_key=idempotency_key,
        request_hash=request_hash,
    )
    if replay is not None:
        return replay

    event = await EventMutationService.create(
        db,
        organization_id=organization_id,
        payload=event_payload,
        actor_user_id=actor.id,
        idempotency_key=idempotency_key,
        source="organization_console",
    )
    response = _console_event_out(event)
    db.add(
        _audit(
            request,
            actor,
            organization_id,
            "EVENT_PROVISIONED",
            "event",
            event.id,
            new_state={
                **response,
                "reason": payload.reason,
                "case_reference": payload.case_reference,
                "idempotency_key": idempotency_key,
            },
            sensitive=True,
        )
    )
    db.add(
        _governed_mutation_receipt(
            organization_id=organization_id,
            actor_id=actor.id,
            operation_key=operation_key,
            idempotency_key=idempotency_key,
            request_hash=request_hash,
            resource_type="event",
            resource_id=event.id,
            response=response,
        )
    )
    await command.commit(organization_id=organization_id)
    return response


@router.post("/events/{event_id}/contract", status_code=status.HTTP_201_CREATED)
async def create_event_contract(
    organization_id: uuid.UUID,
    event_id: uuid.UUID,
    payload: EventContractCreate,
    request: Request,
    step_up: StepUpAuth,
    if_match: int = Header(..., alias="If-Match", ge=0),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=16, max_length=160),
    actor: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    operation_key = "event_contract.apply"
    request_hash = request_fingerprint({
        "operation": operation_key,
        "event_id": str(event_id),
        "if_match": if_match,
        "payload": payload.model_dump(mode="json"),
    })
    return await EventContractCommandService(db).apply(
        organization_id=organization_id, event_id=event_id, actor=actor,
        payload=payload, expected_version=if_match,
        idempotency_key=idempotency_key, request_hash=request_hash,
    )


@router.get("/events/{event_id}/contract")
async def get_event_contract(organization_id: uuid.UUID, event_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    await _require_scoped_event(db, organization_id, event_id)
    rows = (await db.scalars(select(EventCommercialContract).where(EventCommercialContract.organization_id == organization_id, EventCommercialContract.event_id == event_id).order_by(EventCommercialContract.version.desc()))).all()
    return {"items": [{"id": row.id, "version": row.version, "status": row.status, "plan_key": row.plan_key, "plan_version": row.plan_version, "currency": row.currency, "entitlements": row.entitlements, "hard_ceilings": row.hard_ceilings, "addons": row.addons, "source": row.source, "effective_at": row.effective_at, "ends_at": row.ends_at, "created_at": row.created_at} for row in rows]}


@router.get("/events/{event_id}/entitlements/resolved")
async def resolved_entitlements(
    organization_id: uuid.UUID,
    event_id: uuid.UUID,
    actor: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    await _require_scoped_event(db, organization_id, event_id)
    resolved = await EventEntitlementService.resolve(db, organization_id, event_id, explain=True)
    resolved.pop("activation", None)
    if not resolved["availability"]["available"]:
        raise HTTPException(status_code=409, detail={"code": "EVENT_ACTIVATION_SNAPSHOT_REQUIRED", "message": "The event has no immutable entitlement snapshot."})
    capability_result = await CapabilityService.resolve_event(
        db,
        organization_id,
        event_id,
        user_id=actor.id,
        environment=settings.environment.upper(),
    )
    resolved["capabilities"] = capability_result["features"]
    resolved["limits"] = capability_result["limits"]
    resolved["restrictions"] = capability_result["restrictions"]
    resolved["flags"] = capability_result["flags"]
    resolved["rollout_mode"] = capability_result["rollout_mode"]
    resolved["freshness_at"] = capability_result["freshness_at"]
    return resolved


@router.post("/override-requests", status_code=status.HTTP_201_CREATED)
async def request_override(organization_id: uuid.UUID, payload: OverrideRequestCreate, request: Request, step_up: StepUpAuth, idempotency_key: str = Header(min_length=16, max_length=120, alias="Idempotency-Key"), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    command = GovernedMutationCommandService(db)
    await OrganizationConsoleService(db).require_organization(organization_id)
    if payload.event_id: await _require_scoped_event(db, organization_id, payload.event_id)
    operation_key = "entitlement_override.request"
    request_hash = request_fingerprint({"operation": operation_key, "payload": payload.model_dump(mode="json")})
    replay = await _governed_mutation_replay(db, organization_id=organization_id, actor_id=actor.id, operation_key=operation_key, idempotency_key=idempotency_key, request_hash=request_hash)
    if replay is not None:
        return replay
    existing = await db.scalar(select(EntitlementOverrideRequest).where(EntitlementOverrideRequest.organization_id == organization_id, EntitlementOverrideRequest.idempotency_key == idempotency_key))
    if existing:
        raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT"})
    effective_at = payload.effective_at or datetime.now(timezone.utc)
    expires_at = payload.expires_at or (effective_at + timedelta(days=30))
    row = EntitlementOverrideRequest(organization_id=organization_id, requested_by=actor.id, idempotency_key=idempotency_key, effective_at=effective_at, expires_at=expires_at, **payload.model_dump(exclude={"effective_at", "expires_at"}))
    db.add(row); await db.flush()
    response = {"id": row.id, "status": row.status, "version": row.version}
    db.add(_audit(request, actor, organization_id, "ENTITLEMENT_OVERRIDE_REQUESTED", "entitlement_override_request", row.id, new_state={"event_id": str(row.event_id) if row.event_id else None, "key": row.entitlement_key, "operation": row.operation, "idempotency_key": idempotency_key, "version": row.version}, sensitive=True))
    db.add(_governed_mutation_receipt(organization_id=organization_id, actor_id=actor.id, operation_key=operation_key, idempotency_key=idempotency_key, request_hash=request_hash, resource_type="entitlement_override_request", resource_id=row.id, response=response))
    await command.commit(organization_id=organization_id)
    return response


@router.get("/override-requests")
async def list_override_requests(organization_id: uuid.UUID, event_id: uuid.UUID | None = None, request_status: str | None = None, limit: int = 50, db: AsyncSession = Depends(get_db)):
    await OrganizationConsoleService(db).require_organization(organization_id)
    query = select(EntitlementOverrideRequest).where(EntitlementOverrideRequest.organization_id == organization_id)
    if event_id:
        await _require_scoped_event(db, organization_id, event_id)
        query = query.where(EntitlementOverrideRequest.event_id == event_id)
    if request_status: query = query.where(EntitlementOverrideRequest.status == request_status)
    rows = (await db.scalars(query.order_by(EntitlementOverrideRequest.created_at.desc()).limit(min(max(limit, 1), 100)))).all()
    return {"items": [{"id": row.id, "event_id": row.event_id, "entitlement_key": row.entitlement_key, "operation": row.operation, "requested_value": row.requested_value, "reason": row.reason, "case_reference": row.case_reference, "status": row.status, "version": row.version, "requested_by": row.requested_by, "approved_by": row.approved_by, "effective_at": row.effective_at, "expires_at": row.expires_at, "created_at": row.created_at, "decided_at": row.decided_at, "revocation_status": row.revocation_status, "revocation_reason": row.revocation_reason, "revocation_case_reference": row.revocation_case_reference, "revocation_requested_by": row.revocation_requested_by, "revocation_approved_by": row.revocation_approved_by, "revocation_requested_at": row.revocation_requested_at, "revoked_at": row.revoked_at, "revoked_by": row.revoked_by} for row in rows]}


@router.post("/override-requests/{override_id}/decision")
async def decide_override(organization_id: uuid.UUID, override_id: uuid.UUID, payload: ApprovalDecision, request: Request, step_up: StepUpAuth, if_match: int = Header(..., alias="If-Match", ge=1), idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=16, max_length=160), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    command = GovernedMutationCommandService(db)
    operation_key = "entitlement_override.decision"
    request_hash = request_fingerprint({"operation": operation_key, "override_id": str(override_id), "if_match": if_match, "payload": payload.model_dump(mode="json")})
    replay = await _governed_mutation_replay(db, organization_id=organization_id, actor_id=actor.id, operation_key=operation_key, idempotency_key=idempotency_key, request_hash=request_hash)
    if replay is not None:
        return replay
    row = await db.scalar(select(EntitlementOverrideRequest).where(EntitlementOverrideRequest.id == override_id, EntitlementOverrideRequest.organization_id == organization_id).with_for_update())
    if not row: raise HTTPException(status_code=404, detail="Override request not found")
    if row.version != if_match: raise HTTPException(status_code=412, detail={"code": "VERSION_CONFLICT", "current_version": row.version})
    if row.status != "PENDING": raise HTTPException(status_code=409, detail="Override request is already decided")
    if row.requested_by == actor.id: raise HTTPException(status_code=409, detail="Requester cannot approve their own request")
    row.status = payload.decision; row.approved_by = actor.id; row.decided_at = datetime.now(timezone.utc); row.version += 1
    response = {"id": row.id, "status": row.status, "decided_at": row.decided_at, "version": row.version}
    db.add(_audit(request, actor, organization_id, f"ENTITLEMENT_OVERRIDE_{payload.decision}", "entitlement_override_request", row.id, old_state={"status": "PENDING", "version": if_match}, new_state={"decision": payload.decision, "reason": payload.reason, "version": row.version, "idempotency_key": idempotency_key}, sensitive=True))
    db.add(_governed_mutation_receipt(organization_id=organization_id, actor_id=actor.id, operation_key=operation_key, idempotency_key=idempotency_key, request_hash=request_hash, resource_type="entitlement_override_request", resource_id=row.id, response=response))
    await command.commit(organization_id=organization_id)
    if payload.decision == "APPROVED" and row.expires_at:
        try:
            from app.tasks.organization_console_tasks import expire_override
            countdown = max(0, int((row.expires_at - datetime.now(timezone.utc)).total_seconds()))
            expire_override.apply_async(args=[str(organization_id), str(row.id)], countdown=countdown)
        except Exception:
            # The approved record remains authoritative; operational monitoring
            # can retry the tenant-scoped expiry task without changing semantics.
            pass
    return response


@router.post("/override-requests/{override_id}/revocation-request", status_code=status.HTTP_202_ACCEPTED)
async def request_override_revocation(organization_id: uuid.UUID, override_id: uuid.UUID, payload: ControlRevocationRequest, request: Request, step_up: StepUpAuth, if_match: int = Header(..., alias="If-Match", ge=1), idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=16, max_length=160), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    command = GovernedMutationCommandService(db)
    operation_key = "entitlement_override.revocation.request"
    request_hash = request_fingerprint({"operation": operation_key, "override_id": str(override_id), "if_match": if_match, "payload": payload.model_dump(mode="json")})
    replay = await _governed_mutation_replay(db, organization_id=organization_id, actor_id=actor.id, operation_key=operation_key, idempotency_key=idempotency_key, request_hash=request_hash)
    if replay is not None:
        return replay
    row = await db.scalar(select(EntitlementOverrideRequest).where(EntitlementOverrideRequest.id == override_id, EntitlementOverrideRequest.organization_id == organization_id).with_for_update())
    if not row: raise HTTPException(status_code=404, detail="Override request not found")
    if row.version != if_match: raise HTTPException(status_code=412, detail={"code": "VERSION_CONFLICT", "current_version": row.version})
    if row.status != "APPROVED": raise HTTPException(status_code=409, detail="Only an active approved override can be revoked")
    if row.revocation_status == "PENDING": raise HTTPException(status_code=409, detail="A revocation is already pending")
    row.revocation_status = "PENDING"
    row.revocation_reason = payload.reason
    row.revocation_case_reference = payload.case_reference
    row.revocation_requested_by = actor.id
    row.revocation_approved_by = None
    row.revocation_requested_at = datetime.now(timezone.utc)
    row.version += 1
    response = {"id": row.id, "status": row.status, "revocation_status": row.revocation_status, "version": row.version}
    db.add(_audit(request, actor, organization_id, "ENTITLEMENT_OVERRIDE_REVOCATION_REQUESTED", "entitlement_override_request", row.id, old_state={"version": if_match}, new_state={"reason": payload.reason, "case_reference": payload.case_reference, "version": row.version, "idempotency_key": idempotency_key}, sensitive=True))
    db.add(_governed_mutation_receipt(organization_id=organization_id, actor_id=actor.id, operation_key=operation_key, idempotency_key=idempotency_key, request_hash=request_hash, resource_type="entitlement_override_request", resource_id=row.id, response=response))
    await command.commit(organization_id=organization_id)
    return response


@router.post("/override-requests/{override_id}/revocation-decision")
async def decide_override_revocation(organization_id: uuid.UUID, override_id: uuid.UUID, payload: ApprovalDecision, request: Request, step_up: StepUpAuth, if_match: int = Header(..., alias="If-Match", ge=1), idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=16, max_length=160), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    command = GovernedMutationCommandService(db)
    operation_key = "entitlement_override.revocation.decision"
    request_hash = request_fingerprint({"operation": operation_key, "override_id": str(override_id), "if_match": if_match, "payload": payload.model_dump(mode="json")})
    replay = await _governed_mutation_replay(db, organization_id=organization_id, actor_id=actor.id, operation_key=operation_key, idempotency_key=idempotency_key, request_hash=request_hash)
    if replay is not None:
        return replay
    row = await db.scalar(select(EntitlementOverrideRequest).where(EntitlementOverrideRequest.id == override_id, EntitlementOverrideRequest.organization_id == organization_id).with_for_update())
    if not row: raise HTTPException(status_code=404, detail="Override request not found")
    if row.version != if_match: raise HTTPException(status_code=412, detail={"code": "VERSION_CONFLICT", "current_version": row.version})
    if row.status != "APPROVED" or row.revocation_status != "PENDING": raise HTTPException(status_code=409, detail="Override revocation is not awaiting approval")
    if row.revocation_requested_by == actor.id: raise HTTPException(status_code=409, detail="Requester cannot approve their own revocation")
    row.revocation_status = payload.decision
    row.revocation_approved_by = actor.id
    if payload.decision == "APPROVED":
        row.status = "REVOKED"
        row.revoked_at = datetime.now(timezone.utc)
        row.revoked_by = actor.id
    row.version += 1
    response = {"id": row.id, "status": row.status, "revocation_status": row.revocation_status, "revoked_at": row.revoked_at, "version": row.version}
    db.add(_audit(request, actor, organization_id, f"ENTITLEMENT_OVERRIDE_REVOCATION_{payload.decision}", "entitlement_override_request", row.id, old_state={"status": "APPROVED", "revocation_status": "PENDING", "version": if_match}, new_state={"status": row.status, "revocation_status": row.revocation_status, "reason": payload.reason, "version": row.version, "idempotency_key": idempotency_key}, sensitive=True))
    db.add(_governed_mutation_receipt(organization_id=organization_id, actor_id=actor.id, operation_key=operation_key, idempotency_key=idempotency_key, request_hash=request_hash, resource_type="entitlement_override_request", resource_id=row.id, response=response))
    await command.commit(organization_id=organization_id)
    return response


@router.get("/restrictions")
async def list_capability_restrictions(organization_id: uuid.UUID, event_id: uuid.UUID | None = None, request_status: str | None = None, db: AsyncSession = Depends(get_db)):
    await OrganizationConsoleService(db).require_organization(organization_id)
    query = select(CapabilityRestriction).where(CapabilityRestriction.organization_id == organization_id)
    if event_id:
        await _require_scoped_event(db, organization_id, event_id)
        query = query.where(CapabilityRestriction.event_id == event_id)
    if request_status:
        query = query.where(CapabilityRestriction.status == request_status)
    rows = (await db.scalars(query.order_by(CapabilityRestriction.created_at.desc()).limit(100))).all()
    return {"items": [{column.name: getattr(row, column.name) for column in row.__table__.columns} for row in rows]}


@router.post("/restrictions", status_code=status.HTTP_202_ACCEPTED)
async def request_capability_restriction(organization_id: uuid.UUID, payload: CapabilityRestrictionCreate, request: Request, step_up: StepUpAuth, idempotency_key: str = Header(min_length=16, max_length=120, alias="Idempotency-Key"), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    command = GovernedMutationCommandService(db)
    await OrganizationConsoleService(db).require_organization(organization_id)
    if payload.event_id:
        await _require_scoped_event(db, organization_id, payload.event_id)
    operation_key = "capability_restriction.request"
    request_hash = request_fingerprint({"operation": operation_key, "payload": payload.model_dump(mode="json")})
    replay = await _governed_mutation_replay(db, organization_id=organization_id, actor_id=actor.id, operation_key=operation_key, idempotency_key=idempotency_key, request_hash=request_hash)
    if replay is not None:
        return replay
    existing = await db.scalar(select(CapabilityRestriction).where(CapabilityRestriction.organization_id == organization_id, CapabilityRestriction.idempotency_key == idempotency_key))
    if existing:
        raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT"})
    effective_at = payload.effective_at or datetime.now(timezone.utc)
    expires_at = payload.expires_at or (effective_at + timedelta(hours=24))
    row = CapabilityRestriction(organization_id=organization_id, requested_by=actor.id, idempotency_key=idempotency_key, effective_at=effective_at, expires_at=expires_at, **payload.model_dump(exclude={"effective_at", "expires_at"}))
    db.add(row); await db.flush()
    response = {"id": row.id, "status": row.status, "version": row.version}
    db.add(_audit(request, actor, organization_id, "CAPABILITY_RESTRICTION_REQUESTED", "capability_restriction", row.id, new_state={"event_id": str(row.event_id) if row.event_id else None, "capability_key": row.capability_key, "reason_code": row.reason_code, "expires_at": row.expires_at, "version": row.version, "idempotency_key": idempotency_key}, sensitive=True))
    db.add(_governed_mutation_receipt(organization_id=organization_id, actor_id=actor.id, operation_key=operation_key, idempotency_key=idempotency_key, request_hash=request_hash, resource_type="capability_restriction", resource_id=row.id, response=response))
    await command.commit(organization_id=organization_id)
    return response


@router.post("/restrictions/{restriction_id}/decision")
async def decide_capability_restriction(organization_id: uuid.UUID, restriction_id: uuid.UUID, payload: ApprovalDecision, request: Request, step_up: StepUpAuth, if_match: int = Header(..., alias="If-Match", ge=1), idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=16, max_length=160), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    command = GovernedMutationCommandService(db)
    operation_key = "capability_restriction.decision"
    request_hash = request_fingerprint({"operation": operation_key, "restriction_id": str(restriction_id), "if_match": if_match, "payload": payload.model_dump(mode="json")})
    replay = await _governed_mutation_replay(db, organization_id=organization_id, actor_id=actor.id, operation_key=operation_key, idempotency_key=idempotency_key, request_hash=request_hash)
    if replay is not None:
        return replay
    row = await db.scalar(select(CapabilityRestriction).where(CapabilityRestriction.id == restriction_id, CapabilityRestriction.organization_id == organization_id).with_for_update())
    if not row:
        raise HTTPException(status_code=404, detail="Restriction request not found")
    if row.version != if_match:
        raise HTTPException(status_code=412, detail={"code": "VERSION_CONFLICT", "current_version": row.version})
    if row.status != "PENDING":
        raise HTTPException(status_code=409, detail="Restriction request is already decided")
    if row.requested_by == actor.id:
        raise HTTPException(status_code=409, detail="Requester cannot approve their own restriction")
    row.status = payload.decision
    row.approved_by = actor.id
    row.version += 1
    response = {"id": row.id, "status": row.status, "version": row.version}
    db.add(_audit(request, actor, organization_id, f"CAPABILITY_RESTRICTION_{payload.decision}", "capability_restriction", row.id, old_state={"status": "PENDING", "version": if_match}, new_state={"decision": payload.decision, "reason": payload.reason, "version": row.version, "idempotency_key": idempotency_key}, sensitive=True))
    db.add(_governed_mutation_receipt(organization_id=organization_id, actor_id=actor.id, operation_key=operation_key, idempotency_key=idempotency_key, request_hash=request_hash, resource_type="capability_restriction", resource_id=row.id, response=response))
    await command.commit(organization_id=organization_id)
    return response


@router.post("/restrictions/{restriction_id}/revoke")
async def revoke_capability_restriction(organization_id: uuid.UUID, restriction_id: uuid.UUID, payload: ApprovalDecision, request: Request, step_up: StepUpAuth, actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    raise HTTPException(
        status_code=409,
        detail={
            "code": "GOVERNED_REVOCATION_REQUIRED",
            "message": "Request and independently approve revocation through the revocation workflow.",
        },
    )


@router.post("/restrictions/{restriction_id}/revocation-request", status_code=status.HTTP_202_ACCEPTED)
async def request_capability_restriction_revocation(organization_id: uuid.UUID, restriction_id: uuid.UUID, payload: ControlRevocationRequest, request: Request, step_up: StepUpAuth, if_match: int = Header(..., alias="If-Match", ge=1), idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=16, max_length=160), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    command = GovernedMutationCommandService(db)
    operation_key = "capability_restriction.revocation.request"
    request_hash = request_fingerprint({"operation": operation_key, "restriction_id": str(restriction_id), "if_match": if_match, "payload": payload.model_dump(mode="json")})
    replay = await _governed_mutation_replay(db, organization_id=organization_id, actor_id=actor.id, operation_key=operation_key, idempotency_key=idempotency_key, request_hash=request_hash)
    if replay is not None:
        return replay
    row = await db.scalar(select(CapabilityRestriction).where(CapabilityRestriction.id == restriction_id, CapabilityRestriction.organization_id == organization_id).with_for_update())
    if not row: raise HTTPException(status_code=404, detail="Restriction request not found")
    if row.version != if_match: raise HTTPException(status_code=412, detail={"code": "VERSION_CONFLICT", "current_version": row.version})
    if row.status != "APPROVED" or row.revoked_at: raise HTTPException(status_code=409, detail="Only an active approved restriction can be revoked")
    if row.revocation_status == "PENDING": raise HTTPException(status_code=409, detail="A revocation is already pending")
    row.revocation_status = "PENDING"
    row.revocation_reason = payload.reason
    row.revocation_case_reference = payload.case_reference
    row.revocation_requested_by = actor.id
    row.revocation_approved_by = None
    row.revocation_requested_at = datetime.now(timezone.utc)
    row.version += 1
    response = {"id": row.id, "status": row.status, "revocation_status": row.revocation_status, "version": row.version}
    db.add(_audit(request, actor, organization_id, "CAPABILITY_RESTRICTION_REVOCATION_REQUESTED", "capability_restriction", row.id, old_state={"version": if_match}, new_state={"reason": payload.reason, "case_reference": payload.case_reference, "version": row.version, "idempotency_key": idempotency_key}, sensitive=True))
    db.add(_governed_mutation_receipt(organization_id=organization_id, actor_id=actor.id, operation_key=operation_key, idempotency_key=idempotency_key, request_hash=request_hash, resource_type="capability_restriction", resource_id=row.id, response=response))
    await command.commit(organization_id=organization_id)
    return response


@router.post("/restrictions/{restriction_id}/revocation-decision")
async def decide_capability_restriction_revocation(organization_id: uuid.UUID, restriction_id: uuid.UUID, payload: ApprovalDecision, request: Request, step_up: StepUpAuth, if_match: int = Header(..., alias="If-Match", ge=1), idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=16, max_length=160), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    command = GovernedMutationCommandService(db)
    operation_key = "capability_restriction.revocation.decision"
    request_hash = request_fingerprint({"operation": operation_key, "restriction_id": str(restriction_id), "if_match": if_match, "payload": payload.model_dump(mode="json")})
    replay = await _governed_mutation_replay(db, organization_id=organization_id, actor_id=actor.id, operation_key=operation_key, idempotency_key=idempotency_key, request_hash=request_hash)
    if replay is not None:
        return replay
    row = await db.scalar(select(CapabilityRestriction).where(CapabilityRestriction.id == restriction_id, CapabilityRestriction.organization_id == organization_id).with_for_update())
    if not row: raise HTTPException(status_code=404, detail="Restriction request not found")
    if row.version != if_match: raise HTTPException(status_code=412, detail={"code": "VERSION_CONFLICT", "current_version": row.version})
    if row.status != "APPROVED" or row.revocation_status != "PENDING": raise HTTPException(status_code=409, detail="Restriction revocation is not awaiting approval")
    if row.revocation_requested_by == actor.id: raise HTTPException(status_code=409, detail="Requester cannot approve their own revocation")
    row.revocation_status = payload.decision
    row.revocation_approved_by = actor.id
    if payload.decision == "APPROVED":
        row.status = "REVOKED"
        row.revoked_at = datetime.now(timezone.utc)
        row.revoked_by = actor.id
    row.version += 1
    response = {"id": row.id, "status": row.status, "revocation_status": row.revocation_status, "revoked_at": row.revoked_at, "version": row.version}
    db.add(_audit(request, actor, organization_id, f"CAPABILITY_RESTRICTION_REVOCATION_{payload.decision}", "capability_restriction", row.id, old_state={"status": "APPROVED", "revocation_status": "PENDING", "version": if_match}, new_state={"status": row.status, "revocation_status": row.revocation_status, "reason": payload.reason, "version": row.version, "idempotency_key": idempotency_key}, sensitive=True))
    db.add(_governed_mutation_receipt(organization_id=organization_id, actor_id=actor.id, operation_key=operation_key, idempotency_key=idempotency_key, request_hash=request_hash, resource_type="capability_restriction", resource_id=row.id, response=response))
    await command.commit(organization_id=organization_id)
    return response


@router.post("/usage/adjustments", status_code=status.HTTP_201_CREATED)
async def create_usage_adjustment(organization_id: uuid.UUID, payload: UsageAdjustmentCreate, request: Request, step_up: StepUpAuth, idempotency_key: str = Header(min_length=16, max_length=160, alias="Idempotency-Key"), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    command = GovernedMutationCommandService(db)
    await OrganizationConsoleService(db).require_organization(organization_id)
    if payload.event_id: await _require_scoped_event(db, organization_id, payload.event_id)
    operation_key = "usage_adjustment.apply"
    request_hash = request_fingerprint({"operation": operation_key, "payload": payload.model_dump(mode="json")})
    replay = await _governed_mutation_replay(db, organization_id=organization_id, actor_id=actor.id, operation_key=operation_key, idempotency_key=idempotency_key, request_hash=request_hash)
    if replay is not None:
        return replay
    approval = await db.scalar(select(EntitlementOverrideRequest).where(EntitlementOverrideRequest.id == payload.approved_request_id, EntitlementOverrideRequest.organization_id == organization_id).with_for_update())
    expected_key = f"usage.{payload.metric_key}"
    if not approval or approval.status != "APPROVED" or approval.entitlement_key != expected_key:
        raise HTTPException(status_code=409, detail="An approved matching usage request is required")
    if approval.requested_by == approval.approved_by:
        raise HTTPException(status_code=409, detail="Usage request lacks independent approval")
    if (approval.operation == "RESET") != (payload.adjustment_type == "RESET"):
        raise HTTPException(status_code=409, detail="Usage adjustment type does not match the approved operation")
    approved_quantity = approval.requested_value.get("quantity") if isinstance(approval.requested_value, dict) else approval.requested_value
    if approved_quantity != payload.quantity or (approval.event_id or None) != payload.event_id:
        raise HTTPException(status_code=409, detail="Usage adjustment does not match the approved request")
    approval_source = f"COMMAND_CENTER_APPROVAL:{approval.id}"
    consumed = await db.scalar(select(UsageLedgerEntry.id).where(UsageLedgerEntry.organization_id == organization_id, UsageLedgerEntry.source == approval_source))
    if consumed or approval.status == "APPLIED":
        raise HTTPException(status_code=409, detail="Approved usage request has already been applied")
    if payload.adjustment_type == "RESET":
        epoch = await MeteringService.reset(db, organization_id=organization_id, event_id=payload.event_id, metric_key=payload.metric_key, unit=payload.unit, reason=payload.reason, idempotency_key=idempotency_key, actor_user_id=actor.id)
        resource_id = epoch.reset_entry_id or epoch.id
        quantity = 0
        outcome = {"id": resource_id, "quantity": 0, "epoch_id": epoch.id, "epoch_sequence": epoch.sequence}
    else:
        row, _ = await MeteringService.record(db, organization_id=organization_id, event_id=payload.event_id, metric_key=payload.metric_key, quantity=payload.quantity, unit=payload.unit, source=approval_source, idempotency_key=idempotency_key, entry_type=payload.adjustment_type, reason=payload.reason, actor_user_id=actor.id, metadata={"approved_request_id": str(approval.id)})
        resource_id = row.id
        quantity = row.quantity
        outcome = {"id": row.id, "quantity": row.quantity, "epoch_id": row.epoch_id}
    approval.status = "APPLIED"
    approval.version += 1
    db.add(_audit(request, actor, organization_id, f"USAGE_{payload.adjustment_type}_RECORDED", "usage_ledger_entry", resource_id, new_state={"metric_key": payload.metric_key, "quantity": quantity, "reason": payload.reason, "approved_request_id": str(approval.id), "idempotency_key": idempotency_key}, sensitive=True))
    db.add(_governed_mutation_receipt(organization_id=organization_id, actor_id=actor.id, operation_key=operation_key, idempotency_key=idempotency_key, request_hash=request_hash, resource_type="usage_ledger_entry", resource_id=resource_id, response=outcome))
    await command.commit(organization_id=organization_id)
    return outcome


@router.get("/usage")
async def get_usage(organization_id: uuid.UUID, event_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db)):
    await OrganizationConsoleService(db).require_organization(organization_id)
    if event_id: await _require_scoped_event(db, organization_id, event_id)
    query = select(UsageLedgerEntry.metric_key, UsageLedgerEntry.unit).where(UsageLedgerEntry.organization_id == organization_id)
    query = query.where(UsageLedgerEntry.event_id == event_id) if event_id else query.where(UsageLedgerEntry.event_id.is_(None))
    keys = (await db.execute(query.distinct())).all()
    resolved = await EventEntitlementService.resolve(db, organization_id, event_id, explain=True) if event_id else None
    items = []
    now = datetime.now(timezone.utc)
    for key, unit in keys:
        quantity, epoch, freshness = await MeteringService.current_value(db, organization_id, event_id, key)
        reconciliation = await db.scalar(select(UsageReconciliationRun).where(UsageReconciliationRun.organization_id == organization_id, UsageReconciliationRun.event_id == event_id, UsageReconciliationRun.metric_key == key).order_by(UsageReconciliationRun.reconciled_at.desc()).limit(1)) if event_id else None
        entitlement_key = MeteringService.ENTITLEMENT_METRICS.get(key, key)
        limit = resolved["limits"].get(entitlement_key) if resolved else None
        sources = resolved["sources"].get(entitlement_key, []) if resolved else []
        allowance = sources[0].get("value") if sources else None
        extra = None if not isinstance(allowance, (int, float)) or not limit or not isinstance(limit.get("limit_value"), (int, float)) else limit["limit_value"] - allowance
        forecast = quantity
        if freshness and epoch and (now - epoch.started_at).total_seconds() > 86400:
            elapsed_days = max((now - epoch.started_at).total_seconds() / 86400, 1)
            period_days = max(((freshness.replace(day=28) + timedelta(days=4)).replace(day=1) - freshness.replace(day=1)).days, 1)
            forecast = round(quantity / elapsed_days * period_days)
        items.append({"metric_key": key, "unit": unit, "quantity": quantity, "contract_allowance": allowance, "approved_extra_allocation": extra, "effective_entitlement": limit.get("limit_value") if limit else None, "hard_ceiling": resolved["hard_ceilings"].get(entitlement_key) if resolved else None, "forecast": forecast, "freshness_at": freshness, "source": "platform.usage_ledger_entries", "epoch_id": epoch.id if epoch else None, "epoch_sequence": epoch.sequence if epoch else None, "reconciliation": {"status": reconciliation.status, "drift": reconciliation.drift, "reconciled_at": reconciliation.reconciled_at, "source": reconciliation.source} if reconciliation else {"status": "NOT_RECONCILED"}})
    return {"items": items, "availability": {"available": True, "freshness_at": max((item["freshness_at"] for item in items if item["freshness_at"]), default=None)}}


@router.post("/usage/reconcile")
async def reconcile_usage(organization_id: uuid.UUID, event_id: uuid.UUID, request: Request, step_up: StepUpAuth, actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    await _require_scoped_event(db, organization_id, event_id)
    return await OrganizationUsageCommandService(db).reconcile(
        organization_id=organization_id, event_id=event_id, actor=actor,
    )


@router.post("/privileged-access-sessions", status_code=status.HTTP_201_CREATED)
async def create_privileged_access_session(organization_id: uuid.UUID, payload: PrivilegedAccessCreate, request: Request, step_up: StepUpAuth, actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    await OrganizationConsoleService(db).require_organization(organization_id)
    row = await PrivilegedAccessCommandService(db).create(
        organization_id=organization_id, actor=actor, reason=payload.reason,
        case_reference=payload.case_reference, field_categories=payload.field_categories,
        duration_minutes=payload.duration_minutes,
    )
    return {"id": row.id, "expires_at": row.expires_at, "field_categories": row.field_categories}


@router.get("/privileged-access-sessions")
async def list_privileged_access_sessions(organization_id: uuid.UUID, actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    await OrganizationConsoleService(db).require_organization(organization_id)
    now = datetime.now(timezone.utc)
    rows = (await db.scalars(select(PrivilegedAccessSession).where(PrivilegedAccessSession.organization_id == organization_id, PrivilegedAccessSession.actor_user_id == actor.id).order_by(PrivilegedAccessSession.created_at.desc()).limit(20))).all()
    return {"items": [{"id": row.id, "field_categories": row.field_categories, "case_reference": row.case_reference, "created_at": row.created_at, "expires_at": row.expires_at, "revoked_at": row.revoked_at, "active": row.revoked_at is None and row.expires_at > now} for row in rows]}


@router.delete("/privileged-access-sessions/{session_id}")
async def revoke_privileged_access_session(organization_id: uuid.UUID, session_id: uuid.UUID, request: Request, step_up: StepUpAuth, actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    row = await PrivilegedAccessCommandService(db).revoke(
        organization_id=organization_id, session_id=session_id, actor=actor,
    )
    return {"id": row.id, "revoked_at": row.revoked_at}


@router.post("/financial-adjustments", status_code=status.HTTP_201_CREATED)
async def create_financial_adjustment(organization_id: uuid.UUID, payload: FinancialAdjustmentCreate, request: Request, step_up: StepUpAuth, idempotency_key: str = Header(min_length=16, max_length=120, alias="Idempotency-Key"), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    await OrganizationConsoleService(db).require_organization(organization_id)
    if payload.event_id: await _require_scoped_event(db, organization_id, payload.event_id)
    operation_key = "financial_adjustment.request"
    request_hash = request_fingerprint({"operation": operation_key, "payload": payload.model_dump(mode="json")})
    return await FinancialAdjustmentCommandService(db).create(
        organization_id=organization_id, actor=actor,
        values=payload.model_dump(), idempotency_key=idempotency_key,
        request_hash=request_hash,
    )


@router.get("/financial-adjustments")
async def list_financial_adjustments(organization_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    await OrganizationConsoleService(db).require_organization(organization_id)
    rows = (await db.scalars(select(OrganizationFinancialAdjustment).where(OrganizationFinancialAdjustment.organization_id == organization_id).order_by(OrganizationFinancialAdjustment.created_at.desc()).limit(100))).all()
    return {"items": [{"id": row.id, "event_id": row.event_id, "adjustment_type": row.adjustment_type, "amount": row.amount, "currency": row.currency, "reason": row.reason, "case_reference": row.case_reference, "status": row.status, "version": row.version, "requested_by": row.requested_by, "approved_by": row.approved_by, "effective_at": row.effective_at, "expires_at": row.expires_at, "created_at": row.created_at, "decided_at": row.decided_at} for row in rows]}


@router.post("/financial-adjustments/{adjustment_id}/decision")
async def decide_financial_adjustment(organization_id: uuid.UUID, adjustment_id: uuid.UUID, payload: ApprovalDecision, request: Request, step_up: StepUpAuth, if_match: int = Header(..., alias="If-Match", ge=1), idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=16, max_length=160), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    operation_key = "financial_adjustment.decision"
    request_hash = request_fingerprint({"operation": operation_key, "adjustment_id": str(adjustment_id), "if_match": if_match, "payload": payload.model_dump(mode="json")})
    return await FinancialAdjustmentCommandService(db).decide(
        organization_id=organization_id, adjustment_id=adjustment_id, actor=actor,
        decision=payload.decision, reason=payload.reason,
        case_reference=payload.case_reference, if_match=if_match,
        idempotency_key=idempotency_key, request_hash=request_hash,
    )


@router.post("/api-keys", status_code=status.HTTP_201_CREATED)
async def create_organization_api_key(organization_id: uuid.UUID, payload: OrganizationApiKeyCreate, request: Request, step_up: StepUpAuth, idempotency_key: str = Header(min_length=16, max_length=120, alias="Idempotency-Key"), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    await OrganizationConsoleService(db).require_organization(organization_id)
    fingerprint = request_fingerprint(payload.model_dump(mode="json"))
    return await OrganizationApiKeyCommandService(db).create(
        organization_id=organization_id, actor=actor, name=payload.name,
        expires_in_days=payload.expires_in_days, idempotency_key=idempotency_key,
        request_hash=fingerprint, case_reference=payload.case_reference,
        reason=payload.reason,
    )


async def _team_out(db: AsyncSession, team: OrganizationTeam) -> dict:
    member_ids = list((await db.scalars(select(OrganizationTeamMember.organization_member_id).where(OrganizationTeamMember.team_id == team.id))).all())
    event_rows = (await db.execute(select(OrganizationTeamEvent.event_id, OrganizationTeamEvent.permissions).where(OrganizationTeamEvent.team_id == team.id))).all()
    return {"id": team.id, "name": team.name, "description": team.description, "version": team.version, "member_ids": member_ids, "events": [{"event_id": event_id, "permissions": permissions} for event_id, permissions in event_rows], "created_at": team.created_at, "updated_at": team.updated_at}


@router.get("/teams")
async def list_organization_teams(organization_id: uuid.UUID, actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    await OrganizationConsoleService(db).require_organization(organization_id)
    rows = (await db.scalars(select(OrganizationTeam).where(OrganizationTeam.organization_id == organization_id, OrganizationTeam.deleted_at.is_(None)).order_by(OrganizationTeam.name))).all()
    return {"items": [await _team_out(db, row) for row in rows], "freshness_at": datetime.now(timezone.utc), "source": "organizer_access.organization_teams"}


@router.post("/teams", status_code=status.HTTP_201_CREATED)
async def create_organization_team(organization_id: uuid.UUID, payload: OrganizationTeamCreate, request: Request, step_up: StepUpAuth, actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    await OrganizationConsoleService(db).require_organization(organization_id)
    row = await OrganizationTeamCommandService(db).create(
        organization_id=organization_id,
        actor=actor,
        name=payload.name,
        description=payload.description,
        reason=payload.reason,
    )
    return await _team_out(db, row)


@router.patch("/teams/{team_id}")
async def update_organization_team(organization_id: uuid.UUID, team_id: uuid.UUID, payload: OrganizationTeamUpdate, request: Request, step_up: StepUpAuth, if_match: int = Header(alias="If-Match", ge=1), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    row = await OrganizationTeamCommandService(db).update(
        organization_id=organization_id,
        team_id=team_id,
        actor=actor,
        name=payload.name,
        description=payload.description,
        if_match=if_match,
        reason=payload.reason,
    )
    return await _team_out(db, row)


@router.delete("/teams/{team_id}")
async def archive_organization_team(organization_id: uuid.UUID, team_id: uuid.UUID, request: Request, step_up: StepUpAuth, payload: LegalHoldRelease = Body(...), if_match: int = Header(alias="If-Match", ge=1), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    row = await OrganizationTeamCommandService(db).archive(
        organization_id=organization_id,
        team_id=team_id,
        actor=actor,
        if_match=if_match,
        reason=payload.reason,
    )
    return {"id": row.id, "deleted_at": row.deleted_at, "version": row.version}


@router.put("/teams/{team_id}/members/{member_id}")
async def assign_organization_team_member(organization_id: uuid.UUID, team_id: uuid.UUID, member_id: uuid.UUID, payload: OrganizationTeamAssignment, request: Request, step_up: StepUpAuth, actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    team = await OrganizationTeamCommandService(db).assign_member(organization_id=organization_id, team_id=team_id, member_id=member_id, actor=actor, reason=payload.reason)
    return await _team_out(db, team)


@router.delete("/teams/{team_id}/members/{member_id}")
async def unassign_organization_team_member(organization_id: uuid.UUID, team_id: uuid.UUID, member_id: uuid.UUID, payload: LegalHoldRelease, request: Request, step_up: StepUpAuth, actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    team = await OrganizationTeamCommandService(db).unassign_member(organization_id=organization_id, team_id=team_id, member_id=member_id, actor=actor, reason=payload.reason)
    return await _team_out(db, team)


@router.put("/teams/{team_id}/events/{event_id}")
async def assign_organization_team_event(organization_id: uuid.UUID, team_id: uuid.UUID, event_id: uuid.UUID, payload: OrganizationTeamAssignment, request: Request, step_up: StepUpAuth, actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    team = await OrganizationTeamCommandService(db).assign_event(organization_id=organization_id, team_id=team_id, event_id=event_id, actor=actor, permissions=payload.permissions, reason=payload.reason)
    return await _team_out(db, team)


@router.delete("/teams/{team_id}/events/{event_id}")
async def unassign_organization_team_event(organization_id: uuid.UUID, team_id: uuid.UUID, event_id: uuid.UUID, payload: LegalHoldRelease, request: Request, step_up: StepUpAuth, actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    team = await OrganizationTeamCommandService(db).unassign_event(organization_id=organization_id, team_id=team_id, event_id=event_id, actor=actor, reason=payload.reason)
    return await _team_out(db, team)


@router.post("/api-keys/{key_id}/revoke")
async def revoke_organization_api_key(organization_id: uuid.UUID, key_id: uuid.UUID, payload: LegalHoldRelease, request: Request, step_up: StepUpAuth, actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    return await OrganizationApiKeyCommandService(db).revoke(
        organization_id=organization_id, key_id=key_id, actor=actor,
        reason=payload.reason,
    )


@router.post("/notification-rules", status_code=status.HTTP_201_CREATED)
async def create_notification_rule(organization_id: uuid.UUID, payload: NotificationRuleWrite, request: Request, step_up: StepUpAuth, actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    await OrganizationConsoleService(db).require_organization(organization_id)
    row = await OrganizationNotificationRuleCommandService(db).create(
        organization_id=organization_id, actor=actor,
        values=payload.model_dump(exclude={"reason"}), reason=payload.reason,
    )
    return OrganizationConsoleService._model_dict(row)


@router.patch("/notification-rules/{rule_id}")
async def update_notification_rule(organization_id: uuid.UUID, rule_id: uuid.UUID, payload: NotificationRuleWrite, request: Request, step_up: StepUpAuth, if_match: int = Header(alias="If-Match", ge=1), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    row = await OrganizationNotificationRuleCommandService(db).update(
        organization_id=organization_id, rule_id=rule_id, actor=actor,
        values=payload.model_dump(exclude={"reason"}), if_match=if_match,
        reason=payload.reason,
    )
    return OrganizationConsoleService._model_dict(row)


@router.delete("/notification-rules/{rule_id}")
async def archive_notification_rule(organization_id: uuid.UUID, rule_id: uuid.UUID, request: Request, step_up: StepUpAuth, payload: LegalHoldRelease = Body(...), if_match: int = Header(alias="If-Match", ge=1), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    row = await OrganizationNotificationRuleCommandService(db).archive(
        organization_id=organization_id, rule_id=rule_id, actor=actor,
        if_match=if_match, reason=payload.reason,
    )
    return {"id": row.id, "version": row.version, "deleted_at": row.deleted_at}


@router.post("/notification-channels", status_code=status.HTTP_201_CREATED)
async def create_notification_channel(organization_id: uuid.UUID, payload: NotificationChannelWrite, request: Request, step_up: StepUpAuth, actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    await OrganizationConsoleService(db).require_organization(organization_id)
    if payload.state == "ACTIVE":
        raise HTTPException(
            status_code=422,
            detail={"code": "PROVIDER_VERIFICATION_REQUIRED"},
        )
    provider = payload.provider.upper()
    if payload.channel in SUPPORTED_PROVIDERS and provider not in SUPPORTED_PROVIDERS[payload.channel] and not (settings.environment == "testing" and provider == "TEST"):
        raise HTTPException(
            status_code=422,
            detail={
                "code": "PROVIDER_NOT_APPROVED",
                "approved_providers": sorted(SUPPORTED_PROVIDERS[payload.channel]),
            },
        )
    values = payload.model_dump(exclude={"reason"})
    values["provider"] = provider
    row = await OrganizationNotificationChannelCommandService(db).create(
        organization_id=organization_id, actor=actor, values=values, reason=payload.reason,
    )
    response = OrganizationConsoleService._model_dict(row, exclude={"secret_reference"})
    response["secret_reference_present"] = bool(row.secret_reference)
    return response


@router.patch("/notification-channels/{channel_id}")
async def update_notification_channel(organization_id: uuid.UUID, channel_id: uuid.UUID, payload: NotificationChannelWrite, request: Request, step_up: StepUpAuth, if_match: int = Header(alias="If-Match", ge=1), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    if payload.state == "ACTIVE":
        raise HTTPException(
            status_code=422,
            detail={"code": "PROVIDER_VERIFICATION_REQUIRED"},
        )
    provider = payload.provider.upper()
    if payload.channel in SUPPORTED_PROVIDERS and provider not in SUPPORTED_PROVIDERS[payload.channel] and not (settings.environment == "testing" and provider == "TEST"):
        raise HTTPException(
            status_code=422,
            detail={
                "code": "PROVIDER_NOT_APPROVED",
                "approved_providers": sorted(SUPPORTED_PROVIDERS[payload.channel]),
            },
        )
    values = payload.model_dump(exclude={"reason"}, exclude_unset=True)
    values["provider"] = provider
    row = await OrganizationNotificationChannelCommandService(db).update(
        organization_id=organization_id, channel_id=channel_id, actor=actor,
        values=values, if_match=if_match, reason=payload.reason,
    )
    response = OrganizationConsoleService._model_dict(row, exclude={"secret_reference"})
    response["secret_reference_present"] = bool(row.secret_reference)
    return response


@router.post("/notification-channels/{channel_id}/verify")
async def verify_notification_channel(
    organization_id: uuid.UUID,
    channel_id: uuid.UUID,
    payload: NotificationChannelVerification,
    request: Request,
    step_up: StepUpAuth,
    if_match: int = Header(alias="If-Match", ge=1),
    actor: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    row = await OrganizationNotificationChannelCommandService(db).verify(
        organization_id=organization_id, channel_id=channel_id, actor=actor,
        if_match=if_match, reason=payload.reason,
        case_reference=payload.case_reference,
    )
    response = OrganizationConsoleService._model_dict(row, exclude={"secret_reference"})
    response["secret_reference_present"] = bool(row.secret_reference)
    return response


@router.delete("/notification-channels/{channel_id}")
async def archive_notification_channel(organization_id: uuid.UUID, channel_id: uuid.UUID, request: Request, step_up: StepUpAuth, payload: LegalHoldRelease = Body(...), if_match: int = Header(alias="If-Match", ge=1), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    row = await OrganizationNotificationChannelCommandService(db).archive(
        organization_id=organization_id, channel_id=channel_id, actor=actor,
        if_match=if_match, reason=payload.reason,
    )
    return {"id": row.id, "version": row.version, "deleted_at": row.deleted_at}


@router.post("/integrations/connections", status_code=status.HTTP_201_CREATED)
async def create_integration_connection(organization_id: uuid.UUID, payload: IntegrationConnectionCreate, request: Request, step_up: StepUpAuth, idempotency_key: str = Header(min_length=16, max_length=120, alias="Idempotency-Key"), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    await OrganizationConsoleService(db).require_organization(organization_id)
    fingerprint = request_fingerprint(payload.model_dump(mode="json"))
    return await IntegrationConnectionCommandService(db).create(
        organization_id=organization_id, actor=actor, provider_id=payload.provider_id,
        idempotency_key=idempotency_key, request_hash=fingerprint,
        case_reference=payload.case_reference, reason=payload.reason,
    )


@router.patch("/integrations/connections/{connection_id}")
async def update_integration_connection(organization_id: uuid.UUID, connection_id: uuid.UUID, payload: IntegrationConnectionUpdate, request: Request, step_up: StepUpAuth, if_match: int = Header(alias="If-Match", ge=1), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    return await IntegrationConnectionCommandService(db).update(
        organization_id=organization_id, connection_id=connection_id, actor=actor,
        is_active=payload.is_active, if_match=if_match,
        case_reference=payload.case_reference, reason=payload.reason,
    )


@router.post("/exports", response_model=ConsoleExportOut, status_code=status.HTTP_202_ACCEPTED)
async def create_console_export(
    organization_id: uuid.UUID, payload: ConsoleExportCreate, request: Request, step_up: StepUpAuth,
    idempotency_key: str = Header(min_length=16, max_length=120, alias="Idempotency-Key"),
    privileged_access_session: uuid.UUID | None = Header(default=None, alias="X-Privileged-Access-Session"),
    actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db),
) -> ConsoleExportOut:
    await OrganizationConsoleService(db).require_organization(organization_id)
    request_data = payload.model_dump(mode="json")
    fingerprint = request_fingerprint(request_data)
    row = await OrganizationExportCommandService(db).create(
        organization_id=organization_id, actor=actor, payload=payload,
        idempotency_key=idempotency_key, request_hash=fingerprint,
        privileged_access_session_id=privileged_access_session,
    )
    return _console_export_out(row)


@router.get("/exports", response_model=list[ConsoleExportOut])
async def list_console_exports(organization_id: uuid.UUID, limit: int = Query(default=25, ge=1, le=100), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)) -> list[ConsoleExportOut]:
    await OrganizationConsoleService(db).require_organization(organization_id)
    rows = (await db.scalars(select(DataExport).where(DataExport.organization_id == organization_id, DataExport.source_type == "organization_console_export").order_by(DataExport.created_at.desc()).limit(limit))).all()
    return [_console_export_out(row) for row in rows]


@router.get("/exports/{export_id}/download")
async def download_console_export(organization_id: uuid.UUID, export_id: uuid.UUID, request: Request, actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    row = await db.scalar(select(DataExport).where(DataExport.id == export_id, DataExport.organization_id == organization_id, DataExport.source_type == "organization_console_export"))
    if not row: raise HTTPException(status_code=404, detail="Export not found")
    if row.status != "COMPLETED" or not row.storage_key: raise HTTPException(status_code=409, detail={"code": "EXPORT_NOT_READY", "status": row.status})
    now = datetime.now(timezone.utc)
    if row.expires_at and row.expires_at <= now: raise HTTPException(status_code=410, detail="EXPORT_EXPIRED")
    expiry = min(settings.S3_PRESIGNED_EXPIRY_SECONDS, 300)
    download_url = await asyncio.to_thread(create_presigned_download, bucket=settings.S3_BUCKET_EXPORTS, storage_path=row.storage_key, filename=f"organization-{organization_id}-console-export.csv", expiry_seconds=expiry)
    await _dispatch_read_audit(
        request,
        actor,
        organization_id,
        "ORGANIZATION_CONSOLE_EXPORT_DOWNLOADED",
        "data_export",
        row.id,
        new_state={"downloaded_at": now.isoformat()},
    )
    return {"download_url": download_url, "filename": f"organization-{organization_id}-console-export.csv", "expires_in": expiry}


@router.get("/search")
async def search_organization_console(
    organization_id: uuid.UUID, request: Request,
    q: str = Query(min_length=2, max_length=120), domains: str | None = None,
    event_id: uuid.UUID | None = None, cursor: str | None = None,
    limit: int = Query(default=25, ge=1, le=100), include_sensitive: bool = False,
    privileged_access_session: uuid.UUID | None = Header(default=None, alias="X-Privileged-Access-Session"),
    actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db),
):
    await OrganizationConsoleService(db).require_organization(organization_id)
    if event_id: await _require_scoped_event(db, organization_id, event_id)
    selected = {value.strip().lower() for value in domains.split(",")} if domains else set(SEARCH_DOMAINS)
    unknown = selected - SEARCH_DOMAINS
    if unknown: raise HTTPException(status_code=422, detail=f"Unsupported search domains: {', '.join(sorted(unknown))}")
    access = await _require_privileged_access(db, organization_id, actor.id, privileged_access_session, {"IDENTITY", "CONTACT"}) if include_sensitive else None
    pattern = f"%{q.strip()}%"
    event_scope = select(Event.id).where(Event.organization_id == organization_id)
    if event_id: event_scope = event_scope.where(Event.id == event_id)
    items: list[dict] = []
    if "events" in selected:
        rows = (await db.scalars(select(Event).where(Event.organization_id == organization_id, or_(Event.name.ilike(pattern), Event.short_code.ilike(pattern))).limit(101))).all()
        items.extend({"domain": "events", "resource_type": "event", "id": row.id, "event_id": row.id, "title": row.name, "subtitle": row.short_code, "status": row.status, "occurred_at": row.updated_at} for row in rows)
    if "speakers" in selected:
        rows = (await db.scalars(select(Speaker).where(Speaker.event_id.in_(event_scope), Speaker.deleted_at.is_(None), or_(Speaker.first_name.ilike(pattern), Speaker.last_name.ilike(pattern), Speaker.email.ilike(pattern), Speaker.affiliation.ilike(pattern))).limit(101))).all()
        items.extend({"domain": "speakers", "resource_type": "speaker", "id": row.id, "event_id": row.event_id, "title": f"{row.first_name} {row.last_name}" if include_sensitive else f"{row.first_name[:1]}*** {row.last_name[:1]}***", "subtitle": row.email if include_sensitive else _mask_email(row.email), "status": row.upload_status, "occurred_at": row.updated_at} for row in rows)
    if "sessions" in selected:
        rows = (await db.scalars(select(Session).where(Session.event_id.in_(event_scope), Session.deleted_at.is_(None), or_(Session.name.ilike(pattern), Session.session_code.ilike(pattern), Session.description.ilike(pattern))).limit(101))).all()
        items.extend({"domain": "sessions", "resource_type": "session", "id": row.id, "event_id": row.event_id, "title": row.name, "subtitle": row.session_code, "status": row.status, "occurred_at": row.updated_at} for row in rows)
    if "registrations" in selected:
        rows = (await db.scalars(select(ParticipantRegistration).where(ParticipantRegistration.event_id.in_(event_scope), ParticipantRegistration.deleted_at.is_(None), or_(ParticipantRegistration.registration_data["name"].astext.ilike(pattern), ParticipantRegistration.registration_data["email"].astext.ilike(pattern))).limit(101))).all()
        items.extend({"domain": "registrations", "resource_type": "registration", "id": row.id, "event_id": row.event_id, "title": str((row.registration_data or {}).get("name", "Registration")) if include_sensitive else f"{str((row.registration_data or {}).get('name', 'R'))[:1]}***", "subtitle": (row.registration_data or {}).get("email") if include_sensitive else _mask_email((row.registration_data or {}).get("email")), "status": row.registration_status, "occurred_at": row.updated_at} for row in rows)
    if "files" in selected:
        rows = (await db.scalars(select(PresentationFile).where(PresentationFile.event_id.in_(event_scope), PresentationFile.deleted_at.is_(None), PresentationFile.original_filename.ilike(pattern)).limit(101))).all()
        items.extend({"domain": "files", "resource_type": "presentation_file", "id": row.id, "event_id": row.event_id, "title": row.original_filename, "subtitle": row.file_format, "status": row.upload_status, "occurred_at": row.updated_at} for row in rows)
    if "campaigns" in selected:
        rows = (await db.scalars(select(EmailCampaign).where(EmailCampaign.event_id.in_(event_scope), EmailCampaign.deleted_at.is_(None), EmailCampaign.name.ilike(pattern)).limit(101))).all()
        items.extend({"domain": "campaigns", "resource_type": "email_campaign", "id": row.id, "event_id": row.event_id, "title": row.name, "subtitle": row.target_type, "status": row.status, "occurred_at": row.updated_at} for row in rows)
    if "users" in selected:
        rows = (await db.execute(select(UserEventAssignment, User).join(User, User.id == UserEventAssignment.user_id).where(User.organization_id == organization_id, UserEventAssignment.event_id.in_(event_scope), or_(User.first_name.ilike(pattern), User.last_name.ilike(pattern), User.email.ilike(pattern))).limit(101))).all()
        items.extend({"domain": "users", "resource_type": "user_event_assignment", "id": assignment.id, "event_id": assignment.event_id, "title": f"{user.first_name or ''} {user.last_name or ''}".strip() if include_sensitive else f"{(user.first_name or 'U')[:1]}***", "subtitle": user.email if include_sensitive else _mask_email(user.email), "status": "active", "occurred_at": assignment.assigned_at} for assignment, user in rows)
    items.sort(key=lambda item: (item["occurred_at"] or datetime.min.replace(tzinfo=timezone.utc), str(item["id"])), reverse=True)
    offset = _search_cursor(cursor); page = items[offset:offset + limit]; next_offset = offset + len(page)
    next_cursor = base64.urlsafe_b64encode(f"search:{next_offset}".encode()).decode() if next_offset < len(items) else None
    if access:
        await _dispatch_read_audit(
            request,
            actor,
            organization_id,
            "SENSITIVE_CROSS_DOMAIN_SEARCH",
            "organization",
            organization_id,
            new_state={"query": q, "domains": sorted(selected), "event_id": str(event_id) if event_id else None, "record_count": len(page), "privileged_access_session_id": str(access.id)},
        )
    return {"items": page, "next_cursor": next_cursor, "has_more": next_cursor is not None, "availability": {"available": True, "freshness_at": datetime.now(timezone.utc)}, "source": sorted(selected), "sensitive_data_included": bool(access)}


@router.get("/events/{event_id}/workspace/registrations")
async def event_registration_workspace(
    organization_id: uuid.UUID,
    event_id: uuid.UUID,
    request: Request,
    registration_status: str | None = None,
    cursor: str | None = None,
    limit: int = 50,
    include_sensitive: bool = False,
    privileged_access_session: uuid.UUID | None = Header(default=None, alias="X-Privileged-Access-Session"),
    actor: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    await _require_scoped_event(db, organization_id, event_id)
    access = None
    if include_sensitive:
        access = await _require_privileged_access(db, organization_id, actor.id, privileged_access_session, {"IDENTITY", "CONTACT"})
    query = select(ParticipantRegistration).where(ParticipantRegistration.event_id == event_id, ParticipantRegistration.deleted_at.is_(None))
    if registration_status: query = query.where(ParticipantRegistration.registration_status == registration_status.lower())
    if cursor:
        try:
            decoded = base64.urlsafe_b64decode(cursor.encode()).decode()
            submitted_raw, id_raw = decoded.split("|", 1)
            submitted_at, cursor_id = datetime.fromisoformat(submitted_raw), uuid.UUID(id_raw)
        except (ValueError, TypeError):
            raise HTTPException(status_code=422, detail="Invalid registration cursor")
        query = query.where(or_(ParticipantRegistration.submitted_at < submitted_at, and_(ParticipantRegistration.submitted_at == submitted_at, ParticipantRegistration.id < cursor_id)))
    page_size = min(max(limit, 1), 100)
    rows = (await db.scalars(query.order_by(ParticipantRegistration.submitted_at.desc(), ParticipantRegistration.id.desc()).limit(page_size + 1))).all()
    has_more = len(rows) > page_size
    rows = rows[:page_size]
    next_cursor = None
    if has_more and rows:
        next_cursor = base64.urlsafe_b64encode(f"{rows[-1].submitted_at.isoformat()}|{rows[-1].id}".encode()).decode()
    if access:
        await _dispatch_read_audit(
            request,
            actor,
            organization_id,
            "SENSITIVE_REGISTRATION_DATA_READ",
            "event",
            event_id,
            new_state={"privileged_access_session_id": str(access.id), "record_count": len(rows), "field_categories": ["IDENTITY", "CONTACT"]},
        )
    return {"items": [{"id": row.id, "event_id": row.event_id, "participant_id": row.participant_id, "status": row.registration_status.upper(), "registration_data": row.registration_data if include_sensitive else _masked_registration_data(row.registration_data or {}), "submitted_at": row.submitted_at, "reviewed_by": row.reviewed_by, "reviewed_at": row.reviewed_at, "review_notes": row.review_notes, "waitlist_position": row.waitlist_position, "rejection_reason": row.rejection_reason, "approval_source": row.approval_source} for row in rows], "next_cursor": next_cursor, "has_more": has_more, "sensitive_data_included": include_sensitive, "freshness_at": datetime.now(timezone.utc), "source": "registration.registrations"}


@router.get("/events/{event_id}/workspace/{workspace}")
async def event_domain_workspace(
    organization_id: uuid.UUID,
    event_id: uuid.UUID,
    workspace: str,
    request: Request,
    include_sensitive: bool = False,
    include_archived: bool = False,
    privileged_access_session: uuid.UUID | None = Header(default=None, alias="X-Privileged-Access-Session"),
    actor: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    event = await _require_scoped_event(db, organization_id, event_id)
    supported = {"overview", "settings", "operations", "attendees", "speakers", "abstracts", "sessions", "rooms", "communications", "templates", "files", "payments", "integrations", "tickets", "checkins", "users", "jobs", "analytics", "audit"}
    if workspace not in supported: raise HTTPException(status_code=404, detail="Event workspace not found")
    access = None
    sensitive_categories = {"CONTACT"} if workspace in {"attendees", "speakers", "abstracts", "communications", "users"} else {"PAYMENT"} if workspace == "payments" else set()
    if include_sensitive and sensitive_categories:
        access = await _require_privileged_access(db, organization_id, actor.id, privileged_access_session, sensitive_categories)
    data: dict = {}
    source = ""
    if workspace == "overview":
        counts = {}
        for key, model in (("registrations", ParticipantRegistration), ("speakers", Speaker), ("sessions", Session), ("rooms", Room), ("files", PresentationFile), ("payments", PaymentTransaction)):
            counts[key] = await db.scalar(select(func.count(model.id)).where(model.event_id == event_id)) or 0
        capability = await CapabilityService.resolve_event(
            db,
            organization_id,
            event_id,
            user_id=actor.id,
        )
        data = {
            "event": {
                "id": event.id,
                "name": event.name,
                "short_code": event.short_code,
                "status": event.status,
                "start_date": event.start_date,
                "end_date": event.end_date,
                "timezone": event.timezone,
                "venue_name": event.venue_name,
                "country": event.country,
                "is_maintenance": event.is_maintenance,
                "is_read_only": event.is_read_only,
            },
            "commercial_control": {
                "contract_version": capability.get("contract_version"),
                "resolution_version": capability["resolution_version"],
                "rollout_mode": capability["rollout_mode"],
                "availability": capability["availability"],
                "source": "CANONICAL_CAPABILITY_RESOLVER",
            },
            "counts": counts,
        }
        source = "events.events+canonical_capabilities"
    elif workspace == "settings":
        data = {
            "event": {
                "id": event.id,
                "name": event.name,
                "short_code": event.short_code,
                "status": event.status,
                "tagline": event.tagline,
                "description": event.description,
                "location": event.location,
                "venue_name": event.venue_name,
                "country": event.country,
                "state": event.state,
                "organizer_name": event.organizer_name,
                "organizer_details": event.organizer_details,
                "start_date": event.start_date,
                "end_date": event.end_date,
                "timezone": event.timezone,
                "upload_deadline": event.upload_deadline,
                "max_file_size_mb": event.max_file_size_mb,
                "allowed_formats": event.allowed_formats,
                "currency": event.currency,
                "map_link": event.map_link,
                "venue_images": event.venue_images,
                "venue_details": event.venue_details,
                "speaker_settings": event.speaker_settings,
                "registration_settings": event.registration_settings,
                "branding_settings": event.branding_settings,
                "updated_at": event.updated_at,
            }
        }
        source = "events.events"
    elif workspace == "operations":
        import_failures = int(
            await db.scalar(
                select(func.count(ImportJob.id)).where(
                    ImportJob.event_id == event_id,
                    func.lower(ImportJob.status).in_(["failed", "error"]),
                )
            )
            or 0
        )
        sync_failures = int(
            await db.scalar(
                select(func.count(VenueSyncJob.id)).where(
                    VenueSyncJob.event_id == event_id,
                    func.lower(VenueSyncJob.status).in_(["failed", "error"]),
                )
            )
            or 0
        )
        processing_failures = int(
            await db.scalar(
                select(func.count(PresentationProcessingJob.id))
                .join(
                    PresentationFile,
                    PresentationFile.id == PresentationProcessingJob.file_id,
                )
                .where(
                    PresentationFile.event_id == event_id,
                    func.lower(PresentationProcessingJob.status).in_(["failed", "error"]),
                )
            )
            or 0
        )
        data = {
            "control": {
                "status": event.status,
                "is_active": event.deleted_at is None
                and str(event.status).lower() not in {"archived", "cancelled"},
                "is_maintenance": event.is_maintenance,
                "is_read_only": event.is_read_only,
            },
            "failures": {
                "import_jobs": import_failures,
                "venue_sync_jobs": sync_failures,
                "processing_jobs": processing_failures,
                "total": import_failures + sync_failures + processing_failures,
            },
        }
        source = "events.events,registration.import_jobs,venue.sync_jobs,presentations.processing_jobs"
    elif workspace == "attendees":
        participant_filters = [Participant.event_id == event_id]
        if not include_archived:
            participant_filters.append(Participant.deleted_at.is_(None))
        rows = (await db.execute(
            select(Participant, RegistrationConfirmationQR)
            .outerjoin(
                RegistrationConfirmationQR,
                RegistrationConfirmationQR.participant_id == Participant.id,
            )
            .where(*participant_filters)
            .order_by(Participant.registered_at.desc())
            .limit(100)
        )).all()
        data = {
            "items": [
                {
                    "id": participant.id,
                    "registration_number": participant.regno,
                    "name": participant.name if include_sensitive else f"{participant.first_name[:1]}*** {participant.last_name[:1]}***",
                    "email": participant.email if include_sensitive else _mask_email(participant.email),
                    "phone": participant.phone if include_sensitive else _mask_phone(participant.phone),
                    "role": participant.role,
                    "role_id": participant.role_id,
                    "company": participant.company if include_sensitive else None,
                    "designation": participant.designation if include_sensitive else None,
                    "country": participant.country,
                    "approval_status": participant.approval_status,
                    "paid_status": participant.paid_status,
                    "source": participant.source,
                    "custom_fields": participant.custom_fields if include_sensitive else None,
                    "registered_at": participant.registered_at,
                    "updated_at": participant.updated_at,
                    "lifecycle_state": "archived" if participant.deleted_at else "active",
                    "deleted_at": participant.deleted_at,
                    "qr_status": credential.status if credential else "NOT_ISSUED",
                    "qr_version": credential.credential_version if credential else 0,
                    "qr_image_url": (
                        build_confirmation_image_url(
                            build_confirmation_token(
                                credential.id,
                                credential.credential_version,
                            )
                        )
                        if credential
                        else None
                    ),
                }
                for participant, credential in rows
            ],
            "has_more": len(rows) == 100,
            "sensitive_edit_allowed": include_sensitive,
        }
        source = "registration.participants,registration.confirmation_qr_credentials"
    elif workspace == "speakers":
        speaker_filter = [Speaker.event_id == event_id]
        if not include_archived: speaker_filter.append(Speaker.deleted_at.is_(None))
        rows = (await db.scalars(select(Speaker).where(*speaker_filter).order_by(Speaker.created_at.desc()).limit(100))).all()
        data = {"items": [{"id": row.id, "first_name": row.first_name if include_sensitive else f"{row.first_name[:1]}***", "last_name": row.last_name if include_sensitive else f"{row.last_name[:1]}***", "email": row.email if include_sensitive else _mask_email(row.email), "phone": row.phone if include_sensitive else _mask_phone(row.phone), "designation": row.designation, "affiliation": row.affiliation, "country": row.country, "upload_status": row.upload_status, "allow_override": row.allow_override, "checked_in_at": row.checked_in_at, "created_at": row.created_at, "lifecycle_state": "archived" if row.deleted_at else "active", "deleted_at": row.deleted_at} for row in rows], "has_more": len(rows) == 100}; source = "speakers.speakers"
    elif workspace == "abstracts":
        rows = (await db.execute(
            select(SessionSpeaker, Speaker, Session)
            .join(Speaker, Speaker.id == SessionSpeaker.speaker_id)
            .join(Session, Session.id == SessionSpeaker.session_id)
            .where(
                Speaker.event_id == event_id,
                Session.event_id == event_id,
                Speaker.deleted_at.is_(None),
                Session.deleted_at.is_(None),
            )
            .order_by(SessionSpeaker.abstract_submitted_at.desc().nullslast(), SessionSpeaker.id)
            .limit(100)
        )).all()
        data = {
            "items": [
                {
                    "id": slot.id,
                    "speaker_id": speaker.id,
                    "speaker_name": speaker.full_name if include_sensitive else f"{speaker.first_name[:1]}*** {speaker.last_name[:1]}***",
                    "speaker_email": speaker.email if include_sensitive else _mask_email(speaker.email),
                    "session_id": session.id,
                    "session_name": session.name,
                    "presentation_title": slot.presentation_title,
                    "abstract_text": slot.abstract_text,
                    "keywords": slot.abstract_keywords or [],
                    "status": slot.abstract_status,
                    "version": slot.abstract_version,
                    "submitted_at": slot.abstract_submitted_at,
                    "reviewed_at": slot.abstract_reviewed_at,
                    "reviewed_by": slot.abstract_reviewed_by,
                    "review_notes": slot.abstract_review_notes,
                }
                for slot, speaker, session in rows
            ],
            "has_more": len(rows) == 100,
        }
        source = "events.session_speakers"
    elif workspace == "sessions":
        session_filter = [Session.event_id == event_id]
        if not include_archived: session_filter.append(Session.deleted_at.is_(None))
        rows = (await db.scalars(select(Session).where(*session_filter).order_by(Session.start_time).limit(100))).all()
        data = {"items": [{"id": row.id, "room_id": row.room_id, "session_code": row.session_code, "name": row.name, "session_type": row.session_type, "start_time": row.start_time, "end_time": row.end_time, "moderator_id": row.moderator_id, "moderator_name": row.moderator_name, "description": row.description, "status": row.status, "lifecycle_state": "archived" if row.deleted_at else "active", "deleted_at": row.deleted_at} for row in rows], "has_more": len(rows) == 100}; source = "events.sessions"
    elif workspace == "rooms":
        rows = (await db.scalars(select(Room).where(Room.event_id == event_id).order_by(Room.name).limit(100))).all()
        data = {"items": [{"id": row.id, "name": row.name, "code": getattr(row, "code", None), "room_type": row.room_type, "room_coordinator": getattr(row, "room_coordinator", None), "is_active": row.is_active, "lifecycle_state": "active" if row.is_active else "archived"} for row in rows], "has_more": len(rows) == 100}; source = "events.rooms"
    elif workspace == "communications":
        campaign_filter = [EmailCampaign.event_id == event_id]
        if not include_archived: campaign_filter.append(EmailCampaign.deleted_at.is_(None))
        campaigns = (await db.scalars(select(EmailCampaign).where(*campaign_filter).order_by(EmailCampaign.created_at.desc()).limit(100))).all()
        logs = (await db.scalars(select(EmailLog).where(EmailLog.event_id == event_id).order_by(EmailLog.sent_at.desc()).limit(100))).all()
        data = {"campaigns": [{"id": row.id, "template_id": row.template_id, "name": row.name, "recipient_filter": row.recipient_filter, "target_type": row.target_type, "scheduled_at": row.scheduled_at, "sent_at": row.sent_at, "status": row.status, "total_recipients": row.total_recipients, "sent_count": row.sent_count, "lifecycle_state": "archived" if row.deleted_at else "active", "deleted_at": row.deleted_at} for row in campaigns], "delivery_logs": [{"id": row.id, "campaign_id": row.campaign_id, "to_email": row.to_email if include_sensitive else _mask_email(row.to_email), "subject": row.subject, "status": row.status, "error_message": row.error_message, "opened_at": row.opened_at, "sent_at": row.sent_at} for row in logs]}; source = "communications.email_campaigns,email_logs"
    elif workspace == "templates":
        email_filter = [EmailTemplate.event_id == event_id]; print_filter = [PrintTemplate.event_id == event_id]
        if not include_archived: email_filter.append(EmailTemplate.deleted_at.is_(None)); print_filter.append(PrintTemplate.deleted_at.is_(None))
        email_rows = (await db.scalars(select(EmailTemplate).where(*email_filter).order_by(EmailTemplate.created_at.desc()).limit(100).execution_options(skip_tenant_filter=True))).all()
        print_rows = (await db.scalars(select(PrintTemplate).where(*print_filter).order_by(PrintTemplate.updated_at.desc()).limit(100).execution_options(skip_tenant_filter=True))).all()
        data = {"email_templates": [{"id": row.id, "kind": "email", "name": row.name, "template_type": row.template_type, "target_type": row.target_type, "subject": row.subject, "body_html": row.body_html, "body_text": row.body_text, "is_default": row.is_default, "created_at": row.created_at, "lifecycle_state": "archived" if row.deleted_at else "active", "deleted_at": row.deleted_at} for row in email_rows], "print_templates": [{"id": row.id, "kind": "print", "template_name": row.template_name, "template_type": row.template_type, "template_data": row.template_data, "updated_at": row.updated_at, "lifecycle_state": "archived" if row.deleted_at else "active", "deleted_at": row.deleted_at} for row in print_rows]}; source = "communications.email_templates,registration.print_templates"
    elif workspace == "files":
        rows = (await db.scalars(select(PresentationFile).where(PresentationFile.event_id == event_id, PresentationFile.deleted_at.is_(None)).order_by(PresentationFile.uploaded_at.desc()).limit(100))).all()
        data = {"items": [{"id": row.id, "speaker_id": row.speaker_id, "session_speaker_id": row.session_speaker_id, "original_filename": row.original_filename, "file_size_bytes": row.file_size_bytes, "mime_type": row.mime_type, "file_format": row.file_format, "version_number": row.version_number, "is_current_version": row.is_current_version, "upload_source": row.upload_source, "upload_status": row.upload_status, "approved_by": row.approved_by, "approved_at": row.approved_at, "rejection_reason": row.rejection_reason, "is_locked": row.is_locked, "local_sync_status": row.local_sync_status, "uploaded_at": row.uploaded_at} for row in rows], "has_more": len(rows) == 100}; source = "presentations.files"
    elif workspace == "payments":
        rows = (await db.scalars(select(PaymentTransaction).where(PaymentTransaction.event_id == event_id).order_by(PaymentTransaction.created_at.desc()).limit(100))).all()
        data = {"items": [{"id": row.id, "registration_id": row.registration_id, "amount": row.amount, "currency": row.currency, "status": row.status, "payment_method": row.payment_method, "gateway_order_id": row.gateway_order_id if include_sensitive else (f"***{row.gateway_order_id[-6:]}" if row.gateway_order_id else None), "gateway_payment_id": row.gateway_payment_id if include_sensitive else (f"***{row.gateway_payment_id[-6:]}" if row.gateway_payment_id else None), "discount_applied": row.discount_applied, "created_at": row.created_at, "updated_at": row.updated_at} for row in rows], "has_more": len(rows) == 100}; source = "registration.payment_transactions"
    elif workspace == "tickets":
        rows = (await db.scalars(select(TicketType).where(TicketType.event_id == event_id).order_by(TicketType.role_name, TicketType.tier_name).limit(500))).all()
        data = {"items": [{"id": row.id, "role_name": row.role_name, "tier_name": row.tier_name, "price": row.price} for row in rows], "tiers": list(dict.fromkeys(row.tier_name for row in rows)), "has_more": len(rows) == 500}; source = "registration.ticket_types"
    elif workspace == "checkins":
        rows = (await db.scalars(select(CheckIn).where(CheckIn.event_id == event_id).order_by(CheckIn.check_in_time.desc()).limit(100))).all()
        data = {"items": [{"id": row.id, "participant_id": row.participant_id, "session_id": row.session_id, "check_in_time": row.check_in_time, "updated_at": row.updated_at} for row in rows], "has_more": len(rows) == 100}; source = "registration.attendance"
    elif workspace == "users":
        rows = (await db.execute(select(UserEventAssignment, User).join(User, User.id == UserEventAssignment.user_id).where(UserEventAssignment.event_id == event_id).order_by(UserEventAssignment.assigned_at.desc()).limit(100))).all()
        data = {"items": [{"id": assignment.id, "user_id": user.id, "name": f"{user.first_name or ''} {user.last_name or ''}".strip(), "email": user.email if include_sensitive else _mask_email(user.email), "permissions": assignment.permissions, "assigned_at": assignment.assigned_at} for assignment, user in rows], "has_more": len(rows) == 100}; source = "rbac.user_event_assignments,identity.users"
    elif workspace == "jobs":
        imports = (await db.scalars(select(ImportJob).where(ImportJob.event_id == event_id).order_by(ImportJob.created_at.desc()).limit(100))).all()
        sync_jobs = (await db.scalars(select(VenueSyncJob).where(VenueSyncJob.event_id == event_id).order_by(VenueSyncJob.created_at.desc()).limit(100))).all()
        processing = (await db.execute(select(PresentationProcessingJob, PresentationFile).join(PresentationFile, PresentationFile.id == PresentationProcessingJob.file_id).where(PresentationFile.event_id == event_id).order_by(PresentationProcessingJob.created_at.desc()).limit(100))).all()
        import_items = [
            {
                "id": row.id,
                "source": "IMPORT",
                "job_type": row.job_type,
                "filename": row.filename,
                "status": row.status,
                "rows_total": row.rows_total,
                "rows_imported": row.rows_imported,
                "rows_failed": row.rows_failed,
                "rows_updated": row.rows_updated,
                "sessions_created": row.sessions_created,
                "speakers_created": row.speakers_created,
                "rooms_created": row.rooms_created,
                "error_summary": row.error_summary,
                "created_at": row.created_at,
                "completed_at": row.completed_at,
                "capabilities": {
                    "retry": row.status.lower() in {"failed", "error"},
                    "cancel": False,
                },
            }
            for row in imports
        ]
        sync_items = [
            {
                "id": row.id,
                "source": "VENUE_SYNC",
                "file_id": row.file_id,
                "sync_type": row.sync_type,
                "priority": row.priority,
                "status": row.status,
                "retry_count": row.retry_count,
                "error_message": row.error_message,
                "bytes_transferred": row.bytes_transferred,
                "transfer_speed_mbps": row.transfer_speed_mbps,
                "checksum_verified": row.checksum_verified,
                "storage_provider": row.storage_provider,
                "started_at": row.started_at,
                "completed_at": row.completed_at,
                "created_at": row.created_at,
                "capabilities": {
                    "retry": row.status.lower() in {"failed", "error"},
                    "cancel": False,
                },
            }
            for row in sync_jobs
        ]
        processing_items = [
            {
                "id": job.id,
                "source": "PROCESSING",
                "file_id": file.id,
                "filename": file.original_filename,
                "status": job.status,
                "logs": job.logs,
                "created_at": job.created_at,
                "capabilities": {
                    "retry": False,
                    "cancel": False,
                    "retry_workspace": "files",
                    "retry_resource_id": file.id,
                    "unavailable_reason": (
                        "Use RETRY_PROCESSING on the associated file."
                    ),
                },
            }
            for job, file in processing
        ]
        data = {
            "items": [*import_items, *sync_items, *processing_items],
            "import_jobs": import_items,
            "venue_sync_jobs": sync_items,
            "processing_jobs": processing_items,
            "has_more": any(
                len(items) == 100
                for items in (imports, sync_jobs, processing)
            ),
        }
        source = "registration.import_jobs,venue.sync_jobs,presentations.processing_jobs"
    elif workspace == "integrations":
        rows = (await db.scalars(select(Webhook).where(Webhook.event_id == event_id).order_by(Webhook.created_at.desc()).limit(100))).all()
        data = {"webhooks": [{"id": row.id, "url": row.url, "description": row.description, "subscribed_events": row.subscribed_events, "status": row.status, "version": row.version, "created_at": row.created_at, "updated_at": row.updated_at, "lifecycle_state": "archived" if row.status == "paused" else "active", "consecutive_failures": row.consecutive_failures, "last_triggered_at": row.last_triggered_at, "last_success_at": row.last_success_at, "last_failure_reason": row.last_failure_reason, "total_deliveries": row.total_deliveries, "total_failures": row.total_failures, "secret_configured": bool(row.secret_hash)} for row in rows]}; source = "integrations.webhooks"
    elif workspace == "analytics":
        data = await build_analytics_snapshot(db, event_id); source = "analytics.build_analytics_snapshot"
    elif workspace == "audit":
        rows = (await db.scalars(select(AuditLog).where(AuditLog.organization_id == organization_id, AuditLog.resource_id == event_id).order_by(AuditLog.occurred_at.desc()).limit(100))).all()
        data = {"items": [{"id": row.id, "actor_user_id": row.actor_user_id, "impersonated_by": row.impersonated_by, "actor_role": row.actor_role, "resource_type": row.resource_type, "action_type": row.action_type, "change_diff": row.change_diff, "is_sensitive": row.is_sensitive, "occurred_at": row.occurred_at} for row in rows]}; source = "audit.logs"
    if access:
        await _dispatch_read_audit(
            request,
            actor,
            organization_id,
            f"SENSITIVE_EVENT_{workspace.upper()}_READ",
            "event",
            event_id,
            new_state={
                "privileged_access_session_id": str(access.id),
                "workspace": workspace,
                "field_categories": sorted(sensitive_categories),
            },
        )
    return {"workspace": workspace, "event_id": event_id, "generated_at": datetime.now(timezone.utc), "availability": {"available": True, "freshness_at": datetime.now(timezone.utc)}, "source": source, "sensitive_data_included": bool(access), "data": data}


@router.patch("/events/{event_id}/settings")
async def update_event_settings(
    organization_id: uuid.UUID,
    event_id: uuid.UUID,
    payload: EventWorkspaceMutation,
    request: Request,
    step_up: StepUpAuth,
    actor: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
    if_match: str | None = Header(None, alias="If-Match"),
):
    del step_up
    event_update = EventUpdate.model_validate(payload.data)
    from app.core.concurrency import require_if_match
    expected_version = require_if_match(if_match) if if_match is not None else None
    return await EventSettingsCommandService(db).update(
        organization_id=organization_id, event_id=event_id, actor=actor,
        payload=event_update, reason=payload.reason,
        case_reference=payload.case_reference, expected_version=expected_version,
    )


@router.patch("/events/{event_id}/operations")
async def update_event_operational_controls(
    organization_id: uuid.UUID,
    event_id: uuid.UUID,
    payload: EventOperationalControlUpdate,
    request: Request,
    step_up: StepUpAuth,
    actor: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
    if_match: int | None = Header(default=None, alias="If-Match", ge=1),
):
    del step_up
    return await EventOperationalControlCommandService(db).update(
        organization_id=organization_id, event_id=event_id, actor=actor,
        is_maintenance=payload.is_maintenance, is_read_only=payload.is_read_only,
        reason=payload.reason, case_reference=payload.case_reference,
        expected_version=if_match,
    )


@router.post("/events/{event_id}/workspace/registrations/{registration_id}/correction")
async def correct_event_registration(organization_id: uuid.UUID, event_id: uuid.UUID, registration_id: uuid.UUID, payload: RegistrationAdministrativeCorrection, request: Request, step_up: StepUpAuth, actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    if_match = request.headers.get("If-Match")
    expected_version = int(if_match) if if_match and if_match.isdigit() else None
    return await RegistrationCorrectionCommandService(db).correct(
        organization_id=organization_id, event_id=event_id,
        registration_id=registration_id, actor=actor, status=payload.status,
        reason=payload.reason, case_reference=payload.case_reference,
        rejection_reason=payload.rejection_reason,
        expected_version=expected_version,
    )


@router.post("/events/{event_id}/workspace/{workspace}", status_code=status.HTTP_201_CREATED)
async def create_event_workspace_resource(organization_id: uuid.UUID, event_id: uuid.UUID, workspace: str, payload: EventWorkspaceMutation, request: Request, step_up: StepUpAuth, idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    command = EventWorkspaceCommandService(db)
    event = await _require_scoped_event(db, organization_id, event_id)
    reservation = None
    one_time_secret = None
    if workspace == "speakers":
        data = SpeakerCreate.model_validate(payload.data)
        row = await EventResourceMutationService.create_speaker(
            db,
            event=event,
            payload=data,
            actor_user_id=actor.id,
            idempotency_key=idempotency_key,
            source="organization_console",
        )
        resource_type = "speaker"
    elif workspace == "sessions":
        data = SessionCreate.model_validate(payload.data)
        row = await EventResourceMutationService.create_session(
            db,
            event=event,
            payload=data,
            actor_user_id=actor.id,
            idempotency_key=idempotency_key,
            source="organization_console",
        )
        resource_type = "session"
    elif workspace == "rooms":
        data = RoomCreate.model_validate(payload.data)
        row = await EventResourceMutationService.create_room(
            db,
            event=event,
            payload=data,
            actor_user_id=actor.id,
            idempotency_key=idempotency_key,
            source="organization_console",
        )
        resource_type = "room"
    elif workspace == "attendees":
        data = ParticipantCreate.model_validate(payload.data)
        row, _, outcome = await EventParticipantMutationService.create(
            db,
            event=event,
            payload=data,
            actor_user_id=actor.id,
            idempotency_key=idempotency_key,
            source="organization_console",
        )
        resource_type = "participant"
        if outcome == "MERGED":
            db.add(
                _audit(
                    request,
                    actor,
                    organization_id,
                    "EVENT_PARTICIPANT_MERGED",
                    resource_type,
                    row.id,
                    new_state={
                        "event_id": str(event_id),
                        "reason": payload.reason,
                        "case_reference": payload.case_reference,
                    },
                    sensitive=True,
                )
            )
            await command.commit(organization_id=organization_id, event_id=event_id)
            enqueue_event_registration_projection_refresh(
                organization_id=organization_id, event_id=event_id
            )
            return {
                "id": row.id,
                "event_id": event_id,
                "resource_type": resource_type,
                "outcome": outcome,
            }
    elif workspace == "integrations":
        data = WebhookCreate.model_validate(payload.data)
        await enforce_event_operation(db, organization_id, event_id, "developer.webhooks.manage", user_id=actor.id)
        request_hash = request_fingerprint(
            {
                "operation": "CREATE",
                "event_id": str(event_id),
                "payload": payload.model_dump(mode="json"),
            }
        )
        replay = await _webhook_mutation_replay(
            db,
            organization_id=organization_id,
            event_id=event_id,
            actor_id=actor.id,
            idempotency_key=idempotency_key,
            request_hash=request_hash,
        )
        if replay is not None:
            return replay
        await db.scalar(
            select(Event.id)
            .where(Event.id == event_id, Event.organization_id == organization_id)
            .with_for_update()
        )
        duplicate = await db.scalar(
            select(Webhook.id).where(
                Webhook.event_id == event_id,
                Webhook.url == data.url,
                Webhook.status != "paused",
            )
        )
        if duplicate:
            raise HTTPException(
                status_code=409,
                detail="A webhook with this URL already exists for this event",
            )
        secret = data.secret or secrets.token_urlsafe(32)
        one_time_secret = secret
        row = Webhook(event_id=event_id, url=data.url, description=data.description, subscribed_events=data.subscribed_events, secret_hash=hashlib.sha256(secret.encode()).hexdigest(), status="active")
        resource_type = "webhook"
        db.add(row)
        await db.flush()
        response = {
            "id": row.id,
            "event_id": event_id,
            "resource_type": resource_type,
            "created_at": row.created_at,
            "secret": one_time_secret,
            "secret_available_once": True,
            "version": row.version,
        }
        replay_response = {
            **response,
            "secret": None,
            "secret_available_once": False,
        }
        db.add(
            _webhook_mutation(
                organization_id=organization_id,
                event_id=event_id,
                webhook_id=row.id,
                actor_id=actor.id,
                operation_type="CREATE",
                idempotency_key=idempotency_key,
                request_hash=request_hash,
                response=replay_response,
            )
        )
        db.add(_audit(request, actor, organization_id, "EVENT_WEBHOOK_CREATED", "webhook", row.id, new_state={"event_id": str(event_id), "reason": payload.reason, "case_reference": payload.case_reference, "secret_configured": True, "version": row.version}, sensitive=True))
        await command.commit(organization_id=organization_id, event_id=event_id)
        return response
    elif workspace == "communications":
        data = CampaignCreate.model_validate(payload.data)
        row = await EventCampaignMutationService.create(
            db,
            event=event,
            payload=data,
            actor=actor,
        )
        resource_type = "email_campaign"
    elif workspace == "templates":
        kind = payload.data.get("kind")
        template_data = {key: value for key, value in payload.data.items() if key != "kind"}
        if kind == "email":
            data = EmailTemplateCreate.model_validate(template_data)
            row = await EventTemplateMutationService.create_email(
                db,
                event=event,
                payload=data,
                actor_user_id=actor.id,
            )
            resource_type = "email_template"
        elif kind == "print":
            data = PrintTemplateCreate.model_validate(template_data)
            row = await EventTemplateMutationService.create_print(
                db,
                event=event,
                payload=data,
                actor_user_id=actor.id,
                idempotency_key=idempotency_key,
                source="organization_console",
            )
            resource_type = "print_template"
        else: raise HTTPException(status_code=422, detail="Template kind must be 'email' or 'print'")
    else: raise HTTPException(status_code=405, detail="This event workspace does not support create operations")
    db.add(row); await db.flush()
    if reservation is not None:
        await UsageReservationService.consume(db, reservation.id, source=f"organization_console.{workspace}.create", actor_user_id=actor.id)
    db.add(_audit(request, actor, organization_id, f"EVENT_{resource_type.upper()}_CREATED", resource_type, row.id, new_state={"event_id": str(event_id), "reason": payload.reason, "case_reference": payload.case_reference}, sensitive=workspace in {"speakers", "integrations"})); await command.commit(organization_id=organization_id, event_id=event_id)
    if workspace == "attendees":
        enqueue_event_registration_projection_refresh(
            organization_id=organization_id, event_id=event_id
        )
    await db.refresh(row)
    response = {"id": row.id, "event_id": event_id, "resource_type": resource_type, "created_at": getattr(row, "created_at", getattr(row, "updated_at", None))}
    if one_time_secret is not None:
        response["secret"] = one_time_secret
        response["secret_available_once"] = True
        response["version"] = row.version
    return response


@router.patch("/events/{event_id}/workspace/{workspace}/{resource_id}")
async def update_event_workspace_resource(organization_id: uuid.UUID, event_id: uuid.UUID, workspace: str, resource_id: uuid.UUID, payload: EventWorkspaceMutation, request: Request, step_up: StepUpAuth, if_match: int | None = Header(None, alias="If-Match", ge=1), idempotency_key: str | None = Header(None, alias="Idempotency-Key", min_length=8, max_length=200), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    command = EventWorkspaceCommandService(db)
    event = await _require_scoped_event(db, organization_id, event_id)
    if workspace == "attendees":
        row, _, changes, old = await EventParticipantMutationService.update(
            db,
            event=event,
            participant_id=resource_id,
            payload=ParticipantUpdate.model_validate(payload.data),
            actor_user_id=actor.id,
        )
        db.add(
            _audit(
                request,
                actor,
                organization_id,
                "EVENT_PARTICIPANT_UPDATED",
                "participant",
                row.id,
                old_state=old,
                new_state={
                    "changed_fields": sorted(changes),
                    "event_id": str(event_id),
                    "reason": payload.reason,
                    "case_reference": payload.case_reference,
                },
                sensitive=True,
            )
        )
        await command.commit(organization_id=organization_id, event_id=event_id)
        enqueue_event_registration_projection_refresh(
            organization_id=organization_id, event_id=event_id
        )
        return {
            "id": row.id,
            "event_id": event_id,
            "resource_type": "participant",
            "updated": sorted(changes),
        }
    if workspace in {"speakers", "sessions", "rooms"}:
        if workspace == "speakers":
            row, changes, old = await EventResourceMutationService.update_speaker(
                db,
                event=event,
                speaker_id=resource_id,
                payload=SpeakerUpdate.model_validate(payload.data),
                actor_user_id=actor.id,
            )
            resource_type = "speaker"
        elif workspace == "sessions":
            row, changes, old = await EventResourceMutationService.update_session(
                db,
                event=event,
                session_id=resource_id,
                payload=SessionUpdate.model_validate(payload.data),
                actor_user_id=actor.id,
            )
            resource_type = "session"
        else:
            try:
                room_payload = RoomUpdate.model_validate(payload.data)
            except ValidationError as exc:
                raise HTTPException(status_code=422, detail=jsonable_encoder(exc.errors())) from exc
            row, changes, old = await EventResourceMutationService.update_room(
                db,
                event=event,
                room_id=resource_id,
                payload=room_payload,
                actor_user_id=actor.id,
            )
            resource_type = "room"
        db.add(
            _audit(
                request,
                actor,
                organization_id,
                f"EVENT_{resource_type.upper()}_UPDATED",
                resource_type,
                row.id,
                old_state=old,
                new_state={
                    "changed_fields": sorted(changes),
                    "event_id": str(event_id),
                    "reason": payload.reason,
                    "case_reference": payload.case_reference,
                },
                sensitive=workspace == "speakers",
            )
        )
        await command.commit(organization_id=organization_id, event_id=event_id)
        return {
            "id": row.id,
            "event_id": event_id,
            "resource_type": resource_type,
            "updated": sorted(changes),
        }
    if workspace == "integrations":
        await enforce_event_operation(
            db,
            organization_id,
            event_id,
            "developer.webhooks.manage",
            user_id=actor.id,
        )
        if if_match is None or idempotency_key is None:
            raise HTTPException(
                status_code=428,
                detail={
                    "code": "VERSION_AND_IDEMPOTENCY_REQUIRED",
                    "required_headers": ["If-Match", "Idempotency-Key"],
                },
            )
        data = WebhookUpdate.model_validate(payload.data)
        changes = data.model_dump(exclude_unset=True)
        request_hash = request_fingerprint(
            {
                "operation": "UPDATE",
                "event_id": str(event_id),
                "webhook_id": str(resource_id),
                "version": if_match,
                "payload": payload.model_dump(mode="json"),
            }
        )
        replay = await _webhook_mutation_replay(
            db,
            organization_id=organization_id,
            event_id=event_id,
            actor_id=actor.id,
            idempotency_key=idempotency_key,
            request_hash=request_hash,
        )
        if replay is not None:
            return replay
        row = await db.scalar(
            select(Webhook)
            .where(Webhook.id == resource_id, Webhook.event_id == event_id)
            .with_for_update()
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Webhook not found")
        if row.version != if_match:
            raise HTTPException(
                status_code=409,
                detail={"code": "VERSION_CONFLICT", "current_version": row.version},
            )
        old = {key: getattr(row, key, None) for key in changes}
        for key, value in changes.items():
            setattr(row, key, value)
        if data.status == "active":
            row.consecutive_failures = 0
            row.last_failure_reason = None
        row.version += 1
        row.updated_at = datetime.now(timezone.utc)
        await db.flush()
        response = {
            "id": row.id,
            "event_id": event_id,
            "resource_type": "webhook",
            "updated": sorted(changes),
            "version": row.version,
            "status": row.status,
        }
        db.add(
            _webhook_mutation(
                organization_id=organization_id,
                event_id=event_id,
                webhook_id=row.id,
                actor_id=actor.id,
                operation_type="UPDATE",
                idempotency_key=idempotency_key,
                request_hash=request_hash,
                response=response,
            )
        )
        db.add(_audit(request, actor, organization_id, "EVENT_WEBHOOK_UPDATED", "webhook", row.id, old_state=old, new_state={"changed_fields": sorted(changes), "event_id": str(event_id), "reason": payload.reason, "case_reference": payload.case_reference, "version": row.version}, sensitive=True))
        await command.commit(organization_id=organization_id, event_id=event_id)
        return response
    elif workspace == "communications":
        row, old, changes = await EventCampaignMutationService.update(
            db,
            event=event,
            campaign_id=resource_id,
            payload=CampaignUpdate.model_validate(payload.data),
            actor=actor,
        )
        db.add(_audit(request, actor, organization_id, "EVENT_EMAIL_CAMPAIGN_UPDATED", "email_campaign", row.id, old_state=old, new_state={"changed_fields": changes, "event_id": str(event_id), "reason": payload.reason, "case_reference": payload.case_reference}, sensitive=False))
        await command.commit(organization_id=organization_id, event_id=event_id)
        return {"id": row.id, "event_id": event_id, "resource_type": "email_campaign", "updated": changes}
    elif workspace == "templates":
        kind = payload.data.get("kind")
        clean = {key: value for key, value in payload.data.items() if key != "kind"}
        if kind == "email":
            row, old, changes, cloned = await EventTemplateMutationService.update_email(
                db,
                event=event,
                template_id=resource_id,
                payload=EmailTemplateUpdate.model_validate(clean),
                actor_user_id=actor.id,
            )
            resource_type = "email_template"
        elif kind == "print":
            if idempotency_key is None:
                raise HTTPException(
                    status_code=428,
                    detail={
                        "code": "IDEMPOTENCY_REQUIRED",
                        "required_headers": ["Idempotency-Key"],
                    },
                )
            row, old, changes = await EventTemplateMutationService.update_print(
                db,
                event=event,
                template_id=resource_id,
                payload=PrintTemplateUpdate.model_validate(clean),
                actor_user_id=actor.id,
                idempotency_key=idempotency_key,
                source="organization_console",
            )
            cloned = False
            resource_type = "print_template"
        else:
            raise HTTPException(
                status_code=422,
                detail="Template kind must be 'email' or 'print'",
            )
        db.add(
            _audit(
                request,
                actor,
                organization_id,
                f"EVENT_{resource_type.upper()}_UPDATED",
                resource_type,
                row.id,
                old_state=old,
                new_state={
                    "changed_fields": changes,
                    "event_id": str(event_id),
                    "cloned_from_global": cloned,
                    "reason": payload.reason,
                    "case_reference": payload.case_reference,
                },
                sensitive=False,
            )
        )
        await command.commit(organization_id=organization_id, event_id=event_id)
        return {
            "id": row.id,
            "event_id": event_id,
            "resource_type": resource_type,
            "updated": changes,
            "cloned_from_global": cloned,
        }
    else: raise HTTPException(status_code=405, detail="This event workspace does not support update operations")
    conditions = [model.id == resource_id, model.event_id == event_id]
    if hasattr(model, "deleted_at"): conditions.append(model.deleted_at.is_(None))
    row = await db.scalar(select(model).where(*conditions).with_for_update())
    if not row: raise HTTPException(status_code=404, detail=f"{resource_type.replace('_', ' ').title()} not found")
    if workspace == "integrations":
        if if_match is None or idempotency_key is None:
            raise HTTPException(
                status_code=428,
                detail={
                    "code": "VERSION_AND_IDEMPOTENCY_REQUIRED",
                    "required_headers": ["If-Match", "Idempotency-Key"],
                },
            )
        if row.version != if_match:
            raise HTTPException(
                status_code=409,
                detail={"code": "VERSION_CONFLICT", "current_version": row.version},
            )
    data = schema.model_validate(payload.data)
    changes = data.model_dump(exclude_unset=True)
    transition_reservation = None
    if (
        workspace == "templates"
        and resource_type == "print_template"
        and changes.get("template_type")
        and changes["template_type"] != row.template_type
    ):
        if idempotency_key is None:
            raise HTTPException(
                status_code=428,
                detail={
                    "code": "IDEMPOTENCY_REQUIRED",
                    "required_headers": ["Idempotency-Key"],
                },
            )
        is_certificate = changes["template_type"] == "certificate"
        transition_reservation = await UsageReservationService.reserve(
            db,
            organization_id=organization_id,
            event_id=event_id,
            limit_key=(
                "max_certificate_templates"
                if is_certificate
                else "max_badge_templates"
            ),
            quantity=1,
            unit="template",
            idempotency_key=f"console-print-template-transition:{idempotency_key}",
            metadata={
                "template_id": str(row.id),
                "from": row.template_type,
                "to": changes["template_type"],
                "case_reference": payload.case_reference,
            },
        )
    old = {key: getattr(row, key, None) for key in changes}
    for key, value in changes.items(): setattr(row, key, value)
    if workspace == "integrations":
        if data.status == "active":
            row.consecutive_failures = 0
            row.last_failure_reason = None
        row.version += 1
        row.updated_at = datetime.now(timezone.utc)
    if transition_reservation is not None:
        await db.flush()
        await UsageReservationService.consume(
            db,
            transition_reservation.id,
            source="organization_console.print_templates.transition",
            actor_user_id=actor.id,
        )
    db.add(_audit(request, actor, organization_id, f"EVENT_{resource_type.upper()}_UPDATED", resource_type, row.id, old_state=old, new_state={"changed_fields": sorted(changes), "event_id": str(event_id), "reason": payload.reason, "case_reference": payload.case_reference}, sensitive=workspace in {"speakers", "integrations"})); await command.commit(organization_id=organization_id, event_id=event_id)
    return {"id": row.id, "event_id": event_id, "resource_type": resource_type, "updated": sorted(changes)}


@router.delete("/events/{event_id}/workspace/{workspace}/{resource_id}")
async def archive_event_workspace_resource(organization_id: uuid.UUID, event_id: uuid.UUID, workspace: str, resource_id: uuid.UUID, payload: EventWorkspaceDelete, request: Request, step_up: StepUpAuth, if_match: int | None = Header(None, alias="If-Match", ge=1), idempotency_key: str | None = Header(None, alias="Idempotency-Key", min_length=8, max_length=200), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    command = EventWorkspaceCommandService(db)
    event = await _require_scoped_event(db, organization_id, event_id)
    if workspace in {"speakers", "sessions", "rooms"}:
        if workspace == "speakers":
            row, outcome = await EventResourceMutationService.archive_speaker(
                db,
                event=event,
                speaker_id=resource_id,
                actor_user_id=actor.id,
                source="organization_console",
            )
            resource_type = "speaker"
        elif workspace == "sessions":
            row, outcome = await EventResourceMutationService.archive_session(
                db,
                event=event,
                session_id=resource_id,
                actor_user_id=actor.id,
                source="organization_console",
            )
            resource_type = "session"
        else:
            row, outcome = await EventResourceMutationService.archive_room(
                db,
                event=event,
                room_id=resource_id,
                actor_user_id=actor.id,
                source="organization_console",
            )
            resource_type = "room"
        db.add(
            _audit(
                request,
                actor,
                organization_id,
                f"EVENT_{resource_type.upper()}_{outcome}",
                resource_type,
                row.id,
                new_state={
                    "event_id": str(event_id),
                    "outcome": outcome,
                    "reason": payload.reason,
                    "case_reference": payload.case_reference,
                },
                sensitive=True,
            )
        )
        await command.commit(organization_id=organization_id, event_id=event_id)
        return {"id": row.id, "outcome": outcome, "recoverable": True}
    if workspace == "attendees":
        row, outcome = await EventParticipantMutationService.archive(
            db,
            event=event,
            participant_id=resource_id,
            actor_user_id=actor.id,
            source="organization_console",
        )
        db.add(
            _audit(
                request,
                actor,
                organization_id,
                f"EVENT_PARTICIPANT_{outcome}",
                "participant",
                row.id,
                new_state={
                    "event_id": str(event_id),
                    "outcome": outcome,
                    "reason": payload.reason,
                    "case_reference": payload.case_reference,
                },
                sensitive=True,
            )
        )
        await command.commit(organization_id=organization_id, event_id=event_id)
        enqueue_event_registration_projection_refresh(
            organization_id=organization_id, event_id=event_id
        )
        return {"id": row.id, "outcome": outcome, "recoverable": True}
    if workspace == "integrations":
        await enforce_event_operation(
            db,
            organization_id,
            event_id,
            "developer.webhooks.manage",
            user_id=actor.id,
        )
        if if_match is None or idempotency_key is None:
            raise HTTPException(
                status_code=428,
                detail={
                    "code": "VERSION_AND_IDEMPOTENCY_REQUIRED",
                    "required_headers": ["If-Match", "Idempotency-Key"],
                },
            )
        request_hash = request_fingerprint(
            {
                "operation": "ARCHIVE",
                "event_id": str(event_id),
                "webhook_id": str(resource_id),
                "version": if_match,
                "payload": payload.model_dump(mode="json"),
            }
        )
        replay = await _webhook_mutation_replay(
            db,
            organization_id=organization_id,
            event_id=event_id,
            actor_id=actor.id,
            idempotency_key=idempotency_key,
            request_hash=request_hash,
        )
        if replay is not None:
            return replay
        row = await db.scalar(
            select(Webhook)
            .where(Webhook.id == resource_id, Webhook.event_id == event_id)
            .with_for_update()
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Webhook not found")
        if row.version != if_match:
            raise HTTPException(
                status_code=409,
                detail={"code": "VERSION_CONFLICT", "current_version": row.version},
            )
        row.status = "paused"
        row.version += 1
        row.updated_at = datetime.now(timezone.utc)
        response = {
            "id": row.id,
            "outcome": "PAUSED",
            "recoverable": True,
            "version": row.version,
        }
        db.add(
            _webhook_mutation(
                organization_id=organization_id,
                event_id=event_id,
                webhook_id=row.id,
                actor_id=actor.id,
                operation_type="ARCHIVE",
                idempotency_key=idempotency_key,
                request_hash=request_hash,
                response=response,
            )
        )
        db.add(_audit(request, actor, organization_id, "EVENT_WEBHOOK_PAUSED", "webhook", row.id, new_state={"event_id": str(event_id), "reason": payload.reason, "case_reference": payload.case_reference, "version": row.version}, sensitive=True))
        await command.commit(organization_id=organization_id, event_id=event_id)
        return response
    elif workspace == "communications":
        row, outcome = await EventCampaignMutationService.archive(
            db,
            event=event,
            campaign_id=resource_id,
            actor=actor,
        )
        db.add(_audit(request, actor, organization_id, f"EVENT_EMAIL_CAMPAIGN_{outcome}", "email_campaign", row.id, new_state={"event_id": str(event_id), "outcome": outcome, "reason": payload.reason, "case_reference": payload.case_reference}, sensitive=True))
        await command.commit(organization_id=organization_id, event_id=event_id)
        return {"id": row.id, "outcome": outcome, "recoverable": True}
    elif workspace == "templates":
        if await db.scalar(
            select(EmailTemplate.id).where(
                EmailTemplate.id == resource_id,
                EmailTemplate.event_id == event_id,
            ).execution_options(skip_tenant_filter=True)
        ):
            row, outcome = await EventTemplateMutationService.archive_email(
                db,
                event=event,
                template_id=resource_id,
                actor_user_id=actor.id,
            )
            resource_type = "email_template"
        else:
            row, outcome = await EventTemplateMutationService.archive_print(
                db,
                event=event,
                template_id=resource_id,
                actor_user_id=actor.id,
            )
            resource_type = "print_template"
        db.add(_audit(request, actor, organization_id, f"EVENT_{resource_type.upper()}_{outcome}", resource_type, row.id, new_state={"event_id": str(event_id), "outcome": outcome, "reason": payload.reason, "case_reference": payload.case_reference}, sensitive=True))
        await command.commit(organization_id=organization_id, event_id=event_id)
        return {"id": row.id, "outcome": outcome, "recoverable": True}
    else: raise HTTPException(status_code=409, detail="This resource requires a recoverable lifecycle job and cannot be directly deleted")
    row = await db.scalar(select(model).where(model.id == resource_id, model.event_id == event_id).with_for_update())
    if not row: raise HTTPException(status_code=404, detail=f"{resource_type.title()} not found")
    if workspace == "integrations":
        if if_match is None or idempotency_key is None:
            raise HTTPException(
                status_code=428,
                detail={
                    "code": "VERSION_AND_IDEMPOTENCY_REQUIRED",
                    "required_headers": ["If-Match", "Idempotency-Key"],
                },
            )
        if row.version != if_match:
            raise HTTPException(
                status_code=409,
                detail={"code": "VERSION_CONFLICT", "current_version": row.version},
            )
    if (hasattr(row, "deleted_at") and row.deleted_at is not None) or (workspace == "rooms" and not row.is_active) or (workspace == "integrations" and row.status == "paused"):
        return {"id": row.id, "outcome": "ALREADY_ARCHIVED", "recoverable": True}
    if workspace == "sessions" and row.status == "in_progress": raise HTTPException(status_code=409, detail="An in-progress session cannot be archived")
    if hasattr(row, "deleted_at"):
        row.deleted_at = datetime.now(timezone.utc); row.deleted_by = actor.id; outcome = "SOFT_DELETED"
    elif workspace == "rooms": row.is_active = False; outcome = "DEACTIVATED"
    else:
        row.status = "paused"
        row.version += 1
        row.updated_at = datetime.now(timezone.utc)
        outcome = "PAUSED"
    db.add(_audit(request, actor, organization_id, f"EVENT_{resource_type.upper()}_{outcome}", resource_type, row.id, new_state={"event_id": str(event_id), "outcome": outcome, "reason": payload.reason, "case_reference": payload.case_reference}, sensitive=True)); await command.commit(organization_id=organization_id, event_id=event_id)
    return {"id": row.id, "outcome": outcome, "recoverable": True}


@router.post("/events/{event_id}/workspace/{workspace}/{resource_id}/restore")
async def restore_event_workspace_resource(organization_id: uuid.UUID, event_id: uuid.UUID, workspace: str, resource_id: uuid.UUID, payload: EventWorkspaceDelete, request: Request, step_up: StepUpAuth, idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200), if_match: int | None = Header(None, alias="If-Match", ge=1), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    command = EventWorkspaceCommandService(db)
    event = await _require_scoped_event(db, organization_id, event_id)
    if workspace in {"speakers", "sessions", "rooms"}:
        if workspace == "speakers":
            row, outcome = await EventResourceMutationService.restore_speaker(
                db,
                event=event,
                speaker_id=resource_id,
                actor_user_id=actor.id,
                idempotency_key=idempotency_key,
                source="organization_console",
            )
            resource_type = "speaker"
        elif workspace == "sessions":
            row, outcome = await EventResourceMutationService.restore_session(
                db,
                event=event,
                session_id=resource_id,
                actor_user_id=actor.id,
                idempotency_key=idempotency_key,
                source="organization_console",
            )
            resource_type = "session"
        else:
            row, outcome = await EventResourceMutationService.restore_room(
                db,
                event=event,
                room_id=resource_id,
                actor_user_id=actor.id,
                idempotency_key=idempotency_key,
                source="organization_console",
            )
            resource_type = "room"
        db.add(
            _audit(
                request,
                actor,
                organization_id,
                f"EVENT_{resource_type.upper()}_{outcome}",
                resource_type,
                row.id,
                new_state={
                    "event_id": str(event_id),
                    "outcome": outcome,
                    "reason": payload.reason,
                    "case_reference": payload.case_reference,
                },
                sensitive=True,
            )
        )
        await command.commit(organization_id=organization_id, event_id=event_id)
        return {"id": row.id, "outcome": outcome}
    if workspace == "attendees":
        row, outcome = await EventParticipantMutationService.restore(
            db,
            event=event,
            participant_id=resource_id,
            actor_user_id=actor.id,
            idempotency_key=idempotency_key,
            source="organization_console",
        )
        db.add(
            _audit(
                request,
                actor,
                organization_id,
                f"EVENT_PARTICIPANT_{outcome}",
                "participant",
                row.id,
                new_state={
                    "event_id": str(event_id),
                    "outcome": outcome,
                    "reason": payload.reason,
                    "case_reference": payload.case_reference,
                },
                sensitive=True,
            )
        )
        await command.commit(organization_id=organization_id, event_id=event_id)
        enqueue_event_registration_projection_refresh(
            organization_id=organization_id, event_id=event_id
        )
        return {"id": row.id, "outcome": outcome}
    if workspace == "integrations":
        await enforce_event_operation(
            db,
            organization_id,
            event_id,
            "developer.webhooks.manage",
            user_id=actor.id,
        )
        if if_match is None:
            raise HTTPException(
                status_code=428,
                detail={
                    "code": "VERSION_REQUIRED",
                    "required_headers": ["If-Match"],
                },
            )
        request_hash = request_fingerprint(
            {
                "operation": "RESTORE",
                "event_id": str(event_id),
                "webhook_id": str(resource_id),
                "version": if_match,
                "payload": payload.model_dump(mode="json"),
            }
        )
        replay = await _webhook_mutation_replay(
            db,
            organization_id=organization_id,
            event_id=event_id,
            actor_id=actor.id,
            idempotency_key=idempotency_key,
            request_hash=request_hash,
        )
        if replay is not None:
            return replay
        row = await db.scalar(
            select(Webhook)
            .where(Webhook.id == resource_id, Webhook.event_id == event_id)
            .with_for_update()
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Webhook not found")
        if row.version != if_match:
            raise HTTPException(
                status_code=409,
                detail={"code": "VERSION_CONFLICT", "current_version": row.version},
            )
        row.status = "active"
        row.consecutive_failures = 0
        row.last_failure_reason = None
        row.version += 1
        row.updated_at = datetime.now(timezone.utc)
        response = {
            "id": row.id,
            "outcome": "RESTORED",
            "version": row.version,
        }
        db.add(
            _webhook_mutation(
                organization_id=organization_id,
                event_id=event_id,
                webhook_id=row.id,
                actor_id=actor.id,
                operation_type="RESTORE",
                idempotency_key=idempotency_key,
                request_hash=request_hash,
                response=response,
            )
        )
        db.add(_audit(request, actor, organization_id, "EVENT_WEBHOOK_RESTORED", "webhook", row.id, new_state={"event_id": str(event_id), "reason": payload.reason, "case_reference": payload.case_reference, "version": row.version}, sensitive=True))
        await command.commit(organization_id=organization_id, event_id=event_id)
        return response
    elif workspace == "communications":
        row, outcome = await EventCampaignMutationService.restore(
            db,
            event=event,
            campaign_id=resource_id,
            actor=actor,
        )
        db.add(_audit(request, actor, organization_id, f"EVENT_EMAIL_CAMPAIGN_{outcome}", "email_campaign", row.id, new_state={"event_id": str(event_id), "reason": payload.reason, "case_reference": payload.case_reference}, sensitive=True))
        await command.commit(organization_id=organization_id, event_id=event_id)
        return {"id": row.id, "outcome": outcome}
    elif workspace == "templates":
        if await db.scalar(
            select(EmailTemplate.id).where(
                EmailTemplate.id == resource_id,
                EmailTemplate.event_id == event_id,
            ).execution_options(skip_tenant_filter=True)
        ):
            row, outcome = await EventTemplateMutationService.restore_email(
                db,
                event=event,
                template_id=resource_id,
                actor_user_id=actor.id,
            )
            resource_type = "email_template"
        else:
            row, outcome = await EventTemplateMutationService.restore_print(
                db,
                event=event,
                template_id=resource_id,
                actor_user_id=actor.id,
                idempotency_key=idempotency_key,
                source="organization_console",
            )
            resource_type = "print_template"
        db.add(_audit(request, actor, organization_id, f"EVENT_{resource_type.upper()}_{outcome}", resource_type, row.id, new_state={"event_id": str(event_id), "reason": payload.reason, "case_reference": payload.case_reference}, sensitive=True))
        await command.commit(organization_id=organization_id, event_id=event_id)
        return {"id": row.id, "outcome": outcome}
    else: raise HTTPException(status_code=405, detail="This workspace does not support restore")
    row = await db.scalar(select(model).where(model.id == resource_id, model.event_id == event_id).with_for_update())
    if not row: raise HTTPException(status_code=404, detail=f"{resource_type.title()} not found")
    if workspace == "integrations":
        if if_match is None:
            raise HTTPException(
                status_code=428,
                detail={
                    "code": "VERSION_REQUIRED",
                    "required_headers": ["If-Match"],
                },
            )
        if row.version != if_match:
            raise HTTPException(
                status_code=409,
                detail={"code": "VERSION_CONFLICT", "current_version": row.version},
            )
    if (hasattr(row, "deleted_at") and row.deleted_at is None) or (workspace == "rooms" and row.is_active) or (workspace == "integrations" and row.status == "active"):
        return {"id": row.id, "outcome": "ALREADY_ACTIVE"}
    restore_marker = row.deleted_at.isoformat() if getattr(row, "deleted_at", None) else f"{workspace}:{getattr(row, 'status', getattr(row, 'is_active', None))}"
    operation = {
        "speakers": "speakers.manage",
        "sessions": "sessions.manage",
        "rooms": "venue.rooms.manage",
        "integrations": "developer.webhooks.manage",
        "communications": "communications.campaign.manage",
    }[workspace]
    await enforce_event_operation(db, organization_id, event_id, operation, user_id=actor.id)
    limit_key = {
        "speakers": "max_speakers",
        "sessions": "max_sessions",
        "rooms": "max_rooms",
    }.get(workspace)
    reservation = None
    if limit_key:
        reservation = await UsageReservationService.reserve(
            db,
            organization_id=organization_id,
            event_id=event_id,
            limit_key=limit_key,
            quantity=1,
            unit=resource_type,
            idempotency_key=f"workspace-restore:{workspace}:{idempotency_key}",
            metadata={"resource_id": str(row.id), "restore_marker": restore_marker},
        )
    if hasattr(row, "deleted_at"): row.deleted_at = None; row.deleted_by = None
    elif workspace == "rooms": row.is_active = True
    else:
        row.status = "active"
        row.version += 1
        row.updated_at = datetime.now(timezone.utc)
    if reservation is not None:
        await UsageReservationService.consume(db, reservation.id, source=f"organization_console.{workspace}.restore", actor_user_id=actor.id)
    db.add(_audit(request, actor, organization_id, f"EVENT_{resource_type.upper()}_RESTORED", resource_type, row.id, new_state={"event_id": str(event_id), "reason": payload.reason, "case_reference": payload.case_reference}, sensitive=True)); await command.commit(organization_id=organization_id, event_id=event_id)
    return {"id": row.id, "outcome": "RESTORED"}


@router.post("/events/{event_id}/workspace/{workspace}/{resource_id}/actions")
async def execute_event_workspace_action(organization_id: uuid.UUID, event_id: uuid.UUID, workspace: str, resource_id: uuid.UUID, payload: EventWorkspaceAction, request: Request, step_up: StepUpAuth, idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200), actor: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    command = EventWorkspaceCommandService(db)
    event = await _require_scoped_event(db, organization_id, event_id)
    action = payload.action
    task_to_dispatch = None
    consume_now = None
    if workspace == "files":
        if action not in {"APPROVE", "REJECT", "LOCK", "UNLOCK", "RETRY_PROCESSING"}:
            raise HTTPException(status_code=422, detail="Unsupported file action")
        row = await PresentationFileAdministrationService.apply(db, event, resource_id, actor.id, action, reason=payload.data.get("rejection_reason") or payload.reason, source="organization_console")
        if action == "RETRY_PROCESSING":
            from app.modules.presentations.tasks.file_tasks import validate_presentation
            task_to_dispatch = lambda: validate_presentation.delay(str(row.id), str(organization_id))
        result = {"id": row.id, "status": row.upload_status, "is_locked": row.is_locked}
    elif workspace == "attendees":
        if action not in {"ISSUE_CONFIRMATION_QR", "ROTATE_CONFIRMATION_QR"}:
            raise HTTPException(
                status_code=422,
                detail="Unsupported attendee action",
            )
        await enforce_event_operation(
            db,
            organization_id,
            event_id,
            "registration.confirmation_qr.manage",
            user_id=actor.id,
        )
        participant = await db.scalar(
            select(Participant)
            .where(
                Participant.id == resource_id,
                Participant.event_id == event_id,
                Participant.deleted_at.is_(None),
            )
            .with_for_update()
        )
        if participant is None:
            raise HTTPException(status_code=404, detail="Attendee not found")
        try:
            expected_version = int(payload.data.get("version"))
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=422,
                detail="A numeric confirmation QR version is required",
            ) from exc
        if action == "ISSUE_CONFIRMATION_QR" and expected_version != 0:
            raise HTTPException(
                status_code=409,
                detail="Use ROTATE_CONFIRMATION_QR for an existing credential",
            )
        if action == "ROTATE_CONFIRMATION_QR" and expected_version < 1:
            raise HTTPException(
                status_code=409,
                detail="No existing confirmation QR is available to rotate",
            )
        issuance = await RegistrationConfirmationQRService.issue_or_rotate(
            db,
            organization_id=organization_id,
            event_id=event_id,
            participant=participant,
            expected_version=expected_version,
            idempotency_key=idempotency_key,
            actor_user_id=actor.id,
        )
        token = build_confirmation_token(
            issuance.credential.id,
            issuance.credential.credential_version,
        )
        result = {
            "id": participant.id,
            "qr_status": issuance.credential.status,
            "qr_version": issuance.credential.credential_version,
            "qr_image_url": build_confirmation_image_url(token),
            "outcome": (
                "REPLAYED"
                if issuance.replayed
                else ("ROTATED" if issuance.old_state else "ISSUED")
            ),
        }
    elif workspace == "abstracts":
        await enforce_event_operation(
            db,
            organization_id,
            event_id,
            "abstracts.review",
            user_id=actor.id,
        )
        row = await db.scalar(
            select(SessionSpeaker)
            .join(Session, Session.id == SessionSpeaker.session_id)
            .join(Speaker, Speaker.id == SessionSpeaker.speaker_id)
            .where(
                SessionSpeaker.id == resource_id,
                Session.event_id == event_id,
                Speaker.event_id == event_id,
                Session.deleted_at.is_(None),
                Speaker.deleted_at.is_(None),
            )
            .with_for_update()
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Abstract not found")
        if row.abstract_idempotency_key == idempotency_key:
            result = {
                "id": row.id,
                "status": row.abstract_status,
                "version": row.abstract_version,
            }
        else:
            try:
                expected_version = int(payload.data.get("version"))
            except (TypeError, ValueError) as exc:
                raise HTTPException(
                    status_code=422,
                    detail="A numeric abstract version is required",
                ) from exc
            if row.abstract_version != expected_version:
                raise HTTPException(
                    status_code=412,
                    detail={
                        "code": "VERSION_CONFLICT",
                        "current_version": row.abstract_version,
                    },
                )
            decision = {
                "START_REVIEW": "UNDER_REVIEW",
                "APPROVE": "ACCEPTED",
                "REJECT": "REJECTED",
                "REQUEST_REVISION": "REVISION_REQUESTED",
            }.get(action)
            if decision is None:
                raise HTTPException(
                    status_code=422,
                    detail="Unsupported abstract action",
                )
            allowed_from = {
                "UNDER_REVIEW": {"SUBMITTED"},
                "ACCEPTED": {"SUBMITTED", "UNDER_REVIEW"},
                "REJECTED": {"SUBMITTED", "UNDER_REVIEW"},
                "REVISION_REQUESTED": {"SUBMITTED", "UNDER_REVIEW"},
            }
            if row.abstract_status not in allowed_from[decision]:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "INVALID_ABSTRACT_STATE",
                        "status": row.abstract_status,
                        "decision": decision,
                    },
                )
            notes = str(payload.data.get("review_notes") or "").strip()
            if decision in {"REJECTED", "REVISION_REQUESTED"} and not notes:
                raise HTTPException(
                    status_code=422,
                    detail={"code": "REVIEW_NOTES_REQUIRED"},
                )
            row.abstract_status = decision
            row.abstract_review_notes = notes or None
            row.abstract_reviewed_at = datetime.now(timezone.utc)
            row.abstract_reviewed_by = actor.id
            row.abstract_version += 1
            row.abstract_idempotency_key = idempotency_key
            result = {
                "id": row.id,
                "status": row.abstract_status,
                "version": row.abstract_version,
                "review_notes": row.abstract_review_notes,
            }
    elif workspace == "communications":
        await enforce_event_operation(db, organization_id, event_id, "communications.campaign.manage", user_id=actor.id)
        campaign = await db.scalar(select(EmailCampaign).where(EmailCampaign.id == resource_id, EmailCampaign.event_id == event_id).with_for_update())
        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")
        from app.modules.notifications.tasks.email_tasks import process_email_campaign
        if action == "SEND":
            if campaign.status != "draft":
                raise HTTPException(status_code=409, detail="Only draft campaigns can be sent")
            recipient_count = campaign.total_recipients
            if not recipient_count:
                from app.modules.notifications.routers.notifications import get_campaign_recipient_count
                recipient_count = await get_campaign_recipient_count(db, campaign)
            if recipient_count <= 0:
                raise HTTPException(status_code=409, detail={"code": "NO_CAMPAIGN_RECIPIENTS", "message": "Campaign has no eligible recipients"})
            await enforce_event_operation(db, organization_id, event_id, "communications.bulk_email.send", user_id=actor.id)
            await enforce_event_operation(db, organization_id, event_id, "communications.email.send", user_id=actor.id)
            reservation = await UsageReservationService.reserve(db, organization_id=organization_id, event_id=event_id, limit_key="max_emails_per_event", quantity=recipient_count, unit="recipient", idempotency_key=f"console-email-send:{idempotency_key}", ttl_seconds=86_400, metadata={"campaign_id": str(campaign.id), "action": action})
            campaign.total_recipients = recipient_count
            campaign.status = "sending"
            task_to_dispatch = lambda: process_email_campaign.delay(str(campaign.id), str(organization_id), str(reservation.id))
        elif action == "RESEND_FAILED":
            failed_count = await db.scalar(select(func.count(EmailLog.id)).where(EmailLog.campaign_id == campaign.id, EmailLog.status.in_(["failed", "bounced"]))) or 0
            if failed_count == 0:
                raise HTTPException(status_code=409, detail="Campaign has no failed deliveries")
            await enforce_event_operation(db, organization_id, event_id, "communications.bulk_email.send", user_id=actor.id)
            await enforce_event_operation(db, organization_id, event_id, "communications.email.send", user_id=actor.id)
            reservation = await UsageReservationService.reserve(db, organization_id=organization_id, event_id=event_id, limit_key="max_emails_per_event", quantity=int(failed_count), unit="recipient", idempotency_key=f"console-email-resend:{idempotency_key}", ttl_seconds=86_400, metadata={"campaign_id": str(campaign.id), "action": action})
            await db.execute(update(EmailLog).where(EmailLog.campaign_id == campaign.id, EmailLog.status.in_(["failed", "bounced"])).values(status="queued", error_message=None))
            campaign.status = "sending"
            task_to_dispatch = lambda: process_email_campaign.delay(str(campaign.id), str(organization_id), str(reservation.id))
        elif action == "CANCEL":
            if campaign.status not in {"draft", "scheduled"}:
                raise HTTPException(status_code=409, detail="Only draft or scheduled campaigns can be cancelled")
            campaign.status = "failed"
        else:
            raise HTTPException(status_code=422, detail="Unsupported communication action")
        result = {"id": campaign.id, "status": campaign.status}
    elif workspace == "payments":
        await enforce_event_operation(
            db,
            organization_id,
            event_id,
            "registration.payments.manage",
            user_id=actor.id,
        )
        if action != "RECORD_REFUND" or not payload.approved_request_id:
            raise HTTPException(status_code=422, detail="A dual-approved refund request is required")
        payment = await db.scalar(select(PaymentTransaction).where(PaymentTransaction.id == resource_id, PaymentTransaction.event_id == event_id).with_for_update())
        if not payment:
            raise HTTPException(status_code=404, detail="Payment not found")
        approval = await db.scalar(select(OrganizationFinancialAdjustment).where(OrganizationFinancialAdjustment.id == payload.approved_request_id, OrganizationFinancialAdjustment.organization_id == organization_id).with_for_update())
        if not approval or approval.status != "APPROVED" or approval.applied_at is not None or approval.event_id != event_id:
            raise HTTPException(status_code=409, detail="The approved financial adjustment is invalid, mismatched, or already applied")
        if approval.requested_by == approval.approved_by or approval.adjustment_type != "CREDIT":
            raise HTTPException(status_code=409, detail="Refund approval lacks an independent credit decision")
        if round(float(approval.amount), 2) != round(float(payment.amount), 2) or approval.currency.upper() != payment.currency.upper():
            raise HTTPException(status_code=409, detail="Refund amount or currency does not match the approved adjustment")
        configured_payment_id = approval.details.get("payment_id")
        if configured_payment_id and configured_payment_id != str(payment.id):
            raise HTTPException(status_code=409, detail="Refund approval targets another payment")
        provider_refund_id = payload.data.get("provider_refund_id")
        if payment.payment_method != "simulated" and not provider_refund_id:
            raise HTTPException(status_code=422, detail="Provider refund reference is required; Command Center records completed provider refunds and does not fabricate them")
        if payment.status not in {"completed", "succeeded", "paid"}:
            raise HTTPException(status_code=409, detail="Payment is not refundable in its current state")
        payment.status = "refunded"
        payment.updated_at = datetime.now(timezone.utc)
        if payment.registration_id:
            registration = await db.get(ParticipantRegistration, payment.registration_id)
            if registration and registration.participant_id:
                participant = await db.get(Participant, registration.participant_id)
                if participant:
                    participant.paid_status = "Refunded"
        approval.applied_at = datetime.now(timezone.utc)
        approval.applied_resource_type = "registration_payment"
        approval.applied_resource_id = payment.id
        approval.details = {**(approval.details or {}), "provider_refund_id": provider_refund_id, "payment_id": str(payment.id)}
        result = {"id": payment.id, "status": payment.status, "provider_refund_id": provider_refund_id}
    elif workspace == "tickets":
        await enforce_event_operation(
            db,
            organization_id,
            event_id,
            "registration.ticket_types.manage",
            user_id=actor.id,
        )
        if action != "SET_PRICING" or resource_id != event_id:
            raise HTTPException(status_code=422, detail="Ticket pricing requires SET_PRICING against the selected event")
        pricing_data = payload.data.get("pricing_data")
        if not isinstance(pricing_data, dict):
            raise HTTPException(status_code=422, detail="pricing_data must be an object")
        matrix = await TicketPricingService.replace_matrix(db, event, pricing_data)
        tiers = payload.data.get("tiers")
        if tiers is not None:
            if not isinstance(tiers, list) or not all(isinstance(item, str) for item in tiers):
                raise HTTPException(status_code=422, detail="tiers must be an array of strings")
            await TicketPricingService.set_tiers(db, event, tiers)
        result = {"event_id": event.id, "pricing_data": matrix, "tiers": (event.registration_settings or {}).get("tiers", [])}
    elif workspace == "checkins":
        await enforce_event_operation(
            db,
            organization_id,
            event_id,
            "registration.checkin",
            user_id=actor.id,
        )
        if action == "CHECK_IN":
            session_id = payload.data.get("session_id")
            try:
                session_uuid = uuid.UUID(str(session_id))
            except (TypeError, ValueError) as exc:
                raise HTTPException(status_code=422, detail="A valid session_id is required") from exc
            checkin, created = await CheckInService.create(db, event, resource_id, session_uuid)
            result = {"id": checkin.id, "participant_id": checkin.participant_id, "session_id": checkin.session_id, "outcome": "CREATED" if created else "ALREADY_CHECKED_IN"}
        elif action == "REMOVE_CHECK_IN":
            checkin = await CheckInService.remove(db, event, resource_id)
            result = {"id": checkin.id, "outcome": "REMOVED"}
        else:
            raise HTTPException(status_code=422, detail="Unsupported check-in action")
    elif workspace == "jobs":
        if action != "RETRY_JOB":
            raise HTTPException(status_code=422, detail="Unsupported job action")
        source_type = str(payload.data.get("source") or "").strip().upper()
        retry = await EventJobControlService.request_retry(
            db,
            event=event,
            source_type=source_type,
            job_id=resource_id,
            actor=actor,
            idempotency_key=idempotency_key,
            reason=payload.reason,
        )
        control = retry["control"]
        result = {
            "id": control.id,
            "source": retry["source"],
            "source_job_id": retry["source_job_id"],
            "successor_job_id": retry["successor_job_id"],
            "status": retry["status"],
            "replayed": retry["replayed"],
        }
        if retry["replayed"]:
            return result
        # Commit the successor before publishing it to a worker or venue poller.
        await command.commit(organization_id=organization_id, event_id=event_id)
        dispatch = retry["dispatch"]
        if dispatch is not None:
            try:
                from app.tasks import run_excel_import

                run_excel_import.delay(
                    str(dispatch["job_id"]),
                    str(dispatch["organization_id"]),
                )
                control = await EventJobControlService.mark_dispatch_succeeded(
                    db, control.id
                )
            except Exception as exc:
                control = await EventJobControlService.mark_dispatch_failed(
                    db, control.id
                )
                db.add(
                    _audit(
                        request,
                        actor,
                        organization_id,
                        "EVENT_JOBS_RETRY_JOB_FAILED",
                        "background_job",
                        resource_id,
                        new_state={
                            "event_id": str(event_id),
                            "source": source_type,
                            "successor_job_id": retry["successor_job_id"],
                            "status": control.status,
                            "reason": payload.reason,
                            "case_reference": payload.case_reference,
                            "failure_code": control.failure_code,
                        },
                        sensitive=True,
                    )
                )
                await command.commit(organization_id=organization_id, event_id=event_id)
                raise HTTPException(
                    status_code=503,
                    detail={
                        "code": "QUEUE_UNAVAILABLE",
                        "control_request_id": str(control.id),
                        "successor_job_id": retry["successor_job_id"],
                    },
                ) from exc
        else:
            # Venue sync successors are consumed by the venue poller rather than
            # Celery; the control request itself has completed successfully once
            # the successor is durably committed.
            control = await EventJobControlService.mark_dispatch_succeeded(
                db, control.id
            )
        result["status"] = control.status
        db.add(
            _audit(
                request,
                actor,
                organization_id,
                "EVENT_JOBS_RETRY_JOB",
                "background_job",
                resource_id,
                new_state={
                    "event_id": str(event_id),
                    "source": source_type,
                    "successor_job_id": retry["successor_job_id"],
                    "status": control.status,
                    "reason": payload.reason,
                    "case_reference": payload.case_reference,
                },
                sensitive=True,
            )
        )
        await command.commit(organization_id=organization_id, event_id=event_id)
        return result
    elif workspace == "users":
        await enforce_event_operation(
            db,
            organization_id,
            event_id,
            "events.planning.manage",
            user_id=actor.id,
        )
        user = await db.scalar(select(User).where(User.id == resource_id, User.organization_id == organization_id, User.is_active.is_(True)))
        if not user:
            raise HTTPException(status_code=404, detail="Active organization user not found")
        assignment = await db.scalar(select(UserEventAssignment).where(UserEventAssignment.user_id == user.id, UserEventAssignment.event_id == event_id).with_for_update())
        if action == "ASSIGN_USER":
            permissions = payload.data.get("permissions", {})
            if not isinstance(permissions, dict):
                raise HTTPException(status_code=422, detail="permissions must be an object")
            if assignment is None:
                consume_now = await UsageReservationService.reserve(db, organization_id=organization_id, event_id=event_id, limit_key="max_event_team_members", quantity=1, unit="member", idempotency_key=f"console-event-user:{idempotency_key}", metadata={"user_id": str(user.id)})
                assignment = UserEventAssignment(user_id=user.id, event_id=event_id, permissions=permissions)
                db.add(assignment)
                await db.flush()
                outcome = "ASSIGNED"
            else:
                assignment.permissions = permissions
                outcome = "UPDATED"
            result = {"id": assignment.id, "user_id": user.id, "permissions": assignment.permissions, "outcome": outcome}
        elif action == "UNASSIGN_USER":
            if assignment is None:
                raise HTTPException(status_code=404, detail="Event assignment not found")
            assignment_id = assignment.id
            await db.delete(assignment)
            result = {"id": assignment_id, "user_id": user.id, "outcome": "UNASSIGNED"}
        else:
            raise HTTPException(status_code=422, detail="Unsupported event-user action")
    else:
        raise HTTPException(status_code=404, detail="Workspace action endpoint not available")
    if consume_now is not None:
        await UsageReservationService.consume(db, consume_now.id, source=f"organization_console.{workspace}.{action.lower()}", actor_user_id=actor.id)
    db.add(_audit(request, actor, organization_id, f"EVENT_{workspace.upper()}_{action}", workspace.rstrip("s"), resource_id, new_state={"event_id": str(event_id), "action": action, "reason": payload.reason, "case_reference": payload.case_reference, "result": result}, sensitive=workspace in {"attendees", "files", "payments", "users", "abstracts"}))
    await command.commit(organization_id=organization_id, event_id=event_id)
    if workspace == "checkins":
        enqueue_event_attendance_projection_refresh(
            organization_id=organization_id, event_id=event_id
        )
    if task_to_dispatch:
        task_to_dispatch()
    return result


# Keep this generic fallback last: FastAPI matches routes in declaration order,
# and an early /{domain} would shadow concrete list resources above.
@router.get("/{domain}", response_model=OrganizationDomainSnapshot)
async def get_domain(
    organization_id: uuid.UUID,
    domain: str,
    db: AsyncSession = Depends(get_db),
) -> OrganizationDomainSnapshot:
    return await OrganizationConsoleService(db).domain_snapshot(organization_id, domain)
