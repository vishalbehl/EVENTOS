"""Durable upload orchestration entry points for Celery workers."""
from __future__ import annotations

import asyncio
import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from itertools import islice

from app.database import AsyncSessionLocal
from app.worker import celery_app
from app.core.upload_service import UploadService
from app.core.task_policy import is_retryable, policy_for
from app.core.antivirus import scan_chunks
from app.core.upload_validation import validate_file_signature
from app.modules.files.models.file import Asset, DurableUpload, VirusScan
from app.modules.audit.models.audit_log import AuditLog
from app.modules.files.infrastructure.repositories import DurableUploadRepository
from app.modules.registration.models.import_job import ImportJob
from app.modules.events.models.event import Event
from app.modules.platform.models.organization import Organization
from app.modules.registration.models.registration_form_config import RegistrationFormConfig
from sqlalchemy import or_, select
from app.config import settings
from app.modules.presentations.services.upload_service import (
    delete_object, get_object_metadata, iter_object_chunks, seal_registration_upload_key,
)
from app.core.async_runner import run_async

# Compatibility seam for existing task tests and internal callers. The old
# implementation owned a second event loop; the alias now uses the shared
# worker-loop runner instead.
_run = run_async

_FILES_POLICY = policy_for("files")
_IMPORTS_POLICY = policy_for("imports")


@celery_app.task(
    bind=True,
    name="app.tasks.scan_asset_for_viruses",
    max_retries=_FILES_POLICY.max_retries,
    soft_time_limit=_FILES_POLICY.soft_timeout_seconds,
    time_limit=_FILES_POLICY.hard_timeout_seconds,
    autoretry_for=(),
    acks_late=True,
    queue=_FILES_POLICY.queue,
)
def scan_asset_for_viruses(self, asset_id_str: str, organization_id_str: str) -> dict:
    """Scan legacy ``Asset`` records through the shared files worker queue.

    The general asset API predates ``DurableUpload``. Keeping this adapter on
    the same worker and tenant boundary prevents old routes from silently
    bypassing antivirus processing while their public contract is migrated.
    """
    asset_id = uuid.UUID(asset_id_str)
    organization_id = uuid.UUID(organization_id_str)
    try:
        return _run(_scan_asset(asset_id, organization_id, str(self.request.id)))
    except Exception as exc:
        if not is_retryable(exc):
            raise
        attempt = int(getattr(self.request, "retries", 0) or 0)
        if attempt >= _FILES_POLICY.max_retries:
            _run(_mark_asset_scan_failed(asset_id, organization_id, str(self.request.id), exc))
            raise
        raise self.retry(
            exc=exc,
            countdown=min(
                300,
                _FILES_POLICY.retry_delay(attempt, apply_jitter=True),
            ),
            max_retries=_FILES_POLICY.max_retries,
        )


async def _scan_asset(
    asset_id: uuid.UUID,
    organization_id: uuid.UUID,
    task_id: str,
) -> dict:
    """Verify, scan, and publish one legacy asset exactly once logically."""
    # Claim in a short transaction. Storage reads and antivirus work must not
    # hold an asset row lock or an application database connection.
    async with AsyncSessionLocal() as db:
        asset = await db.scalar(
            select(Asset)
            .where(
                Asset.id == asset_id,
                Asset.organization_id == organization_id,
            )
            .with_for_update()
        )
        if asset is None:
            return {"asset_id": str(asset_id), "status": "missing"}
        if asset.processing_status == "READY":
            return {"asset_id": str(asset_id), "status": "ready", "idempotent": True}

        scan = await db.scalar(
            select(VirusScan)
            .where(VirusScan.asset_id == asset_id, VirusScan.status.in_(("pending", "scanning")))
            .order_by(VirusScan.scanned_at.desc(), VirusScan.id.desc())
            .limit(1)
            .with_for_update()
        )
        if scan is not None and scan.status == "scanning":
            marker = str(scan.scan_result or "")
            if marker != f"lease:{task_id}":
                return {"asset_id": str(asset_id), "status": "scanning", "idempotent": True}
        if scan is None:
            scan = VirusScan(
                id=uuid.uuid4(),
                asset_id=asset_id,
                status="pending",
            )
            db.add(scan)
            await db.flush()
        scan.status = "scanning"
        scan.scan_result = f"lease:{task_id}"
        scan.scanned_at = datetime.now(timezone.utc)
        snapshot = (scan.id, asset.file_path, int(asset.file_size_bytes))
        await db.commit()

    try:
        metadata = get_object_metadata(
                bucket=settings.S3_BUCKET_ASSETS,
                storage_path=snapshot[1],
                verified_organization_id=organization_id,
            )
        if int(metadata["size"]) != snapshot[2]:
            outcome, detail = "error", "Uploaded object size does not match the declared size."
        else:
            result = scan_chunks(iter_object_chunks(
                settings.S3_BUCKET_ASSETS, snapshot[1], verified_organization_id=organization_id,
            ))
            if result.status == "unavailable" and settings.ANTIVIRUS_REQUIRED:
                raise RuntimeError("Antivirus scanning is temporarily unavailable.")
            outcome = result.status if result.status in {"clean", "infected"} else "error"
            detail = result.signature or result.status
    except FileNotFoundError:
        outcome, detail = "error", "Uploaded object was not found."
    except Exception:
        # Leave the lease visible for the retry with the same Celery task id.
        raise

    async with AsyncSessionLocal() as db:
        asset = await db.scalar(select(Asset).where(
            Asset.id == asset_id, Asset.organization_id == organization_id,
        ).with_for_update())
        scan = await db.scalar(select(VirusScan).where(
            VirusScan.id == snapshot[0], VirusScan.asset_id == asset_id,
        ).with_for_update())
        if asset is None or scan is None:
            return {"asset_id": str(asset_id), "status": "missing"}
        if scan.status != "scanning" or scan.scan_result != f"lease:{task_id}":
            return {"asset_id": str(asset_id), "status": "superseded", "idempotent": True}
        scan.status = outcome
        scan.scan_result = detail
        scan.scanned_at = datetime.now(timezone.utc)
        asset.processing_status = "READY" if outcome == "clean" else "QUARANTINED"
        await db.commit()
        return {
            "asset_id": str(asset_id), "status": asset.processing_status.lower(),
            "scan_status": scan.status, "idempotent": False,
        }


