from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import delete, func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models.audit_log import AuditLog
from app.modules.events.models.event import Event
from app.modules.agenda.models import Session
from app.modules.events.models.speaker import Speaker
from app.modules.identity.models.refresh_token import RefreshToken
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.organization_console import (
    OrganizationBrandProfile,
    OrganizationLifecycleJob,
    OrganizationLocation,
    OrganizationSecurityPolicy,
)
from app.modules.presentations.models.presentation_file import PresentationFile
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.registration.models.payment_transaction import PaymentTransaction


class OrganizationLifecycleService:
    RETAINED_PURGE_TABLES = {
        ("platform", "organizations"),
        ("platform", "organization_lifecycle_jobs"),
        ("identity", "users"),
    }
    RETAINED_PURGE_SCHEMAS = {"audit", "billing"}

    @staticmethod
    async def _organization_tables(db: AsyncSession) -> list[tuple[str, str]]:
        rows = (await db.execute(text("""
            SELECT DISTINCT ns.nspname AS schema_name, rel.relname AS table_name
            FROM pg_constraint con
            JOIN pg_class rel ON rel.oid = con.conrelid
            JOIN pg_namespace ns ON ns.oid = rel.relnamespace
            JOIN pg_class parent ON parent.oid = con.confrelid
            JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
            JOIN pg_attribute attr ON attr.attrelid = rel.oid AND attr.attnum = ANY(con.conkey)
            WHERE con.contype='f' AND parent_ns.nspname='platform' AND parent.relname='organizations' AND attr.attname='organization_id'
            ORDER BY ns.nspname, rel.relname
        """))).mappings().all()
        return [(row["schema_name"], row["table_name"]) for row in rows]

    @staticmethod
    def _qualified(schema: str, table: str) -> str:
        return f'"{schema.replace(chr(34), chr(34) * 2)}"."{table.replace(chr(34), chr(34) * 2)}"'

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
        event_ids = select(Event.id).where(Event.organization_id == organization_id)
        counts = {
            "events": await db.scalar(select(func.count(Event.id)).where(Event.organization_id == organization_id)) or 0,
            "users": await db.scalar(select(func.count(User.id)).where(User.organization_id == organization_id)) or 0,
            "registrations": await db.scalar(select(func.count(ParticipantRegistration.id)).where(ParticipantRegistration.event_id.in_(event_ids))) or 0,
            "participants": await db.scalar(select(func.count(Participant.id)).where(Participant.event_id.in_(event_ids))) or 0,
            "speakers": await db.scalar(select(func.count(Speaker.id)).where(Speaker.event_id.in_(event_ids))) or 0,
            "sessions": await db.scalar(select(func.count(Session.id)).where(Session.event_id.in_(event_ids))) or 0,
            "files": await db.scalar(select(func.count(PresentationFile.id)).where(PresentationFile.event_id.in_(event_ids))) or 0,
            "registration_payments": await db.scalar(select(func.count(PaymentTransaction.id)).where(PaymentTransaction.event_id.in_(event_ids))) or 0,
            "audit_records_retained": await db.scalar(select(func.count(AuditLog.id)).where(AuditLog.organization_id == organization_id)) or 0,
        }
        table_counts: dict[str, int] = {}
        if job_type in {"MERGE", "PURGE", "DELETE"}:
            for schema, table in await OrganizationLifecycleService._organization_tables(db):
                if schema == "audit" or table == "organization_lifecycle_jobs":
                    continue
                count = await db.scalar(text(f"SELECT COUNT(*) FROM {OrganizationLifecycleService._qualified(schema, table)} WHERE organization_id=:organization_id"), {"organization_id": organization_id})
                table_counts[f"{schema}.{table}"] = int(count or 0)
        destructive = job_type in {"MERGE", "PURGE", "DELETE"}
        manifest = {
            "job_type": "PURGE" if job_type == "DELETE" else job_type,
            "organization_id": str(organization_id),
            "target_organization_id": str(target_organization_id) if target_organization_id else None,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "counts": {key: int(value) for key, value in counts.items()},
            "table_counts": table_counts,
            "legal_holds": [],
            "blocked": False,
            "requires_two_person_approval": destructive,
            "recoverable": job_type not in {"PURGE", "DELETE"},
            "restore_window_days": 30 if job_type == "ARCHIVE" else None,
            "configuration_only": job_type == "CLONE",
            "excluded_from_clone": ["events", "users", "billing_history", "audit_logs", "credentials", "api_secrets", "personal_data"] if job_type == "CLONE" else [],
            "retained_after_purge": ["non_sensitive_audit_proof", "financial_records_required_by_law"] if destructive else [],
        }
        checksum = OrganizationLifecycleService._manifest_checksum(manifest)
        return manifest, checksum

    @staticmethod
    async def execute(db: AsyncSession, job: OrganizationLifecycleJob) -> dict:
        organization = await db.scalar(select(Organization).where(Organization.id == job.organization_id).with_for_update())
        if not organization:
            raise HTTPException(status_code=404, detail="Organization not found")
        job_type = "PURGE" if job.job_type == "DELETE" else job.job_type
        if job_type in {"MERGE", "PURGE"}:
            manifest, checksum = await OrganizationLifecycleService.build_manifest(db, job.organization_id, job_type, job.target_organization_id)
            if checksum != job.manifest_checksum:
                raise HTTPException(status_code=409, detail="Lifecycle manifest changed; a new approval is required")
            if manifest["blocked"]:
                raise HTTPException(status_code=409, detail="An active legal hold blocks this lifecycle operation")
        if job_type == "ARCHIVE":
            organization.is_active = False
            organization.suspended_at = datetime.now(timezone.utc)
            organization.suspension_reason = job.reason
            user_ids = select(User.id).where(User.organization_id == job.organization_id)
            revoked = await db.execute(update(RefreshToken).where(RefreshToken.user_id.in_(user_ids), RefreshToken.is_revoked.is_(False)).values(is_revoked=True, revoked_at=datetime.now(timezone.utc), revoked_reason="organization_archive"))
            return {"organization_active": False, "sessions_revoked": int(revoked.rowcount or 0), "recoverable": True}
        if job_type == "RESTORE":
            organization.is_active = True
            organization.suspended_at = None
            organization.suspension_reason = None
            return {"organization_active": True, "recoverable": True}
        if job_type == "EXPORT":
            return {"manifest": job.dry_run_manifest, "format": "JSON", "contains_personal_data": False, "status": "MANIFEST_EXPORTED"}
        if job_type == "CLONE":
            if not job.target_organization_id:
                raise HTTPException(status_code=422, detail="Clone target is required")
            target = await db.get(Organization, job.target_organization_id)
            if not target:
                raise HTTPException(status_code=404, detail="Clone target not found")
            copied: dict[str, int] = {}
            for model, fields, key in (
                (OrganizationLocation, ("location_type", "name", "address", "latitude", "longitude", "timezone", "contact", "storage_node_ref", "venue_server_ref", "status"), "locations"),
                (OrganizationBrandProfile, ("status", "assets", "tokens", "templates"), "brand_profiles"),
                (OrganizationSecurityPolicy, ("require_mfa", "allowed_auth_methods", "password_policy", "session_policy", "trusted_device_policy", "sso_config", "sso_enforced", "allowed_cidrs"), "security_policies"),
            ):
                source_rows = (await db.scalars(select(model).where(model.organization_id == job.organization_id))).all()
                for source in source_rows:
                    values = {field: getattr(source, field) for field in fields if hasattr(source, field)}
                    db.add(model(organization_id=target.id, **values))
                copied[key] = len(source_rows)
            return {"target_organization_id": str(target.id), "configuration_only": True, "copied": copied, "excluded": job.dry_run_manifest.get("excluded_from_clone", [])}
        if job_type == "MERGE":
            if not job.target_organization_id:
                raise HTTPException(status_code=422, detail="Merge target is required")
            target = await db.scalar(select(Organization).where(Organization.id == job.target_organization_id).with_for_update())
            if not target or not target.is_active or target.is_platform_org:
                raise HTTPException(status_code=409, detail="Merge target must be an active non-platform organization")
            moved: dict[str, int] = {}
            excluded = {("platform", "organizations"), ("platform", "organization_lifecycle_jobs")}
            for schema, table in await OrganizationLifecycleService._organization_tables(db):
                if (schema, table) in excluded or schema == "audit": continue
                identity_guard = " AND is_platform_admin=false AND platform_role IS NULL AND role <> 'super_admin'" if (schema, table) == ("identity", "users") else ""
                result = await db.execute(text(f"UPDATE {OrganizationLifecycleService._qualified(schema, table)} SET organization_id=:target WHERE organization_id=:source{identity_guard}"), {"source": job.organization_id, "target": target.id})
                moved[f"{schema}.{table}"] = int(result.rowcount or 0)
            organization.is_active = False
            organization.suspended_at = datetime.now(timezone.utc)
            organization.suspension_reason = f"Merged into organization {target.id}: {job.reason}"
            organization.custom_domain = None
            organization.billing_email = None
            return {"source_organization_id": str(organization.id), "target_organization_id": str(target.id), "moved": moved, "source_tombstoned": True, "audit_history_retained_on_source": True}
        if job_type == "PURGE":
            now = datetime.now(timezone.utc)
            deleted: dict[str, int] = {}
            tables = [(schema, table) for schema, table in await OrganizationLifecycleService._organization_tables(db) if schema not in OrganizationLifecycleService.RETAINED_PURGE_SCHEMAS and (schema, table) not in OrganizationLifecycleService.RETAINED_PURGE_TABLES]
            # Referencing organization-scoped rows are attempted before roots. Constraint
            # failures are isolated to savepoints and retried after their children clear.
            pending = list(tables)
            while pending:
                progressed = False
                deferred: list[tuple[str, str]] = []
                for schema, table in pending:
                    try:
                        async with db.begin_nested():
                            result = await db.execute(text(f"DELETE FROM {OrganizationLifecycleService._qualified(schema, table)} WHERE organization_id=:organization_id"), {"organization_id": job.organization_id})
                        deleted[f"{schema}.{table}"] = int(result.rowcount or 0)
                        progressed = True
                    except Exception:
                        deferred.append((schema, table))
                if deferred and not progressed:
                    blocked = ", ".join(f"{schema}.{table}" for schema, table in deferred)
                    raise HTTPException(status_code=409, detail=f"Purge dependency graph could not be resolved safely: {blocked}")
                pending = deferred
            tenant_user_ids = select(User.id).where(User.organization_id == job.organization_id)
            revoked = await db.execute(update(RefreshToken).where(RefreshToken.user_id.in_(tenant_user_ids), RefreshToken.is_revoked.is_(False)).values(is_revoked=True, revoked_at=now, revoked_reason="organization_purge"))
            anonymized = await db.execute(update(User).where(User.organization_id == job.organization_id, User.is_platform_admin.is_(False), User.platform_role.is_(None), User.role != "super_admin").values(email=func.concat("purged+", User.id, "@invalid.local"), first_name="Purged", last_name="User", phone=None, password_hash=None, avatar_url=None, two_factor_secret=None, allowed_ips=None, notification_preferences={}, is_active=False, deleted_at=now))
            organization.name = f"Purged organization {organization.id}"
            organization.slug = f"purged-{organization.id}"
            organization.logo_url = None; organization.banner_thumbnail_url = None
            organization.custom_domain = None; organization.billing_email = None
            organization.portal_name = None; organization.onboarding_draft = {}
            organization.is_active = False
            organization.suspended_at = now; organization.suspension_reason = "Permanent purge completed"
            return {"organization_tombstoned": True, "deleted": deleted, "users_anonymized": int(anonymized.rowcount or 0), "sessions_revoked": int(revoked.rowcount or 0), "retained": job.dry_run_manifest.get("retained_after_purge", [])}
        raise HTTPException(status_code=501, detail=f"Lifecycle execution for {job_type} is not implemented safely")
