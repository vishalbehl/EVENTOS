from __future__ import annotations

import uuid
import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.operations_control.models import JobControlRequest
from app.modules.registration.models.import_job import ImportJob
from app.modules.venue.models.venue_sync_job import VenueSyncJob
from sqlalchemy import select


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
        source_type = source_type.upper()
        if source_type == "PROCESSING":
            raise HTTPException(status_code=409, detail={"code": "JOB_RETRY_USE_WORKSPACE", "workspace": "files"})
        if source_type not in {"IMPORT", "VENUE_SYNC"}:
            raise HTTPException(status_code=422, detail="Unsupported retry source")
        model = ImportJob if source_type == "IMPORT" else VenueSyncJob
        source = await db.scalar(select(model).where(model.id == job_id, model.event_id == event.id).with_for_update())
        if source is None:
            raise HTTPException(status_code=404, detail="Job not found")
        if source.status.lower() not in {"failed", "error"}:
            raise HTTPException(status_code=409, detail="Only failed jobs can be retried")
        request_hash = hashlib.sha256(json.dumps({"source": source_type, "job_id": str(job_id), "reason": reason}, sort_keys=True).encode()).hexdigest()
        existing = await db.scalar(select(JobControlRequest).where(JobControlRequest.organization_id == event.organization_id, JobControlRequest.operation_type == "RETRY", JobControlRequest.idempotency_key == idempotency_key).with_for_update())
        if existing:
            if existing.request_hash != request_hash:
                raise HTTPException(status_code=409, detail="IDEMPOTENCY_KEY_REUSED")
            return {"control": existing, "source": source_type, "source_job_id": str(source.id), "successor_job_id": existing.successor_job_id, "status": existing.status, "replayed": True, "dispatch": None}
        if source_type == "IMPORT":
            successor = ImportJob(event_id=source.event_id, uploaded_by=source.uploaded_by, filename=source.filename, storage_path=source.storage_path, job_type=source.job_type, status="uploaded")
        else:
            successor = VenueSyncJob(event_id=source.event_id, file_id=source.file_id, sync_type=source.sync_type, priority=source.priority, status="pending", retry_count=source.retry_count + 1, storage_provider=source.storage_provider, worker_metadata={**(source.worker_metadata or {}), "predecessor_job_id": str(source.id)})
        db.add(successor)
        await db.flush()
        control = JobControlRequest(organization_id=event.organization_id, event_id=event.id, source_type=source_type, source_job_id=str(source.id), successor_job_id=str(successor.id), operation_type="RETRY", idempotency_key=idempotency_key, request_hash=request_hash, reason=reason, status="PENDING", requested_by=actor.id)
        db.add(control)
        await db.flush()
        dispatch = {"job_id": successor.id, "organization_id": event.organization_id} if source_type == "IMPORT" else None
        return {"control": control, "source": source_type, "source_job_id": str(source.id), "successor_job_id": str(successor.id), "status": "PENDING", "replayed": False, "dispatch": dispatch}

    @staticmethod
    async def mark_dispatch_succeeded(
        db: AsyncSession, control_id: uuid.UUID
    ) -> None:
        control = await db.get(JobControlRequest, control_id)
        if control is None:
            raise HTTPException(status_code=404, detail="Job control request not found")
        control.status = "SUCCEEDED"
        control.completed_at = datetime.now(timezone.utc)
        await db.commit()
        return control

    @staticmethod
    async def mark_dispatch_failed(
        db: AsyncSession, control_id: uuid.UUID
    ) -> None:
        control = await db.get(JobControlRequest, control_id)
        if control is None:
            raise HTTPException(status_code=404, detail="Job control request not found")
        control.status = "FAILED"
        control.failure_code = "QUEUE_UNAVAILABLE"
        control.completed_at = datetime.now(timezone.utc)
        await db.commit()
        return control