async def _mark_asset_scan_failed(
    asset_id: uuid.UUID,
    organization_id: uuid.UUID,
    task_id: str,
    error: Exception,
) -> None:
    """Persist the terminal scanner failure without making the asset ready."""
    async with AsyncSessionLocal() as db:
        asset = await db.scalar(
            select(Asset)
            .where(
                Asset.id == asset_id,
                Asset.organization_id == organization_id,
            )
            .with_for_update()
        )
        if asset is None or asset.processing_status == "READY":
            return
        scan = await db.scalar(
            select(VirusScan)
            .where(VirusScan.asset_id == asset_id, VirusScan.status.in_(("pending", "scanning")))
            .order_by(VirusScan.scanned_at.desc(), VirusScan.id.desc())
            .limit(1)
            .with_for_update()
        )
        if scan is None:
            scan = VirusScan(id=uuid.uuid4(), asset_id=asset_id)
            db.add(scan)
        scan.status = "error"
        scan.scan_result = f"Scanner failed after retries: {type(error).__name__}"
        scan.scanned_at = datetime.now(timezone.utc)
        asset.processing_status = "QUARANTINED"
        await db.commit()


@celery_app.task(
    bind=True,
    name="app.tasks.process_durable_upload",
    max_retries=_FILES_POLICY.max_retries,
    soft_time_limit=_FILES_POLICY.soft_timeout_seconds,
    time_limit=_FILES_POLICY.hard_timeout_seconds,
    autoretry_for=(),
    acks_late=True,
    queue=_FILES_POLICY.queue,
)
def process_durable_upload(self, upload_id_str: str, organization_id_str: str) -> dict:
    """Advance one upload through the durable processing lifecycle.

    The organization is required in the task payload so a retry cannot run
    without a tenant boundary. Existing terminal states are idempotent.
    """
    upload_id = uuid.UUID(upload_id_str)
    organization_id = uuid.UUID(organization_id_str)
    try:
        return _run(_process(upload_id, organization_id, str(self.request.id)))
    except Exception as exc:
        # Storage/database outages are transient; retry with bounded backoff.
        # Validation mismatches are handled inside _process and never reach here.
        if not is_retryable(exc):
            raise
        attempt = int(getattr(self.request, "retries", 0))
        policy = policy_for("files")
        if attempt >= policy.max_retries:
            # Celery will stop retrying after this attempt. Persist the final
            # state so clients never observe an upload stuck indefinitely in a
            # transient processing state.
            _run(_mark_upload_failed(upload_id, organization_id, str(self.request.id), exc))
            raise
        countdown = min(300, policy.retry_delay(attempt, apply_jitter=True))
        raise self.retry(exc=exc, countdown=countdown, max_retries=policy.max_retries)


