"""Independent transactions run the actual public review and repair commands."""
import asyncio
from datetime import date, datetime, timedelta, timezone
import uuid

from fastapi import HTTPException
import pytest
import pytest_asyncio
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.modules.abstracts.models import AbstractAssignment, AbstractReview, AbstractReviewer, AbstractSubmission
from app.modules.audit.models.audit_log import AuditLog
from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.platform.models.idempotency import IdempotencyRecord
from app.modules.platform.models.organization import Organization
from app.modules.programme.models import ProgrammeAccessGrant, ProgrammeEvaluationPlan
from app.modules.programme.router import _hash_token, declare_reviewer_conflict, submit_public_review
from app.modules.programme.schemas import PublicReviewerConflict, PublicReviewerReview
from app.modules.rbac.models.access_foundation import OperationalWorkspace, OrganizationAccessRevision
from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation as Evidence
from tests.test_catalogue_retirement_concurrency import race_fixture, wait_for_blocker
from tests.test_programme_rubric_reconciliation import repair


@pytest_asyncio.fixture
async def scoring_fixture(committed_session_factory, race_fixture):
    data = {**race_fixture, "owner_id": uuid.uuid4(), "event_id": uuid.uuid4(),
        "plan_id": uuid.uuid4(), "assignment_id": uuid.uuid4(), "token": uuid.uuid4().hex,
        "key_prefix": f"rubric-order-{uuid.uuid4()}"}
    async with committed_session_factory() as db:
        db.add(Organization(id=data["owner_id"], name="Rubric score ordering fixture", slug=f"rubric-{data['owner_id'].hex}"))
        await db.flush()
        workspace = OperationalWorkspace(organization_id=data["owner_id"], name="Scoring workspace")
        db.add_all([workspace, OrganizationAccessRevision(organization_id=data["owner_id"])])
        await db.flush()
        db.add(Event(id=data["event_id"], organization_id=data["owner_id"], created_by=data["actor_id"],
            operational_workspace_id=workspace.id, name="Scoring ordering event",
            short_code=f"RO{uuid.uuid4().hex[:8]}", start_date=date(2026, 10, 22), end_date=date(2026, 10, 23),
            location="Local test", timezone="UTC", status="draft"))
        await db.flush()
        values = dict(organization_id=data["owner_id"], event_id=data["event_id"])
        reviewer = AbstractReviewer(**values, email=f"rubric-{uuid.uuid4()}@example.test",
            full_name="Fixture reviewer", status="ACTIVE", user_id=data["actor_id"])
        submission = AbstractSubmission(**values, code=f"RO-{uuid.uuid4().hex[:10]}", title="Scoring fixture")
        db.add_all([reviewer, submission])
        await db.flush()
        data["submission_id"] = submission.id
        db.add_all([
            AbstractAssignment(**values, id=data["assignment_id"], submission_id=submission.id, reviewer_id=reviewer.id),
            ProgrammeEvaluationPlan(**values, id=data["plan_id"], name="Historical rubric", rubric=[
                {"key": "score_0", "label": "Quality", "weight": 99}], reviewer_ids=[], status="DRAFT"),
            ProgrammeEvaluationPlan(**values, name="Active approved scoring", rubric=[
                {"key": "score_0", "label": "Quality", "max": 10, "weight": 100}], reviewer_ids=[], status="ACTIVE"),
            ProgrammeAccessGrant(**values, audience="REVIEWER", email=reviewer.email,
                token_hash=_hash_token(data["token"]), expires_at=datetime.now(timezone.utc) + timedelta(hours=1)),
            Evidence(**values, resource_type="PROGRAMME_RUBRIC", resource_id=data["plan_id"],
                resource_version=1, operation="DOCUMENT_VALIDATION", status="BLOCKED")])
        await db.commit()
    try:
        yield data
    finally:
        # Exact synthetic fixture cleanup in the isolated test database only.
        async with committed_session_factory() as db:
            await db.execute(delete(AuditLog).where(AuditLog.resource_id == data["plan_id"]))
            await db.execute(delete(AuditLog).where(AuditLog.organization_id == data["owner_id"]))
            await db.execute(delete(IdempotencyRecord).where(
                IdempotencyRecord.idempotency_key.like(data["key_prefix"] + "%")))
            await db.execute(delete(Evidence).where(Evidence.organization_id == data["owner_id"]))
            await db.execute(delete(Event).where(Event.id == data["event_id"]))
            await db.execute(delete(OperationalWorkspace).where(OperationalWorkspace.organization_id == data["owner_id"]))
            await db.execute(delete(OrganizationAccessRevision).where(OrganizationAccessRevision.organization_id == data["owner_id"]))
            await db.execute(delete(Organization).where(Organization.id == data["owner_id"]))
            await db.commit()


