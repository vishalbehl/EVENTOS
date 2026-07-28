from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.models.organization_console import CapabilityRestriction, EntitlementOverrideRequest, OrganizationLifecycleJob, UsageReservation
from app.modules.platform.models.platform_domain_tables import PlatformFlagDefinition, PlatformFlagOverride
from app.modules.events.models.event import Event
from app.modules.platform.models.organization import Organization
from app.modules.platform.services.lifecycle_service import OrganizationLifecycleService
from app.modules.platform.services.metering_service import MeteringService
from app.database import AsyncSessionLocal
from app.tasks.tenant_job_scope import parse_required_organization_id, tenant_job_session
from app.worker import celery_app


async def expire_organization_overrides(organization_id_str: str, override_id_str: str | None = None) -> int:
    organization_id = parse_required_organization_id(organization_id_str)
    override_id = uuid.UUID(override_id_str) if override_id_str else None
    async with tenant_job_session(organization_id) as db:
        counts = await expire_tenant_capability_controls_in_session(
            db,
            organization_id,
            override_id=override_id,
            include_non_entitlement=False,
        )
        await db.commit()
        return counts["entitlement_overrides"]


@celery_app.task(name="app.tasks.organization_console_tasks.expire_override")
def expire_override(organization_id_str: str, override_id_str: str | None = None) -> int:
    from app.tasks.platform_tasks import _run_async
    return _run_async(expire_organization_overrides(organization_id_str, override_id_str))


async def expire_tenant_capability_controls_in_session(
    db,
    organization_id: uuid.UUID,
    *,
    now: datetime | None = None,
    override_id: uuid.UUID | None = None,
    include_non_entitlement: bool = True,
) -> dict:
    now = now or datetime.now(timezone.utc)
    counts = {"entitlement_overrides": 0, "restrictions": 0, "flag_overrides": 0, "reservations": 0}
    entitlement_query = select(EntitlementOverrideRequest).where(
        EntitlementOverrideRequest.organization_id == organization_id,
        EntitlementOverrideRequest.status == "APPROVED",
        EntitlementOverrideRequest.expires_at.is_not(None),
        EntitlementOverrideRequest.expires_at <= now,
    )
    if override_id:
        entitlement_query = entitlement_query.where(EntitlementOverrideRequest.id == override_id)
    entitlement_rows = (await db.scalars(entitlement_query.with_for_update())).all()
    restriction_rows = []
    flag_rows = []
    reservation_rows = []
    if include_non_entitlement:
        restriction_rows = (await db.scalars(select(CapabilityRestriction).where(CapabilityRestriction.organization_id == organization_id, CapabilityRestriction.status == "APPROVED", CapabilityRestriction.expires_at.is_not(None), CapabilityRestriction.expires_at <= now).with_for_update())).all()
        flag_rows = (await db.scalars(select(PlatformFlagOverride).where(PlatformFlagOverride.organization_id == organization_id, PlatformFlagOverride.status == "APPROVED", PlatformFlagOverride.expires_at.is_not(None), PlatformFlagOverride.expires_at <= now).with_for_update())).all()
        reservation_rows = (await db.scalars(select(UsageReservation).where(UsageReservation.organization_id == organization_id, UsageReservation.status == "RESERVED", UsageReservation.expires_at <= now).with_for_update())).all()
    for row in entitlement_rows:
        row.status = "EXPIRED"
        row.version += 1
        counts["entitlement_overrides"] += 1
        db.add(AuditLog(organization_id=organization_id, actor_user_id=None, actor_role="SYSTEM", resource_type="entitlement_override_request", resource_id=row.id, action_type="ENTITLEMENT_OVERRIDE_EXPIRED", old_state={"status": "APPROVED"}, new_state={"status": "EXPIRED", "expires_at": row.expires_at.isoformat(), "version": row.version}, change_diff={"source": "organization_console_expiry_worker"}, is_sensitive=True, occurred_at=now))
    for row in restriction_rows:
        row.status = "EXPIRED"
        row.version += 1
        counts["restrictions"] += 1
        db.add(AuditLog(organization_id=organization_id, actor_user_id=None, actor_role="SYSTEM", resource_type="capability_restriction", resource_id=row.id, action_type="CAPABILITY_RESTRICTION_EXPIRED", old_state={"status": "APPROVED"}, new_state={"status": "EXPIRED", "version": row.version}, is_sensitive=True, occurred_at=now))
    for row in flag_rows:
        row.status = "EXPIRED"
        row.version += 1
        counts["flag_overrides"] += 1
        db.add(AuditLog(organization_id=organization_id, actor_user_id=None, actor_role="SYSTEM", resource_type="platform_flag_override", resource_id=row.id, action_type="PLATFORM_FLAG_OVERRIDE_EXPIRED", old_state={"status": "APPROVED"}, new_state={"status": "EXPIRED", "version": row.version}, is_sensitive=True, occurred_at=now))
    for row in reservation_rows:
        row.status = "EXPIRED"
        counts["reservations"] += 1
    await db.flush()
    return counts


