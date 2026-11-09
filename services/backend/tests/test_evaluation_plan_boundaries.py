"""Additional scope, historical-state and bounded assignment negative cases."""
from copy import deepcopy
import uuid

from fastapi import HTTPException
import pytest
from sqlalchemy import func, select

from app.core.tenant_context import TenantContextGuard
from app.modules.abstracts.models import AbstractAssignment, AbstractReviewer, AbstractSubmission
from app.modules.programme.evaluation_commands import EvaluationPlanCommands as Commands
from app.modules.programme.models import ProgrammeEvaluationPlan as Plan
from app.modules.programme.schemas import ProgrammeEvaluationPlanApply, ProgrammeEvaluationPlanCreate
from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation as Evidence
from tests.conftest import activate_event_for_test
from tests.test_evaluation_plan_commands import create, update_payload
from tests.test_programme_rubric_reconciliation import add_review


@pytest.mark.parametrize("change", [
    {"name": "   "}, {"anonymous_review": "false"}, {"reviewer_ids": [str(uuid.UUID(int=1))] * 2},
    {"scope_filter": {"instruction": "x" * (128 * 1024 + 1)}},
    {"scope_filter": {"invalid": float("nan")}},
    {"scope_filter": {"instruction": "🙂" * 31000}},
])
def test_plan_write_contract_rejects_ambiguous_or_over_budget_inputs(change):
    with pytest.raises(ValueError):
        ProgrammeEvaluationPlanCreate.model_validate({"name": "Bounded plan", **change})


@pytest.mark.asyncio
async def test_current_blocked_history_requires_review_even_when_rubric_now_looks_valid(db, event, organizer):
    await activate_event_for_test(db, event, abstracts=True)
    owner = event.organization_id
    async with TenantContextGuard.scoped(db, owner):
        first = await create(db, event, organizer)
        row = await db.get(Plan, first.id)
        row.version = 2
        db.add(Evidence(organization_id=owner, event_id=event.id, resource_type="PROGRAMME_RUBRIC",
            resource_id=row.id, resource_version=2, operation="DOCUMENT_VALIDATION", status="BLOCKED"))
        await db.commit()
        with pytest.raises(HTTPException) as denied:
            await Commands.execute(db, operation="update", event=event, user=organizer, plan_id=first.id,
                payload=update_payload(first, expected_version=2, name="Must remain blocked"),
                if_match="2", idempotency_key=f"blocked-save-{uuid.uuid4()}")
        assert denied.value.status_code == 409
        assert denied.value.detail["code"] == "EVALUATION_RUBRIC_RECONCILIATION_REQUIRED"
        await db.refresh(row)
        assert row.version == 2 and row.name == "Evaluation plan"


@pytest.mark.asyncio
async def test_metadata_update_does_not_reinterpret_existing_scores_or_confuse_canonical_defaults(db, event, organizer):
    await activate_event_for_test(db, event, abstracts=True)
    owner = event.organization_id
    async with TenantContextGuard.scoped(db, owner):
        first = await create(db, event, organizer)
        row = await db.get(Plan, first.id)
        legacy = deepcopy(row.rubric)
        legacy[0].pop("description")
        row.rubric = legacy
        review = await add_review(db, event)
        await db.commit()
        saved = await Commands.execute(db, operation="update", event=event, user=organizer, plan_id=first.id,
            payload=update_payload(first, name="Metadata-only change"), if_match="1", idempotency_key=f"metadata-{uuid.uuid4()}")
        assert saved.version == 2
        await db.refresh(review)
        assert review.scores == {"score_0": 7} and review.total_score == 7


@pytest.mark.asyncio
@pytest.mark.parametrize("scope, expected", [
    ({"status_filter": [], "category_filter": "ALL"}, 0),
    ({"status_filter": ["NOMINATED"], "category_filter": "Cancer"}, 1),
    ({"status_filter": ["SUBMITTED"], "category_filter": "Cancer"}, 1),
])
async def test_application_uses_saved_status_and_topic_scope(db, event, organizer, scope, expected):
    await activate_event_for_test(db, event, abstracts=True)
    values = dict(organization_id=event.organization_id, event_id=event.id)
    reviewer = AbstractReviewer(**values, email=f"scope-{uuid.uuid4()}@example.test", full_name="Scope reviewer", status="ACTIVE")
    db.add(reviewer)
    for status, topic in (("SUBMITTED", "Cancer"), ("SUBMITTED", "Other"), ("NOMINATED", "Cancer"), ("DRAFT", "Cancer")):
        db.add(AbstractSubmission(**values, code=uuid.uuid4().hex, title="Scoped submission", status=status, topic=topic))
    await db.flush()
    async with TenantContextGuard.scoped(db, event.organization_id):
        plan = await create(db, event, organizer, reviewers=[reviewer.id], scope=scope)
        result = await Commands.execute(db, operation="apply", event=event, user=organizer, plan_id=plan.id,
            payload=ProgrammeEvaluationPlanApply(assignments_per_submission=1), if_match="1", idempotency_key=f"scope-{uuid.uuid4()}")
        assert result.assignments_created == result.submissions_considered == expected
        assert result.submissions_unfilled == 0


@pytest.mark.asyncio
async def test_default_assigned_mode_uses_active_event_roster_and_reports_capacity_shortfall(db, event, organizer):
    await activate_event_for_test(db, event, abstracts=True)
    values = dict(organization_id=event.organization_id, event_id=event.id)
    db.add_all([AbstractReviewer(**values, email=f"capacity-{uuid.uuid4()}@example.test",
        full_name="Capacity reviewer", status="ACTIVE", capacity=1) for _ in range(2)])
    db.add_all([AbstractSubmission(**values, code=uuid.uuid4().hex, title="Capacity submission", status="SUBMITTED") for _ in range(3)])
    await db.flush()
    async with TenantContextGuard.scoped(db, event.organization_id):
        plan = await create(db, event, organizer, scope={"evaluator_scope": "ASSIGNED"})
        result = await Commands.execute(db, operation="apply", event=event, user=organizer, plan_id=plan.id,
            payload=ProgrammeEvaluationPlanApply(assignments_per_submission=2), if_match="1", idempotency_key=f"capacity-{uuid.uuid4()}")
        assert result.assignments_created == 2 and result.submissions_unfilled == 2 and not result.has_next
        assert await db.scalar(select(func.count()).select_from(AbstractAssignment).where(AbstractAssignment.event_id == event.id)) == 2
