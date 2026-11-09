"""Transaction-owning commands for abstract reviews."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from .write_authority import authorize_abstract_write, write_abstract_audit
from sqlalchemy.exc import IntegrityError

from app.modules.abstracts.models import AbstractAssignment, AbstractReview, AbstractReviewer, AbstractSubmission
from app.modules.audit.services.audit_service import AuditContext
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response


class AbstractReviewCommandService:
    """Submit a review while locking the assignment and submission."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def submit(self, *, assignment_id, payload: dict, event, user, idempotency_key: str) -> AbstractSubmission:
        try:
            await authorize_abstract_write(self.db, event, user, "abstracts.review")
            idem = await begin_idempotent(
                self.db, organization_id=event.organization_id, actor_id=user.id,
                operation="abstract.review.submit", key=idempotency_key,
                payload={"assignment_id": str(assignment_id), **payload},
            )
            target = (await self.db.execute(
                select(AbstractAssignment.submission_id, AbstractAssignment.reviewer_id).where(
                    AbstractAssignment.id == assignment_id,
                    AbstractAssignment.event_id == event.id,
                    AbstractAssignment.organization_id == event.organization_id,
                )
            )).one_or_none()
            if target is None:
                raise HTTPException(status_code=404, detail="Assignment not found")
            # Match assignment creation/deletion order: parent submission,
            # reviewer, then assignment. Never lock a child before its parent.
            submission = await self.db.scalar(select(AbstractSubmission).where(
                AbstractSubmission.id == target.submission_id,
                AbstractSubmission.event_id == event.id,
                AbstractSubmission.organization_id == event.organization_id)
                .with_for_update().execution_options(populate_existing=True))
            reviewer = await self.db.scalar(select(AbstractReviewer).where(
                AbstractReviewer.id == target.reviewer_id,
                AbstractReviewer.event_id == event.id,
                AbstractReviewer.organization_id == event.organization_id).with_for_update(read=True))
            assignment = await self.db.scalar(select(AbstractAssignment).where(
                AbstractAssignment.id == assignment_id,
                AbstractAssignment.submission_id == target.submission_id,
                AbstractAssignment.reviewer_id == target.reviewer_id,
                AbstractAssignment.event_id == event.id,
                AbstractAssignment.organization_id == event.organization_id)
                .with_for_update().execution_options(populate_existing=True))
            if assignment is None or submission is None or reviewer is None:
                raise HTTPException(status_code=404, detail="Assignment not found")
            if replay_response(idem):
                await self.db.commit()
                return submission
            if assignment.status == "COMPLETED":
                raise HTTPException(status_code=409, detail={"code": "ABSTRACT_REVIEW_ALREADY_SUBMITTED"})
            if assignment.conflict_declared:
                raise HTTPException(status_code=409, detail={"code": "ABSTRACT_REVIEW_CONFLICT_DECLARED"})

            scores_payload = payload.get("scores", {})
            from app.modules.programme.rubric_integrity import active_event_rubric, validate_review_scores
            rubric = await active_event_rubric(self.db, organization_id=event.organization_id, event_id=event.id)
            total = validate_review_scores(rubric, scores_payload)
            # Read the aggregate before adding the new review: autoflush would
            # otherwise include it and then count it a second time below.
            score_sum, score_count = (await self.db.execute(select(
                func.coalesce(func.sum(AbstractReview.total_score), 0),
                func.count(AbstractReview.id)).where(
                    AbstractReview.submission_id == submission.id,
                    AbstractReview.event_id == event.id,
                    AbstractReview.organization_id == event.organization_id))).one()
            self.db.add(AbstractReview(
                organization_id=event.organization_id,
                event_id=event.id,
                submission_id=submission.id,
                assignment_id=assignment.id,
                reviewer_id=assignment.reviewer_id,
                scores=scores_payload,
                total_score=total,
                recommendation=payload["recommendation"],
                comments_to_committee=payload.get("comments_to_committee"),
                comments_to_author=payload.get("comments_to_author"),
            ))
            assignment.status = "COMPLETED"
            submission.average_score = int(round((score_sum + total) / (score_count + 1)))
            submission.version = int(submission.version or 1) + 1
            await complete_idempotent(
                self.db, idem, response_status=200,
                response_body={"resource_id": str(submission.id), "assignment_id": str(assignment.id)},
                resource_id=submission.id,
            )
            await write_abstract_audit(
                AuditContext(
                    action_type="ABSTRACT_REVIEW_SUBMITTED",
                    correlation_id=idem.id,
                    resource_type="abstract",
                    resource_id=submission.id,
                    actor_user_id=user.id,
                    organization_id=event.organization_id,
                    actor_role=getattr(user, "role", None),
                    old_state={},
                    new_state={"assignment_id": str(assignment.id), "total_score": total, "event_id": str(event.id)},
                ),
                self.db,
                commit=False,
            )
            await self.db.commit()
            await self.db.refresh(submission)
            return submission
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(
                status_code=409,
                detail={"code": "ABSTRACT_REVIEW_ALREADY_SUBMITTED", "message": "This assignment already has a review."},
            ) from exc
        except Exception:
            await self.db.rollback()
            raise
