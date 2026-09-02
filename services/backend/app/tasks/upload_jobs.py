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
from app.modules.files.models.file import DurableUpload
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
        row = await db.scalar(select(DurableUpload).where(
            DurableUpload.id == upload_id,
            DurableUpload.organization_id == organization_id,
        ).with_for_update())
        if row is None:
            return {"upload_id": str(upload_id), "status": "missing"}
        if row.status in {"ready", "failed", "quarantined", "deleted"}:
            return {"upload_id": str(upload_id), "status": row.status, "idempotent": True}
        try:
            row.task_id = task_id
            metadata = get_object_metadata(
                bucket=getattr(row, "storage_bucket", None) or settings.S3_BUCKET_ASSETS,
                storage_path=row.object_key,
                verified_organization_id=organization_id,
            )
            if int(metadata["size"]) != row.size_bytes:
                row.status = "quarantined"
                row.processing_error = "Uploaded object size does not match the declared size."
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
                    row.status = "quarantined"
                    row.processing_error = "Uploaded object checksum does not match the declared checksum."
                    await db.commit()
                    return {"upload_id": str(upload_id), "status": row.status}
            if row.status in {"uploaded", "verifying", "scanning"}:
                signature_prefix = b"".join(islice(iter_object_chunks(
                    getattr(row, "storage_bucket", None) or settings.S3_BUCKET_ASSETS,
                    row.object_key,
                    verified_organization_id=organization_id,
                ), 1))[:1024 * 1024]
                try:
                    validate_file_signature(signature_prefix, row.mime_type)
                except Exception as exc:
                    row.status = "quarantined"
                    row.processing_error = str(getattr(exc, "detail", "File signature does not match declared MIME type."))
                    await db.commit()
                    return {"upload_id": str(upload_id), "status": row.status}
                row.status = "scanning"
                scan = scan_chunks(iter_object_chunks(
                    getattr(row, "storage_bucket", None) or settings.S3_BUCKET_ASSETS,
                    row.object_key,
                    verified_organization_id=organization_id,
                ))
                if scan.status == "infected":
                    row.status = "quarantined"
                    row.processing_error = f"Antivirus detected {scan.signature or 'malware'}."
                    await db.commit()
                    return {"upload_id": str(upload_id), "status": row.status}
                if scan.status == "unavailable" and settings.ANTIVIRUS_REQUIRED:
                    # An unavailable scanner is an infrastructure condition,
                    # not evidence that the file is malicious. Leave the
                    # upload retryable so a ClamAV recovery can complete it.
                    raise RuntimeError("Antivirus scanning is temporarily unavailable.")
            if row.status == "uploaded":
                row.status = "verifying"
            if row.status == "verifying":
                row.status = "scanning"
            if row.status == "scanning":
                row.status = "processing"
            if row.status == "processing":
                row.status = "ready"
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
        row = await db.scalar(
            select(DurableUpload)
            .where(
                DurableUpload.id == upload_id,
                DurableUpload.organization_id == organization_id,
            )
            .with_for_update()
        )
        if row is None or row.status in {"ready", "failed", "quarantined", "deleted"}:
            return
        row.task_id = task_id
        row.status = "failed"
        row.processing_error = f"Processing failed after retries: {type(error).__name__}"
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


async def _mark_import_failed(
    upload_id: uuid.UUID,
    organization_id: uuid.UUID,
    job_id: uuid.UUID,
    task_id: str,
    error: Exception,
) -> None:
    """Persist terminal state for both sides of an exhausted import retry."""
    async with AsyncSessionLocal() as db:
        upload = await db.scalar(
            select(DurableUpload)
            .where(
                DurableUpload.id == upload_id,
                DurableUpload.organization_id == organization_id,
            )
            .with_for_update()
        )
        if upload and upload.status not in {"ready", "failed", "quarantined", "deleted"}:
            upload.status = "failed"
            upload.task_id = task_id
            upload.processing_error = f"Import upload failed after retries: {type(error).__name__}"

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
            job.error_summary = [{"row": 0, "error": "Import processing failed after retries."}]
            job.completed_at = datetime.now(timezone.utc)
        await db.commit()
