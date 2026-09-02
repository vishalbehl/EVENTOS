"""Transaction-owning commands for abstract decisions."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.abstracts.models import AbstractDecision, AbstractSubmission
from app.modules.audit.services.audit_service import AuditContext, AuditService


class AbstractDecisionCommandService:
    """Apply one idempotent, optimistic-concurrency-protected decision."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def decide(
        self,
        *,
        submission_id,
        decision: str,
        presentation_type: str | None,
        reason: str,
        notes_to_author: str | None,
        expected_version: int,
        idempotency_key: str,
        event,
        user,
    ) -> AbstractSubmission:
        try:
            submission = await self.db.scalar(
                select(AbstractSubmission).where(
                    AbstractSubmission.id == submission_id,
                    AbstractSubmission.event_id == event.id,
                    AbstractSubmission.organization_id == event.organization_id,
                ).with_for_update()
            )
            if submission is None:
                raise HTTPException(status_code=404, detail="Submission not found")
            existing = await self.db.scalar(
                select(AbstractDecision).where(
                    AbstractDecision.organization_id == event.organization_id,
                    AbstractDecision.event_id == event.id,
                    AbstractDecision.idempotency_key == idempotency_key,
                )
            )
            if existing:
                return submission
            if submission.version != expected_version:
                raise HTTPException(status_code=412, detail={"code": "VERSION_CONFLICT", "current_version": submission.version})
            if submission.status not in {"SUBMITTED", "UNDER_REVIEW", "REVISION_REQUESTED"}:
                raise HTTPException(status_code=409, detail={"code": "INVALID_ABSTRACT_STATE", "status": submission.status})
            old = {"status": submission.status, "version": submission.version}
            submission.status = decision
            submission.final_decision = decision
            submission.presentation_type = presentation_type
            submission.decided_at = datetime.now(timezone.utc)
            submission.version = int(submission.version or 1) + 1
            self.db.add(AbstractDecision(
                organization_id=event.organization_id,
                event_id=event.id,
                submission_id=submission.id,
                decision=decision,
                presentation_type=presentation_type,
                reason=reason,
                notes_to_author=notes_to_author,
                decided_by=user.id,
                idempotency_key=idempotency_key,
            ))
            await AuditService.write_log_sync(
                AuditContext(
                    action_type=f"ABSTRACT_{decision}",
                    resource_type="abstract",
                    resource_id=submission.id,
                    actor_user_id=user.id,
                    organization_id=event.organization_id,
                    actor_role=getattr(user, "role", None),
                    old_state=old,
                    new_state={"status": submission.status, "presentation_type": presentation_type, "event_id": str(event.id)},
                ),
                self.db,
            )
            await self.db.commit()
            await self.db.refresh(submission)
            return submission
        except Exception:
            await self.db.rollback()
            raise
