"""Durable continuation/outbox for the existing catalogue page processors."""
from datetime import datetime, timedelta, timezone
import uuid

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import aliased

from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.models.organization import Organization
from app.modules.registration.models.catalogue_reconciliation import CatalogueReconciliationRun as Run, CatalogueReconciliationWork as Work
from app.modules.rbac.services.access_foundation import lock_revision

MAX_ATTEMPTS = 30


def _worker():
    from app.tasks import catalogue_reconciliation
    return catalogue_reconciliation


def _audit(db, work, actor, action, state):
    db.add(AuditLog(organization_id=work.organization_id, actor_user_id=actor,
        actor_role="SYSTEM", resource_type="catalogue_reconciliation_work", resource_id=work.id,
        correlation_id=work.run_id, is_sensitive=True, action_type=action, new_state=state))


async def run_cursor(run_id, actor_id, attempt):
    worker = _worker()
    async with worker.AsyncSessionLocal() as db:
        owner = await worker._authorise_platform_actor(db, actor_id)
        async with TenantContextGuard.scoped(db, owner):
            run = await db.get(Run, run_id)
            if run is None or run.actor_user_id != actor_id or run.dispatch_attempts != attempt:
                raise PermissionError("Reconciliation run generation unavailable")
            return run.enumeration_cursor


async def stage_streams(run_id, actor_id, attempt, input_cursor, owner_ids, *, enumeration_complete=False):
    """Persist stream creation and enumeration cursor atomically, before publish."""
    if not isinstance(owner_ids, tuple) or len(owner_ids) > 100 or len(set(owner_ids)) != len(owner_ids):
        raise ValueError("Invalid bounded reconciliation cohort page")
    worker = _worker()
    async with worker.AsyncSessionLocal() as db:
        platform = await worker._authorise_platform_actor(db, actor_id)
        async with TenantContextGuard.scoped(db, platform):
            await lock_revision(db, platform, write=False)
            await worker._authorise_platform_actor(db, actor_id)
            run = await db.scalar(select(Run).where(Run.id == run_id).with_for_update())
            if (run is None or run.actor_user_id != actor_id or run.status != "RUNNING"
                    or run.dispatch_attempts != attempt or run.enumeration_cursor != input_cursor):
                raise PermissionError("Reconciliation cohort checkpoint changed")
            if owner_ids:
                eligible = set((await db.scalars(select(Organization.id).where(Organization.id.in_(owner_ids),
                    Organization.is_platform_org.is_(False), Organization.archived_at.is_(None)))).all())
                if eligible != set(owner_ids):
                    raise ValueError("Reconciliation cohort changed lifecycle")
                if tuple(sorted(owner_ids)) != owner_ids or input_cursor is not None and owner_ids[0] <= input_cursor:
                    raise ValueError("Reconciliation cursor must advance monotonically")
            values = [dict(id=uuid.uuid4(), run_id=run_id, organization_id=platform,
                target_organization_id=target, kind="TENANT", stage="FORM_CATEGORY") for target in owner_ids]
            if input_cursor is None:
                values.append(dict(id=uuid.uuid4(), run_id=run_id, organization_id=platform,
                    target_organization_id=platform, kind="GLOBAL", stage="GLOBAL_CATEGORY"))
            if values:
                await db.execute(insert(Work).values(values).on_conflict_do_nothing(constraint="uq_catalogue_work_stream"))
            if owner_ids:
                run.enumeration_cursor = owner_ids[-1]
            run.enumeration_complete = enumeration_complete
            await db.commit()


