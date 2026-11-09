from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models.audit_log import AuditLog
from app.modules.events.models.event import Event
from app.modules.agenda.models import Session
from app.modules.events.models.speaker import Speaker
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.organization_console import (
    OrganizationBrandProfile,
    OrganizationLifecycleJob,
)
from app.modules.presentations.models.presentation_file import PresentationFile
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.registration.models.payment_transaction import PaymentTransaction
from app.core.tenant_context import TenantContextGuard
from app.modules.platform.services.lifecycle_authority import lock_lifecycle_authority
from app.modules.platform.services.clone_projection import CLONE_EXCLUSIONS, CLONE_PROJECTION_VERSION, portable_brand_tokens


class OrganizationLifecycleService:
    # Tenant reassignment/erasure needs a separate verified retention and ownership
    # workflow. Approval alone cannot make the old generic FK walker safe.
    UNAVAILABLE_DESTRUCTIVE_OPERATIONS = frozenset({"MERGE", "PURGE", "DELETE"})

    @staticmethod
    def require_available_operation(job_type: str) -> None:
        if job_type in OrganizationLifecycleService.UNAVAILABLE_DESTRUCTIVE_OPERATIONS:
            raise HTTPException(409, detail={
                "code": "DESTRUCTIVE_LIFECYCLE_UNAVAILABLE",
                "message": "Organization merge and purge are unavailable until ownership, retention and legal-hold workflows are implemented and verified. Existing data and history are preserved.",
            })

    @staticmethod
    def _manifest_checksum(manifest: dict) -> str:
        # Audit rows are retained and excluded from destructive operations. Their
        # count is therefore evidence metadata, not part of the purge approval
        # fingerprint, and may change while an approval is being executed.
        stable = {key: value for key, value in manifest.items() if key != "generated_at"}
        counts = dict(stable.get("counts", {}))
        counts.pop("audit_records_retained", None)
        stable["counts"] = counts
        return hashlib.sha256(json.dumps(stable, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

    @staticmethod
    async def build_manifest(db: AsyncSession, organization_id: uuid.UUID, job_type: str, target_organization_id: uuid.UUID | None) -> tuple[dict, str]:
        OrganizationLifecycleService.require_available_operation(job_type)
        event_ids = select(Event.id).where(Event.organization_id == organization_id)
        scalar = lambda statement: statement.scalar_subquery()
        fixed_counts = (
            await db.execute(
                select(
                    scalar(select(Organization.profile_version).where(Organization.id == organization_id)).label("organization_version"),
                    scalar(select(Organization.is_active).where(Organization.id == organization_id)).label("organization_active"),
                    scalar(select(Organization.archived_at).where(Organization.id == organization_id)).label("archived_at"),
                    scalar(select(Organization.suspended_at).where(Organization.id == organization_id)).label("suspended_at"),
                    scalar(select(func.count(Event.id)).where(Event.organization_id == organization_id)).label("events"),
                    scalar(select(func.count(User.id)).where(User.organization_id == organization_id)).label("users"),
                    scalar(select(func.count(ParticipantRegistration.id)).where(ParticipantRegistration.event_id.in_(event_ids))).label("registrations"),
                    scalar(select(func.count(Participant.id)).where(Participant.event_id.in_(event_ids))).label("participants"),
                    scalar(select(func.count(Speaker.id)).where(Speaker.event_id.in_(event_ids))).label("speakers"),
                    scalar(select(func.count(Session.id)).where(Session.event_id.in_(event_ids))).label("sessions"),
                    scalar(select(func.count(PresentationFile.id)).where(PresentationFile.event_id.in_(event_ids))).label("files"),
                    scalar(select(func.count(PaymentTransaction.id)).where(PaymentTransaction.event_id.in_(event_ids))).label("registration_payments"),
                    scalar(select(func.count(AuditLog.id)).where(AuditLog.organization_id == organization_id)).label("audit_records_retained"),
                )
            )
        ).mappings().one()
        if fixed_counts["organization_version"] is None:
            raise HTTPException(404, detail={"code": "RESOURCE_NOT_FOUND"})
        counts = {key: int(fixed_counts[key] or 0) for key in (
            "events", "users", "registrations", "participants", "speakers",
            "sessions", "files", "registration_payments", "audit_records_retained",
        )}
        target_version = None
        if job_type == "CLONE":
            if not target_organization_id or target_organization_id == organization_id:
                raise HTTPException(422, detail={"code": "INVALID_CLONE_SCOPE"})
            async with TenantContextGuard.scoped(db, target_organization_id):
                target = await db.scalar(select(Organization).where(Organization.id == target_organization_id))
                if not target or target.is_platform_org or target.lifecycle_state != "ACTIVE":
                    raise HTTPException(404, detail={"code": "RESOURCE_NOT_FOUND"})
                target_version = target.profile_version
        manifest = {
            "job_type": "PURGE" if job_type == "DELETE" else job_type,
            "organization_id": str(organization_id),
            "organization_version": int(fixed_counts["organization_version"]),
            "organization_state": "ARCHIVED" if fixed_counts["archived_at"] is not None else "ACTIVE" if fixed_counts["organization_active"] and fixed_counts["suspended_at"] is None else "SUSPENDED",
            "target_organization_id": str(target_organization_id) if target_organization_id else None,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "counts": {key: int(value) for key, value in counts.items()},
            "table_counts": {},
            "legal_holds": None,
            "legal_hold_check": "NOT_PERFORMED",
            "blocked": False,
            "requires_two_person_approval": False,
            "recoverable": job_type not in {"PURGE", "DELETE"},
            "restore_window_days": None,
            "configuration_only": job_type == "CLONE",
            "clone_projection_version": CLONE_PROJECTION_VERSION if job_type == "CLONE" else None,
            "target_organization_version": target_version,
            "excluded_from_clone": list(CLONE_EXCLUSIONS) if job_type == "CLONE" else [],
        }
        checksum = OrganizationLifecycleService._manifest_checksum(manifest)
        return manifest, checksum

    @staticmethod
    async def execute(db: AsyncSession, job: OrganizationLifecycleJob) -> dict:
        # Check again for already queued/retried legacy jobs, before any resource
        # mutation; creation and approval checks are not execution authority.
        OrganizationLifecycleService.require_available_operation(job.job_type)
        _, revisions = await lock_lifecycle_authority(db, job.organization_id, job.requested_by, job.target_organization_id)
        organization = await db.scalar(select(Organization).where(Organization.id == job.organization_id)
            .with_for_update().execution_options(populate_existing=True))
        if not organization:
            raise HTTPException(status_code=404, detail="Organization not found")
        if organization.is_platform_org:
            raise HTTPException(403, detail={"code": "PLATFORM_TENANT_LIFECYCLE_FORBIDDEN"})
        expected = job.dry_run_manifest.get("organization_version")
        if type(expected) is not int or expected < 1:
            raise HTTPException(409, detail={"code": "LEGACY_LIFECYCLE_REAPPROVAL_REQUIRED"})
        if organization.profile_version != expected:
            raise HTTPException(412, detail={"code": "STALE_VERSION"})
        job_type = "PURGE" if job.job_type == "DELETE" else job.job_type
        if job_type == "ARCHIVE":
            if organization.lifecycle_state != "ACTIVE":
                raise HTTPException(409, detail={"code": "ORGANIZATION_NOT_ACTIVE"})
            organization.is_active = False
            organization.archived_at = datetime.now(timezone.utc)
            organization.profile_version += 1
            revisions[organization.id].revision += 1
            # Revoke tenant access, not the global identity's sessions in other
            # organisations. All protected requests must revalidate tenant state.
            return {"organization_active": False, "lifecycle_state": "ARCHIVED",
                    "organization_version": organization.profile_version,
                    "policy_revision": revisions[organization.id].revision,
                    "recoverable": True, "events_preserved": True}
        if job_type == "RESTORE":
            if organization.archived_at is None or organization.suspended_at is not None:
                raise HTTPException(409, detail={"code": "ARCHIVED_ORGANIZATION_REQUIRED"})
            organization.is_active = True
            organization.archived_at = None
            organization.profile_version += 1
            revisions[organization.id].revision += 1
            return {"organization_active": True, "lifecycle_state": "ACTIVE",
                    "organization_version": organization.profile_version,
                    "policy_revision": revisions[organization.id].revision, "recoverable": True}
        if job_type == "EXPORT":
            return {"manifest": job.dry_run_manifest, "format": "JSON", "contains_personal_data": False, "status": "MANIFEST_EXPORTED"}
        if job_type == "CLONE":
            if not job.target_organization_id:
                raise HTTPException(status_code=422, detail="Clone target is required")
            if organization.lifecycle_state != "ACTIVE" or job.target_organization_id == organization.id:
                raise HTTPException(409, detail={"code": "INVALID_CLONE_SCOPE"})
            copied: dict[str, int] = {}
            if job.dry_run_manifest.get("clone_projection_version") != CLONE_PROJECTION_VERSION:
                raise HTTPException(409, detail={"code": "LEGACY_LIFECYCLE_REAPPROVAL_REQUIRED"})
            async with TenantContextGuard.scoped(db, job.target_organization_id):
                target = await db.scalar(select(Organization).where(Organization.id == job.target_organization_id)
                    .with_for_update().execution_options(populate_existing=True))
                if not target or target.is_platform_org or target.lifecycle_state != "ACTIVE":
                    raise HTTPException(404, detail={"code": "RESOURCE_NOT_FOUND"})
                if target.profile_version != job.dry_run_manifest.get("target_organization_version"):
                    raise HTTPException(412, detail={"code": "STALE_CLONE_TARGET"})
                if await db.scalar(select(OrganizationBrandProfile.id).where(OrganizationBrandProfile.organization_id == target.id)):
                    raise HTTPException(409, detail={"code": "CLONE_TARGET_CONFIGURATION_EXISTS"})
            # Select only the portable column. Assets, templates, contacts,
            # credentials and commercial fields are structurally unavailable
            # to this clone path rather than filtered after loading an ORM row.
            source = (await db.execute(select(
                OrganizationBrandProfile.id, OrganizationBrandProfile.tokens).where(
                    OrganizationBrandProfile.organization_id == organization.id))).one_or_none()
            tokens = portable_brand_tokens(source.tokens) if source else {}
            async with TenantContextGuard.scoped(db, target.id):
                if source is not None:
                    db.add(OrganizationBrandProfile(organization_id=target.id, status="DRAFT", assets={}, templates={}, tokens=tokens))
                await db.flush()
            copied["brand_profiles"] = int(source is not None)
            copied["colour_tokens"] = len(tokens)
            async with TenantContextGuard.scoped(db, target.id):
                target.profile_version += 1
                revisions[target.id].revision += 1
                await db.flush()
            return {"target_organization_id": str(target.id), "configuration_only": True,
                "contains_financial_data": False, "contains_credentials": False,
                "contains_personal_data": False, "copied": copied,
                "excluded": job.dry_run_manifest.get("excluded_from_clone", [])}
        raise HTTPException(status_code=501, detail=f"Lifecycle execution for {job_type} is not implemented safely")
