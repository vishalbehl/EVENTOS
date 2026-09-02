"""Transaction-owning organization lifecycle job commands."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.models.organization_console import OrganizationLifecycleJob
from app.tasks.organization_console_tasks import execute_lifecycle_job


class OrganizationLifecycleCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, *, organization_id, actor, target_organization_id,
                     job_type: str, manifest: dict, manifest_checksum: str,
                     reason: str, idempotency_key: str,
                     requires_approval: bool) -> OrganizationLifecycleJob:
        try:
            existing = await self.db.scalar(select(OrganizationLifecycleJob).where(
                OrganizationLifecycleJob.organization_id == organization_id,
                OrganizationLifecycleJob.idempotency_key == idempotency_key,
            ).with_for_update())
            if existing:
                return existing
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
                           "target_organization_id": str(target_organization_id) if target_organization_id else None,
                           "manifest_checksum": manifest_checksum}, is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(job)
            await invalidate_organization(organization_id)
            if not requires_approval:
                execute_lifecycle_job.delay(str(organization_id), str(job.id))
            return job
        except Exception:
            await self.db.rollback()
            raise

    async def decide(self, *, organization_id, job_id, actor, decision: str,
                     reason: str, version: int) -> OrganizationLifecycleJob:
        try:
            job = await self.db.scalar(select(OrganizationLifecycleJob).where(
                OrganizationLifecycleJob.id == job_id,
                OrganizationLifecycleJob.organization_id == organization_id,
            ).with_for_update())
            if job is None:
                raise HTTPException(status_code=404, detail="Lifecycle job not found")
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
                new_state={"status": job.status, "decision": approval}, is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(job)
            await invalidate_organization(organization_id)
            if job.status == "PENDING":
                execute_lifecycle_job.delay(str(organization_id), str(job.id))
            return job
        except Exception:
            await self.db.rollback()
            raise

    async def retry(self, *, organization_id, job_id, actor, reason: str,
                    version: int) -> OrganizationLifecycleJob:
        try:
            job = await self.db.scalar(select(OrganizationLifecycleJob).where(
                OrganizationLifecycleJob.id == job_id,
                OrganizationLifecycleJob.organization_id == organization_id,
            ).with_for_update())
            if job is None:
                raise HTTPException(status_code=404, detail="Lifecycle job not found")
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
                new_state={"status": "RETRY_PENDING", "reason": reason}, is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(job)
            await invalidate_organization(organization_id)
            execute_lifecycle_job.delay(str(organization_id), str(job.id))
            return job
        except Exception:
            await self.db.rollback()
            raise