async def claim_pages(platform_id=None, work_id=None):
    worker = _worker()
    messages = []
    processed = 0
    async with worker.AsyncSessionLocal() as db:
        platform_query = select(Organization.id).where(Organization.is_platform_org.is_(True),
            Organization.is_active.is_(True), Organization.archived_at.is_(None), Organization.suspended_at.is_(None))
        if platform_id is not None:
            platform_query = platform_query.where(Organization.id == platform_id)
        platforms = list((await db.scalars(platform_query.order_by(Organization.id))).all())
        for platform in platforms:
            if processed >= 100:
                break
            async with TenantContextGuard.scoped(db, platform):
                now = await db.scalar(select(func.clock_timestamp()))
                global_stream = aliased(Work)
                statement = (select(Work, Run.actor_user_id, Run.status, global_stream.status)
                    .join(Run, Run.id == Work.run_id)
                    .join(global_stream, (global_stream.run_id == Work.run_id) & (global_stream.kind == "GLOBAL"))
                    .where(Work.status.in_(("PENDING", "RUNNING")), Work.next_dispatch_at <= now,
                        (Work.kind == "GLOBAL") | global_stream.status.in_(("COMPLETED", "FAILED")))
                    .order_by(Work.next_dispatch_at, Work.id).limit(100 - processed)
                    .with_for_update(of=Work, skip_locked=True))
                if work_id is not None:
                    statement = statement.where(Work.id == work_id)
                rows = list((await db.execute(statement)).all())
                for work, actor_id, run_status, global_status in rows:
                    processed += 1
                    if actor_id is None or run_status == "FAILED" or work.dispatch_attempts >= MAX_ATTEMPTS or global_status == "FAILED":
                        work.status, work.failure_code = "FAILED", "RUN_OR_RETRY_UNAVAILABLE"
                        _audit(db, work, actor_id,
                            "CATALOGUE_PAGE_FAILED", {"code": work.failure_code, "generation": work.generation})
                        continue
                    work.generation += 1
                    work.dispatch_attempts += 1
                    work.status = "PENDING"
                    work.next_dispatch_at = now + timedelta(seconds=min(900, 30 * 2 ** min(work.dispatch_attempts - 1, 5)))
                    messages.append((work.id, platform, work.generation))
                await db.commit()
    return messages


async def _fail_page(work_id, platform, generation, code):
    worker = _worker()
    async with worker.AsyncSessionLocal() as db:
        async with TenantContextGuard.scoped(db, platform):
            work = await db.scalar(select(Work).where(Work.id == work_id).with_for_update())
            if work is None or work.generation != generation or work.status not in {"PENDING", "RUNNING"}:
                return
            run = await db.get(Run, work.run_id)
            work.status, work.failure_code = "FAILED", code
            _audit(db, work, run.actor_user_id if run else None, "CATALOGUE_PAGE_FAILED",
                {"code": code, "generation": generation})
            await db.commit()


