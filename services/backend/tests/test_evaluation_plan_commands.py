"""Real PostgreSQL, real scoped authority and commercial activation; no allow mocks."""
from collections import Counter
from datetime import date
import uuid

from fastapi import HTTPException
import pytest
from sqlalchemy import event as sa_event, func, select

from app.core.tenant_context import TenantContextGuard
from app.modules.abstracts.models import AbstractAssignment, AbstractReviewer, AbstractSubmission
from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash
from app.modules.events.models.event import Event
from app.modules.platform.models.idempotency import IdempotencyRecord
from app.modules.programme.evaluation_commands import EvaluationPlanCommands as Commands
from app.modules.programme.models import ProgrammeEvaluationPlan as Plan
from app.modules.programme.schemas import ProgrammeEvaluationPlanCreate, ProgrammeEvaluationPlanUpdate, ProgrammeEvaluationPlanApply
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation as Evidence
from tests.conftest import activate_event_for_test
from tests.test_evaluation_rubric_contract import criteria


async def create(db, event, actor, *, key=None, reviewers=(), scope=None):
    return await Commands.execute(db, operation="create", event=event, user=actor,
        idempotency_key=key or f"create-{uuid.uuid4()}",
        payload=ProgrammeEvaluationPlanCreate(name="Evaluation plan", rubric=criteria(1), reviewer_ids=list(reviewers), scope_filter=scope or {}))


def update_payload(plan, **changes):
    return ProgrammeEvaluationPlanUpdate(**{**plan.model_dump(exclude={"id", "source_type", "status", "version"}),
        "expected_version": plan.version, **changes})


@pytest.mark.asyncio
async def test_create_update_replay_keep_original_snapshot_and_one_audit_each(db, event, organizer):
    await activate_event_for_test(db, event, abstracts=True)
    await db.commit()
    async with TenantContextGuard.scoped(db, event.organization_id):
        key = f"original-{uuid.uuid4()}"
        first = await create(db, event, organizer, key=key)
        assert first.version == 1
        update_key = f"update-{uuid.uuid4()}"
        request = update_payload(first, name="Updated plan")
        updated = await Commands.execute(db, operation="update", event=event, user=organizer, plan_id=first.id,
            payload=request, if_match='"1"', idempotency_key=update_key)
        assert updated.version == 2
        assert await create(db, event, organizer, key=key) == first
        assert await Commands.execute(db, operation="update", event=event, user=organizer, plan_id=first.id,
            payload=request, if_match='"1"', idempotency_key=update_key) == updated
        audits = list((await db.scalars(select(AuditLog).where(AuditLog.resource_id == first.id))).all())
        assert len(audits) == 2 and all(row.row_hash == compute_audit_hash(row) for row in audits)
        for row in audits:
            assert row.new_state["event_id"] == str(event.id)
            assert row.new_state["workspace_id"] == str(event.operational_workspace_id)
            assert row.new_state["target_organization_id"] == str(event.organization_id)
            assert row.new_state["reason"] and row.correlation_id


@pytest.mark.asyncio
@pytest.mark.parametrize("defect", ["missing_version", "stale_version", "mismatched_body", "missing_key"])
async def test_update_preconditions_are_mandatory_and_non_mutating(db, event, organizer, defect):
    await activate_event_for_test(db, event, abstracts=True)
    await db.commit()
    owner = event.organization_id
    async with TenantContextGuard.scoped(db, owner):
        plan = await create(db, event, organizer)
        header, body, key = "1", update_payload(plan), f"precondition-{uuid.uuid4()}"
        expected = 428
        if defect == "missing_version": header = None
        elif defect == "stale_version": header, body, expected = "2", update_payload(plan, expected_version=2), 412
        elif defect == "mismatched_body": header, expected = "2", 422
        else: key = None
        with pytest.raises(HTTPException) as denied:
            await Commands.execute(db, operation="update", event=event, user=organizer, plan_id=plan.id,
                payload=body, if_match=header, idempotency_key=key)
        assert denied.value.status_code == expected
        current = await db.get(Plan, plan.id, populate_existing=True)
        assert current.version == 1 and current.name == "Evaluation plan"


@pytest.mark.asyncio
async def test_create_retry_cannot_cross_events_even_with_identical_body(db, event, organizer):
    await activate_event_for_test(db, event, abstracts=True)
    owner = event.organization_id
    other = Event(organization_id=owner, created_by=organizer.id, operational_workspace_id=event.operational_workspace_id,
        name="Other requested event", short_code=f"OE{uuid.uuid4().hex[:8]}", location="Test", timezone="UTC",
        start_date=date(2026, 10, 22), end_date=date(2026, 10, 23))
    db.add(other); await db.flush()
    await activate_event_for_test(db, other, abstracts=True)
    await db.commit()
    other_id = other.id
    async with TenantContextGuard.scoped(db, owner):
        key = f"event-context-{uuid.uuid4()}"
        first = await create(db, event, organizer, key=key)
        with pytest.raises(HTTPException) as denied:
            await create(db, other, organizer, key=key)
        assert denied.value.status_code == 409 and denied.value.detail["code"] == "IDEMPOTENCY_CONFLICT"
        assert await db.scalar(select(func.count()).select_from(Plan).where(Plan.organization_id == owner)) == 1
        assert (await db.get(Plan, first.id)).event_id != other_id
        assert await db.scalar(select(Plan.id).where(Plan.event_id == other_id)) is None


