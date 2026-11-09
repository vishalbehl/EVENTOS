"""Transaction-owning organization lifecycle job commands."""

from __future__ import annotations

from datetime import datetime, timezone
import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.models.organization_console import OrganizationLifecycleJob
from app.modules.platform.services.lifecycle_service import OrganizationLifecycleService
from app.modules.platform.services.lifecycle_authority import lock_lifecycle_authority
from app.modules.platform.models.organization import Organization
from app.modules.rbac.services.platform_permissions import platform_permission_authority
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.modules.platform.schemas.organization_console import LifecycleJobOut


class OrganizationLifecycleCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _transition_receipt(self, organization_id, job_id, actor, operation, decision, reason, version, key):
        if decision not in {"APPROVED", "REJECTED"} or not isinstance(reason, str) or not 12 <= len(reason.strip()) <= 2000:
            raise HTTPException(422, detail={"code": "INVALID_LIFECYCLE_DECISION"})
        if type(version) is not int or version < 1:
            raise HTTPException(428, detail={"code": "IF_MATCH_REQUIRED"})
        if not isinstance(key, str) or not 16 <= len(key) <= 120:
            raise HTTPException(422, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
        return await begin_idempotent(self.db, organization_id=organization_id, actor_id=actor.id,
            operation=f"platform.lifecycle.{operation}", key=key,
            payload={"actor_id": str(actor.id), "job_id": str(job_id), "decision": decision,
                     "reason": reason, "version": version})

    async def _complete_transition(self, receipt, job):
        await self.db.flush()
        await self.db.refresh(job)
        result = LifecycleJobOut.model_validate(job)
        await complete_idempotent(self.db, receipt, response_status=200,
            response_body=result.model_dump(mode="json"), resource_id=job.id)
        return result

    async def _lock_job(self, organization_id, job_id, actor):
        await platform_permission_authority(self.db, actor.id, "platform:organizations:manage")
        statement = select(OrganizationLifecycleJob).where(
            OrganizationLifecycleJob.id == job_id, OrganizationLifecycleJob.organization_id == organization_id)
        observed = await self.db.scalar(statement)
        if observed is None:
            raise HTTPException(404, detail={"code": "RESOURCE_NOT_FOUND"})
        target = observed.target_organization_id
        await lock_lifecycle_authority(self.db, organization_id, actor.id, target,
            expected_auth_revision=actor.auth_revision)
        job = await self.db.scalar(statement.with_for_update().execution_options(populate_existing=True))
        if job is None or job.target_organization_id != target:
            raise HTTPException(409, detail={"code": "LIFECYCLE_SCOPE_CHANGED"})
        return job

    async def create(self, *, organization_id, actor, target_organization_id,
                     job_type: str, manifest: dict, manifest_checksum: str,
                     reason: str, idempotency_key: str,
                     requires_approval: bool, expected_version: int) -> OrganizationLifecycleJob:
        try:
            OrganizationLifecycleService.require_available_operation(job_type)
            acting_organization_id, _ = await lock_lifecycle_authority(self.db, organization_id, actor.id, target_organization_id,
                expected_auth_revision=actor.auth_revision)
            existing = await self.db.scalar(select(OrganizationLifecycleJob).where(
                OrganizationLifecycleJob.organization_id == organization_id,
                OrganizationLifecycleJob.idempotency_key == idempotency_key,
            ).with_for_update())
            if existing:
                if (existing.requested_by != actor.id or existing.job_type != job_type
                        or existing.target_organization_id != target_organization_id
                        or existing.reason != reason
                        or existing.dry_run_manifest.get("organization_version") != expected_version):
                    raise HTTPException(409, detail={"code": "IDEMPOTENCY_PAYLOAD_CONFLICT"})
                return existing
            current = await self.db.scalar(select(Organization).where(Organization.id == organization_id)
                .execution_options(populate_existing=True))
            if current is None or current.is_platform_org:
                raise HTTPException(404, detail={"code": "RESOURCE_NOT_FOUND"})
            if type(expected_version) is not int or expected_version < 1:
                raise HTTPException(428, detail={"code": "IF_MATCH_REQUIRED"})
            if current.profile_version != expected_version or manifest.get("organization_version") != expected_version:
                raise HTTPException(412, detail={"code": "STALE_VERSION"})
            job = OrganizationLifecycleJob(
                organization_id=organization_id,
                target_organization_id=target_organization_id,
                job_type=job_type,
                status="AWAITING_APPROVAL" if requires_approval else "PENDING",
                dry_run_manifest=manifest, manifest_checksum=manifest_checksum,
                reason=reason, idempotency_key=idempotency_key, requested_by=actor.id,
            )
            self.db.add(job)
            await self.db.flush()
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organization_lifecycle_job",
                resource_id=job.id, action_type=f"ORGANIZATION_{job_type}_REQUESTED",
                new_state={"job_type": job.job_type, "status": job.status,
                           "acting_organization_id": str(acting_organization_id),
                           "target_organization_id": str(organization_id), "reason": reason,
                           "clone_target_organization_id": str(target_organization_id) if target_organization_id else None,
                           "manifest_checksum": manifest_checksum}, is_sensitive=True,
                correlation_id=uuid.uuid4(),
            ))
            await self.db.commit()
            await self.db.refresh(job)
            await invalidate_organization(organization_id)
            return job
        except Exception:
            await self.db.rollback()
            raise

    async def decide(self, *, organization_id, job_id, actor, decision: str,
                     reason: str, version: int, idempotency_key: str) -> OrganizationLifecycleJob | LifecycleJobOut:
        try:
            job = await self._lock_job(organization_id, job_id, actor)
            if job is None:
                raise HTTPException(status_code=404, detail="Lifecycle job not found")
            if decision == "APPROVED":
                OrganizationLifecycleService.require_available_operation(job.job_type)
            receipt = await self._transition_receipt(organization_id, job_id, actor, "decide", decision, reason, version, idempotency_key)
            replay = replay_response(receipt)
            if replay is not None:
                await self.db.commit()
                return LifecycleJobOut.model_validate(replay[1])
            if job.status != "AWAITING_APPROVAL":
                raise HTTPException(status_code=409, detail="Lifecycle job is not awaiting approval")
            if job.version != version:
                raise HTTPException(status_code=412, detail="Lifecycle job version is stale")
            if job.requested_by == actor.id:
                raise HTTPException(status_code=403, detail="Requester cannot approve their own lifecycle operation")
            approval = {"decision": decision, "reason": reason, "actor_id": str(actor.id),
                        "decided_at": datetime.now(timezone.utc).isoformat()}
            job.approvals = [*(job.approvals or []), approval]
            job.status = "PENDING" if decision == "APPROVED" else "REJECTED"
            job.version = int(job.version or 1) + 1
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organization_lifecycle_job",
                resource_id=job.id, action_type=f"ORGANIZATION_LIFECYCLE_{decision}",
                old_state={"status": "AWAITING_APPROVAL"},
                new_state={"status": job.status, "decision": approval,
                           "acting_organization_id": str(actor.organization_id),
                           "target_organization_id": str(organization_id)}, is_sensitive=True,
                correlation_id=uuid.uuid4(),
            ))
            if job.status == "PENDING":
                job.next_dispatch_at = datetime.now(timezone.utc)
            result = await self._complete_transition(receipt, job)
            await self.db.commit()
            await invalidate_organization(organization_id)
            return result
        except Exception:
            await self.db.rollback()
            raise

    async def retry(self, *, organization_id, job_id, actor, reason: str,
                    version: int, idempotency_key: str) -> OrganizationLifecycleJob | LifecycleJobOut:
        try:
            job = await self._lock_job(organization_id, job_id, actor)
            if job is None:
                raise HTTPException(status_code=404, detail="Lifecycle job not found")
            OrganizationLifecycleService.require_available_operation(job.job_type)
            receipt = await self._transition_receipt(organization_id, job_id, actor, "retry", "APPROVED", reason, version, idempotency_key)
            replay = replay_response(receipt)
            if replay is not None:
                await self.db.commit()
                return LifecycleJobOut.model_validate(replay[1])
            if job.status != "FAILED":
                raise HTTPException(status_code=409, detail="Only failed jobs can be approved for retry")
            if job.version != version:
                raise HTTPException(status_code=412, detail="Lifecycle job version is stale")
            job.status = "RETRY_PENDING"
            job.failure_reason = None
            job.version = int(job.version or 1) + 1
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organization_lifecycle_job",
                resource_id=job.id, action_type="ORGANIZATION_LIFECYCLE_RETRY_REQUESTED",
                old_state={"status": "FAILED"},
                new_state={"status": "RETRY_PENDING", "reason": reason,
                           "acting_organization_id": str(actor.organization_id),
                           "target_organization_id": str(organization_id)}, is_sensitive=True,
                correlation_id=uuid.uuid4(),
            ))
            job.next_dispatch_at = datetime.now(timezone.utc)
            job.dispatch_attempts = 0
            result = await self._complete_transition(receipt, job)
            await self.db.commit()
            await invalidate_organization(organization_id)
            return result
        except Exception:
            await self.db.rollback()
            raise