async def execute_page(work_id, platform, generation):
    """One transaction owns page data, immutable evidence, cursor and audit.

    A process crash before commit leaves the old cursor eligible for recovery.
    A crash after commit leaves the next cursor durably queued, not in memory.
    """
    if not isinstance(work_id, uuid.UUID) or not isinstance(platform, uuid.UUID) or type(generation) is not int or generation < 1:
        raise ValueError("Invalid reconciliation work selector")
    worker = _worker()
    try:
        async with worker.AsyncSessionLocal() as db:
            async with TenantContextGuard.scoped(db, platform):
                work = await db.scalar(select(Work).where(Work.id == work_id).with_for_update())
                if work is None or work.generation != generation or work.status not in {"PENDING", "RUNNING"}:
                    return {"status": "STALE_OR_UNAVAILABLE"}
                # Canonical role/lifecycle changes take conflicting revision
                # locks. Acquire these in deterministic order before catalogue locks.
                for owner in sorted({platform, work.target_organization_id}):
                    async with TenantContextGuard.scoped(db, owner):
                        await lock_revision(db, owner, write=False)
                run = await db.scalar(select(Run).where(Run.id == work.run_id).execution_options(populate_existing=True))
                if run is None or run.actor_user_id is None or run.status == "FAILED":
                    raise PermissionError("Reconciliation run no longer available")
                if await worker._authorise_platform_actor(db, run.actor_user_id) != platform:
                    raise PermissionError("Reconciliation actor owner changed")
                if work.kind == "TENANT":
                    await worker._require_tenant_target(db, work.target_organization_id)
                stage, cursor = work.stage, work.cursor
                if stage == "GLOBAL_CATEGORY":
                    result = await worker._global_category_page(run.actor_user_id, cursor, session=db, commit=False)
                elif stage == "GLOBAL_TEMPLATE":
                    result = await worker._global_template_page(run.actor_user_id, cursor, session=db, commit=False)
                else:
                    async with TenantContextGuard.scoped(db, work.target_organization_id):
                        result = await worker._process_page_with_session(db, work.target_organization_id,
                            run.actor_user_id, stage, cursor, commit=False)
                next_cursor = result["next_cursor"]
                if next_cursor is not None:
                    advanced = uuid.UUID(str(next_cursor))
                    if cursor is not None and advanced <= cursor:
                        raise ValueError("Reconciliation page did not advance")
                    work.cursor = advanced
                else:
                    if work.coverage_version not in (1, 2):
                        raise ValueError("Unsupported reconciliation coverage")
                    stages = (("GLOBAL_CATEGORY", "GLOBAL_TEMPLATE") if work.kind == "GLOBAL"
                        else worker._LEGACY_STAGES if work.coverage_version == 1 else worker._STAGES)
                    index = stages.index(stage) + 1
                    if index == len(stages):
                        work.status = "COMPLETED"
                    else:
                        work.stage, work.cursor = stages[index], None
                if work.status != "COMPLETED":
                    work.status = "PENDING"
                work.dispatch_attempts = 0
                # Consume this message generation in the checkpoint transaction;
                # a duplicate delivery must not execute the next cursor early.
                work.generation += 1
                work.failure_code = None
                work.next_dispatch_at = datetime.now(timezone.utc)
                work.pages_completed += 1
                work.checked_count += result["checked"]
                work.blocked_count += result["blocked"]
                _audit(db, work, run.actor_user_id, "CATALOGUE_PAGE_CHECKPOINT_COMMITTED",
                    {"generation": generation, "stage": stage, "coverage_version": work.coverage_version,
                        "target_organization_id": str(work.target_organization_id), "pages_completed": work.pages_completed,
                        "status": work.status, "checked": result["checked"], "blocked": result["blocked"]})
                await db.commit()
                return {"status": work.status, "pages_completed": work.pages_completed}
    except Exception as exc:
        from app.core.task_policy import is_retryable
        if not is_retryable(exc):
            await _fail_page(work_id, platform, generation, "PAGE_AUTHORITY_OR_INPUT_REJECTED")
        raise


async def progress(db, run):
    rows = (await db.execute(select(Work.status, Work.kind, func.count(Work.id),
        func.sum(Work.pages_completed), func.sum(Work.checked_count), func.sum(Work.blocked_count),
        func.min(Work.coverage_version))
        .where(Work.run_id == run.id).group_by(Work.status, Work.kind))).all()
    counts = {state: sum(int(row[2]) for row in rows if row[0] == state)
        for state in ("PENDING", "RUNNING", "COMPLETED", "FAILED")}
    total = sum(counts.values())
    global_count = sum(int(row[2]) for row in rows if row[1] == "GLOBAL")
    status = ("FAILED" if run.status == "FAILED" or counts["FAILED"] else
        "LEGACY_UNTRACKED" if run.status == "DISPATCHED" and (global_count != 1 or not run.enumeration_complete
            or any(row[6] != 2 for row in rows)) else
        "COMPLETED" if run.status == "DISPATCHED" and total and counts["COMPLETED"] == total else "PENDING")
    return dict(completion_status=status, streams_total=total, streams_completed=counts["COMPLETED"],
        pages_completed=sum(int(row[3] or 0) for row in rows), checked_count=sum(int(row[4] or 0) for row in rows),
        blocked_count=sum(int(row[5] or 0) for row in rows))
