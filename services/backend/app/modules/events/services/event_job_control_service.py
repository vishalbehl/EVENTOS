from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies.feature_gate import enforce_event_operation
from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.operations_control.models import JobControlRequest
from app.modules.registration.models.import_job import ImportJob
from app.modules.venue.models.venue_sync_job import VenueSyncJob


class EventJobControlService:
    """Governed, lineage-preserving controls for event background jobs."""

    @staticmethod
    async def request_retry(
        db: AsyncSession,
        *,
        event: Event,
        source_type: str,
        job_id: uuid.UUID,
        actor: User,
        idempotency_key: str,
        reason: str,
    ) -> dict[str, Any]:
        source = source_type.strip().upper()
        fingerprint = hashlib.sha256(
            json.dumps(
                {
                    "organization_id": str(event.organization_id),
                    "event_id": str(event.id),
                    "source": source,
                    "job_id": str(job_id),
                    "operation": "RETRY",
                    "reason": reason,
                },
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
        ).hexdigest()
        existing = await db.scalar(
            select(JobControlRequest)
            .where(
                JobControlRequest.organization_id == event.organization_id,
                JobControlRequest.operation_type == "RETRY",
                JobControlRequest.idempotency_key == idempotency_key,
            )
            .with_for_update()
        )
        if existing is not None:
            if existing.request_hash != fingerprint:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={"code": "IDEMPOTENCY_CONFLICT"},
                )
            return {
                "control": existing,
                "source": existing.source_type,
                "source_job_id": existing.source_job_id,
                "successor_job_id": existing.successor_job_id,
                "status": existing.status,
                "replayed": True,
                "dispatch": None,
            }

        if source == "IMPORT":
            await enforce_event_operation(
                db,
                event.organization_id,
                event.id,
                "registration.import",
                user_id=actor.id,
            )
            failed = await db.scalar(
                select(ImportJob)
                .where(ImportJob.id == job_id, ImportJob.event_id == event.id)
                .with_for_update()
            )
            if failed is None:
                raise HTTPException(status_code=404, detail="Import job not found.")
            if failed.status.lower() not in {"failed", "error"}:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "JOB_ACTION_UNSUPPORTED",
                        "message": "Only failed import jobs can be retried.",
                    },
                )
            successor = ImportJob(
                event_id=event.id,
                uploaded_by=actor.id,
                filename=failed.filename,
                storage_path=failed.storage_path,
                job_type=failed.job_type,
                status="uploaded",
            )
            db.add(successor)
            await db.flush()
            dispatch = {
                "task": "run_excel_import",
                "job_id": successor.id,
                "organization_id": event.organization_id,
            }
            control_status = "PENDING"
        elif source == "VENUE_SYNC":
            await enforce_event_operation(
                db,
                event.organization_id,
                event.id,
                "venue.sync",
                user_id=actor.id,
            )
            failed = await db.scalar(
                select(VenueSyncJob)
                .where(VenueSyncJob.id == job_id, VenueSyncJob.event_id == event.id)
                .with_for_update()
            )
            if failed is None:
                raise HTTPException(status_code=404, detail="Venue sync job not found.")
            if failed.status.lower() not in {"failed", "error"}:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "JOB_ACTION_UNSUPPORTED",
                        "message": "Only failed venue sync jobs can be retried.",
                    },
                )
            successor = VenueSyncJob(
                event_id=event.id,
                file_id=failed.file_id,
                sync_type=failed.sync_type,
                priority=failed.priority,
                status="pending",
                retry_count=failed.retry_count + 1,
                request_id=uuid.uuid4(),
                correlation_id=failed.correlation_id or failed.request_id or uuid.uuid4(),
                worker_metadata={
                    "predecessor_job_id": str(failed.id),
                    "retry_requested_by": str(actor.id),
                    "retry_reason": reason,
                },
                storage_provider=failed.storage_provider,
            )
            db.add(successor)
            await db.flush()
            dispatch = None  # Venue agents durably poll pending sync jobs.
            control_status = "SUCCEEDED"
        elif source == "PROCESSING":
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "JOB_ACTION_UNSUPPORTED",
                    "message": (
                        "Processing-job records have no governed retry adapter. "
                        "Use RETRY_PROCESSING on the associated file."
                    ),
                    "workspace": "files",
                },
            )
        else:
            raise HTTPException(
                status_code=422,
                detail={"code": "UNKNOWN_JOB_SOURCE", "source": source},
            )

        control = JobControlRequest(
            organization_id=event.organization_id,
            event_id=event.id,
            source_type=source,
            source_job_id=str(job_id),
            successor_job_id=str(successor.id),
            operation_type="RETRY",
            idempotency_key=idempotency_key,
            request_hash=fingerprint,
            reason=reason,
            status=control_status,
            requested_by=actor.id,
            completed_at=(
                datetime.now(timezone.utc)
                if control_status == "SUCCEEDED"
                else None
            ),
        )
        db.add(control)
        await db.flush()
        return {
            "control": control,
            "source": source,
            "source_job_id": str(job_id),
            "successor_job_id": str(successor.id),
            "status": control.status,
            "replayed": False,
            "dispatch": dispatch,
        }

    @staticmethod
    async def mark_dispatch_succeeded(
        db: AsyncSession, control_id: uuid.UUID
    ) -> JobControlRequest:
        control = await db.scalar(
            select(JobControlRequest)
            .where(JobControlRequest.id == control_id)
            .with_for_update()
        )
        if control is None:
            raise HTTPException(status_code=404, detail="Job control request not found.")
        control.status = "SUCCEEDED"
        control.completed_at = datetime.now(timezone.utc)
        return control

    @staticmethod
    async def mark_dispatch_failed(
        db: AsyncSession, control_id: uuid.UUID
    ) -> JobControlRequest:
        control = await db.scalar(
            select(JobControlRequest)
            .where(JobControlRequest.id == control_id)
            .with_for_update()
        )
        if control is None:
            raise HTTPException(status_code=404, detail="Job control request not found.")
        control.status = "FAILED"
        control.failure_code = "QUEUE_UNAVAILABLE"
        control.failure_detail = "Import worker dispatch failed."
        control.completed_at = datetime.now(timezone.utc)
        if control.source_type == "IMPORT" and control.successor_job_id:
            successor = await db.get(ImportJob, uuid.UUID(control.successor_job_id))
            if successor is not None:
                successor.status = "failed"
                successor.error_summary = [
                    {
                        "row": 0,
                        "error": "Background processing is unavailable.",
                    }
                ]
                successor.completed_at = datetime.now(timezone.utc)
        return control
