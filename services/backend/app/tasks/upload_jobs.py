"""Durable upload orchestration entry points for Celery workers."""
from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone
from itertools import islice

from app.database import AsyncSessionLocal
from app.worker import celery_app
from app.core.upload_service import UploadService
from app.core.task_policy import is_retryable, policy_for
from app.core.antivirus import scan_chunks
from app.core.upload_validation import validate_file_signature
from app.modules.files.models.file import Asset, DurableUpload, VirusScan
from app.modules.files.infrastructure.repositories import DurableUploadRepository
from app.modules.registration.models.import_job import ImportJob
from app.modules.events.models.event import Event
from sqlalchemy import select
from app.config import settings
from app.modules.presentations.services.upload_service import iter_object_chunks, get_object_metadata
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
            .where(VirusScan.asset_id == asset_id, VirusScan.status == "pending")
            .order_by(VirusScan.scanned_at.desc(), VirusScan.id.desc())
            .limit(1)
            .with_for_update()
        )
        if scan is None:
            scan = VirusScan(
                id=uuid.uuid4(),
                asset_id=asset_id,
                status="pending",
            )
            db.add(scan)
            await db.flush()

        try:
            metadata = get_object_metadata(
                bucket=settings.S3_BUCKET_ASSETS,
                storage_path=asset.file_path,
                verified_organization_id=organization_id,
            )
            if int(metadata["size"]) != asset.file_size_bytes:
                scan.status = "error"
                scan.scan_result = "Uploaded object size does not match the declared size."
                asset.processing_status = "QUARANTINED"
                scan.scanned_at = datetime.now(timezone.utc)
                await db.commit()
                return {"asset_id": str(asset_id), "status": "quarantined", "reason": "size_mismatch"}

            result = scan_chunks(
                iter_object_chunks(
                    settings.S3_BUCKET_ASSETS,
                    asset.file_path,
                    verified_organization_id=organization_id,
                )
            )
            if result.status == "unavailable" and settings.ANTIVIRUS_REQUIRED:
                raise RuntimeError("Antivirus scanning is temporarily unavailable.")

            scan.status = result.status if result.status in {"clean", "infected"} else "error"
            scan.scan_result = result.signature or result.status
            scan.scanned_at = datetime.now(timezone.utc)
            asset.processing_status = "READY" if result.status == "clean" else "QUARANTINED"
            await db.commit()
            return {
                "asset_id": str(asset_id),
                "status": asset.processing_status.lower(),
                "scan_status": scan.status,
                "idempotent": False,
            }
        except FileNotFoundError as exc:
            scan.status = "error"
            scan.scan_result = "Uploaded object was not found."
            asset.processing_status = "QUARANTINED"
            scan.scanned_at = datetime.now(timezone.utc)
            await db.commit()
            return {"asset_id": str(asset_id), "status": "quarantined", "reason": str(exc)}
        except Exception:
            await db.rollback()
            raise


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
            .where(VirusScan.asset_id == asset_id, VirusScan.status == "pending")
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
    async with AsyncSessionLocal() as db:
        row = await DurableUploadRepository(db).get_by_id(
            upload_id=upload_id,
            organization_id=organization_id,
            for_update=True,
        )
        if row is None:
            return {"upload_id": str(upload_id), "status": "missing"}
        if row.status in {"ready", "failed", "quarantined", "deleted"}:
            return {"upload_id": str(upload_id), "status": row.status, "idempotent": True}
        try:
            await UploadService.apply_transition(db, row, row.status, task_id=task_id)
            metadata = get_object_metadata(
                bucket=getattr(row, "storage_bucket", None) or settings.S3_BUCKET_ASSETS,
                storage_path=row.object_key,
                verified_organization_id=organization_id,
            )
            if int(metadata["size"]) != row.size_bytes:
                await UploadService.apply_transition(db, row, "quarantined", error="Uploaded object size does not match the declared size.", task_id=task_id)
                await db.commit()
                return {"upload_id": str(upload_id), "status": row.status}
            if row.checksum:
                digest = hashlib.sha256()
                for chunk in iter_object_chunks(
                    getattr(row, "storage_bucket", None) or settings.S3_BUCKET_ASSETS,
                    row.object_key,
                    verified_organization_id=organization_id,
                ):
                    digest.update(chunk)
                if digest.hexdigest().lower() != row.checksum.lower():
                    await UploadService.apply_transition(db, row, "quarantined", error="Uploaded object checksum does not match the declared checksum.", task_id=task_id)
                    await db.commit()
                    return {"upload_id": str(upload_id), "status": row.status}
            if row.status == "uploaded":
                await UploadService.apply_transition(db, row, "verifying", task_id=task_id)
            if row.status in {"verifying", "scanning"}:
                signature_prefix = b"".join(islice(iter_object_chunks(
                    getattr(row, "storage_bucket", None) or settings.S3_BUCKET_ASSETS,
                    row.object_key,
                    verified_organization_id=organization_id,
                ), 1))[:1024 * 1024]
                try:
                    validate_file_signature(signature_prefix, row.mime_type)
                except Exception as exc:
                    await UploadService.apply_transition(db, row, "quarantined", error=str(getattr(exc, "detail", "File signature does not match declared MIME type.")), task_id=task_id)
                    await db.commit()
                    return {"upload_id": str(upload_id), "status": row.status}
                if row.status == "verifying":
                    await UploadService.apply_transition(db, row, "scanning", task_id=task_id)
                scan = scan_chunks(iter_object_chunks(
                    getattr(row, "storage_bucket", None) or settings.S3_BUCKET_ASSETS,
                    row.object_key,
                    verified_organization_id=organization_id,
                ))
                if scan.status == "infected":
                    await UploadService.apply_transition(db, row, "quarantined", error=f"Antivirus detected {scan.signature or 'malware'}.", task_id=task_id)
                    await db.commit()
                    return {"upload_id": str(upload_id), "status": row.status}
                if scan.status == "unavailable" and settings.ANTIVIRUS_REQUIRED:
                    # An unavailable scanner is an infrastructure condition,
                    # not evidence that the file is malicious. Leave the
                    # upload retryable so a ClamAV recovery can complete it.
                    raise RuntimeError("Antivirus scanning is temporarily unavailable.")
            if row.status == "scanning":
                await UploadService.apply_transition(db, row, "processing", task_id=task_id)
            if row.status == "processing":
                await UploadService.apply_transition(db, row, "ready", task_id=task_id)
            await db.commit()
            return {"upload_id": str(upload_id), "status": row.status}
        except Exception as exc:
            await db.rollback()
            if is_retryable(exc):
                # Keep transient storage/database/scanner failures out of the
                # terminal state set. Celery can safely retry the same upload.
                raise
            await UploadService.transition(db, upload_id, "failed", organization_id=organization_id, error=str(exc), task_id=task_id)
            await db.commit()
            raise


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
        if row is None or row.status in {"ready", "failed", "quarantined", "deleted"}:
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
