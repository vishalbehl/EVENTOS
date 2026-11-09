"""Authoritative validation for scan-gated registration form upload answers."""
from __future__ import annotations

import re
import asyncio
import threading
import uuid

from fastapi import HTTPException
from sqlalchemy import select

from app.config import settings
from app.modules.files.models.file import DurableUpload

_UPLOAD_FIELD_TYPES = {"file", "image", "signature", "upload"}
# A broker outage must not fill the shared executor with one blocking publish
# per admitted upload. Metadata already committed before this best-effort step
# is the durable recovery source, not this process-local admission bound.
_DISPATCH_SLOTS = threading.BoundedSemaphore(8)
_DISPATCH_FUTURES_LOCK = threading.Lock()
_DISPATCH_FUTURES: set[asyncio.Future[bool]] = set()


async def dispatch_committed_registration_upload(*, upload_id: uuid.UUID, organization_id: uuid.UUID) -> bool:
    """Admit a bounded post-commit publish without delaying the request.

Do not call inside the business transaction. ``True`` means the publish was
admitted to the bounded executor, not that the broker accepted it. The durable
database record and recovery worker remain the correctness mechanism. A slot is
released only when its actual blocking worker finishes.
"""
    if not _DISPATCH_SLOTS.acquire(blocking=False):
        return False

    def publish() -> bool:
        try:
            from app.tasks.upload_jobs import process_durable_upload
            from app.worker import celery_app
            # Explicit socket/connection ceilings; no inline broker retry loop.
            with celery_app.connection_for_write(connect_timeout=3, transport_options={
                **celery_app.conf.broker_transport_options,
                "socket_connect_timeout": 3, "socket_timeout": 3,
                "retry_on_timeout": False, "max_retries": 0,
            }) as connection:
                process_durable_upload.apply_async(args=(str(upload_id), str(organization_id)),
                    headers={"tenant_org_id": str(organization_id)}, retry=False, connection=connection)
            return True
        except Exception as exc:
            from loguru import logger
            logger.warning("Registration upload dispatch pending for durable recovery: {}", type(exc).__name__)
            return False
        finally:
            _DISPATCH_SLOTS.release()

    try:
        future = asyncio.get_running_loop().run_in_executor(None, publish)
    except Exception:
        _DISPATCH_SLOTS.release()
        return False

    # Keep a strong reference until completion. Admission is deliberately the
    # request boundary: a slow/unavailable broker must not extend public upload
    # latency after the durable attempt has committed.
    with _DISPATCH_FUTURES_LOCK:
        _DISPATCH_FUTURES.add(future)

    def forget(completed: asyncio.Future[bool]) -> None:
        try:
            completed.result()
        except asyncio.CancelledError:
            pass
        except Exception:
            # ``publish`` already converts broker failures to False. This guard
            # also consumes executor/loop failures without an unhandled-future
            # warning; durable recovery owns the retry.
            pass
        finally:
            with _DISPATCH_FUTURES_LOCK:
                _DISPATCH_FUTURES.discard(completed)

    future.add_done_callback(forget)
    return True


def registration_upload_buckets() -> tuple[str, ...]:
    """New writes use configuration; persisted local-provider legacy rows remain readable."""
    return tuple(dict.fromkeys((settings.S3_BUCKET_REGISTRATION_UPLOADS, "registration_uploads")))


def require_upload_not_recovering(upload: DurableUpload) -> None:
    """Called while holding the upload row lock before retry/finalisation."""
    if getattr(upload, "status", None) == "cleanup_pending" or upload.task_id and upload.task_id.startswith("recovery:"):
        raise HTTPException(409, detail={"code": "UPLOAD_RECOVERY_IN_PROGRESS",
            "message": "This upload is being recovered. Please wait, then retry the same file."},
            headers={"Retry-After": "5"})


def registration_upload_field_folder(field_name: str | None) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9\-]+", "_", (field_name or "default").strip())
    return (cleaned.strip("_") or "default").lower()


async def validate_managed_registration_upload_answers(
    db,
    *,
    organization_id: uuid.UUID,
    event_id: uuid.UUID,
    fields: list[dict],
    values: dict,
) -> None:
    """Reject raw, foreign, unscanned, or cross-field upload references."""
    expected_prefix = f"{settings.api_v1_prefix}/events/{event_id}/registration/uploads/"
    references: list[tuple[uuid.UUID, str]] = []
    for field in fields:
        if field.get("type") not in _UPLOAD_FIELD_TYPES or not field.get("is_active", True):
            continue
        field_id = str(field.get("id") or "")
        value = values.get(field_id)
        if value in (None, ""):
            continue
        if not isinstance(value, str) or not value.startswith(expected_prefix) or not value.endswith("/download"):
            raise HTTPException(422, detail={"code": "MANAGED_UPLOAD_REFERENCE_REQUIRED", "field": field_id})
        identifier = value[len(expected_prefix):-len("/download")]
        if "/" in identifier:
            raise HTTPException(422, detail={"code": "MANAGED_UPLOAD_REFERENCE_REQUIRED", "field": field_id})
        try:
            upload_id = uuid.UUID(identifier)
        except ValueError:
            raise HTTPException(422, detail={"code": "MANAGED_UPLOAD_REFERENCE_REQUIRED", "field": field_id}) from None
        references.append((upload_id, registration_upload_field_folder(field_id)))

    if not references:
        return
    upload_ids = {upload_id for upload_id, _ in references}
    rows = list((await db.scalars(select(DurableUpload).where(
        DurableUpload.id.in_(upload_ids),
        DurableUpload.organization_id == organization_id,
        DurableUpload.event_id == event_id,
        DurableUpload.storage_bucket.in_(registration_upload_buckets()),
        DurableUpload.status == "ready",
    ))).all())
    by_id = {row.id: row for row in rows}
    for upload_id, folder in references:
        row = by_id.get(upload_id)
        owned_prefix = (
            f"tenant/{organization_id}/event/{event_id}/registration_upload/{folder}/"
        )
        if row is None or not row.object_key.startswith(owned_prefix):
            # Conceal whether the rejected upload exists in another scope.
            raise HTTPException(422, detail={"code": "MANAGED_UPLOAD_NOT_READY_OR_INVALID"})