@pytest.mark.asyncio
@pytest.mark.parametrize("actor_kind", ["revoked_membership", "platform_label"])
async def test_global_labels_do_not_admit_evaluation_writes(db, event, organizer, super_admin, actor_kind):
    await activate_event_for_test(db, event, abstracts=True)
    await db.commit()
    owner = event.organization_id
    if actor_kind == "revoked_membership":
        member = await db.scalar(select(OrganizationMember).where(OrganizationMember.user_id == organizer.id,
            OrganizationMember.organization_id == owner))
        member.is_active = False
        await db.commit()
    async with TenantContextGuard.scoped(db, owner):
        with pytest.raises(HTTPException) as denied:
            await create(db, event, organizer if actor_kind == "revoked_membership" else super_admin)
        assert denied.value.status_code in (403, 404)
        assert await db.scalar(select(func.count()).select_from(Plan).where(Plan.organization_id == owner)) == 0


@pytest.mark.asyncio
async def test_apply_101_submissions_is_explicitly_paged_without_n_plus_one(db, event, organizer):
    await activate_event_for_test(db, event, abstracts=True)
    values = dict(organization_id=event.organization_id, event_id=event.id)
    reviewers = [AbstractReviewer(**values, email=f"batch-{uuid.uuid4()}@example.test", full_name="Batch reviewer",
        status="ACTIVE", capacity=500) for _ in range(2)]
    submissions = [AbstractSubmission(**values, code=f"BATCH-{uuid.uuid4().hex[:12]}", title="Batch submission", status="SUBMITTED") for _ in range(101)]
    db.add_all([*reviewers, *submissions]); await db.flush()
    async with TenantContextGuard.scoped(db, event.organization_id):
        plan = await create(db, event, organizer, reviewers=[row.id for row in reviewers])
        selects = []
        def count_queries(conn, cursor, statement, parameters, context, executemany):
            if statement.lstrip().upper().startswith("SELECT") and "FROM abstract.abstract_assignments" in statement:
                selects.append(statement)
        engine = db.bind.sync_engine
        sa_event.listen(engine, "before_cursor_execute", count_queries)
        try:
            first_payload = ProgrammeEvaluationPlanApply(assignments_per_submission=2)
            first_key = f"first-page-{uuid.uuid4()}"
            first = await Commands.execute(db, operation="apply", event=event, user=organizer, plan_id=plan.id,
                payload=first_payload, if_match="1", idempotency_key=first_key)
            assert first.submissions_considered == 100 and first.assignments_created == 200 and first.has_next
            assert len(selects) == 3
            selects.clear()
            second = await Commands.execute(db, operation="apply", event=event, user=organizer, plan_id=plan.id,
                payload=ProgrammeEvaluationPlanApply(assignments_per_submission=2, cursor=first.next_cursor),
                if_match=str(first.version), idempotency_key=f"second-page-{uuid.uuid4()}")
            assert second.submissions_considered == 1 and second.assignments_created == 2 and not second.has_next
            assert len(selects) == 3
            replayed = await Commands.execute(db, operation="apply", event=event, user=organizer, plan_id=plan.id,
                payload=first_payload, if_match="1", idempotency_key=first_key)
            assert replayed == first
        finally:
            sa_event.remove(engine, "before_cursor_execute", count_queries)
        rows = (await db.execute(select(AbstractAssignment.submission_id, AbstractAssignment.reviewer_id).where(
            AbstractAssignment.event_id == event.id, AbstractAssignment.organization_id == event.organization_id))).all()
        assert len(rows) == len(set(rows)) == 202
        assert set(Counter(row.submission_id for row in rows).values()) == {2}


@pytest.mark.asyncio
async def test_failed_mandatory_audit_rolls_back_create_and_receipt(db, event, organizer):
    await activate_event_for_test(db, event, abstracts=True)
    await db.commit()
    owner = event.organization_id
    key = f"audit-failure-{uuid.uuid4()}"
    def reject_audit(mapper, connection, row):
        if row.action_type == "EVALUATION_PLAN_CREATE":
            raise RuntimeError("Mandatory evaluation audit failed")
    sa_event.listen(AuditLog, "before_insert", reject_audit)
    try:
        async with TenantContextGuard.scoped(db, owner):
            with pytest.raises(RuntimeError, match="Mandatory evaluation audit"):
                await create(db, event, organizer, key=key)
    finally:
        sa_event.remove(AuditLog, "before_insert", reject_audit)
    async with TenantContextGuard.scoped(db, owner):
        assert await db.scalar(select(Plan.id).where(Plan.organization_id == owner)) is None
        assert await db.scalar(select(IdempotencyRecord.id).where(IdempotencyRecord.idempotency_key == key)) is None
        assert await db.scalar(select(Evidence.id).where(Evidence.organization_id == owner)) is None