async def write_review(db, data):
    async with TenantContextGuard.scoped(db, data["owner_id"]):
        return await submit_public_review(data["token"], data["assignment_id"],
            PublicReviewerReview(scores={"score_0": 7}, recommendation="ACCEPT"),
            idempotency_key=data["key_prefix"] + "-review", db=db)


async def write_repair(db, data):
    async with TenantContextGuard.scoped(db, data["platform_id"]):
        actor = await db.get(User, data["actor_id"])
        return await repair(db, data["plan_id"], actor, key=data["key_prefix"] + "-repair")


async def write_conflict(db, data, *, expected=1, key_suffix="-conflict", reason="Same institution"):
    return await declare_reviewer_conflict(data["token"], data["assignment_id"],
        PublicReviewerConflict(conflict_declared=True, conflict_reason=reason),
        if_match=str(expected), idempotency_key=data["key_prefix"] + key_suffix, db=db)


@pytest.mark.asyncio
async def test_public_conflict_is_versioned_idempotent_audited_and_blocks_review(
        committed_session_factory, scoring_fixture):
    data = scoring_fixture
    async with committed_session_factory() as db:
        first = await write_conflict(db, data)
        replay = await write_conflict(db, data)
        assert first == replay == {"status": "CONFLICT", "conflict_declared": True,
            "submission_version": 2}

    async with committed_session_factory() as db:
        with pytest.raises(HTTPException) as changed_payload:
            await write_conflict(db, data, reason="Financial conflict")
        assert changed_payload.value.status_code == 409

    async with committed_session_factory() as db:
        with pytest.raises(HTTPException) as stale:
            await write_conflict(db, data, expected=1, key_suffix="-stale")
        assert stale.value.status_code == 412
        assert stale.value.detail == {"code": "RESOURCE_VERSION_CONFLICT", "current_version": 2}

    async with committed_session_factory() as db:
        with pytest.raises(HTTPException) as review_denied:
            await write_review(db, data)
        assert review_denied.value.status_code == 409
        assert review_denied.value.detail["code"] == "ABSTRACT_REVIEW_CONFLICT_DECLARED"

    async with committed_session_factory() as observer:
        assignment = await observer.get(AbstractAssignment, data["assignment_id"])
        submission = await observer.get(AbstractSubmission, data["submission_id"])
        audits = list((await observer.scalars(select(AuditLog).where(
            AuditLog.organization_id == data["owner_id"],
            AuditLog.action_type == "ABSTRACT_PUBLIC_REVIEW_CONFLICT_UPDATED"))).all())
        receipts = list((await observer.scalars(select(IdempotencyRecord).where(
            IdempotencyRecord.organization_id == data["owner_id"],
            IdempotencyRecord.operation == "abstract.public_review.conflict"))).all())
        assert assignment.status == "CONFLICT" and assignment.conflict_declared is True
        assert submission.version == 2
        assert len(audits) == 1 and audits[0].resource_id == data["assignment_id"]
        assert len(receipts) == 1 and receipts[0].resource_id == data["assignment_id"]


@pytest.mark.asyncio
@pytest.mark.parametrize("review_first", [True, False])
async def test_score_commit_and_reviewed_rubric_correction_are_ordered(
        committed_session_factory, scoring_fixture, review_first):
    data, task = scoring_fixture, None
    try:
        async with committed_session_factory() as outer, committed_session_factory() as competing:
            connection = await outer.connection()
            async with AsyncSession(bind=connection, expire_on_commit=False,
                    join_transaction_mode="create_savepoint") as ordered:
                first = await (write_review(ordered, data) if review_first else write_repair(ordered, data))
                if review_first:
                    assert uuid.UUID(first["review_id"])
                pid = await competing.scalar(text("SELECT pg_backend_pid()"))
                task = asyncio.create_task(write_repair(competing, data) if review_first else write_review(competing, data))
                await wait_for_blocker(ordered, pid, task)
                await ordered.close()
                await outer.commit()
                if review_first:
                    with pytest.raises(HTTPException) as denied:
                        await asyncio.wait_for(task, 15)
                    assert denied.value.status_code == 409
                    assert denied.value.detail["code"] == "RECORDED_SCORES_IMMUTABLE"
                else:
                    assert uuid.UUID((await asyncio.wait_for(task, 15))["review_id"])
        async with committed_session_factory() as observer:
            row = await observer.get(ProgrammeEvaluationPlan, data["plan_id"])
            assert row.version == (1 if review_first else 2)
            assert row.rubric[0]["weight"] == (99 if review_first else 100)
            reviews = list((await observer.scalars(select(AbstractReview).where(AbstractReview.event_id == data["event_id"]))).all())
            assert len(reviews) == 1 and reviews[0].scores == {"score_0": 7}
            assert reviews[0].total_score == 7
    finally:
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