async def _process(upload_id: uuid.UUID, organization_id: uuid.UUID, task_id: str) -> dict:
    from app.tasks.tenant_job_scope import tenant_job_session
    # Claim and snapshot in a short transaction. Object storage, hashing and
    # antivirus scanning run after the row lock and DB connection are released.
    async with tenant_job_session(organization_id) as db:
        row = await DurableUploadRepository(db).get_by_id(
            upload_id=upload_id,
            organization_id=organization_id,
            for_update=True,
        )
        if row is None:
            return {"upload_id": str(upload_id), "status": "missing"}
        if row.status in {"ready", "failed", "quarantined", "deleted"}:
            return {"upload_id": str(upload_id), "status": row.status, "idempotent": True}
        if row.status == "cleanup_pending":
            return {"upload_id": str(upload_id), "status": row.status, "in_progress": True}
        if row.task_id and row.task_id != task_id and row.updated_at > datetime.now(timezone.utc) - timedelta(minutes=15):
            return {"upload_id": str(upload_id), "status": row.status, "in_progress": True}
        row.task_id = task_id[:255]
        if row.status == "uploaded":
            await UploadService.apply_transition(db, row, "verifying", task_id=task_id)
        snapshot = (row.storage_bucket or settings.S3_BUCKET_ASSETS, row.object_key,
            int(row.size_bytes), row.checksum, row.mime_type)
        await db.commit()

    try:
        metadata = get_object_metadata(bucket=snapshot[0], storage_path=snapshot[1],
            verified_organization_id=organization_id)
        error = None
        if int(metadata["size"]) != snapshot[2]:
            error = "Uploaded object size does not match the declared size."
        if error is None and snapshot[3]:
            digest = hashlib.sha256()
            for chunk in iter_object_chunks(snapshot[0], snapshot[1], verified_organization_id=organization_id):
                digest.update(chunk)
            if digest.hexdigest().lower() != snapshot[3].lower():
                error = "Uploaded object checksum does not match the declared checksum."
        if error is None:
            signature_prefix = b"".join(islice(iter_object_chunks(
                snapshot[0], snapshot[1], verified_organization_id=organization_id), 1))[:1024 * 1024]
            try:
                validate_file_signature(signature_prefix, snapshot[4])
            except Exception as exc:
                error = str(getattr(exc, "detail", "File signature does not match declared MIME type."))
        if error is None:
            scan = scan_chunks(iter_object_chunks(snapshot[0], snapshot[1], verified_organization_id=organization_id))
            if scan.status == "infected":
                error = f"Antivirus detected {scan.signature or 'malware'}."
            elif scan.status == "unavailable" and settings.ANTIVIRUS_REQUIRED:
                raise RuntimeError("Antivirus scanning is temporarily unavailable.")
    except Exception:
        raise

    async with tenant_job_session(organization_id) as db:
        row = await DurableUploadRepository(db).get_by_id(upload_id=upload_id,
            organization_id=organization_id, for_update=True)
        if row is None:
            return {"upload_id": str(upload_id), "status": "missing"}
        if row.status in {"ready", "failed", "quarantined", "deleted"}:
            return {"upload_id": str(upload_id), "status": row.status, "idempotent": True}
        if row.task_id != task_id:
            return {"upload_id": str(upload_id), "status": "superseded", "idempotent": True}
        if error is not None:
            await UploadService.apply_transition(db, row, "quarantined", error=error, task_id=task_id)
        else:
            if row.status == "verifying":
                await UploadService.apply_transition(db, row, "scanning", task_id=task_id)
            if row.status == "scanning":
                await UploadService.apply_transition(db, row, "processing", task_id=task_id)
            if row.status == "processing":
                await UploadService.apply_transition(db, row, "ready", task_id=task_id)
        await db.commit()
        return {"upload_id": str(upload_id), "status": row.status}


@celery_app.task(name="app.tasks.recover_abandoned_uploads", queue="reconciliation",
    soft_time_limit=120, time_limit=180, acks_late=True, ignore_result=True)
def recover_abandoned_uploads(after: str | None = None) -> None:
    """Discover a bounded page; customer storage is handled only by scoped jobs."""
    _run(_recover_abandoned_uploads(after))


async def _recover_abandoned_uploads(after: str | None = None) -> None:
    cursor = uuid.UUID(after) if after else None
    async with AsyncSessionLocal() as db:
        # Allowlisted control-plane projection, never an unscoped upload query.
        organizations = Organization.__table__.c
        query = select(organizations.id)
        if cursor is not None:
            query = query.where(organizations.id > cursor)
        rows = list((await db.scalars(query.order_by(organizations.id).limit(101))).all())
    # Do not exclude suspended/archived tenants: retained objects and quota
    # holds still require recovery, with lifecycle rechecked by the scoped job.
    for organization_id in rows[:100]:
        await asyncio.to_thread(recover_abandoned_uploads_for_tenant.apply_async,
            args=(str(organization_id),),
            headers={"tenant_org_id": str(organization_id)}, retry=False)
    if len(rows) > 100:
        await asyncio.to_thread(recover_abandoned_uploads.apply_async,
            args=(str(rows[99]),), headers={"tenant_org_id": ""}, retry=False)


@celery_app.task(name="app.tasks.recover_abandoned_uploads_for_tenant", queue="reconciliation",
    soft_time_limit=120, time_limit=180, acks_late=True, ignore_result=True)
def recover_abandoned_uploads_for_tenant(organization_id_str: str) -> None:
    from app.tasks.tenant_job_scope import parse_required_organization_id
    _run(_recover_abandoned_tenant_uploads(parse_required_organization_id(organization_id_str)))