async def expire_tenant_capability_controls(organization_id_str: str) -> dict:
    organization_id = parse_required_organization_id(organization_id_str)
    async with tenant_job_session(organization_id) as db:
        counts = await expire_tenant_capability_controls_in_session(db, organization_id)
        await db.commit()
    return {"organization_id": str(organization_id), **counts}


@celery_app.task(name="app.tasks.organization_console_tasks.expire_tenant_capability_controls")
def expire_tenant_capability_controls_task(organization_id_str: str) -> dict:
    from app.tasks.platform_tasks import _run_async
    return _run_async(expire_tenant_capability_controls(organization_id_str))


async def fanout_capability_control_expiry() -> int:
    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        organization_ids = (await db.scalars(select(Organization.id))).all()
        global_flag_rows = (await db.scalars(select(PlatformFlagOverride).where(PlatformFlagOverride.organization_id.is_(None), PlatformFlagOverride.status == "APPROVED", PlatformFlagOverride.expires_at.is_not(None), PlatformFlagOverride.expires_at <= now).with_for_update())).all()
        expired_definitions = (await db.scalars(select(PlatformFlagDefinition).where(PlatformFlagDefinition.is_active.is_(True), PlatformFlagDefinition.expires_at.is_not(None), PlatformFlagDefinition.expires_at <= now).with_for_update())).all()
        for row in global_flag_rows:
            row.status = "EXPIRED"
            row.version += 1
            db.add(AuditLog(organization_id=None, actor_user_id=None, actor_role="SYSTEM", resource_type="platform_flag_override", resource_id=row.id, action_type="PLATFORM_FLAG_OVERRIDE_EXPIRED", old_state={"status": "APPROVED"}, new_state={"status": "EXPIRED", "version": row.version}, is_sensitive=True, occurred_at=now))
        for row in expired_definitions:
            row.is_active = False
            row.version += 1
            db.add(AuditLog(organization_id=None, actor_user_id=None, actor_role="SYSTEM", resource_type="platform_flag", resource_id=row.id, action_type="PLATFORM_FLAG_DEFINITION_EXPIRED", old_state={"is_active": True}, new_state={"is_active": False, "version": row.version}, is_sensitive=True, occurred_at=now))
        await db.commit()
    for organization_id in organization_ids:
        expire_tenant_capability_controls_task.delay(str(organization_id))
    return len(organization_ids)


@celery_app.task(name="app.tasks.organization_console_tasks.fanout_capability_control_expiry")
def fanout_capability_control_expiry_task() -> int:
    from app.tasks.platform_tasks import _run_async
    return _run_async(fanout_capability_control_expiry())


