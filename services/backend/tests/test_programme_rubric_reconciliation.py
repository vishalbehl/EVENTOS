"""Real PostgreSQL coverage, bounded historical validation and reviewed repair."""
from contextlib import asynccontextmanager
from copy import deepcopy
import uuid

from fastapi import HTTPException, Response
import pytest
from sqlalchemy import event as sa_event, func, select

from app.core.tenant_context import TenantContextGuard
from app.modules.abstracts.models import AbstractAssignment, AbstractReview, AbstractReviewer, AbstractSubmission
from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.models.idempotency import IdempotencyRecord
from app.modules.programme.models import ProgrammeEvaluationPlan
from app.modules.registration.application.aggregate_reconciliation import repair_aggregate_document
from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation as Evidence
from app.modules.registration.models.catalogue_reconciliation import CatalogueReconciliationRun as Run, CatalogueReconciliationWork as Work
from app.modules.registration.routers.form_templates import list_blocked_aggregate_documents
from app.modules.registration.schemas.catalogue_contracts import AggregateRepairRequest
from app.modules.registration.services import catalogue_work
from app.tasks import catalogue_reconciliation as worker
from tests.test_catalogue_durable_pages import initialize, execute_claimed
from tests.test_evaluation_rubric_contract import criteria


async def scan(db, event, actor, monkeypatch, cursor=None):
    @asynccontextmanager
    async def sessions():
        yield db
    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    return await worker._process_page(event.organization_id, actor.id, "PROGRAMME_RUBRIC", cursor)


def plan(event, *, valid=False):
    rubric = criteria(1)
    if not valid:
        rubric[0]["weight"] = 99
        rubric[0]["private_credential"] = "do-not-project-this"
    return ProgrammeEvaluationPlan(organization_id=event.organization_id, event_id=event.id,
        name=f"Reconciliation-{uuid.uuid4()}", rubric=rubric,
        scope_filter={"internal_note": "private-plan-data"}, reviewer_ids=[str(uuid.uuid4())])


async def repair(db, row_id, actor, *, version=1, key=None, document=None):
    return await repair_aggregate_document(db, resource_type="PROGRAMME_RUBRIC", resource_id=row_id,
        actor=actor, if_match=f'"{version}"', idempotency_key=key or f"rubric-{uuid.uuid4()}",
        payload=AggregateRepairRequest(document={"rubric": criteria(1)} if document is None else document,
            reason="Reviewed historical scoring criteria correction"))


async def add_review(db, event):
    values = dict(organization_id=event.organization_id, event_id=event.id)
    submission = AbstractSubmission(**values, code=f"TEST-{uuid.uuid4().hex[:8]}", title="Scored abstract")
    reviewer = AbstractReviewer(**values, email=f"reviewer-{uuid.uuid4()}@example.test", full_name="Reviewer", status="ACTIVE")
    db.add_all([submission, reviewer])
    await db.flush()
    assignment = AbstractAssignment(**values, submission_id=submission.id, reviewer_id=reviewer.id)
    db.add(assignment)
    await db.flush()
    review = AbstractReview(**values, submission_id=submission.id, assignment_id=assignment.id,
        reviewer_id=reviewer.id, scores={"score_0": 7}, total_score=7)
    db.add(review)
    await db.flush()
    return review


@pytest.mark.asyncio
async def test_programme_rubric_pages_are_bounded_and_do_not_normalize_scoring(db, event, super_admin, monkeypatch):
    rows = [plan(event, valid=True) for _ in range(205)]
    rows[0].rubric = criteria(21)
    rows[0].status = "ACTIVE"
    before = {row.name: deepcopy(row.rubric) for row in rows}
    db.add_all(rows)
    await db.commit()
    cursor, sizes, blocked = None, [], 0
    while True:
        result = await scan(db, event, super_admin, monkeypatch, cursor)
        sizes.append(result["checked"])
        blocked += result["blocked"]
        assert result["normalized"] == 0
        if result["next_cursor"] is None:
            break
        cursor = uuid.UUID(result["next_cursor"])
    assert sizes == [100, 100, 5] and blocked == 1
    assert await db.scalar(select(func.count()).select_from(Evidence).where(
        Evidence.organization_id == event.organization_id, Evidence.resource_type == "PROGRAMME_RUBRIC")) == 205
    for row in rows:
        await db.refresh(row)
        assert row.rubric == before[row.name] and row.version == 1