async def _commit_upload_cleanup_intent(*, organization_id: uuid.UUID, upload_id: uuid.UUID,
        claim_token: str, bucket: str, object_key: str, reason: str) -> bool:
    """Fence irreversible provider deletion without retaining a DB connection.

An expired/superseded claimant cannot authorise DELETE. Once committed, this
intent prevents a newer claimant/finalizer from reviving the same object key.
"""
    from app.tasks.tenant_job_scope import tenant_job_session
    from app.modules.platform.models.organization_console import UsageReservation
    async with tenant_job_session(organization_id) as db:
        await db.scalar(select(Organization.id).where(Organization.id == organization_id).with_for_update())
        reservation = await db.scalar(select(UsageReservation).where(
            UsageReservation.organization_id == organization_id,
            UsageReservation.status.in_(("RESERVED", "CONSUMED")),
            or_(UsageReservation.idempotency_key.like("program-upload:%"),
                UsageReservation.idempotency_key.like("registration-upload:%")),
            UsageReservation.metadata_json["upload_id"].as_string() == str(upload_id),
        ).with_for_update().execution_options(populate_existing=True))
        row = await db.scalar(select(DurableUpload).where(DurableUpload.id == upload_id,
            DurableUpload.organization_id == organization_id).with_for_update()
            .execution_options(populate_existing=True))
        if (row is None or row.task_id != claim_token or row.storage_bucket != bucket
                or row.object_key != object_key or row.status in {"ready", "failed", "quarantined", "deleted"}
                or reservation is not None and reservation.status == "CONSUMED"):
            return False
        if row.status != "cleanup_pending":
            await UploadService.apply_transition(db, row, "cleanup_pending", error=reason)
            db.add(AuditLog(organization_id=organization_id, actor_role="SYSTEM", resource_type="upload",
                resource_id=row.id, action_type="UPLOAD_CLEANUP_INTENT_RECORDED", is_sensitive=True,
                new_state={"event_id": str(row.event_id) if row.event_id else None,
                    "reservation_id": str(reservation.id) if reservation is not None else None,
                    "reason": reason}))
        await db.commit()
        return True


