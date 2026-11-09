"""Real PostgreSQL reads preserve invalid history and conceal foreign owners."""
import uuid

from fastapi import HTTPException, Response
import pytest

from app.core.tenant_context import TenantContextGuard
from app.modules.programme.models import ProgrammeEvaluationPlan
from app.modules.programme.queries import ProgrammeQueryService
from app.modules.programme.router import list_evaluation_plans
from tests.test_evaluation_rubric_contract import criteria


@pytest.mark.asyncio
@pytest.mark.parametrize("defect", ["oversized", "weights", "missing_key", "unknown_field"])
async def test_historical_evaluation_read_fails_safely_without_repair(db, event, organizer, defect):
    rubric = criteria(21 if defect == "oversized" else 1)
    if defect == "weights":
        rubric[0]["weight"] = 99
    elif defect == "missing_key":
        rubric[0].pop("key")
    elif defect == "unknown_field":
        rubric[0]["private_credential"] = "must-not-appear-in-errors"
    row = ProgrammeEvaluationPlan(organization_id=event.organization_id, event_id=event.id,
        name=f"Historical-{uuid.uuid4()}", rubric=rubric, reviewer_ids=[],
        scope_filter={"internal_note": "must-not-appear-in-errors"}, version=7)
    db.add(row)
    await db.commit()
    async with TenantContextGuard.scoped(db, event.organization_id):
        with pytest.raises(HTTPException) as denied:
            await list_evaluation_plans(event=event, _=organizer, response=Response(), db=db)
        assert denied.value.status_code == 503
        assert denied.value.detail == {"code": "EVALUATION_RUBRIC_UNAVAILABLE"}
        assert denied.value.headers == {"Cache-Control": "no-store"}
        await db.refresh(row)
        assert row.rubric == rubric
        assert row.version == 7


@pytest.mark.asyncio
async def test_evaluation_read_returns_all_twenty_criteria(db, event, organizer):
    row = ProgrammeEvaluationPlan(organization_id=event.organization_id, event_id=event.id,
        name=f"Valid-{uuid.uuid4()}", rubric=criteria(20), reviewer_ids=[])
    db.add(row)
    await db.commit()
    async with TenantContextGuard.scoped(db, event.organization_id):
        response = Response()
        result = await list_evaluation_plans(event=event, _=organizer, response=response, db=db)
        assert response.headers["Cache-Control"] == "no-store"
        assert [plan.id for plan in result] == [row.id]
        assert len(result[0].rubric) == 20


@pytest.mark.asyncio
async def test_evaluation_query_checks_both_plan_and_event_ownership(db, event, organizer, super_admin):
    own = ProgrammeEvaluationPlan(organization_id=event.organization_id, event_id=event.id,
        name=f"Owned-{uuid.uuid4()}", rubric=criteria(1), reviewer_ids=[])
    # Separate historical FKs permit this inconsistent tuple; reads must not.
    foreign = ProgrammeEvaluationPlan(organization_id=super_admin.organization_id, event_id=event.id,
        name=f"Foreign-{uuid.uuid4()}", rubric=criteria(21), reviewer_ids=[])
    db.add_all([own, foreign])
    await db.commit()
    async with TenantContextGuard.scoped(db, event.organization_id):
        result = await list_evaluation_plans(event=event, _=organizer, response=Response(), db=db)
        assert [plan.id for plan in result] == [own.id]
    async with TenantContextGuard.scoped(db, super_admin.organization_id):
        result = await ProgrammeQueryService(db).evaluation_plans(
            event_id=event.id, organization_id=super_admin.organization_id)
        assert result == []
