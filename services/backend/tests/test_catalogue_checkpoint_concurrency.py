"""Independent PostgreSQL transactions, not sequential duplicate simulations."""
import asyncio
from contextlib import asynccontextmanager
from contextvars import ContextVar
import uuid

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash
from app.modules.identity.models.user import User
from app.modules.rbac.services.access_foundation import lock_revision
from app.modules.registration.models.catalogue_reconciliation import CatalogueReconciliationRun as Run, CatalogueReconciliationWork as Work
from app.modules.registration.services import catalogue_work as service
from app.tasks import catalogue_reconciliation as worker
from tests.test_catalogue_retirement_concurrency import race_fixture, wait_for_blocker


@pytest_asyncio.fixture
async def checkpoint(committed_session_factory, race_fixture, monkeypatch):
    data = {**race_fixture, "run_id": uuid.uuid4(), "work_id": uuid.uuid4()}
    selected = ContextVar("checkpoint_connection")

    @asynccontextmanager
    async def sessions():
        yield selected.get()

    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    async with committed_session_factory() as db:
        db.add(Run(id=data["run_id"], organization_id=data["platform_id"], actor_user_id=data["actor_id"],
            reason="Independent durable checkpoint concurrency", status="DISPATCHED", enumeration_complete=True))
        await db.flush()
        db.add(Work(id=data["work_id"], run_id=data["run_id"], organization_id=data["platform_id"],
            target_organization_id=data["platform_id"], kind="GLOBAL", stage="GLOBAL_CATEGORY"))
        await db.commit()
    try:
        yield data, selected
    finally:
        # Exact generated test run only; runtime cannot delete retained evidence.
        async with committed_session_factory() as db:
            await db.execute(delete(AuditLog).where(AuditLog.resource_id == data["work_id"]))
            await db.execute(delete(Work).where(Work.id == data["work_id"]))
            await db.execute(delete(Run).where(Run.id == data["run_id"]))
            await db.commit()


async def claim(db, selected, data):
    token = selected.set(db)
    try:
        return await service.claim_pages(data["platform_id"], data["work_id"])
    finally:
        selected.reset(token)


async def execute(db, selected, message):
    token = selected.set(db)
    try:
        return await service.execute_page(*message)
    finally:
        selected.reset(token)


@pytest.mark.asyncio
async def test_two_claimers_skip_uncommitted_checkpoint_claim(committed_session_factory, checkpoint):
    data, selected = checkpoint
    async with committed_session_factory() as outer, committed_session_factory() as second:
        connection = await outer.connection()
        async with AsyncSession(bind=connection, expire_on_commit=False,
                join_transaction_mode="create_savepoint") as first:
            assert await claim(first, selected, data) == [(data["work_id"], data["platform_id"], 1)]
            # The first commit released its savepoint, not the independent outer
            # transaction. The old due generation is visible but still locked.
            assert await claim(second, selected, data) == []
            await first.close()
            await outer.commit()
    async with committed_session_factory() as observer:
        work = await observer.get(Work, data["work_id"])
        assert work.generation == work.dispatch_attempts == 1 and work.pages_completed == 0


@pytest.mark.asyncio
async def test_parallel_duplicate_waits_then_cannot_consume_next_page(committed_session_factory, checkpoint):
    data, selected = checkpoint
    async with committed_session_factory() as db:
        message, = await claim(db, selected, data)
    task = None
    try:
        async with committed_session_factory() as outer, committed_session_factory() as second:
            connection = await outer.connection()
            async with AsyncSession(bind=connection, expire_on_commit=False,
                    join_transaction_mode="create_savepoint") as first:
                assert (await execute(first, selected, message))["pages_completed"] == 1
                pid = await second.scalar(text("SELECT pg_backend_pid()"))
                task = asyncio.create_task(execute(second, selected, message))
                await wait_for_blocker(first, pid, task)
                await first.close()
                await outer.commit()
                assert await asyncio.wait_for(task, 15) == {"status": "STALE_OR_UNAVAILABLE"}
        async with committed_session_factory() as observer:
            work = await observer.get(Work, data["work_id"])
            assert work.pages_completed == 1 and work.stage == "GLOBAL_TEMPLATE" and work.generation == 2
            audits = list((await observer.scalars(select(AuditLog).where(
                AuditLog.resource_id == work.id))).all())
            assert len(audits) == 1 and audits[0].row_hash == compute_audit_hash(audits[0])
    finally:
        if task and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)


@pytest.mark.asyncio
@pytest.mark.parametrize("worker_first", [False, True])
async def test_platform_revocation_orders_against_page_checkpoint(
        committed_session_factory, checkpoint, worker_first):
    data, selected = checkpoint
    async with committed_session_factory() as db:
        message, = await claim(db, selected, data)
    task = None

    async def revoke(db):
        async with TenantContextGuard.scoped(db, data["platform_id"]):
            revision = await lock_revision(db, data["platform_id"], write=True)
            actor = await db.get(User, data["actor_id"])
            actor.platform_role = None
            revision.revision += 1
            await db.commit()

    try:
        async with committed_session_factory() as outer, committed_session_factory() as second:
            connection = await outer.connection()
            async with AsyncSession(bind=connection, expire_on_commit=False,
                    join_transaction_mode="create_savepoint") as first:
                if worker_first:
                    assert (await execute(first, selected, message))["pages_completed"] == 1
                    pid = await second.scalar(text("SELECT pg_backend_pid()"))
                    task = asyncio.create_task(revoke(second))
                else:
                    await revoke(first)
                    pid = await second.scalar(text("SELECT pg_backend_pid()"))
                    task = asyncio.create_task(execute(second, selected, message))
                await wait_for_blocker(first, pid, task)
                await first.close()
                await outer.commit()
                if worker_first:
                    await asyncio.wait_for(task, 15)
                else:
                    with pytest.raises(HTTPException) as denied:
                        await asyncio.wait_for(task, 15)
                    assert denied.value.status_code == 403
        async with committed_session_factory() as observer:
            work = await observer.get(Work, data["work_id"])
            assert work.pages_completed == int(worker_first)
            assert work.status == ("PENDING" if worker_first else "FAILED")
    finally:
        if task and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
