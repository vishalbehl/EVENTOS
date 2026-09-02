"""Transaction-owning commands for abstract reviews."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.abstracts.models import AbstractAssignment, AbstractReview, AbstractSubmission
from app.modules.audit.services.audit_service import AuditContext, AuditService


class AbstractReviewCommandService:
    """Submit a review while locking the assignment and submission."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def submit(self, *, assignment_id, payload: dict, event, user) -> AbstractSubmission:
        try:
            assignment = await self.db.scalar(
                select(AbstractAssignment).where(
                    AbstractAssignment.id == assignment_id,
                    AbstractAssignment.event_id == event.id,
                    AbstractAssignment.organization_id == event.organization_id,
                ).with_for_update()
            )
            if assignment is None:
                raise HTTPException(status_code=404, detail="Assignment not found")
            if assignment.status == "COMPLETED":
                raise HTTPException(status_code=409, detail={"code": "ABSTRACT_REVIEW_ALREADY_SUBMITTED"})
            if assignment.conflict_declared:
                raise HTTPException(status_code=409, detail={"code": "ABSTRACT_REVIEW_CONFLICT_DECLARED"})

            submission = await self.db.scalar(
                select(AbstractSubmission).where(
                    AbstractSubmission.id == assignment.submission_id,
                    AbstractSubmission.event_id == event.id,
                    AbstractSubmission.organization_id == event.organization_id,
                ).with_for_update()
            )
            if submission is None:
                raise HTTPException(status_code=404, detail="Submission not found")

            scores_payload = payload.get("scores") or {}
            total = sum(int(value) for value in scores_payload.values())
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
            prior_scores = (await self.db.scalars(
                select(AbstractReview.total_score).where(
                    AbstractReview.submission_id == submission.id,
                    AbstractReview.organization_id == event.organization_id,
                )
            )).all()
            submission.average_score = int(round((sum(prior_scores) + total) / (len(prior_scores) + 1)))
            submission.version = int(submission.version or 1) + 1
            await AuditService.write_log_sync(
                AuditContext(
                    action_type="ABSTRACT_REVIEW_SUBMITTED",
                    resource_type="abstract",
                    resource_id=submission.id,
                    actor_user_id=user.id,
                    organization_id=event.organization_id,
                    actor_role=getattr(user, "role", None),
                    old_state={},
                    new_state={"assignment_id": str(assignment.id), "total_score": total, "event_id": str(event.id)},
                ),
                self.db,
            )
            await self.db.commit()
            await self.db.refresh(submission)
            return submission
        except Exception:
            await self.db.rollback()
            raise
