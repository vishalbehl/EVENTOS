"""Serialize scoring-definition changes against both abstract review writers."""
from fastapi import HTTPException
from sqlalchemy import func, select

from app.modules.abstracts.models import AbstractReview
from app.modules.events.models.event import Event
from app.modules.platform.models.organization import Organization
from app.modules.rbac.models.access_foundation import OperationalWorkspace
from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation as Evidence
from app.modules.registration.schemas.event_form_contracts import evaluation_rubric_projection


async def lock_scoring_event(db, *, organization_id, event_id, exclusive=False):
    # Review commands already take this parent's FOR SHARE lock through
    # authorize_abstract_write. Public review takes it before child locks too.
    # NO KEY UPDATE conflicts with FOR SHARE without blocking receipt FK reads.
    owner = (await db.execute(select(Organization.id, Organization.is_active,
        Organization.suspended_at, Organization.archived_at).where(Organization.id == organization_id)
        .with_for_update(read=True, of=Organization))).one_or_none()
    if owner is None:
        raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"})
    if not owner.is_active or owner.suspended_at is not None or owner.archived_at is not None:
        raise HTTPException(409, detail={"code": "ORGANIZATION_NOT_OPERATIONAL"})
    workspace_id = await db.scalar(select(Event.operational_workspace_id).where(
        Event.id == event_id, Event.organization_id == organization_id, Event.deleted_at.is_(None)))
    if workspace_id is None:
        raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"})
    workspace = (await db.execute(select(OperationalWorkspace.id, OperationalWorkspace.status).where(
        OperationalWorkspace.id == workspace_id, OperationalWorkspace.organization_id == organization_id)
        .with_for_update(read=True, of=OperationalWorkspace))).one_or_none()
    if workspace is None:
        raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"})
    if workspace.status != "ACTIVE":
        raise HTTPException(409, detail={"code": "WORKSPACE_NOT_OPERATIONAL"})
    row = (await db.execute(select(Event.id, Event.operational_workspace_id).where(Event.id == event_id,
        Event.organization_id == organization_id, Event.deleted_at.is_(None),
        Event.operational_workspace_id == workspace_id,
        func.lower(Event.status) != "archived")
        .with_for_update(read=not exclusive, key_share=exclusive, of=Event))).one_or_none()
    if row is None:
        raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"})
    return row


async def require_unscored_event(db, *, organization_id, event_id):
    # Historical reviews have no trustworthy plan-version FK. Do not guess
    # which plan produced them; a committed event score prevents rubric repair.
    if await db.scalar(select(AbstractReview.id).where(
        AbstractReview.organization_id == organization_id,
        AbstractReview.event_id == event_id).limit(1)) is not None:
        raise HTTPException(409, detail={"code": "RECORDED_SCORES_IMMUTABLE",
            "message": "Submitted scores exist. Their scoring definitions cannot be rewritten."})


async def validated_plan_rubric(db, plan):
    if plan is None:
        raise HTTPException(409, detail={"code": "EVALUATION_RUBRIC_UNAVAILABLE",
            "message": "The organiser must activate an evaluation plan before reviews can be submitted."})
    if await db.scalar(select(Evidence.id).where(Evidence.organization_id == plan.organization_id,
        Evidence.resource_type == "PROGRAMME_RUBRIC", Evidence.resource_id == plan.id,
        Evidence.resource_version == int(plan.version or 1), Evidence.operation == "DOCUMENT_VALIDATION",
        Evidence.status == "BLOCKED")) is not None:
        raise HTTPException(409, detail={"code": "EVALUATION_RUBRIC_RECONCILIATION_REQUIRED"})
    try:
        return evaluation_rubric_projection(plan.rubric)
    except (TypeError, ValueError):
        raise HTTPException(409, detail={"code": "EVALUATION_RUBRIC_RECONCILIATION_REQUIRED"}) from None


async def active_event_rubric(db, *, organization_id, event_id):
    from app.modules.programme.models import ProgrammeEvaluationPlan
    plan = await db.scalar(select(ProgrammeEvaluationPlan).where(
        ProgrammeEvaluationPlan.organization_id == organization_id, ProgrammeEvaluationPlan.event_id == event_id,
        ProgrammeEvaluationPlan.source_type == "ABSTRACT", ProgrammeEvaluationPlan.status == "ACTIVE")
        .order_by(ProgrammeEvaluationPlan.created_at.desc(), ProgrammeEvaluationPlan.id).limit(1))
    return await validated_plan_rubric(db, plan)


def validate_review_scores(rubric, scores):
    if (not isinstance(scores, dict) or len(scores) > 20
            or any(not isinstance(key, str) or not 1 <= len(key) <= 100
                or type(value) is not int or not 0 <= value <= 1000 for key, value in scores.items())):
        raise HTTPException(422, detail={"code": "INVALID_REVIEW_SCORES"})
    bounds = {item["key"]: item["max"] for item in rubric}
    missing = sorted(set(bounds) - set(scores))
    if missing:
        raise HTTPException(422, detail={"code": "ABSTRACT_REVIEW_SCORES_INCOMPLETE", "missing": missing})
    invalid = [key for key, value in scores.items() if key not in bounds or value > bounds[key]]
    if invalid:
        raise HTTPException(422, detail={"code": "ABSTRACT_REVIEW_SCORE_OUT_OF_RANGE", "fields": invalid})
    return sum(scores.values())
