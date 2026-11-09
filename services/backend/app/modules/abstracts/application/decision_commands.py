"""Transaction-owning commands for abstract decisions."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from .write_authority import authorize_abstract_write, write_abstract_audit
from sqlalchemy.exc import IntegrityError

from app.modules.abstracts.models import AbstractDecision, AbstractSubmission
from app.modules.audit.services.audit_service import AuditContext
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response


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
            await authorize_abstract_write(self.db, event, user, "abstracts.decide")
            idem = await begin_idempotent(
                self.db,
                organization_id=event.organization_id,
                actor_id=user.id,
                operation="abstract.decision.single",
                key=idempotency_key,
                payload={
                    "submission_id": str(submission_id),
                    "decision": decision,
                    "presentation_type": presentation_type,
                    "reason": reason,
                    "notes_to_author": notes_to_author,
                    "expected_version": expected_version,
                },
            )
            if replay_response(idem):
                existing_submission = await self.db.scalar(select(AbstractSubmission).where(
                    AbstractSubmission.id == submission_id,
                    AbstractSubmission.event_id == event.id,
                    AbstractSubmission.organization_id == event.organization_id,
                ))
                if existing_submission is None:
                    raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_RESOURCE_MISSING"})
                await self.db.commit()
                return existing_submission
            submission = await self.db.scalar(
                select(AbstractSubmission).where(
                    AbstractSubmission.id == submission_id,
                    AbstractSubmission.event_id == event.id,
                    AbstractSubmission.organization_id == event.organization_id,
                ).with_for_update().execution_options(populate_existing=True)
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
                # Only the actor-bound receipt above proves a valid replay.
                raise HTTPException(409, detail={"code": "LEGACY_DECISION_RECEIPT_CONFLICT"})
            if submission.version != expected_version:
                raise HTTPException(status_code=412, detail={"code": "RESOURCE_VERSION_CONFLICT", "current_version": submission.version})
            allowed = {
                "SUBMITTED": {"NOMINATED", "ACCEPTED", "WAITLISTED", "REJECTED", "REVISION_REQUESTED", "WITHDRAWN"},
                "UNDER_REVIEW": {"NOMINATED", "ACCEPTED", "WAITLISTED", "REJECTED", "REVISION_REQUESTED", "WITHDRAWN"},
                "REVISION_REQUESTED": {"ACCEPTED", "WAITLISTED", "REJECTED", "WITHDRAWN"},
                "NOMINATED": {"ACCEPTED", "WAITLISTED", "REJECTED", "REVISION_REQUESTED", "WITHDRAWN"},
                "WAITLISTED": {"ACCEPTED", "REJECTED", "REVISION_REQUESTED", "WITHDRAWN"},
            }
            if decision not in allowed.get(submission.status, set()):
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
            await complete_idempotent(
                self.db,
                idem,
                response_status=200,
                response_body={"resource_id": str(submission.id), "decision": decision},
                resource_id=submission.id,
            )
            await write_abstract_audit(
                AuditContext(
                    action_type=f"ABSTRACT_{decision}",
                    correlation_id=idem.id,
                    resource_type="abstract",
                    resource_id=submission.id,
                    actor_user_id=user.id,
                    organization_id=event.organization_id,
                    actor_role=getattr(user, "role", None),
                    old_state=old,
                    new_state={"status": submission.status, "presentation_type": presentation_type,
                        "reason": reason, "event_id": str(event.id)},
                ),
                self.db,
                commit=False,
            )
            await self.db.commit()
            await self.db.refresh(submission)
            return submission
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=409, detail={"code": "ABSTRACT_DECISION_ALREADY_RECORDED"}) from exc
        except Exception:
            await self.db.rollback()
            raise

    async def decide_many(self, *, items: list[dict], decision: str, presentation_type: str | None,
                          reason: str, notes_to_author: str | None, event, user, idempotency_key: str) -> list[AbstractSubmission]:
        """Apply a committee queue decision atomically across selected rows."""
        try:
            await authorize_abstract_write(self.db, event, user, "abstracts.decide")
            if not 1 <= len(items) <= 100 or len({item["submission_id"] for item in items}) != len(items):
                raise HTTPException(422, detail={"code": "INVALID_BULK_ABSTRACT_TARGETS"})
            idem = await begin_idempotent(
                self.db, organization_id=event.organization_id, actor_id=user.id,
                operation="abstract.decision.bulk", key=idempotency_key,
                payload={"items": items, "decision": decision, "presentation_type": presentation_type, "reason": reason, "notes_to_author": notes_to_author},
            )
            if replay_response(idem):
                ids = [item["submission_id"] for item in items]
                rows = list((await self.db.scalars(select(AbstractSubmission).where(AbstractSubmission.id.in_(ids),
                    AbstractSubmission.event_id == event.id, AbstractSubmission.organization_id == event.organization_id)
                    .order_by(AbstractSubmission.id))).all())
                if len(rows) != len(items):
                    raise HTTPException(404, detail={"code": "ABSTRACT_NOT_FOUND"})
                await self.db.commit()
                return rows
            ids = [item["submission_id"] for item in items]
            rows = list((await self.db.scalars(select(AbstractSubmission).where(
                AbstractSubmission.id.in_(ids), AbstractSubmission.event_id == event.id,
                AbstractSubmission.organization_id == event.organization_id,
            ).order_by(AbstractSubmission.id).with_for_update().execution_options(populate_existing=True))).all())
            by_id = {row.id: row for row in rows}
            if len(by_id) != len(items):
                raise HTTPException(status_code=404, detail={"code": "ABSTRACT_NOT_FOUND"})
            if decision not in {"NOMINATED", "ACCEPTED", "WAITLISTED", "REJECTED", "REVISION_REQUESTED", "WITHDRAWN"}:
                raise HTTPException(status_code=422, detail={"code": "INVALID_ABSTRACT_DECISION"})
            for item in items:
                row = by_id[item["submission_id"]]
                if int(row.version or 1) != item["expected_version"]:
                    raise HTTPException(status_code=412, detail={"code": "RESOURCE_VERSION_CONFLICT", "submission_id": str(row.id), "current_version": row.version})
                allowed = {"SUBMITTED", "UNDER_REVIEW", "REVISION_REQUESTED", "NOMINATED", "WAITLISTED"}
                if row.status not in allowed:
                    raise HTTPException(status_code=409, detail={"code": "INVALID_ABSTRACT_STATE", "status": row.status, "submission_id": str(row.id)})
                old = {"status": row.status, "version": row.version}
                row.status = decision
                row.final_decision = decision
                row.presentation_type = presentation_type
                row.decided_at = datetime.now(timezone.utc)
                row.version = int(row.version or 1) + 1
                self.db.add(AbstractDecision(
                    organization_id=event.organization_id, event_id=event.id, submission_id=row.id,
                    decision=decision, presentation_type=presentation_type, reason=reason,
                    notes_to_author=notes_to_author, decided_by=user.id,
                    idempotency_key=f"{idempotency_key}:{row.id}",
                ))
                from app.modules.audit.models.audit_log import AuditLog
                selector = self.db.info.get("customer_request_selector")
                self.db.add(AuditLog(organization_id=event.organization_id, actor_user_id=user.id,
                    resource_type="abstract", resource_id=row.id, action_type=f"ABSTRACT_{decision}",
                    correlation_id=idem.id, is_sensitive=True, old_state=old,
                    new_state={"status": row.status, "version": row.version, "bulk": True,
                        "event_id": str(event.id), "workspace_id": str(event.operational_workspace_id),
                        "reason": reason, "target_organization_id": str(event.organization_id),
                        "acting_organization_id": str(getattr(selector, "acting_organization_id", None) or event.organization_id),
                        "access_mode": getattr(selector, "access_mode", "DIRECT")}))
            await complete_idempotent(self.db, idem, response_status=200, response_body={"resource_ids": [str(row.id) for row in rows]})
            await self.db.commit()
            return rows
        except Exception:
            await self.db.rollback()
            raise