async def _recover_abandoned_tenant_uploads(organization_id: uuid.UUID) -> None:
    from app.modules.registration.services.managed_registration_uploads import registration_upload_buckets
    from app.modules.platform.models.organization_console import UsageReservation
    from app.modules.billing.services.usage_reservation_service import UsageReservationService
    from app.modules.identity.models.user import User
    from app.tasks.tenant_job_scope import (
        TenantJobScopeRequired, reauthorize_job_actor, tenant_job_session,
        parse_required_organization_id,
    )
    from app.core.dependencies.feature_gate import enforce_event_operation
    from fastapi import HTTPException
    organization_id = parse_required_organization_id(organization_id)
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=15)
    claims: list[tuple[uuid.UUID, uuid.UUID, str, str, int, str, bool]] = []
    token = f"recovery:{uuid.uuid4()}"
    async with tenant_job_session(organization_id) as db:
        rows = list((await db.scalars(select(DurableUpload).where(
            DurableUpload.organization_id == organization_id,
            DurableUpload.status.in_(("created", "uploading", "uploaded", "verifying", "scanning", "processing", "cleanup_pending")),
            DurableUpload.updated_at < cutoff,
        ).order_by(DurableUpload.updated_at, DurableUpload.id).limit(100)
          .with_for_update(skip_locked=True))).all())
        for row in rows:
            row.task_id = token
            row.updated_at = datetime.now(timezone.utc)
            claims.append((row.id, row.organization_id, row.storage_bucket, row.object_key,
                int(row.size_bytes), row.original_filename, row.status == "cleanup_pending"))
        await db.commit()

    dispatch: list[tuple[uuid.UUID, uuid.UUID]] = []
    for upload_id, organization_id, bucket, object_key, expected_size, filename, cleanup_requested in claims:
        missing = False
        mismatch = False
        revoked = False
        reservation_state: str | None = None
        is_public_registration_path = "/registration_upload/" in object_key
        is_program_registration_path = "/registration_program/" in object_key
        is_managed_registration_path = (
            is_public_registration_path or is_program_registration_path
        )
        try:
            metadata = await asyncio.to_thread(get_object_metadata, bucket=bucket, storage_path=object_key,
                verified_organization_id=organization_id)
            mismatch = int(metadata["size"]) != expected_size
        except FileNotFoundError:
            missing = True
        except Exception:
            continue
        # Resolve the exact quota/usage state even when the object is missing or
        # malformed. Without this lookup a finalized CONSUMED upload could be
        # mistaken for a retained RESERVED attempt and deleted/released twice.
        async with tenant_job_session(organization_id) as authority_db:
            reservation = await authority_db.scalar(select(UsageReservation).where(
                UsageReservation.organization_id == organization_id,
                UsageReservation.status.in_(("RESERVED", "CONSUMED")),
                or_(
                    UsageReservation.idempotency_key.like("program-upload:%"),
                    UsageReservation.idempotency_key.like("registration-upload:%"),
                ),
                UsageReservation.metadata_json["upload_id"].as_string() == str(upload_id),
            ))
            reservation_state = reservation.status if reservation is not None else None
            if reservation is None and is_managed_registration_path:
                revoked = True
            elif (is_public_registration_path and reservation is not None
                  and reservation.status == "RESERVED" and not missing and not mismatch):
                # A prepared-but-unfinalized public upload is still subject
                # to the current event/form authority. It may be deleted and
                # its exact held quota released only after this recheck.
                reservation_metadata = dict(reservation.metadata_json or {})
                field_name = str(reservation_metadata.get("field_name") or "")
                event = await authority_db.scalar(select(Event).join(
                    Organization, Organization.id == Event.organization_id).where(
                    Event.id == reservation.event_id,
                    Event.organization_id == organization_id,
                    Event.deleted_at.is_(None),
                    Event.status == "active",
                    Organization.is_active.is_(True),
                    Organization.suspended_at.is_(None),
                    Organization.archived_at.is_(None),
                ))
                config = None if event is None else await authority_db.scalar(
                    select(RegistrationFormConfig).where(
                        RegistrationFormConfig.event_id == event.id,
                        RegistrationFormConfig.is_live.is_(True),
                    )
                )
                field = None
                if config is not None and field_name:
                    from app.modules.registration.schemas.event_form_contracts import form_document
                    try:
                        document = form_document(config.fields or [], config.settings or {},
                            stored=True, event_id=event.id)
                        field = next((item for item in document["fields"]
                            if item.get("id") == field_name
                            and item.get("is_active", True)
                            and item.get("type") in {"file", "image", "signature", "upload"}), None)
                    except ValueError:
                        field = None
                from app.modules.registration.services.managed_registration_uploads import (
                    registration_upload_field_folder,
                )
                expected_prefix = (
                    f"tenant/{organization_id}/event/{reservation.event_id}/"
                    f"registration_upload/{registration_upload_field_folder(field_name)}/"
                )
                revoked = (
                    field is None
                    or bucket not in registration_upload_buckets()
                    or not reservation.idempotency_key.startswith("registration-upload:")
                    or reservation_metadata.get("storage_path") != object_key
                    or not object_key.startswith(expected_prefix)
                )
            elif (is_public_registration_path and reservation is not None
                  and reservation.status == "CONSUMED" and not missing and not mismatch):
                # CONSUMED means finalization already committed. Later form
                # or tenant lifecycle changes must block delivery, but must
                # not turn a legitimate retained customer object into an
                # abandoned attempt. Check only immutable tenant/event/path
                # ownership here; processing may safely resume afterward.
                reservation_metadata = dict(reservation.metadata_json or {})
                field_name = str(reservation_metadata.get("field_name") or "")
                from app.modules.registration.services.managed_registration_uploads import (
                    registration_upload_field_folder,
                )
                expected_prefix = (
                    f"tenant/{organization_id}/event/{reservation.event_id}/"
                    f"registration_upload/{registration_upload_field_folder(field_name)}/"
                )
                revoked = (
                    reservation.event_id is None
                    or not field_name
                    or bucket not in registration_upload_buckets()
                    or not reservation.idempotency_key.startswith("registration-upload:")
                    or reservation_metadata.get("storage_path") != object_key
                    or not object_key.startswith(expected_prefix)
                )
            elif (is_program_registration_path and reservation is not None
                  and reservation.status == "RESERVED" and not missing and not mismatch):
                # A staff upload abandoned after storage but before finalisation
                # may consume quota only if the exact actor and selected access
                # context still authorise the protected event operation.
                reservation_metadata = dict(reservation.metadata_json or {})
                expected_prefix = (
                    f"tenant/{organization_id}/event/{reservation.event_id}/"
                    "registration_program/"
                )
                try:
                    actor_id = uuid.UUID(str(reservation_metadata["actor_id"]))
                    workspace_id = uuid.UUID(str(reservation_metadata["workspace_id"]))
                    acting_organization_id = uuid.UUID(
                        str(reservation_metadata["acting_organization_id"])
                    )
                    relationship_id = (
                        uuid.UUID(str(reservation_metadata["relationship_id"]))
                        if reservation_metadata.get("relationship_id") else None
                    )
                    access_mode = str(reservation_metadata["access_mode"])
                    expected_auth_revision = int(reservation_metadata["auth_revision"])
                except (KeyError, TypeError, ValueError):
                    revoked = True
                else:
                    upload = await authority_db.scalar(select(DurableUpload).where(
                        DurableUpload.id == upload_id,
                        DurableUpload.organization_id == organization_id,
                        DurableUpload.event_id == reservation.event_id,
                        DurableUpload.created_by == actor_id,
                        DurableUpload.object_key == object_key,
                    ))
                    event = await authority_db.scalar(select(Event).join(
                        Organization, Organization.id == Event.organization_id).where(
                        Event.id == reservation.event_id,
                        Event.organization_id == organization_id,
                        Event.operational_workspace_id == workspace_id,
                        Event.deleted_at.is_(None),
                        Event.status == "active",
                        Organization.is_active.is_(True),
                        Organization.suspended_at.is_(None),
                        Organization.archived_at.is_(None),
                    ))
                    current_auth_revision = await authority_db.scalar(select(
                        User.__table__.c.auth_revision
                    ).where(
                        User.__table__.c.id == actor_id,
                        User.__table__.c.is_active.is_(True),
                        User.__table__.c.deleted_at.is_(None),
                    ))
                    revoked = (
                        upload is None
                        or event is None
                        or bucket not in registration_upload_buckets()
                        or not reservation.idempotency_key.startswith("program-upload:")
                        or current_auth_revision != expected_auth_revision
                        or reservation_metadata.get("storage_path") != object_key
                        or not object_key.startswith(expected_prefix)
                        or access_mode not in {"DIRECT", "DELEGATED"}
                        or (access_mode == "DIRECT" and (
                            acting_organization_id != organization_id
                            or relationship_id is not None
                        ))
                        or (access_mode == "DELEGATED" and (
                            acting_organization_id == organization_id
                            or relationship_id is None
                        ))
                    )
                    if not revoked:
                        try:
                            async with reauthorize_job_actor(
                                authority_db,
                                actor_id,
                                organization_id,
                                workspace_id=workspace_id,
                                event_id=reservation.event_id,
                                action="registration.forms.manage",
                                access_mode=access_mode,
                                relationship_id=relationship_id,
                                emc_organization_id=(
                                    acting_organization_id
                                    if access_mode == "DELEGATED" else None
                                ),
                            ):
                                await enforce_event_operation(
                                    authority_db,
                                    organization_id,
                                    reservation.event_id,
                                    "registration.forms.manage",
                                    user_id=actor_id,
                                )
                        except (TenantJobScopeRequired, HTTPException):
                            revoked = True
            elif (is_program_registration_path and reservation is not None
                  and reservation.status == "CONSUMED" and not missing and not mismatch):
                # Finalised usage is retained even when the initiating staff
                # member is later revoked. Only immutable tenant/event/object
                # ownership is required to resume antivirus processing.
                reservation_metadata = dict(reservation.metadata_json or {})
                expected_prefix = (
                    f"tenant/{organization_id}/event/{reservation.event_id}/"
                    "registration_program/"
                )
                upload = await authority_db.scalar(select(DurableUpload.id).where(
                    DurableUpload.id == upload_id,
                    DurableUpload.organization_id == organization_id,
                    DurableUpload.event_id == reservation.event_id,
                    DurableUpload.object_key == object_key,
                ))
                recorded_path = reservation_metadata.get("storage_path")
                revoked = (
                    reservation.event_id is None
                    or upload is None
                    or bucket not in registration_upload_buckets()
                    or not reservation.idempotency_key.startswith("program-upload:")
                    or not object_key.startswith(expected_prefix)
                    or (recorded_path is not None and recorded_path != object_key)
                )
        if cleanup_requested and reservation_state == "CONSUMED":
            # Contradictory historical/manual state needs operator review, not
            # destructive cleanup of an accounted customer object.
            continue
        if (mismatch or revoked or cleanup_requested or missing and is_managed_registration_path) and reservation_state != "CONSUMED":
            reason = ("Abandoned upload object was not found." if missing
                else "Abandoned upload authority was revoked." if revoked
                else "Abandoned upload object size did not match." if mismatch
                else "Previously committed abandoned upload cleanup intent.")
            if not await _commit_upload_cleanup_intent(organization_id=organization_id,
                    upload_id=upload_id, claim_token=token, bucket=bucket,
                    object_key=object_key, reason=reason):
                continue
            try:
                cleanup = seal_registration_upload_key if is_managed_registration_path else delete_object
                await asyncio.to_thread(cleanup, bucket, object_key,
                    verified_organization_id=organization_id)
            except Exception:
                # Retain both the row and quota hold until exact-object cleanup
                # succeeds; releasing first would under-count stored bytes.
                continue
        async with tenant_job_session(organization_id) as db:
            # Match public/programme finalisation: organisation -> receipt ->
            # upload. Holding the upload first can deadlock against a retry.
            await db.scalar(select(Organization.id).where(
                Organization.id == organization_id).with_for_update())
            reservation = await db.scalar(select(UsageReservation).where(
                UsageReservation.organization_id == organization_id,
                UsageReservation.status.in_(("RESERVED", "CONSUMED")),
                or_(UsageReservation.idempotency_key.like("program-upload:%"),
                    UsageReservation.idempotency_key.like("registration-upload:%")),
                UsageReservation.metadata_json["upload_id"].as_string() == str(upload_id),
            ).with_for_update().execution_options(populate_existing=True))
            row = await db.scalar(select(DurableUpload).where(
                DurableUpload.id == upload_id, DurableUpload.organization_id == organization_id,
            ).with_for_update().execution_options(populate_existing=True))
            if row is None or row.task_id != token or row.status in {
                "ready", "failed", "quarantined", "deleted",
            }:
                continue
            if row.status == "cleanup_pending" and reservation is not None and reservation.status == "CONSUMED":
                continue
            if missing or mismatch or revoked or cleanup_requested:
                await UploadService.apply_transition(db, row, "failed",
                    error=("Abandoned upload object was not found." if missing
                        else "Abandoned upload authority was revoked." if revoked
                        else "Previously committed abandoned upload cleanup intent." if cleanup_requested
                        else "Abandoned upload object size did not match."))
                if reservation is not None and reservation.event_id == row.event_id:
                    metadata_json = dict(reservation.metadata_json or {})
                    metadata_json.update({"delivery_hold": False, "lease_until": 0,
                        "release_reason": ("UPLOAD_AUTHORITY_REVOKED" if revoked
                            else "ABANDONED_STORAGE_ATTEMPT")})
                    if reservation.status == "RESERVED":
                        reservation.metadata_json = metadata_json
                        await UsageReservationService.release(db, reservation.id)
                        action_type = "ABANDONED_UPLOAD_QUOTA_RELEASED"
                    else:
                        # Consumed usage is not a retained hold. Never call the
                        # reservation release path or delete the retained object
                        # automatically; record the exceptional state for the
                        # authoritative storage/usage reconciliation workflow.
                        reservation.metadata_json = {**metadata_json,
                            "reconciliation_required": True,
                            "consumed_object_failure": True}
                        action_type = "CONSUMED_UPLOAD_RECONCILIATION_REQUIRED"
                    db.add(AuditLog(organization_id=organization_id, actor_user_id=None,
                        actor_role="SYSTEM", resource_type="upload", resource_id=row.id,
                        action_type=action_type, is_sensitive=True,
                        new_state={"event_id": str(row.event_id) if row.event_id else None,
                            "reservation_id": str(reservation.id),
                            "reservation_status": reservation.status,
                            "reason": metadata_json["release_reason"]}))
            else:
                if row.status == "created":
                    await UploadService.apply_transition(db, row, "uploading")
                if row.status == "uploading":
                    await UploadService.apply_transition(db, row, "uploaded")
                if reservation is not None and reservation.event_id == row.event_id:
                    is_public_registration = reservation.idempotency_key.startswith(
                        "registration-upload:"
                    )
                    if reservation.status == "RESERVED":
                        from app.modules.registration.services.public_upload_capability import (
                            public_upload_response,
                        )
                        capability_expires_at = int(
                            (reservation.metadata_json or {}).get("capability_expires_at")
                            or (datetime.now(timezone.utc) + timedelta(hours=24)).timestamp()
                        )
                        result = public_upload_response(
                            upload_id=upload_id,
                            event_id=row.event_id,
                            filename=filename,
                            expires_at=capability_expires_at,
                        )
                        if not is_public_registration:
                            result["managed_url"] = (
                                f"{settings.api_v1_prefix}/public/events/{row.event_id}/"
                                f"registration-documents/{upload_id}"
                            )
                        reservation.metadata_json = {**dict(reservation.metadata_json or {}),
                            "delivery_hold": False, "lease_until": 0, "response": result,
                            "dispatch_due": 0, "dispatch_attempts": 0,
                            "recovered_at": datetime.now(timezone.utc).isoformat()}
                        reservation.expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
                        await UsageReservationService.consume(db, reservation.id,
                            source=("registration.portal.upload.recovery" if is_public_registration
                                else "registration.program.upload.recovery"),
                            actor_user_id=row.created_by)
                        action_type = "ABANDONED_UPLOAD_RECOVERED"
                    else:
                        reservation.metadata_json = {**dict(reservation.metadata_json or {}),
                            "dispatch_due": 0,
                            "recovered_processing_at": datetime.now(timezone.utc).isoformat()}
                        action_type = "FINALIZED_UPLOAD_PROCESSING_REDISPATCHED"
                    db.add(AuditLog(organization_id=organization_id,
                        actor_user_id=row.created_by, actor_role="SYSTEM",
                        resource_type="upload", resource_id=row.id,
                        action_type=action_type, is_sensitive=True,
                        new_state={"event_id": str(row.event_id) if row.event_id else None,
                            "reservation_id": str(reservation.id),
                            "reservation_status": reservation.status}))
                row.task_id = None
                row.updated_at = datetime.now(timezone.utc)
                dispatch.append((row.id, row.organization_id))
            await db.commit()
    for upload_id, organization_id in dispatch:
        try:
            await asyncio.to_thread(process_durable_upload.apply_async,
                args=(str(upload_id), str(organization_id)),
                headers={"tenant_org_id": str(organization_id)}, retry=False)
        except Exception:
            # The committed uploaded state remains eligible for the next pass.
            pass
    # Legacy assets also need durable dispatch recovery. Only pending scans are
    # republished; the scanner itself performs the lease/ownership check.
    async with tenant_job_session(organization_id) as db:
        scan_rows = list((await db.execute(select(VirusScan, Asset.organization_id).join(
            Asset, Asset.id == VirusScan.asset_id).where(
                Asset.organization_id == organization_id,
                Asset.processing_status == "QUARANTINED",
                VirusScan.status.in_(("pending", "scanning")),
                VirusScan.scanned_at < cutoff,
            ).order_by(VirusScan.scanned_at, VirusScan.id).limit(100)
              .with_for_update(of=VirusScan, skip_locked=True))).all())
        pending_scans = []
        for scan, organization_id in scan_rows:
            scan.status = "pending"
            scan.scan_result = "Recovered abandoned scanner lease."
            scan.scanned_at = datetime.now(timezone.utc)
            pending_scans.append((scan.asset_id, organization_id))
        await db.commit()
    for asset_id, organization_id in pending_scans:
        try:
            await asyncio.to_thread(scan_asset_for_viruses.apply_async,
                args=(str(asset_id), str(organization_id)),
                headers={"tenant_org_id": str(organization_id)}, retry=False)
        except Exception:
            pass


