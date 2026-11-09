"""Real PostgreSQL page data/checkpoint atomicity and lost-message recovery."""
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import uuid

import pytest
from sqlalchemy import event as sqlalchemy_event, func, select
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException

from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash
from app.modules.registration.models.catalogue_reconciliation import CatalogueReconciliationRun as Run, CatalogueReconciliationWork as Work, CatalogueDocumentReconciliation as Evidence
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.form_template import FormTemplate
from app.modules.registration.services import catalogue_work as service
from app.tasks import catalogue_reconciliation as worker


async def initialize(db, organization, super_admin, monkeypatch):
    @asynccontextmanager
    async def sessions():
        try:
            yield db
        except Exception:
            await db.rollback()
            raise
    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    run = Run(organization_id=super_admin.organization_id, actor_user_id=super_admin.id,
        reason="Durable whole-cohort stream fixture", status="RUNNING", dispatch_attempts=1)
    db.add(run)
    await db.commit()
    ids = (run.id, organization.id, super_admin.organization_id, super_admin.id)
    await service.stage_streams(ids[0], ids[3], 1, None, (ids[1],), enumeration_complete=True)
    await worker._mark_run_dispatched(ids[0], ids[3], 1)
    return ids


async def execute_claimed(db, platform):
    messages = await service.claim_pages(platform)
    assert messages
    for work_id, owner, generation in messages:
        await service.execute_page(work_id, owner, generation)
    return messages


@pytest.mark.asyncio
async def test_global_then_205_owned_categories_survive_missing_continuation_publish(db, organization, super_admin, monkeypatch):
    # The suite can retain valid global catalogue fixtures from other command
    # cases. Independently census the exact global selectors, rather than
    # incorrectly assuming this whole-cohort worker processes only our tenant.
    global_categories = await db.scalar(select(func.count()).select_from(FormCategory).where(
        FormCategory.organization_id.is_(None), FormCategory.is_active.is_(True),
        FormCategory.deleted_at.is_(None)))
    global_templates = await db.scalar(select(func.count()).select_from(FormTemplate).where(
        FormTemplate.organization_id.is_(None), FormTemplate.scope_type == "GLOBAL",
        FormTemplate.deleted_at.is_(None)))
    assert global_categories < 100 and global_templates < 100
    categories = [FormCategory(organization_id=organization.id, name=f"Durable {index}", slug=f"durable-{uuid.uuid4().hex}") for index in range(205)]
    db.add_all(categories)
    await db.commit()
    run_id, owner, platform, actor = await initialize(db, organization, super_admin, monkeypatch)
    # Only global taxonomy may start until its template-validation stage ends.
    first = await execute_claimed(db, platform)
    assert len(first) == 1
    async with TenantContextGuard.scoped(db, platform):
        global_work = await db.get(Work, first[0][0])
        assert global_work.kind == "GLOBAL" and global_work.stage == "GLOBAL_TEMPLATE"
    assert await service.execute_page(*first[0]) == {"status": "STALE_OR_UNAVAILABLE"}
    await execute_claimed(db, platform)
    # No continuation was published; recovery discovers the committed cursor.
    for _ in range(8):
        messages = await service.claim_pages(platform)
        if not messages:
            break
        for message in messages:
            await service.execute_page(*message)
    async with TenantContextGuard.scoped(db, platform):
        run = await db.get(Run, run_id)
        result = await service.progress(db, run)
        assert result == dict(completion_status="COMPLETED", streams_total=2, streams_completed=2,
            pages_completed=9, checked_count=205 + global_categories + global_templates, blocked_count=0)
        tenant = await db.scalar(select(Work).where(Work.run_id == run_id, Work.kind == "TENANT"))
        assert tenant.pages_completed == 7 and tenant.status == "COMPLETED"
        audits = list((await db.scalars(select(AuditLog).where(AuditLog.resource_id == tenant.id))).all())
        assert len(audits) == 7 and all(a.row_hash == compute_audit_hash(a) for a in audits)
        assert sorted(a.new_state["checked"] for a in audits if a.new_state["stage"] == "FORM_CATEGORY") == [5, 100, 100]
    async with TenantContextGuard.scoped(db, owner):
        assert await db.scalar(select(func.count()).select_from(Evidence).where(Evidence.resource_type == "FORM_CATEGORY")) == 205