@pytest.mark.asyncio
async def test_old_valid_evidence_is_immutable_and_current_block_survives_retry(db, event, super_admin, monkeypatch):
    row = plan(event)
    db.add(row)
    await db.flush()
    old = Evidence(organization_id=event.organization_id, event_id=event.id,
        resource_type="PROGRAMME_RUBRIC", resource_id=row.id, resource_version=1,
        operation="DOCUMENT_VALIDATION", status="VALID", details={"old_approval": True})
    db.add(old)
    await db.commit()
    for _ in range(2):
        result = await scan(db, event, super_admin, monkeypatch)
        assert result["checked"] == result["blocked"] == 1
    await db.refresh(row)
    await db.refresh(old)
    assert row.version == 2 and old.status == "VALID" and old.details == {"old_approval": True}
    observations = list((await db.scalars(select(Evidence).where(Evidence.resource_id == row.id))).all())
    assert {(r.operation, r.resource_version, r.status) for r in observations} == {
        ("DOCUMENT_VALIDATION", 1, "VALID"), ("DOCUMENT_REVALIDATION", 1, "BLOCKED"),
        ("DOCUMENT_VALIDATION", 2, "BLOCKED")}


@pytest.mark.asyncio
async def test_review_projection_repair_and_retry_preserve_unrelated_plan_data(db, event, super_admin, monkeypatch):
    row = plan(event)
    db.add(row)
    await db.commit()
    before = (deepcopy(row.scope_filter), deepcopy(row.reviewer_ids), row.status, row.name)
    await scan(db, event, super_admin, monkeypatch)
    async with TenantContextGuard.scoped(db, super_admin.organization_id):
        page = await list_blocked_aggregate_documents(response=Response(), resource_type="PROGRAMME_RUBRIC",
            cursor=None, page_size=50, db=db, current_user=super_admin)
        assert [issue.resource_id for issue in page.items] == [row.id]
        assert page.items[0].current_document is None
        assert "private-plan-data" not in page.model_dump_json()
        assert "do-not-project-this" not in page.model_dump_json()
        key = f"reviewed-rubric-{uuid.uuid4()}"
        result = await repair(db, row.id, super_admin, key=key)
        assert result["version"] == 2 and result["previous_version"] == 1
        assert await repair(db, row.id, super_admin, key=key) == result
        page = await list_blocked_aggregate_documents(response=Response(), resource_type="PROGRAMME_RUBRIC",
            cursor=None, page_size=50, db=db, current_user=super_admin)
        assert page.items == []
        assert await db.scalar(select(func.count()).select_from(IdempotencyRecord).where(IdempotencyRecord.idempotency_key == key)) == 1
    async with TenantContextGuard.scoped(db, event.organization_id):
        await db.refresh(row)
        assert (row.scope_filter, row.reviewer_ids, row.status, row.name) == before
        audits = list((await db.scalars(select(AuditLog).where(AuditLog.resource_id == row.id))).all())
        assert len(audits) == 1
        assert audits[0].new_state["acting_organization_id"] == str(super_admin.organization_id)
        assert audits[0].new_state["workspace_id"] == str(event.operational_workspace_id)


@pytest.mark.asyncio
@pytest.mark.parametrize("extra", ["reviewer_ids", "scope_filter", "status", "event_id", "organization_id"])
async def test_rubric_repair_rejects_plan_mass_assignment(db, event, super_admin, monkeypatch, extra):
    owner = event.organization_id
    row = plan(event)
    db.add(row)
    await db.commit()
    await scan(db, event, super_admin, monkeypatch)
    async with TenantContextGuard.scoped(db, super_admin.organization_id):
        with pytest.raises(HTTPException) as denied:
            await repair(db, row.id, super_admin, document={"rubric": criteria(1), extra: []})
        assert denied.value.status_code == 422
    async with TenantContextGuard.scoped(db, owner):
        await db.refresh(row)
        assert row.version == 1


@pytest.mark.asyncio
async def test_committed_score_prevents_rubric_repair_and_rolls_back_receipt(db, event, super_admin, monkeypatch):
    owner = event.organization_id
    row = plan(event)
    db.add(row)
    review = await add_review(db, event)
    await db.commit()
    await scan(db, event, super_admin, monkeypatch)
    key = f"graded-rubric-{uuid.uuid4()}"
    async with TenantContextGuard.scoped(db, super_admin.organization_id):
        with pytest.raises(HTTPException) as denied:
            await repair(db, row.id, super_admin, key=key)
        assert denied.value.status_code == 409
        assert denied.value.detail["code"] == "RECORDED_SCORES_IMMUTABLE"
        assert await db.scalar(select(IdempotencyRecord.id).where(IdempotencyRecord.idempotency_key == key)) is None
    async with TenantContextGuard.scoped(db, owner):
        await db.refresh(row)
        await db.refresh(review)
        assert row.version == 1 and row.rubric[0]["weight"] == 99
        assert review.scores == {"score_0": 7} and review.total_score == 7


