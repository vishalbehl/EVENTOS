"""Actual restricted-login worker ordering with approved archive/restore jobs."""
import asyncio
from contextlib import asynccontextmanager
from contextvars import ContextVar
import json
from pathlib import Path
import re
import traceback
import uuid

from sqlalchemy import func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings


async def run(fixture_path):
    fixture = json.loads(fixture_path.read_text())
    url = make_url(settings.DATABASE_URL_ASYNC)
    root = Path(__file__).parents[1]
    if (settings.is_production or url.host not in {"localhost", "127.0.0.1"}
            or url.database != fixture["database"] or url.username != fixture["login"]
            or not re.fullmatch(r"category_a_restore_20261021_[0-9a-f]{12}", url.database or "")
            or not re.fullmatch(r"category_a_checkpoint_[0-9a-f]{12}", url.username or "")
            or fixture_path.resolve().parent != (root / "test-results").resolve()):
        raise RuntimeError("Only an isolated local restricted-login checkpoint fixture is permitted")
    import app.models
    from app.database import AsyncSessionLocal, async_engine
    from app.core.database_security import inspect_database_security
    from app.core.tenant_context import TenantContextGuard
    from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash
    from app.modules.identity.models.user import User
    from app.modules.platform.models.organization_console import OrganizationLifecycleJob
    from app.modules.platform.services.lifecycle_service import OrganizationLifecycleService
    from app.modules.platform.application.lifecycle_commands import OrganizationLifecycleCommandService
    from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation as Evidence
    from app.tasks import catalogue_reconciliation as worker, tenant_job_scope, organization_console_tasks as lifecycle
    platform, owner, actor_id, approver_id = [uuid.UUID(fixture[key]) for key in ("platform", "owner", "actor", "revoker")]
    assert actor_id != approver_id
    selected = ContextVar("restricted_target_probe_connection")
    original_worker, original_jobs = worker.AsyncSessionLocal, tenant_job_scope.AsyncSessionLocal
    tasks = []
    result = dict(status="FAILED", stage="runtime_preflight", database=url.database, cases=[],
        actual_lifecycle_jobs=[], staging_acceptance="NOT_RUN", production_acceptance="NOT_RUN")

    @asynccontextmanager
    async def sessions():
        db = selected.get()
        try:
            yield db
        except Exception:
            await db.rollback()
            raise

    async def create_approved_job(kind):
        async with AsyncSessionLocal() as db:
            async with TenantContextGuard.scoped(db, platform):
                actor = await db.get(User, actor_id)
                approver = await db.get(User, approver_id)
            async with TenantContextGuard.scoped(db, owner):
                manifest, checksum = await OrganizationLifecycleService.build_manifest(db, owner, kind, None)
                job = await OrganizationLifecycleCommandService(db).create(organization_id=owner, actor=actor,
                    target_organization_id=None, job_type=kind, manifest=manifest, manifest_checksum=checksum,
                    reason="Approved isolated target lifecycle concurrency rehearsal",
                    idempotency_key=f"runtime-{kind.lower()}-{uuid.uuid4().hex}", requires_approval=True,
                    expected_version=manifest["organization_version"])
                assert job.status == "AWAITING_APPROVAL"
                job_id, version = job.id, int(job.version)
                approved = await OrganizationLifecycleCommandService(db).decide(organization_id=owner,
                    job_id=job_id, actor=approver, decision="APPROVED", reason="Separate fixture operator approved lifecycle test",
                    version=version, idempotency_key=f"runtime-approve-{uuid.uuid4().hex}")
                assert approved.status == "PENDING"
                return job_id

    async def execute_job(db, job_id):
        token = selected.set(db)
        try:
            outcome = await lifecycle.execute_organization_lifecycle_job(str(owner), str(job_id))
            assert outcome["status"] == "COMPLETED"
            return outcome
        finally:
            selected.reset(token)

    async def page(db):
        token = selected.set(db)
        try:
            return await worker._process_page(owner, actor_id, "FORM_CATEGORY", None)
        finally:
            selected.reset(token)

    async def evidence_count(db):
        async with TenantContextGuard.scoped(db, owner):
            return await db.scalar(select(func.count()).select_from(Evidence).where(
                Evidence.organization_id == owner, Evidence.resource_type == "FORM_CATEGORY"))

    async def verify_job(job_id, kind):
        async with AsyncSessionLocal() as db:
            async with TenantContextGuard.scoped(db, owner):
                job = await db.get(OrganizationLifecycleJob, job_id)
                assert job.status == "COMPLETED" and job.attempt_count == 1
                assert job.requested_by == actor_id and len(job.approvals) == 1
                assert job.approvals[0]["actor_id"] == str(approver_id)
                audits = list((await db.scalars(select(AuditLog).where(
                    AuditLog.organization_id == owner, AuditLog.resource_id == job_id))).all())
                assert {row.action_type for row in audits} == {
                    f"ORGANIZATION_{kind}_REQUESTED", "ORGANIZATION_LIFECYCLE_APPROVED", "ORGANIZATION_LIFECYCLE_COMPLETED"}
                assert len(audits) == 3 and all(row.row_hash == compute_audit_hash(row) for row in audits)
                result["actual_lifecycle_jobs"].append(dict(kind=kind, job_id=str(job_id), status="COMPLETED",
                    separate_approval=True, hash_valid_audits=3, attempts=1))

    try:
        async with AsyncSessionLocal() as db:
            security = await inspect_database_security(db)
            assert security.runtime_role_is_safe and not security.missing_canary_policies
            assert await db.scalar(text("SELECT current_user")) == fixture["login"]
            result.update(actual_restricted_login=True, runtime_role_is_safe=True, missing_canary_policies=[])
        # Preserve the production scope/transaction implementations. Only choose
        # the independently held real connection, so command commits use savepoints.
        worker.AsyncSessionLocal = tenant_job_scope.AsyncSessionLocal = sessions
        for worker_first in (False, True):
            result["stage"] = "approve_archive"
            job_id = await create_approved_job("ARCHIVE")
            async with AsyncSessionLocal() as observer:
                before = await evidence_count(observer)
            async with AsyncSessionLocal() as outer, AsyncSessionLocal() as second:
                connection = await outer.connection()
                async with AsyncSession(bind=connection, expire_on_commit=False,
                        join_transaction_mode="create_savepoint") as first:
                    result["stage"] = "worker_first" if worker_first else "archive_first"
                    if worker_first:
                        assert (await page(first))["checked"] == 100
                        pid = await second.scalar(text("SELECT pg_backend_pid()"))
                        task = asyncio.create_task(execute_job(second, job_id))
                    else:
                        await execute_job(first, job_id)
                        pid = await second.scalar(text("SELECT pg_backend_pid()"))
                        task = asyncio.create_task(page(second))
                    tasks.append(task)
                    async def blocked():
                        while not await first.scalar(text("SELECT cardinality(pg_blocking_pids(:pid))>0"), {"pid": pid}):
                            if task.done():
                                task.result()
                                raise AssertionError("Target lifecycle competitor did not wait")
                            await asyncio.sleep(0.02)
                    await asyncio.wait_for(blocked(), 10)
                    await first.close()
                    await outer.commit()
                    if worker_first:
                        await asyncio.wait_for(task, 15)
                    else:
                        try:
                            await asyncio.wait_for(task, 15)
                        except PermissionError:
                            pass
                        else:
                            raise AssertionError("Archived target admitted a page")
                        await second.rollback()
            result["stage"] = "verify_committed_archive"
            async with AsyncSessionLocal() as observer:
                try:
                    await page(observer)
                except PermissionError:
                    pass
                else:
                    raise AssertionError("Later page admitted an archived target")
                await observer.rollback()
                assert await evidence_count(observer) == before + (100 if worker_first else 0)
            await verify_job(job_id, "ARCHIVE")
            result["cases"].append(dict(worker_first=worker_first, outcome="PASSED", blocked_on_revision=True,
                legacy_page_evidence_delta=100 if worker_first else 0, later_page_denied=True))
            if not worker_first:
                result["stage"] = "approve_and_execute_restore"
                restore_id = await create_approved_job("RESTORE")
                async with AsyncSessionLocal() as db:
                    restored = await execute_job(db, restore_id)
                    assert restored["result"]["organization_active"] is True
                await verify_job(restore_id, "RESTORE")
        result.update(status="PASSED", stage="completed", default_platform_customer_flow="NOT_RUN",
            broker_publications="NOT_RUN", provider_io="NOT_RUN")
    except Exception as error:
        result["error_type"] = type(error).__name__
        result["project_frames"] = [dict(file=str(Path(frame.filename).relative_to(root)), line=frame.lineno, function=frame.name)
            for frame in traceback.extract_tb(error.__traceback__) if Path(frame.filename).is_relative_to(root)
            and ".venv" not in Path(frame.filename).relative_to(root).parts][-8:]
        result["sqlstate"] = getattr(getattr(error, "orig", None), "sqlstate", None)
        if isinstance(getattr(error, "detail", None), dict):
            result["denial_code"] = error.detail.get("code")
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        worker.AsyncSessionLocal, tenant_job_scope.AsyncSessionLocal = original_worker, original_jobs
        await async_engine.dispose()
        from app.redis import close_redis
        await close_redis()
        with fixture_path.with_name(fixture_path.stem + "-runtime.json").open("x", encoding="utf-8") as output:
            json.dump(result, output, indent=2)
        print(json.dumps(dict(status=result["status"], stage=result["stage"])))
    return 0 if result["status"] == "PASSED" else 1
