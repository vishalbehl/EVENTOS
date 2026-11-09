"""Bounded operator reconciliation of previously released registration attempts.

No tenant discovery or authority inference. Default execution is read-only.
Apply is safe only after incompatible unconditional writers have been drained.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash
from app.modules.events.models.event import Event
from app.modules.files.models.file import DurableUpload
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.organization_console import UsageReservation
from app.modules.presentations.services.upload_service import (
    _is_registration_attempt_key, seal_registration_upload_key,
)
from app.modules.registration.services.managed_registration_uploads import registration_upload_buckets
from app.tasks.tenant_job_scope import parse_required_organization_id, tenant_job_session


def _synthetic_local_rehearsal(row: DurableUpload, reservation: UsageReservation) -> bool:
    """Recognise the retained local recovery fixture without inferring provider state."""
    metadata = reservation.metadata_json
    return (
        isinstance(metadata, dict)
        and metadata.get("rehearsal") == "category-a-local-runtime-recovery"
        and reservation.idempotency_key == f"registration-upload:runtime-rehearsal-{row.id}"
        and row.original_filename == "runtime-rehearsal.txt"
        and row.object_key.endswith(f"/registration_upload/rehearsal/{row.id}.txt")
    )


async def _inspect(db, organization_id, upload_id, *, lock=False):
    # Match live finalisation ordering, even for the exceptional historical path.
    if lock:
        await db.scalar(select(Organization.id).where(
            Organization.id == organization_id).with_for_update())
    reservations_query = select(UsageReservation).where(
        UsageReservation.organization_id == organization_id,
        UsageReservation.metadata_json["upload_id"].as_string() == str(upload_id),
    ).order_by(UsageReservation.id).limit(2)
    if lock:
        reservations_query = reservations_query.with_for_update()
    reservations = list((await db.scalars(reservations_query)).all())
    upload_query = select(DurableUpload).where(
        DurableUpload.organization_id == organization_id, DurableUpload.id == upload_id)
    if lock:
        upload_query = upload_query.with_for_update()
    row = await db.scalar(upload_query.execution_options(populate_existing=True))
    if row is None or row.status != "failed":
        return None, None, "STATE_CHANGED"
    if not _is_registration_attempt_key(row.object_key):
        return row, None, ("INVALID_MANAGED_KEY" if any(part in row.object_key
            for part in ("/registration_upload/", "/registration_program/")) else "NOT_MANAGED")
    if len(reservations) != 1:
        return row, None, "AMBIGUOUS_RESERVATION"
    reservation = reservations[0]
    metadata = reservation.metadata_json
    if not isinstance(metadata, dict):
        return row, reservation, "RESERVATION_METADATA_CONFLICT"
    fence = metadata.get("cleanup_key_fence")
    if fence is not None and (not isinstance(fence, dict)
            or fence.get("protocol") != "write-once-v1"
            or fence.get("state") not in {"PENDING", "SEALED"}):
        return row, reservation, "FENCE_RECEIPT_CONFLICT"
    namespace = ("registration_upload" if reservation.idempotency_key.startswith("registration-upload:")
        else "registration_program" if reservation.idempotency_key.startswith("program-upload:") else None)
    if (namespace is None or row.event_id is None or reservation.event_id != row.event_id
            or reservation.status != "RELEASED" or reservation.consumed_entry_id is not None
            or row.storage_bucket not in registration_upload_buckets()
            or not row.object_key.startswith(
                f"tenant/{organization_id}/event/{row.event_id}/{namespace}/")):
        return row, reservation, "OWNERSHIP_OR_ACCOUNTING_CONFLICT"
    event_owner = await db.scalar(select(Event.organization_id).where(Event.id == row.event_id))
    if event_owner != organization_id:
        return row, reservation, "EVENT_OWNERSHIP_CONFLICT"
    audits = list((await db.scalars(select(AuditLog).where(
        AuditLog.organization_id == organization_id, AuditLog.resource_type == "upload",
        AuditLog.resource_id == upload_id,
        AuditLog.action_type == "ABANDONED_UPLOAD_QUOTA_RELEASED",
    ).order_by(AuditLog.id).limit(2))).all())
    if len(audits) != 1:
        return row, reservation, "RELEASE_AUDIT_MISSING_OR_AMBIGUOUS"
    audit = audits[0]
    state = audit.new_state
    if (not isinstance(state, dict) or audit.hash_version != 2
            or audit.row_hash != compute_audit_hash(audit)
            or state.get("reservation_id") != str(reservation.id)
            or state.get("event_id") != str(row.event_id)
            or state.get("reservation_status") != "RELEASED"):
        return row, reservation, "RELEASE_AUDIT_CONFLICT"
    if "storage_path" not in metadata:
        return row, reservation, "RECORDED_PATH_MISSING"
    if metadata["storage_path"] != row.object_key:
        return row, reservation, "OWNERSHIP_OR_ACCOUNTING_CONFLICT"
    return row, reservation, "ELIGIBLE"


async def review_missing_upload_paths(*, organization_id: uuid.UUID,
        only_upload_ids: tuple[uuid.UUID, ...]) -> dict:
    """Propose only; no repair, provider call, quota change or audit mutation.

    The digest is a review snapshot, not an authorisation token. Any future
    correction command must independently re-authorise and revalidate it.
    """
    organization_id = parse_required_organization_id(organization_id)
    if (not isinstance(only_upload_ids, tuple) or not 1 <= len(only_upload_ids) <= 100
            or any(not isinstance(value, uuid.UUID) for value in only_upload_ids)
            or len(set(only_upload_ids)) != len(only_upload_ids)):
        raise ValueError("Review requires 1–100 distinct exact upload UUIDs.")
    records = []
    for upload_id in sorted(only_upload_ids):
        async with tenant_job_session(organization_id) as db:
            # Same lock ordering as finalisation, to capture a coherent proposal.
            row, reservation, status = await _inspect(db, organization_id, upload_id, lock=True)
            if status != "RECORDED_PATH_MISSING":
                records.append({"upload_id": str(upload_id), "status":
                    "NOT_IN_SCOPE_OR_NOT_FAILED" if status == "STATE_CHANGED" else status})
                continue
            if _synthetic_local_rehearsal(row, reservation):
                # This fixture was created against an empty TemporaryDirectory
                # with STORAGE_MODE=local. It never identified a persistent
                # provider object, so a MinIO/path correction would fabricate
                # provenance. Retain the row as immutable rehearsal evidence.
                records.append({"upload_id": str(upload_id),
                    "status": "SYNTHETIC_REHEARSAL_NO_PROVIDER_REPAIR",
                    "provenance": "LOCAL_TEMPORARY_STORAGE",
                    "provider_repair": "NOT_APPLICABLE"})
                continue
            audits = list((await db.scalars(select(AuditLog).where(
                AuditLog.organization_id == organization_id, AuditLog.resource_type == "upload",
                AuditLog.resource_id == upload_id,
                AuditLog.action_type == "ABANDONED_UPLOAD_QUOTA_RELEASED",
            ).order_by(AuditLog.id).limit(2))).all())
            # Include every persisted upload/reservation field, not only the path.
            state = {"upload": {c.key: getattr(row, c.key) for c in row.__table__.columns},
                "reservation": {c.key: getattr(reservation, c.key)
                    for c in reservation.__table__.columns},
                "release_audits": [(str(a.id), a.row_hash) for a in audits]}
            fingerprint = hashlib.sha256(json.dumps(state, sort_keys=True,
                separators=(",", ":"), default=str).encode()).hexdigest()
            records.append({"upload_id": str(upload_id), "reservation_id": str(reservation.id),
                "event_id": str(row.event_id), "status": "REVIEW_REQUIRED",
                "proposed_field": "metadata_json.storage_path",
                "proposed_source": "DurableUpload.object_key",
                "object_key_sha256": hashlib.sha256(row.object_key.encode()).hexdigest(),
                "current_state_sha256": fingerprint,
                "release_audit_id": str(audits[0].id)})
    return {"organization_id": str(organization_id), "mode": "REVIEW_ONLY",
        "apply": False, "metadata_changed": False, "provider_io_performed": False,
        "records": records, "next_cursor": None, "retry_page": False}


async def reconcile_failed_upload_fences(*, organization_id: uuid.UUID,
        after: uuid.UUID | None = None, limit: int = 50, apply: bool = False,
        approval_reference: str | None = None, incompatible_writers_drained: bool = False,
        only_upload_ids: tuple[uuid.UUID, ...] | None = None) -> dict:
    """One keyset page, including explicit blocked rows; never silently skip them.

    Retry a failed provider page using its *input* cursor. Successful receipts
    are replay-safe; dry runs never write audit/metadata or contact storage.
    No object path, filename, capability or credential appears in the report.
    """
    organization_id = parse_required_organization_id(organization_id)
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 100:
        raise ValueError("Page size must be between 1 and 100.")
    if after is not None and not isinstance(after, uuid.UUID):
        raise ValueError("Cursor must be a UUID.")
    if only_upload_ids is not None and (not isinstance(only_upload_ids, tuple)
            or after is not None or not 1 <= len(only_upload_ids) <= limit
            or any(not isinstance(value, uuid.UUID) for value in only_upload_ids)
            or len(set(only_upload_ids)) != len(only_upload_ids)):
        raise ValueError("Reviewed selection requires distinct UUIDs within the page limit and no cursor.")
    if apply and (not incompatible_writers_drained or not isinstance(approval_reference, str)
            or not approval_reference.strip() or len(approval_reference) > 160):
        raise ValueError("Apply requires an approval reference and drained incompatible writers.")
    async with tenant_job_session(organization_id) as db:
        query = select(DurableUpload.id).where(DurableUpload.organization_id == organization_id,
            DurableUpload.status == "failed").order_by(DurableUpload.id).limit(limit + 1)
        if after is not None:
            query = query.where(DurableUpload.id > after)
        if only_upload_ids is not None:
            query = query.where(DurableUpload.id.in_(only_upload_ids))
        ids = list((await db.scalars(query)).all())
    found_ids = set(ids)
    reports = ([{"upload_id": str(upload_id), "status": "NOT_IN_SCOPE_OR_NOT_FAILED"}
        for upload_id in only_upload_ids if upload_id not in found_ids]
        if only_upload_ids is not None else [])
    for upload_id in ids[:limit]:
        async with tenant_job_session(organization_id) as db:
            row, reservation, status = await _inspect(db, organization_id, upload_id, lock=apply)
            if status != "ELIGIBLE":
                reports.append({"upload_id": str(upload_id), "status": status})
                continue
            metadata = dict(reservation.metadata_json or {})
            fence = metadata.get("cleanup_key_fence")
            recorded_sealed = (isinstance(fence, dict) and fence.get("state") == "SEALED"
                and fence.get("protocol") == "write-once-v1")
            if recorded_sealed and not apply:
                reports.append({"upload_id": str(upload_id), "status": "RECORDED_SEALED"})
                continue
            if not apply:
                reports.append({"upload_id": str(upload_id), "status": "ELIGIBLE"})
                continue
            intent = {"state": "PENDING", "protocol": "write-once-v1",
                "approval_reference": approval_reference.strip()}
            if not recorded_sealed and fence != intent:
                reservation.metadata_json = {**metadata, "cleanup_key_fence": intent}
                db.add(AuditLog(organization_id=organization_id, resource_type="upload",
                    resource_id=upload_id, actor_role="SYSTEM", is_sensitive=True,
                    action_type="HISTORICAL_UPLOAD_FENCE_REQUESTED", new_state=intent))
            bucket, key = row.storage_bucket, row.object_key
            await db.commit()
        # Terminal failed + RELEASED cannot be legitimately finalised/reused.
        # The committed intent survives a crash or provider failure here.
        try:
            await asyncio.to_thread(seal_registration_upload_key, bucket, key,
                verified_organization_id=organization_id)
        except Exception:
            reports.append({"upload_id": str(upload_id), "status": "PROVIDER_UNAVAILABLE"})
            continue
        async with tenant_job_session(organization_id) as db:
            row, reservation, status = await _inspect(db, organization_id, upload_id, lock=True)
            if status != "ELIGIBLE" or row.storage_bucket != bucket or row.object_key != key:
                reports.append({"upload_id": str(upload_id), "status": "POST_IO_STATE_CONFLICT"})
                continue
            metadata = dict(reservation.metadata_json or {})
            if (metadata.get("cleanup_key_fence") or {}).get("state") != "SEALED":
                completed = {**intent, "state": "SEALED", "sealed_at": datetime.now(timezone.utc).isoformat()}
                reservation.metadata_json = {**metadata, "cleanup_key_fence": completed}
                db.add(AuditLog(organization_id=organization_id, resource_type="upload",
                    resource_id=upload_id, actor_role="SYSTEM", is_sensitive=True,
                    action_type="HISTORICAL_UPLOAD_KEY_FENCED", new_state=completed))
                await db.commit()
            reports.append({"upload_id": str(upload_id),
                "status": "ALREADY_SEALED" if recorded_sealed else "SEALED"})
    retry_page = any(row["status"] in {"PROVIDER_UNAVAILABLE", "POST_IO_STATE_CONFLICT"}
        for row in reports)
    return {"organization_id": str(organization_id), "apply": apply, "records": reports,
        "input_cursor": str(after) if after is not None else None,
        "next_cursor": str(ids[limit - 1]) if len(ids) > limit and not retry_page else None,
        "retry_page": retry_page}