@pytest.mark.asyncio
async def test_new_durable_stream_must_finish_rubric_stage(db, event, organization, super_admin, monkeypatch):
    db.add(plan(event))
    await db.commit()
    run_id, owner, platform, actor = await initialize(db, organization, super_admin, monkeypatch)
    for _ in range(7):
        await execute_claimed(db, platform)
    async with TenantContextGuard.scoped(db, platform):
        work = await db.scalar(select(Work).where(Work.run_id == run_id, Work.kind == "TENANT"))
        assert work.coverage_version == 2 and work.stage == "PROGRAMME_RUBRIC"
        assert work.status == "COMPLETED" and work.pages_completed == 5 and work.blocked_count == 1
        assert (await catalogue_work.progress(db, await db.get(Run, run_id)))["completion_status"] == "COMPLETED"


@pytest.mark.asyncio
async def test_completed_legacy_stream_cannot_claim_rubric_coverage(db, organization, super_admin):
    run = Run(organization_id=super_admin.organization_id, actor_user_id=super_admin.id,
        reason="Historical pre-rubric coverage", status="DISPATCHED", enumeration_complete=True)
    db.add(run)
    await db.flush()
    db.add_all([
        Work(run_id=run.id, organization_id=super_admin.organization_id,
            target_organization_id=super_admin.organization_id, kind="GLOBAL", stage="GLOBAL_TEMPLATE",
            status="COMPLETED", pages_completed=2, coverage_version=1),
        Work(run_id=run.id, organization_id=super_admin.organization_id, target_organization_id=organization.id,
            kind="TENANT", stage="ABSTRACT_FORM", status="COMPLETED", pages_completed=4, coverage_version=1)])
    await db.commit()
    async with TenantContextGuard.scoped(db, super_admin.organization_id):
        assert (await catalogue_work.progress(db, run))["completion_status"] == "LEGACY_UNTRACKED"


@pytest.mark.asyncio
async def test_rubric_audit_failure_rolls_back_document_evidence_and_receipt(db, event, super_admin, monkeypatch):
    owner = event.organization_id
    row = plan(event)
    db.add(row)
    await db.commit()
    row_id = row.id
    await scan(db, event, super_admin, monkeypatch)
    key = f"rubric-audit-rollback-{uuid.uuid4()}"

    def fail_audit(mapper, connection, target):
        if target.resource_id == row_id and target.action_type == "CATALOGUE_AGGREGATE_EXPLICIT_REPAIR":
            raise RuntimeError("Injected mandatory audit failure")

    sa_event.listen(AuditLog, "before_insert", fail_audit)
    try:
        async with TenantContextGuard.scoped(db, super_admin.organization_id):
            with pytest.raises(RuntimeError, match="mandatory audit failure"):
                await repair(db, row_id, super_admin, key=key)
            assert await db.scalar(select(IdempotencyRecord.id).where(IdempotencyRecord.idempotency_key == key)) is None
    finally:
        sa_event.remove(AuditLog, "before_insert", fail_audit)
    async with TenantContextGuard.scoped(db, owner):
        await db.refresh(row)
        assert row.version == 1 and row.rubric[0]["weight"] == 99
        assert await db.scalar(select(func.count()).select_from(Evidence).where(Evidence.resource_id == row_id)) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("version, expected", [(None, 428), (2, 412)])
async def test_rubric_repair_requires_the_loaded_version(db, event, super_admin, monkeypatch, version, expected):
    row = plan(event)
    db.add(row)
    await db.commit()
    await scan(db, event, super_admin, monkeypatch)
    with pytest.raises(HTTPException) as denied:
        await repair_aggregate_document(db, resource_type="PROGRAMME_RUBRIC", resource_id=row.id,
            actor=super_admin, if_match=None if version is None else str(version), idempotency_key=f"version-{uuid.uuid4()}",
            payload=AggregateRepairRequest(document={"rubric": criteria(1)}, reason="Reviewed version contract check"))
    assert denied.value.status_code == expected


@pytest.mark.asyncio
async def test_ordinary_customer_cannot_review_or_repair_rubrics(db, event, super_admin, organizer, monkeypatch):
    row = plan(event)
    db.add(row)
    await db.commit()
    row_id, actor_id = row.id, organizer.id
    await scan(db, event, super_admin, monkeypatch)
    with pytest.raises(HTTPException) as denied:
        await repair(db, row_id, organizer)
    assert denied.value.status_code == 403
    # A rejected mutation may expire ORM identities; re-read explicitly.
    await db.refresh(organizer)
    assert organizer.id == actor_id
    with pytest.raises(HTTPException) as denied:
        await list_blocked_aggregate_documents(response=Response(), resource_type="PROGRAMME_RUBRIC",
            cursor=None, page_size=50, db=db, current_user=organizer)
    assert denied.value.status_code == 403
