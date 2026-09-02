"""Transaction-owning commands for abstract reviewer assignments."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.abstracts.models import AbstractAssignment, AbstractReviewer, AbstractSubmission
from app.modules.audit.services.audit_service import AuditContext, AuditService


class AbstractAssignmentCommandService:
    """Assign reviewers and update assignment state as atomic commands."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _audit(self, *, event, user, action: str, resource_id, old=None, new=None):
        await AuditService.write_log_sync(
            AuditContext(
                action_type=action,
                resource_type="abstract",
                resource_id=resource_id,
                actor_user_id=user.id,
                organization_id=event.organization_id,
                actor_role=getattr(user, "role", None),
                old_state=old or {},
                new_state={**(new or {}), "event_id": str(event.id)},
            ),
            self.db,
        )

    async def assign(self, *, submission_id, reviewer_id, due_at, event, user) -> AbstractSubmission:
        try:
            submission = await self.db.scalar(
                select(AbstractSubmission).where(
                    AbstractSubmission.id == submission_id,
                    AbstractSubmission.event_id == event.id,
                    AbstractSubmission.organization_id == event.organization_id,
                ).with_for_update()
            )
            reviewer = await self.db.scalar(
                select(AbstractReviewer).where(
                    AbstractReviewer.id == reviewer_id,
                    AbstractReviewer.event_id == event.id,
                    AbstractReviewer.organization_id == event.organization_id,
                ).with_for_update()
            )
            if submission is None or reviewer is None:
                raise HTTPException(status_code=404, detail="Submission or reviewer not found")
            exists = await self.db.scalar(
                select(AbstractAssignment).where(
                    AbstractAssignment.submission_id == submission.id,
                    AbstractAssignment.reviewer_id == reviewer.id,
                    AbstractAssignment.event_id == event.id,
                    AbstractAssignment.organization_id == event.organization_id,
                )
            )
            if exists is None:
                self.db.add(AbstractAssignment(
                    organization_id=event.organization_id,
                    event_id=event.id,
                    submission_id=submission.id,
                    reviewer_id=reviewer.id,
                    due_at=due_at,
                    assigned_by=user.id,
                ))
            if submission.status == "SUBMITTED":
                submission.status = "UNDER_REVIEW"
                submission.version = int(submission.version or 1) + 1
            await self._audit(event=event, user=user, action="ABSTRACT_REVIEWER_ASSIGNED", resource_id=submission.id,
                              new={"reviewer_id": str(reviewer.id), "status": submission.status})
            await self.db.commit()
            await self.db.refresh(submission)
            return submission
        except Exception:
            await self.db.rollback()
            raise

    async def update(self, *, assignment_id, payload: dict[str, Any], event, user) -> dict[str, Any]:
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
            old = {"status": assignment.status, "conflict_declared": assignment.conflict_declared}
            for key, value in payload.items():
                setattr(assignment, key, value)
            if assignment.conflict_declared:
                assignment.status = "CONFLICT"
            await self._audit(event=event, user=user, action="ABSTRACT_ASSIGNMENT_UPDATED", resource_id=assignment.submission_id,
                              old=old, new={"assignment_id": str(assignment.id), "status": assignment.status,
                                            "conflict_declared": assignment.conflict_declared})
            await self.db.commit()
            return {"id": str(assignment.id), "status": assignment.status, "conflict_declared": assignment.conflict_declared}
        except Exception:
            await self.db.rollback()
            raise
