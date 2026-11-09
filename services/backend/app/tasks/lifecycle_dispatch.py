"""Bounded at-least-once recovery from authoritative lifecycle job records."""
import asyncio
import random
import uuid
from datetime import datetime, timedelta, timezone

from loguru import logger
from sqlalchemy import or_, select

from app.database import AsyncSessionLocal
from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.organization_console import OrganizationLifecycleJob
from app.tasks.tenant_job_scope import parse_required_organization_id, tenant_job_session
from app.tasks.organization_console_tasks import execute_lifecycle_job, _run_reconciliation_task
from app.core.task_policy import policy_for
from app.worker import celery_app

_POLICY = policy_for("reconciliation")
MAX_DISPATCH_ATTEMPTS = 30


async def recover_tenant_dispatches(organization_id):
    organization_id = parse_required_organization_id(organization_id)
    now = datetime.now(timezone.utc)
    messages = []
    exhausted = 0
    async with tenant_job_session(organization_id) as db:
        rows = (await db.scalars(select(OrganizationLifecycleJob).where(
            OrganizationLifecycleJob.organization_id == organization_id,
            OrganizationLifecycleJob.status.in_(("PENDING", "RETRY_PENDING")),
            or_(OrganizationLifecycleJob.next_dispatch_at.is_(None), OrganizationLifecycleJob.next_dispatch_at <= now),
        ).order_by(OrganizationLifecycleJob.next_dispatch_at.asc().nullsfirst(), OrganizationLifecycleJob.id)
            .limit(100).with_for_update(skip_locked=True))).all()
        for job in rows:
            if job.dispatch_attempts >= MAX_DISPATCH_ATTEMPTS:
                previous = job.status
                job.status = "FAILED"
                job.failure_reason = "LIFECYCLE_DISPATCH_EXHAUSTED: Review queue health before approving a retry."
                job.completed_at = now
                job.version += 1
                exhausted += 1
                db.add(AuditLog(organization_id=organization_id, actor_user_id=None, actor_role="SYSTEM",
                    resource_type="organization_lifecycle_job", resource_id=job.id,
                    action_type="LIFECYCLE_DISPATCH_EXHAUSTED", old_state={"status": previous},
                    new_state={"status": "FAILED", "dispatch_attempts": job.dispatch_attempts},
                    correlation_id=uuid.uuid4(), is_sensitive=True, occurred_at=now))
                continue
            job.dispatch_attempts += 1
            # Lease is committed before publishing. A crash before/after broker
            # acknowledgement is recovered after expiry; execution deduplicates
            # under policy/job locks, not by trusting a Celery task ID.
            delay = min(900, 30 * (2 ** min(job.dispatch_attempts - 1, 5)))
            job.next_dispatch_at = now + timedelta(seconds=delay + random.randint(0, 15))
            messages.append((str(job.id), job.version, job.dispatch_attempts))
        await db.commit()
    published = 0
    for job_id, version, attempt in messages:
        try:
            await asyncio.to_thread(execute_lifecycle_job.apply_async,
                args=(str(organization_id), job_id),
                headers={"tenant_org_id": str(organization_id)},
                task_id=f"lifecycle-{job_id}-{version}-{attempt}", retry=False)
            published += 1
        except Exception as exc:
            # Never persist provider/credential exception bodies. The durable
            # lease remains pending, so a later recovery cycle retries it.
            logger.warning("Lifecycle dispatch pending; job={} error_type={}", job_id, type(exc).__name__)
    if exhausted:
        logger.error("Lifecycle dispatch budget exhausted; count={}", exhausted)
    return {"claimed": len(messages), "published": published, "exhausted": exhausted}


async def recover_dispatch_page(after=None):
    # Organisation roots are the existing control-plane fan-out projection.
    # Include inactive tenants: restoration jobs must not be starved.
    cursor = uuid.UUID(after) if after is not None else None
    async with AsyncSessionLocal() as db:
        query = select(Organization.id)
        if cursor is not None:
            query = query.where(Organization.id > cursor)
        ids = (await db.scalars(query.order_by(Organization.id).limit(101))).all()
    totals = {"tenants": 0, "claimed": 0, "published": 0, "exhausted": 0}
    if len(ids) > 100:
        # Schedule the next page BEFORE any tenant's broker deliveries. A noisy
        # tenant or a time-limited page must not starve later tenants. If this
        # publication fails, no work is claimed and the periodic root retries.
        await asyncio.to_thread(recover_lifecycle_dispatches.apply_async,
            args=(str(ids[99]),), headers={"tenant_org_id": ""}, retry=False)
    for organization_id in ids[:100]:
        result = await recover_tenant_dispatches(organization_id)
        totals["tenants"] += 1
        for key in ("claimed", "published", "exhausted"):
            totals[key] += result[key]
    return totals


@celery_app.task(name="app.tasks.lifecycle_dispatch.recover", bind=True, queue=_POLICY.queue,
    max_retries=_POLICY.max_retries, soft_time_limit=_POLICY.soft_timeout_seconds,
    time_limit=_POLICY.hard_timeout_seconds, acks_late=True)
def recover_lifecycle_dispatches(self, after=None):
    return _run_reconciliation_task(self, recover_dispatch_page(after))
