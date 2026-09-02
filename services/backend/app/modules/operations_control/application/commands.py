"""Transaction-owning commands for operational job control."""

from __future__ import annotations

import hashlib
import json
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models.audit_log import AuditLog
from app.core.encryption import encrypt
from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.operations_control.models import JobControlRequest, SourceApiKey, TaskFailure
from app.modules.technology_services.models import ServiceRequest
from app.modules.search.models.search import SearchJob
from app.worker import celery_app


def _problem(code: str, message: str, status_code: int = 409) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _fingerprint(payload: dict) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _audit(
    db: AsyncSession,
    actor: User,
    organization_id: uuid.UUID,
    resource_id: uuid.UUID,
    action: str,
    reason: str,
    state: dict | None = None,
    resource_type: str = "search_job",
) -> None:
    db.add(AuditLog(
        organization_id=organization_id,
        actor_user_id=actor.id,
        actor_role=actor.platform_role or actor.role,
        resource_type=resource_type,
        resource_id=resource_id,
        action_type=action,
        new_state={"reason": reason, **(state or {})},
        is_sensitive=action in {"JOB_CANCEL_REQUESTED", "JOB_RETRY_REQUESTED"},
    ))


class OperationsControlCommandService:
    """Own idempotent retry/cancel workflows for search jobs."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_source_access(
        self,
        *,
        actor: User,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        source_type: str,
        name: str,
        permissions: dict,
        expires_at: datetime | None,
        reason: str,
        idempotency_key: str,
    ) -> tuple[SourceApiKey, str]:
        event = await self.db.scalar(
            select(Event)
            .where(
                Event.id == event_id,
                Event.organization_id == organization_id,
                Event.deleted_at.is_(None),
            )
            .execution_options(skip_tenant_filter=True)
        )
        if event is None:
            raise _problem("NOT_FOUND", "Event not found.", 404)
        raw_key = ("regsrc_" if source_type == "registration_server" else "vensrc_") + secrets.token_urlsafe(32)
        key = SourceApiKey(
            id=uuid.uuid4(),
            event_id=event_id,
            organization_id=organization_id,
            name=name.strip(),
            key_prefix=raw_key[:16],
            key_hash=hashlib.sha256(raw_key.encode("utf-8")).hexdigest(),
            api_key_encrypted=encrypt(raw_key),
            source_type=source_type,
            permissions=permissions or {"read": True, "push": True},
            expires_at=expires_at,
            created_by=actor.id,
        )
        self.db.add(key)
        await self.db.flush()
        _audit(
            self.db,
            actor,
            organization_id,
            key.id,
            "SOURCE_API_KEY_CREATED",
            reason,
            {"event_id": str(event_id), "source_type": source_type, "idempotency_key": idempotency_key},
            resource_type="source_api_key",
        )
        await self.db.commit()
        await self.db.refresh(key)
        return key, raw_key

    async def revoke_source_access(
        self,
        *,
        actor: User,
        organization_id: uuid.UUID,
        key_id: uuid.UUID,
        reason: str,
    ) -> SourceApiKey:
        key = await self.db.scalar(
            select(SourceApiKey)
            .where(SourceApiKey.id == key_id, SourceApiKey.organization_id == organization_id)
            .with_for_update()
        )
        if key is None:
            raise _problem("NOT_FOUND", "Source API key not found.", 404)
        if key.revoked_at is None:
            key.revoked_at = _now()
            permissions = dict(key.permissions or {})
            permissions["revoked_reason"] = reason
            permissions["revoked_by"] = str(actor.id)
            key.permissions = permissions
            _audit(
                self.db,
                actor,
                organization_id,
                key.id,
                "SOURCE_API_KEY_REVOKED",
                reason,
                {"event_id": str(key.event_id), "source_type": key.source_type},
                resource_type="source_api_key",
            )
        await self.db.commit()
        await self.db.refresh(key)
        return key

    async def transition_service_request(
        self,
        *,
        actor: User,
        organization_id: uuid.UUID,
        request_id: uuid.UUID,
        expected_version: int,
        target_status: str,
        reason: str,
    ) -> ServiceRequest:
        request = await self.db.scalar(
            select(ServiceRequest)
            .where(
                ServiceRequest.id == request_id,
                ServiceRequest.organization_id == organization_id,
            )
            .with_for_update()
        )
        if request is None:
            raise _problem("NOT_FOUND", "Service request not found.", 404)
        if request.version != expected_version:
            raise _problem("VERSION_CONFLICT", "The service request was changed by another user.", 409)
        request.status = target_status
        request.version += 1
        _audit(
            self.db,
            actor,
            organization_id,
            request.id,
            "REQUEST_STATUS_CHANGED",
            reason,
            {"status": request.status, "version": request.version},
            resource_type="service_request",
        )
        await self.db.commit()
        await self.db.refresh(request)
        return request

    async def control_job(
        self,
        *,
        actor: User,
        source: str,
        job_id: str,
        organization_id: uuid.UUID,
        reason: str,
        idempotency_key: str,
        operation: str,
    ) -> dict:
        if source != "search_index":
            raise _problem("UNSUPPORTED_JOB_SOURCE", "This job source is not supported.", 422)
        try:
            source_id = uuid.UUID(job_id)
        except ValueError as exc:
            raise _problem("JOB_NOT_FOUND", "Job not found.", 404) from exc

        job = await self.db.scalar(
            select(SearchJob)
            .where(SearchJob.id == source_id, SearchJob.organization_id == organization_id)
            .with_for_update()
        )
        if job is None:
            raise _problem("JOB_NOT_FOUND", "Job not found.", 404)

        fingerprint = _fingerprint({
            "organization_id": str(organization_id),
            "job_id": job_id,
            "reason": reason,
            "operation": operation,
        })
        existing = await self.db.scalar(
            select(JobControlRequest)
            .where(
                JobControlRequest.organization_id == organization_id,
                JobControlRequest.operation_type == operation,
                JobControlRequest.idempotency_key == idempotency_key,
            )
            .with_for_update()
        )
        if existing:
            if existing.request_hash != fingerprint:
                raise _problem("IDEMPOTENCY_CONFLICT", "The idempotency key was already used for another request.", 409)
            return {"job_id": str(existing.successor_job_id or job.id), "status": existing.status, "replayed": True}

        successor_id = str(job.id)
        if operation == "RETRY":
            successor = SearchJob(
                organization_id=job.organization_id,
                status="pending",
                entity_types=job.entity_types,
                requested_by=actor.id,
                request_reason=reason,
                predecessor_job_id=job.id,
                queued_at=_now(),
            )
            self.db.add(successor)
            await self.db.flush()
            successor_id = str(successor.id)
        else:
            job.status = "cancel_requested"

        self.db.add(JobControlRequest(
            organization_id=organization_id,
            source_type=source,
            source_job_id=job_id,
            successor_job_id=successor_id,
            operation_type=operation,
            idempotency_key=idempotency_key,
            request_hash=fingerprint,
            reason=reason,
            status="QUEUED" if operation == "RETRY" else "REQUESTED",
            requested_by=actor.id,
        ))
        _audit(
            self.db,
            actor,
            organization_id,
            job.id,
            f"JOB_{operation}",
            reason,
            {"successor_job_id": successor_id},
        )
        await self.db.commit()
        return {
            "job_id": successor_id,
            "status": "QUEUED" if operation == "RETRY" else "REQUESTED",
            "replayed": False,
        }

    async def replay_task_failure(
        self,
        *,
        actor: User,
        failure_id: uuid.UUID,
        organization_id: uuid.UUID,
        reason: str,
        idempotency_key: str,
    ) -> dict:
        """Replay one allow-listed terminal task with durable idempotency."""
        failure = await self.db.scalar(
            select(TaskFailure)
            .where(
                TaskFailure.id == failure_id,
                TaskFailure.organization_id == organization_id,
            )
            .with_for_update()
        )
        if failure is None:
            raise _problem("TASK_FAILURE_NOT_FOUND", "Task failure not found.", 404)

        fingerprint = _fingerprint({
            "failure_id": str(failure_id),
            "organization_id": str(organization_id),
            "reason": reason,
            "operation": "REPLAY_TASK_FAILURE",
        })
        existing = await self.db.scalar(
            select(JobControlRequest)
            .where(
                JobControlRequest.organization_id == organization_id,
                JobControlRequest.operation_type == "REPLAY_TASK_FAILURE",
                JobControlRequest.idempotency_key == idempotency_key,
            )
            .with_for_update()
        )
        if existing:
            if existing.request_hash != fingerprint:
                raise _problem("IDEMPOTENCY_CONFLICT", "The idempotency key was already used for another request.", 409)
            return {
                "failure_id": str(failure.id),
                "job_id": existing.successor_job_id,
                "status": existing.status,
                "replayed": True,
            }

        if failure.status != "FAILED":
            raise _problem("TASK_FAILURE_NOT_REPLAYABLE", "Only terminal failed tasks can be replayed.", 409)
        if not failure.replay_queue or not failure.replay_args:
            raise _problem("TASK_FAILURE_NOT_REPLAYABLE", "This task has no safe allow-listed replay payload.", 409)

        successor_id = f"replay-{failure.id}-{int(failure.replay_count or 0) + 1}"
        task_name = failure.task_name
        replay_args = list(failure.replay_args)
        replay_queue = failure.replay_queue
        failure_task_id = failure.task_id
        failure.status = "REPLAY_QUEUED"
        failure.replay_count = int(failure.replay_count or 0) + 1
        failure.last_replayed_at = _now()
        self.db.add(JobControlRequest(
            organization_id=organization_id,
            source_type="task_failure",
            source_job_id=failure_task_id,
            successor_job_id=successor_id,
            operation_type="REPLAY_TASK_FAILURE",
            idempotency_key=idempotency_key,
            request_hash=fingerprint,
            reason=reason,
            status="DISPATCHING",
            requested_by=actor.id,
        ))
        _audit(
            self.db,
            actor,
            organization_id,
            failure.id,
            "TASK_FAILURE_REPLAY_REQUESTED",
            reason,
            {"successor_job_id": successor_id, "task_name": task_name},
            resource_type="task_failure",
        )
        await self.db.commit()

        try:
            celery_app.send_task(
                task_name,
                args=replay_args,
                queue=replay_queue,
                task_id=successor_id,
            )
        except Exception as exc:
            failure.status = "REPLAY_DISPATCH_FAILED"
            control = await self.db.scalar(
                select(JobControlRequest)
                .where(JobControlRequest.successor_job_id == successor_id)
                .with_for_update()
            )
            if control:
                control.status = "FAILED"
                control.failure_code = "DISPATCH_FAILED"
                control.failure_detail = type(exc).__name__
            await self.db.commit()
            raise _problem("TASK_REPLAY_DISPATCH_FAILED", "The task replay could not be queued.", 503) from exc

        control = await self.db.scalar(
            select(JobControlRequest)
            .where(JobControlRequest.successor_job_id == successor_id)
            .with_for_update()
        )
        if control:
            control.status = "QUEUED"
        await self.db.commit()
        return {
            "failure_id": str(failure_id),
            "job_id": successor_id,
            "status": "QUEUED",
            "replayed": False,
        }