async def _mark_upload_failed(
    upload_id: uuid.UUID,
    organization_id: uuid.UUID,
    task_id: str,
    error: Exception,
) -> None:
    """Persist a bounded terminal failure after retry exhaustion."""
    async with AsyncSessionLocal() as db:
        row = await DurableUploadRepository(db).get_by_id(
            upload_id=upload_id,
            organization_id=organization_id,
            for_update=True,
        )
        if row is None or row.status in {"ready", "failed", "quarantined", "deleted", "cleanup_pending"}:
            return
        await UploadService.apply_transition(
            db,
            row,
            "failed",
            error=f"Processing failed after retries: {type(error).__name__}",
            task_id=task_id,
        )
        await db.commit()


@celery_app.task(
    bind=True,
    name="app.tasks.process_import_upload",
    max_retries=_IMPORTS_POLICY.max_retries,
    soft_time_limit=_IMPORTS_POLICY.soft_timeout_seconds,
    time_limit=_IMPORTS_POLICY.hard_timeout_seconds,
    acks_late=True,
    queue=_IMPORTS_POLICY.queue,
)
def process_import_upload(self, upload_id_str: str, organization_id_str: str, job_id_str: str) -> dict:
    """Verify a direct import upload, then enqueue the import only when clean."""
    upload_id = uuid.UUID(upload_id_str)
    organization_id = uuid.UUID(organization_id_str)
    try:
        result = _run(_process(upload_id, organization_id, str(self.request.id)))
    except Exception as exc:
        if not is_retryable(exc):
            raise
        attempt = int(getattr(self.request, "retries", 0))
        policy = policy_for("imports")
        if attempt >= policy.max_retries:
            _run(_mark_import_failed(
                upload_id,
                organization_id,
                uuid.UUID(job_id_str),
                str(self.request.id),
                exc,
            ))
            raise
        countdown = min(300, policy.retry_delay(attempt, apply_jitter=True))
        raise self.retry(exc=exc, countdown=countdown, max_retries=policy.max_retries)
    # A replay of a terminal upload must not enqueue a second import. The
    # verifier marks terminal replays explicitly, while the first successful
    # transition to ready remains eligible for downstream processing.
    if result.get("status") == "ready" and not result.get("idempotent"):
        from app.tasks import run_excel_import
        run_excel_import.delay(job_id_str, organization_id_str)
    return {**result, "job_id": job_id_str}


