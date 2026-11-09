"""Shared live/stored scoring contract; no database or provider substitutes."""
from copy import deepcopy
from uuid import uuid4

import pytest

from app.modules.programme.schemas import (
    ProgrammeEvaluationPlanCreate,
    ProgrammeEvaluationPlanResponse,
    ProgrammeEvaluationPlanUpdate,
    PublicReviewerAssignment,
    PublicReviewerConflict,
)
from app.modules.registration.schemas.event_form_contracts import (
    MAX_EVALUATION_RUBRIC_CRITERIA,
    evaluation_rubric_projection,
    rubric_projection,
)


def criteria(count):
    return [{"key": f"score_{index}", "label": f"Score {index}",
             "max": 10, "weight": 100 / count} for index in range(count)]


@pytest.mark.parametrize("count", [0, 1, 20])
def test_evaluation_rubric_accepts_complete_bounded_document(count):
    source = criteria(count)
    before = deepcopy(source)
    result = evaluation_rubric_projection(source)
    assert len(result) == count
    assert source == before
    assert [row["key"] for row in result] == [row["key"] for row in source]


@pytest.mark.parametrize("count", [21, 100, 101])
def test_evaluation_rubric_rejects_oversized_history_without_truncation(count):
    source = criteria(count)
    before = deepcopy(source)
    with pytest.raises(ValueError, match="at most 20"):
        evaluation_rubric_projection(source)
    assert source == before


def test_abstract_rubric_keeps_its_independent_limit():
    assert len(rubric_projection(criteria(100))) == 100
    with pytest.raises(ValueError):
        rubric_projection(criteria(101))


@pytest.mark.parametrize("source", [None, {}, "[]", (), 1, True])
def test_evaluation_rubric_rejects_non_list_documents(source):
    with pytest.raises(ValueError):
        evaluation_rubric_projection(source)


@pytest.mark.parametrize("change", [
    {"key": None}, {"key": "__proto__"}, {"key": "prototype"},
    {"key": "constructor"}, {"weight": 99}, {"weight": float("nan")},
    {"max": float("inf")}, {"max": True}, {"weight": "100"},
    {"label": "  "}, {"expression": "score * 2"},
])
def test_evaluation_rubric_rejects_unsafe_scoring_definitions(change):
    source = [{**criteria(1)[0], **change}]
    with pytest.raises(ValueError):
        evaluation_rubric_projection(source)


@pytest.mark.parametrize("field, value", [("key", "score_0"), ("label", "  SCORE 0  ")])
def test_evaluation_rubric_rejects_ambiguous_criterion_identity(field, value):
    source = criteria(2)
    source[1][field] = value
    with pytest.raises(ValueError, match="unique"):
        evaluation_rubric_projection(source)


@pytest.mark.parametrize("contract", [ProgrammeEvaluationPlanCreate, ProgrammeEvaluationPlanUpdate])
def test_evaluation_plan_write_contracts_share_the_bound(contract):
    payload = {"name": "Evaluation", "rubric": criteria(MAX_EVALUATION_RUBRIC_CRITERIA)}
    if contract is ProgrammeEvaluationPlanUpdate:
        payload["expected_version"] = 1
    assert len(contract.model_validate(payload).rubric) == MAX_EVALUATION_RUBRIC_CRITERIA
    payload["rubric"] = criteria(MAX_EVALUATION_RUBRIC_CRITERIA + 1)
    with pytest.raises(ValueError):
        contract.model_validate(payload)


def test_evaluation_plan_response_rejects_oversized_stored_rubric():
    payload = dict(id=uuid4(), name="Historical evaluation", source_type="ABSTRACT",
        scope_filter={}, rubric=criteria(21), reviewer_ids=[], due_at=None,
        anonymous_review=False, status="ACTIVE", version=1)
    with pytest.raises(ValueError):
        ProgrammeEvaluationPlanResponse.model_validate(payload)


def test_public_reviewer_contract_uses_the_same_scoring_bound():
    payload = dict(id=uuid4(), submission_id=uuid4(), code="AB-001", title="Submission",
        submission_version=1, abstract_type="ORAL", status="PENDING", conflict_declared=False,
        rubric=criteria(20))
    assert len(PublicReviewerAssignment.model_validate(payload).rubric) == 20
    payload["rubric"] = criteria(21)
    with pytest.raises(ValueError):
        PublicReviewerAssignment.model_validate(payload)


@pytest.mark.parametrize("payload", [
    {"conflict_declared": False},
    {"conflict_declared": True, "conflict_reason": "   "},
    {"conflict_declared": True, "conflict_reason": "Same institution", "status": "CONFLICT"},
])
def test_public_conflict_is_a_strict_one_way_recusal(payload):
    with pytest.raises(ValueError):
        PublicReviewerConflict.model_validate(payload)


def test_public_conflict_normalizes_a_meaningful_reason():
    row = PublicReviewerConflict.model_validate({
        "conflict_declared": True, "conflict_reason": "  Same institution  "})
    assert row.conflict_reason == "Same institution"


@pytest.mark.parametrize("contract", [ProgrammeEvaluationPlanCreate, ProgrammeEvaluationPlanUpdate,
    ProgrammeEvaluationPlanResponse, PublicReviewerAssignment])
def test_published_schema_advertises_the_enforced_bound(contract):
    assert contract.model_json_schema()["properties"]["rubric"]["maxItems"] == 20
