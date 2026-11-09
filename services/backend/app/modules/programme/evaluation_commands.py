"""Versioned scoped evaluation-plan writes using existing access and receipts."""
from datetime import datetime, timezone
import heapq
import uuid

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.core.concurrency import require_if_match
from app.core.dependencies.feature_gate import enforce_event_operation
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.modules.abstracts.models import AbstractAssignment, AbstractReviewer, AbstractSubmission
from app.modules.audit.models.audit_log import AuditLog
from app.modules.programme.models import ProgrammeEvaluationPlan as Plan
from app.modules.programme.rubric_integrity import lock_scoring_event, require_unscored_event, validated_plan_rubric
from app.modules.programme.schemas import ProgrammeEvaluationPlanApplyResult, ProgrammeEvaluationPlanResponse
from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation as Evidence


class EvaluationPlanCommands:
    @staticmethod
    async def execute(db, *, operation, payload, event, user, idempotency_key, plan_id=None, if_match=None):
        if operation not in {"create", "update", "apply"}:
            raise ValueError("Unsupported evaluation-plan command")
        if user is None:
            raise HTTPException(401, detail={"code": "AUTHENTICATION_REQUIRED"})
        if not idempotency_key:
            raise HTTPException(428, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
        expected = None if operation == "create" else require_if_match(if_match)
        if operation == "update" and payload.expected_version != expected:
            raise HTTPException(422, detail={"code": "VERSION_HEADER_BODY_MISMATCH"})
        owner, event_id, actor_id = event.organization_id, event.id, user.id
        actions = ("abstracts.configure", "abstracts.assign_reviewers") if operation == "apply" else ("abstracts.configure",)
        try:
            for action in actions:
                await enforce_event_operation(db, owner, event_id, action, user_id=actor_id)
            parent = await lock_scoring_event(db, organization_id=owner, event_id=event_id, exclusive=True)
            # Recheck inside the parent mutation transaction. The decision
            # service owns canonical membership/relationship revision fences.
            for action in actions:
                await enforce_event_operation(db, owner, event_id, action, user_id=actor_id)
            receipt = await begin_idempotent(db, organization_id=owner, actor_id=actor_id,
                operation=f"programme.evaluation_plan.{operation}", key=idempotency_key,
                payload={"event_id": str(event_id), "plan_id": str(plan_id) if plan_id else None,
                    "version": expected, "document": payload.model_dump(mode="json")})
            plan = None
            if operation != "create" or replay_response(receipt):
                target = receipt.resource_id if operation == "create" else plan_id
                plan = await db.scalar(select(Plan).where(Plan.id == target, Plan.event_id == event_id,
                    Plan.organization_id == owner).with_for_update(of=Plan)
                    .execution_options(populate_existing=True))
                if plan is None:
                    raise HTTPException(404, detail={"code": "EVALUATION_PLAN_NOT_FOUND"})
            replay = replay_response(receipt)
            if replay:
                contract = ProgrammeEvaluationPlanApplyResult if operation == "apply" else ProgrammeEvaluationPlanResponse
                result = contract.model_validate(replay[1])
                await db.commit()
                return result
            old_version = int(plan.version or 1) if plan is not None else None
            if old_version is not None and old_version != expected:
                raise HTTPException(412, detail={"code": "RESOURCE_VERSION_CONFLICT", "current_version": old_version})
            if plan is not None:
                stored_rubric = await validated_plan_rubric(db, plan)
            if operation == "apply":
                result = await EvaluationPlanCommands._apply(db, plan, payload, owner, event_id, actor_id)
            else:
                await EvaluationPlanCommands._reviewers(db, owner, event_id, payload.reviewer_ids, active=False)
                if operation == "create":
                    plan = Plan(organization_id=owner, event_id=event_id, created_by=actor_id,
                        name=payload.name, source_type=payload.source_type, scope_filter=payload.scope_filter,
                        rubric=payload.rubric, reviewer_ids=[str(value) for value in payload.reviewer_ids],
                        due_at=payload.due_at, anonymous_review=payload.anonymous_review)
                    db.add(plan)
                else:
                    if stored_rubric != payload.rubric:
                        await require_unscored_event(db, organization_id=owner, event_id=event_id)
                    for field in ("name", "scope_filter", "rubric", "due_at", "anonymous_review"):
                        setattr(plan, field, getattr(payload, field))
                    plan.reviewer_ids = [str(value) for value in payload.reviewer_ids]
                    plan.version = old_version + 1
                    plan.updated_at = datetime.now(timezone.utc)
                await db.flush()
                result = ProgrammeEvaluationPlanResponse.model_validate(plan)
            selector = db.info.get("customer_request_selector")
            state = dict(event_id=str(event_id), workspace_id=str(parent.operational_workspace_id),
                acting_organization_id=str(getattr(selector, "acting_organization_id", None) or owner),
                target_organization_id=str(owner), access_mode=getattr(selector, "access_mode", "DIRECT"),
                reason=f"Organiser evaluation plan {operation}", version=int(plan.version),
                operation=operation, reviewer_count=len(plan.reviewer_ids),
                reviewer_selection_mode="EXPLICIT" if plan.reviewer_ids else "ACTIVE_EVENT_ROSTER")
            if operation == "apply":
                state.update(assignments_created=result.assignments_created, submissions_considered=result.submissions_considered,
                    submissions_unfilled=result.submissions_unfilled,
                    has_next=result.has_next, cursor=str(payload.cursor) if payload.cursor else None)
            db.add(AuditLog(organization_id=owner, actor_user_id=actor_id, resource_type="programme_evaluation_plan",
                resource_id=plan.id, action_type=f"EVALUATION_PLAN_{operation.upper()}", correlation_id=receipt.id,
                is_sensitive=True, old_state={"version": old_version}, new_state=state))
            db.add(Evidence(organization_id=owner, event_id=event_id, resource_type="PROGRAMME_RUBRIC",
                resource_id=plan.id, resource_version=int(plan.version), operation="DOCUMENT_VALIDATION", status="VALID",
                reason="Validated by scoped evaluation-plan command.", details={"command": operation}, actor_user_id=actor_id))
            await db.flush()
            await complete_idempotent(db, receipt, response_status=201 if operation == "create" else 200,
                response_body=result.model_dump(mode="json"), resource_id=plan.id)
            await db.commit()
            return result
        except IntegrityError:
            await db.rollback()
            raise HTTPException(409, detail={"code": "EVALUATION_PLAN_CONFLICT",
                "message": "The plan or assignments changed. Reload before trying again."}) from None
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def _reviewers(db, owner, event_id, ids, *, active):
        if len(ids) > 200 or len(set(ids)) != len(ids):
            raise HTTPException(409, detail={"code": "EVALUATION_REVIEWERS_RECONCILIATION_REQUIRED"})
        if not ids:
            return []
        rows = list((await db.execute(select(AbstractReviewer.id, AbstractReviewer.capacity).where(AbstractReviewer.id.in_(ids),
            AbstractReviewer.event_id == event_id, AbstractReviewer.organization_id == owner,
            AbstractReviewer.status.in_(["ACTIVE"] if active else ["ACTIVE", "INVITED"]))
            .order_by(AbstractReviewer.id).with_for_update(of=AbstractReviewer))).all())
        if {row.id for row in rows} != set(ids):
            raise HTTPException(404, detail={"code": "EVALUATION_REVIEWERS_UNAVAILABLE"})
        return rows

    @staticmethod
    async def _apply(db, plan, payload, owner, event_id, actor_id):
        if plan.source_type != "ABSTRACT":
            raise HTTPException(409, detail={"code": "EVALUATION_PLAN_SOURCE_UNAVAILABLE"})
        active_id = await db.scalar(select(Plan.id).where(Plan.organization_id == owner, Plan.event_id == event_id,
            Plan.source_type == "ABSTRACT", Plan.status == "ACTIVE").order_by(Plan.created_at.desc(), Plan.id).limit(1))
        if active_id != plan.id:
            await require_unscored_event(db, organization_id=owner, event_id=event_id)
        try:
            raw_ids = plan.reviewer_ids
            if not isinstance(raw_ids, list) or len(raw_ids) > 200:
                raise ValueError()
            ids = [uuid.UUID(value) for value in raw_ids]
            scope = plan.scope_filter
            if scope.get("evaluator_scope", "ASSIGNED") not in {"ASSIGNED", "ALL", "SELECTED"}:
                raise ValueError()
            statuses = scope.get("status_filter", ["SUBMITTED", "UNDER_REVIEW"])
            if (not isinstance(statuses, list) or len(statuses) > 3
                    or any(value not in {"SUBMITTED", "UNDER_REVIEW", "NOMINATED"} for value in statuses)):
                raise ValueError()
            topics = [value for value in (scope.get("topic"), scope.get("category_filter")) if value not in (None, "", "ALL")]
            if any(not isinstance(value, str) or len(value) > 120 for value in topics):
                raise ValueError()
        except (TypeError, ValueError, AttributeError):
            raise HTTPException(409, detail={"code": "EVALUATION_SCOPE_RECONCILIATION_REQUIRED"}) from None
        query = select(AbstractSubmission).where(AbstractSubmission.event_id == event_id,
            AbstractSubmission.organization_id == owner, AbstractSubmission.status.in_(statuses))
        for topic in topics:
            query = query.where(AbstractSubmission.topic == topic)
        if payload.cursor:
            query = query.where(AbstractSubmission.id > payload.cursor)
        rows = list((await db.scalars(query.order_by(AbstractSubmission.id).limit(101)
            .with_for_update(of=AbstractSubmission))).all())
        submissions = rows[:100]
        if not ids and scope.get("evaluator_scope", "ASSIGNED") == "ASSIGNED":
            # A batch needs at most 100*10 new slots. Choose up to that many
            # least-loaded persisted active reviewers, never fetch an entire
            # organisation/team graph or infer eligibility from global roles.
            totals = select(AbstractAssignment.reviewer_id.label("reviewer_id"), func.count().label("assigned"))
            totals = totals.where(AbstractAssignment.organization_id == owner,
                AbstractAssignment.event_id == event_id).group_by(AbstractAssignment.reviewer_id).cte("event_reviewer_load")
            pool = list((await db.execute(select(AbstractReviewer.id, AbstractReviewer.capacity,
                func.coalesce(totals.c.assigned, 0).label("assigned")).outerjoin(
                totals, totals.c.reviewer_id == AbstractReviewer.id).where(AbstractReviewer.organization_id == owner,
                    AbstractReviewer.event_id == event_id, AbstractReviewer.status == "ACTIVE",
                    func.coalesce(totals.c.assigned, 0) < AbstractReviewer.capacity)
                .order_by(func.coalesce(totals.c.assigned, 0), AbstractReviewer.id).limit(1000)
                .with_for_update(of=AbstractReviewer))).all())
            reviewers, load = pool, {row.id: int(row.assigned) for row in pool}
            if not reviewers and await db.scalar(select(AbstractReviewer.id).where(
                AbstractReviewer.organization_id == owner, AbstractReviewer.event_id == event_id,
                AbstractReviewer.status == "ACTIVE").limit(1)) is None:
                raise HTTPException(409, detail={"code": "EVALUATION_PLAN_NO_ACTIVE_REVIEWERS"})
        else:
            reviewers = await EvaluationPlanCommands._reviewers(db, owner, event_id, ids, active=True)
            if not reviewers:
                raise HTTPException(409, detail={"code": "EVALUATION_PLAN_NO_ACTIVE_REVIEWERS"})
            load = dict((await db.execute(select(AbstractAssignment.reviewer_id, func.count(AbstractAssignment.id))
                .where(AbstractAssignment.organization_id == owner, AbstractAssignment.event_id == event_id,
                    AbstractAssignment.reviewer_id.in_(ids)).group_by(AbstractAssignment.reviewer_id))).all())
        counts = dict((await db.execute(select(AbstractAssignment.submission_id, func.count(AbstractAssignment.id))
            .where(AbstractAssignment.organization_id == owner, AbstractAssignment.event_id == event_id,
                AbstractAssignment.submission_id.in_([row.id for row in submissions]))
            .group_by(AbstractAssignment.submission_id))).all())
        existing = {row.id: set() for row in submissions}
        needs_ids = [row.id for row in submissions if counts.get(row.id, 0) < payload.assignments_per_submission]
        for submission_id, reviewer_id in (await db.execute(select(AbstractAssignment.submission_id, AbstractAssignment.reviewer_id)
            .where(AbstractAssignment.organization_id == owner, AbstractAssignment.event_id == event_id,
                AbstractAssignment.submission_id.in_(needs_ids)))).all():
            existing[submission_id].add(reviewer_id)
        by_id = {row.id: row for row in reviewers}
        available = [(int(load.get(row.id, 0)), row.id.int, row.id) for row in reviewers
            if int(load.get(row.id, 0)) < row.capacity]
        heapq.heapify(available)
        created, unfilled = 0, 0
        for submission in submissions:
            assigned, deferred = existing[submission.id], []
            needed = max(0, payload.assignments_per_submission - int(counts.get(submission.id, 0)))
            while needed and available:
                count, order, reviewer_id = heapq.heappop(available)
                if reviewer_id not in assigned:
                    db.add(AbstractAssignment(organization_id=owner, event_id=event_id, submission_id=submission.id,
                        reviewer_id=reviewer_id, due_at=plan.due_at, assigned_by=actor_id))
                    assigned.add(reviewer_id)
                    count += 1
                    needed -= 1
                    created += 1
                    if submission.status == "SUBMITTED":
                        submission.status = "UNDER_REVIEW"
                        submission.version = int(submission.version or 1) + 1
                if count < by_id[reviewer_id].capacity:
                    deferred.append((count, order, reviewer_id))
            for item in deferred:
                heapq.heappush(available, item)
            unfilled += int(needed > 0)
        plan.status, plan.version = "ACTIVE", int(plan.version or 1) + 1
        plan.updated_at = datetime.now(timezone.utc)
        return ProgrammeEvaluationPlanApplyResult(plan_id=plan.id, version=plan.version,
            assignments_created=created, submissions_considered=len(submissions), submissions_unfilled=unfilled, has_next=len(rows) > 100,
            next_cursor=submissions[-1].id if len(rows) > 100 else None)