@celery_app.task(
    name="app.tasks.recover_import_dispatches",
    queue=_IMPORTS_POLICY.queue,
    soft_time_limit=_IMPORTS_POLICY.soft_timeout_seconds,
    time_limit=_IMPORTS_POLICY.hard_timeout_seconds,
    acks_late=True,
    ignore_result=True,
)
def recover_import_dispatches() -> None:
    """Republish committed import jobs whose first broker publish was lost."""
    _run(_recover_import_dispatches())


async def _recover_import_dispatches() -> None:
    pending: list[tuple[uuid.UUID, uuid.UUID, uuid.UUID, str]] = []
    async with AsyncSessionLocal() as db:
        rows = await db.execute(
            select(ImportJob, DurableUpload.status)
            .join(Event, Event.id == ImportJob.event_id)
            .join(DurableUpload, DurableUpload.id == ImportJob.durable_upload_id)
            .where(
                ImportJob.status.in_(("uploaded", "validating")),
                DurableUpload.status.in_(("uploaded", "ready")),
            )
            .order_by(ImportJob.created_at.asc(), ImportJob.id.asc())
            .limit(50)
            .with_for_update(skip_locked=True)
        )
        for job, upload_status in rows.all():
            if job.durable_upload_id is not None:
                pending.append((job.durable_upload_id, job.event_id, job.id, upload_status))
            job.version = int(getattr(job, "version", 1) or 1) + 1
        await db.commit()

    from app.tasks import process_import_upload, run_excel_import
    for upload_id, event_id, job_id, upload_status in pending:
        event_org = await _organization_id_for_event(event_id)
        if event_org is not None:
            if upload_status == "ready":
                run_excel_import.delay(str(job_id), str(event_org))
            else:
                process_import_upload.delay(str(upload_id), str(event_org), str(job_id))