@pytest.mark.asyncio
async def test_checkpoint_audit_failure_rolls_back_flushed_page_and_cursor(db, organization, super_admin, monkeypatch):
    db.add(FormCategory(organization_id=organization.id, name="Atomic page fixture", slug=f"atomic-{uuid.uuid4().hex}"))
    await db.commit()
    run_id, owner, platform, actor = await initialize(db, organization, super_admin, monkeypatch)
    await execute_claimed(db, platform)
    await execute_claimed(db, platform)
    messages = await service.claim_pages(platform)
    assert len(messages) == 1
    work_id, _, generation = messages[0]

    def fail_audit(mapper, connection, target):
        if target.resource_id == work_id and target.action_type == "CATALOGUE_PAGE_CHECKPOINT_COMMITTED":
            raise RuntimeError("Checkpoint audit unavailable")

    sqlalchemy_event.listen(AuditLog, "before_insert", fail_audit)
    try:
        with pytest.raises(RuntimeError, match="Checkpoint audit unavailable"):
            await service.execute_page(*messages[0])
    finally:
        sqlalchemy_event.remove(AuditLog, "before_insert", fail_audit)
    async with TenantContextGuard.scoped(db, owner):
        assert await db.scalar(select(func.count()).select_from(Evidence)) == 0
    async with TenantContextGuard.scoped(db, platform):
        row = await db.get(Work, work_id, populate_existing=True)
        assert row.pages_completed == 0 and row.cursor is None and row.generation == generation
    assert (await service.execute_page(work_id, platform, generation))["pages_completed"] == 1


@pytest.mark.asyncio
async def test_lost_initial_message_reclaims_generation_and_rejects_old_message(db, organization, super_admin, monkeypatch):
    run_id, owner, platform, actor = await initialize(db, organization, super_admin, monkeypatch)
    first = (await service.claim_pages(platform))[0]
    async with TenantContextGuard.scoped(db, platform):
        row = await db.get(Work, first[0])
        row.next_dispatch_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        await db.commit()
    second = (await service.claim_pages(platform))[0]
    assert second[0] == first[0] and second[2] > first[2]
    assert await service.execute_page(*first) == {"status": "STALE_OR_UNAVAILABLE"}
    assert (await service.execute_page(*second))["pages_completed"] == 1


@pytest.mark.asyncio
async def test_legacy_dispatched_run_is_not_reported_complete(db, super_admin):
    run = Run(organization_id=super_admin.organization_id, actor_user_id=super_admin.id,
        reason="Legacy dispatch has no page checkpoints", status="DISPATCHED")
    db.add(run)
    await db.commit()
    async with TenantContextGuard.scoped(db, super_admin.organization_id):
        assert (await service.progress(db, run))["completion_status"] == "LEGACY_UNTRACKED"


@pytest.mark.asyncio
async def test_committed_platform_revocation_stops_page_execution(db, organization, super_admin, monkeypatch):
    run_id, owner, platform, actor = await initialize(db, organization, super_admin, monkeypatch)
    message = (await service.claim_pages(platform))[0]
    super_admin.platform_role = None
    await db.commit()
    with pytest.raises(HTTPException) as denied:
        await service.execute_page(*message)
    assert denied.value.status_code == 403
    async with TenantContextGuard.scoped(db, platform):
        work = await db.get(Work, message[0], populate_existing=True)
        assert work.status == "FAILED" and work.pages_completed == 0
        run = await db.get(Run, run_id)
        assert (await service.progress(db, run))["completion_status"] == "FAILED"


@pytest.mark.asyncio
@pytest.mark.parametrize("violation", ["owner", "stage", "counter", "fake_completion"])
async def test_database_rejects_invalid_work_ownership_stage_and_completion(db, organization, super_admin, violation):
    platform, owner = super_admin.organization_id, organization.id
    run = Run(organization_id=platform, actor_user_id=super_admin.id,
        reason="Native work constraint acceptance fixture")
    db.add(run)
    await db.commit()
    values = dict(run_id=run.id, organization_id=platform, target_organization_id=owner,
        kind="TENANT", stage="FORM_CATEGORY")
    expected = "ck_catalogue_work_completion"
    if violation == "owner":
        values.update(organization_id=owner, target_organization_id=platform)
        expected = "fk_catalogue_work_run_owner"
    elif violation == "stage":
        values.update(kind="GLOBAL", target_organization_id=platform)
        expected = "ck_catalogue_work_stage"
    elif violation == "counter":
        values.update(generation=-1)
        expected = "ck_catalogue_work_counters"
    else:
        values.update(status="COMPLETED")
    db.add(Work(**values))
    with pytest.raises(IntegrityError) as invalid:
        await db.flush()
    assert expected in str(invalid.value.orig)
    await db.rollback()
