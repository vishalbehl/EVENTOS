"""Real PostgreSQL leases and fencing for whole-cohort fanout recovery."""
from contextlib import asynccontextmanager
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone
import uuid

import pytest
from sqlalchemy import delete, event as sqlalchemy_event, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash
from app.modules.registration.models.catalogue_reconciliation import CatalogueReconciliationRun
from app.tasks import catalogue_reconciliation as worker
from tests.test_catalogue_retirement_concurrency import race_fixture


def sessions_for(db, monkeypatch):
    @asynccontextmanager
    async def sessions():
        yield db
    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)


@pytest.mark.asyncio
@pytest.mark.parametrize("expected", [None, 1])
@pytest.mark.parametrize("action", ["start", "complete", "fail"])
async def test_stale_or_unversioned_fanout_cannot_overwrite_recovered_generation(db, super_admin, monkeypatch, expected, action):
    row = CatalogueReconciliationRun(organization_id=super_admin.organization_id,
        actor_user_id=super_admin.id, reason="Recovered generation fencing acceptance",
        dispatch_attempts=2, status="PENDING")
    db.add(row)
    await db.commit()
    sessions_for(db, monkeypatch)
    if action == "start":
        assert await worker._mark_run_started(row.id, super_admin.id, expected) is None
    elif action == "complete":
        await worker._mark_run_dispatched(row.id, super_admin.id, expected)
    else:
        await worker._mark_run_failed(row.id, super_admin.id, "OLD_WORKER_FAILURE", expected)
    await db.refresh(row)
    assert row.status == "PENDING" and row.dispatch_attempts == 2
    assert row.started_at is None and row.dispatched_at is None and row.failure_code is None
    assert await db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.resource_id == row.id)) == 0
    assert await worker._mark_run_started(row.id, super_admin.id, 2) == 2
    await worker._mark_run_dispatched(row.id, super_admin.id, 2)
    await worker._mark_run_dispatched(row.id, super_admin.id, 2)
    await db.refresh(row)
    assert row.status == "DISPATCHED" and row.dispatched_at is not None
    audits = list((await db.scalars(select(AuditLog).where(AuditLog.resource_id == row.id))).all())
    assert len(audits) == 1 and audits[0].row_hash == compute_audit_hash(audits[0])


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["actor_missing", "exhausted"])
async def test_expired_running_generation_failure_is_terminal_and_audited(db, super_admin, monkeypatch, failure):
    row = CatalogueReconciliationRun(organization_id=super_admin.organization_id,
        actor_user_id=None if failure == "actor_missing" else super_admin.id,
        reason="Bounded crash recovery cannot retry forever", status="RUNNING",
        dispatch_attempts=30 if failure == "exhausted" else 1,
        next_dispatch_at=datetime.now(timezone.utc) - timedelta(seconds=1))
    db.add(row)
    await db.commit()
    sessions_for(db, monkeypatch)
    assert await worker._claim_reconciliation_runs() == []
    assert await worker._claim_reconciliation_runs() == []
    await db.refresh(row)
    assert row.status == "FAILED" and row.failure_code == (
        "ACTOR_UNAVAILABLE" if failure == "actor_missing" else "DISPATCH_ATTEMPTS_EXHAUSTED")
    audits = list((await db.scalars(select(AuditLog).where(AuditLog.resource_id == row.id))).all())
    assert len(audits) == 1 and audits[0].row_hash == compute_audit_hash(audits[0])


@pytest.mark.asyncio
async def test_reclaim_audit_failure_rolls_back_generation_and_can_recover(db, super_admin, monkeypatch):
    actor_id = super_admin.id
    row = CatalogueReconciliationRun(organization_id=super_admin.organization_id,
        actor_user_id=actor_id, reason="Mandatory reclaim audit rollback acceptance",
        status="RUNNING", dispatch_attempts=1,
        next_dispatch_at=datetime.now(timezone.utc) - timedelta(seconds=1))
    db.add(row)
    await db.commit()
    run_id, deadline = row.id, row.next_dispatch_at
    sessions_for(db, monkeypatch)

    def reject_reclaim_audit(mapper, connection, target):
        if target.action_type == "CATALOGUE_RECONCILIATION_DISPATCH_RECLAIMED":
            raise RuntimeError("Mandatory reclaim audit unavailable")

    sqlalchemy_event.listen(AuditLog, "before_insert", reject_reclaim_audit)
    try:
        with pytest.raises(RuntimeError, match="Mandatory reclaim audit unavailable"):
            await worker._claim_reconciliation_runs()
        await db.rollback()
    finally:
        sqlalchemy_event.remove(AuditLog, "before_insert", reject_reclaim_audit)
    await db.refresh(row)
    assert row.status == "RUNNING" and row.dispatch_attempts == 1 and row.next_dispatch_at == deadline
    assert await db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.resource_id == run_id)) == 0
    assert await worker._claim_reconciliation_runs() == [(run_id, actor_id, 2)]


@pytest.mark.asyncio
async def test_independent_recovery_claimers_do_not_duplicate_running_reclaim(
        committed_session_factory, race_fixture, monkeypatch):
    data, run_id = race_fixture, uuid.uuid4()
    async with committed_session_factory() as db:
        db.add(CatalogueReconciliationRun(id=run_id, organization_id=data["platform_id"],
            actor_user_id=data["actor_id"], reason="Independent recovery claims of one expired fanout",
            status="RUNNING", dispatch_attempts=1,
            next_dispatch_at=datetime.now(timezone.utc) - timedelta(seconds=1)))
        await db.commit()
    selected = ContextVar("selected_reconciliation_test_session")

    @asynccontextmanager
    async def sessions():
        yield selected.get()

    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    try:
        async with committed_session_factory() as outer, committed_session_factory() as second:
            connection = await outer.connection()
            async with AsyncSession(bind=connection, expire_on_commit=False,
                    join_transaction_mode="create_savepoint") as first:
                token = selected.set(first)
                try:
                    assert await worker._claim_reconciliation_runs() == [(run_id, data["actor_id"], 2)]
                finally:
                    selected.reset(token)
                async with TenantContextGuard.scoped(second, data["platform_id"]):
                    visible = await second.get(CatalogueReconciliationRun, run_id)
                    # First claim is not yet committed: the second connection
                    # still sees the old due RUNNING row, but SKIP LOCKED skips it.
                    assert visible.status == "RUNNING" and visible.dispatch_attempts == 1
                    token = selected.set(second)
                    try:
                        assert await worker._claim_reconciliation_runs() == []
                    finally:
                        selected.reset(token)
                await first.close()
                await outer.commit()
        async with committed_session_factory() as observer:
            row = await observer.get(CatalogueReconciliationRun, run_id)
            assert row.status == "PENDING" and row.dispatch_attempts == 2
            audits = list((await observer.scalars(select(AuditLog).where(AuditLog.resource_id == run_id))).all())
            assert len(audits) == 1 and audits[0].action_type == "CATALOGUE_RECONCILIATION_DISPATCH_RECLAIMED"
            assert audits[0].row_hash == compute_audit_hash(audits[0])
    finally:
        async with committed_session_factory() as db:
            await db.execute(delete(AuditLog).where(AuditLog.resource_id == run_id))
            await db.execute(delete(CatalogueReconciliationRun).where(CatalogueReconciliationRun.id == run_id))
            await db.commit()