async def execute_organization_lifecycle_job(organization_id_str: str, job_id_str: str) -> dict:
    organization_id = parse_required_organization_id(organization_id_str)
    job_id = uuid.UUID(job_id_str)
    now = datetime.now(timezone.utc)
    async with tenant_job_session(organization_id) as db:
        job = await db.scalar(select(OrganizationLifecycleJob).where(
            OrganizationLifecycleJob.id == job_id,
            OrganizationLifecycleJob.organization_id == organization_id,
        ).with_for_update())
        if not job:
            return {"status": "NOT_FOUND"}
        if job.status not in {"PENDING", "RETRY_PENDING"}:
            return {"status": job.status}
        job.status = "RUNNING"
        job.started_at = now
        job.attempt_count += 1
        job.version += 1
        await db.commit()
    try:
        async with tenant_job_session(organization_id) as db:
            job = await db.scalar(select(OrganizationLifecycleJob).where(
                OrganizationLifecycleJob.id == job_id,
                OrganizationLifecycleJob.organization_id == organization_id,
            ).with_for_update())
            if not job or job.status != "RUNNING":
                return {"status": job.status if job else "NOT_FOUND"}
            result = await OrganizationLifecycleService.execute(db, job)
            completed_at = datetime.now(timezone.utc)
            job.status = "COMPLETED"
            job.result_metadata = result
            job.failure_reason = None
            job.completed_at = completed_at
            job.version += 1
            db.add(AuditLog(
                organization_id=organization_id, actor_user_id=None, actor_role="SYSTEM",
                resource_type="organization_lifecycle_job", resource_id=job.id,
                action_type="ORGANIZATION_LIFECYCLE_COMPLETED",
                old_state={"status": "RUNNING"}, new_state={"status": "COMPLETED"},
                change_diff={"job_type": job.job_type, "attempt": job.attempt_count},
                is_sensitive=True, occurred_at=completed_at,
            ))
            await db.commit()
            return {"status": "COMPLETED", "result": result}
    except Exception as exc:
        async with tenant_job_session(organization_id) as db:
            job = await db.scalar(select(OrganizationLifecycleJob).where(
                OrganizationLifecycleJob.id == job_id,
                OrganizationLifecycleJob.organization_id == organization_id,
            ).with_for_update())
            if job:
                failed_at = datetime.now(timezone.utc)
                job.status = "FAILED"
                job.failure_reason = str(exc)[:2000]
                job.version += 1
                db.add(AuditLog(
                    organization_id=organization_id, actor_user_id=None, actor_role="SYSTEM",
                    resource_type="organization_lifecycle_job", resource_id=job.id,
                    action_type="ORGANIZATION_LIFECYCLE_FAILED",
                    old_state={"status": "RUNNING"}, new_state={"status": "FAILED"},
                    change_diff={"job_type": job.job_type, "attempt": job.attempt_count, "error_type": type(exc).__name__},
                    is_sensitive=True, occurred_at=failed_at,
                ))
                await db.commit()
        raise


@celery_app.task(name="app.tasks.organization_console_tasks.execute_lifecycle_job")
def execute_lifecycle_job(organization_id_str: str, job_id_str: str) -> dict:
    from app.tasks.platform_tasks import _run_async
    return _run_async(execute_organization_lifecycle_job(organization_id_str, job_id_str))


async def reconcile_organization_usage(organization_id_str: str) -> dict:
    """Reconcile every event inside one explicit tenant boundary."""
    organization_id = parse_required_organization_id(organization_id_str)
    async with tenant_job_session(organization_id) as db:
        event_ids = (await db.scalars(select(Event.id).where(
            Event.organization_id == organization_id,
            Event.deleted_at.is_(None),
        ))).all()
        reconciled = 0
        drifted = 0
        for event_id in event_ids:
            rows = await MeteringService.reconcile_event(db, organization_id, event_id)
            reconciled += len(rows)
            drifted += sum(1 for row in rows if row.status != "MATCHED")
        await db.commit()
    return {"organization_id": str(organization_id), "events": len(event_ids), "metrics": reconciled, "drifted": drifted}


@celery_app.task(name="app.tasks.organization_console_tasks.reconcile_organization_usage")
def reconcile_organization_usage_task(organization_id_str: str) -> dict:
    from app.tasks.platform_tasks import _run_async
    return _run_async(reconcile_organization_usage(organization_id_str))


async def fanout_nightly_usage_reconciliation() -> int:
    """Control-plane fan-out; tenant data is never processed in this session."""
    async with AsyncSessionLocal() as db:
        organization_ids = (await db.scalars(select(Organization.id).where(Organization.is_active.is_(True)))).all()
    for organization_id in organization_ids:
        reconcile_organization_usage_task.delay(str(organization_id))
    return len(organization_ids)


@celery_app.task(name="app.tasks.organization_console_tasks.fanout_nightly_usage_reconciliation")
def fanout_nightly_usage_reconciliation_task() -> int:
    from app.tasks.platform_tasks import _run_async
    return _run_async(fanout_nightly_usage_reconciliation())