async def _organization_id_for_event(event_id: uuid.UUID) -> uuid.UUID | None:
    async with AsyncSessionLocal() as db:
        return await db.scalar(select(Event.organization_id).where(Event.id == event_id))


async def _mark_import_failed(
    upload_id: uuid.UUID,
    organization_id: uuid.UUID,
    job_id: uuid.UUID,
    task_id: str,
    error: Exception,
) -> None:
    """Persist terminal state for both sides of an exhausted import retry."""
    async with AsyncSessionLocal() as db:
        upload = await DurableUploadRepository(db).get_by_id(
            upload_id=upload_id,
            organization_id=organization_id,
            for_update=True,
        )
        if upload and upload.status not in {"ready", "failed", "quarantined", "deleted"}:
            await UploadService.apply_transition(
                db,
                upload,
                "failed",
                error=f"Import upload failed after retries: {type(error).__name__}",
                task_id=task_id,
            )

        job = await db.scalar(
            select(ImportJob)
            .join(Event, Event.id == ImportJob.event_id)
            .where(
                ImportJob.id == job_id,
                Event.organization_id == organization_id,
            )
            .with_for_update()
        )
        if job and job.status not in {"completed", "failed"}:
            job.status = "failed"
            job.version = int(getattr(job, "version", 1) or 1) + 1
            job.error_summary = [{"row": 0, "error": "Import processing failed after retries."}]
            job.completed_at = datetime.now(timezone.utc)
        await db.commit()
