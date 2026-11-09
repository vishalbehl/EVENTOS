"""Transaction-owning commands for abstract publication."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from .write_authority import authorize_abstract_write, write_abstract_audit

from app.modules.abstracts.models import AbstractSubmission
from app.modules.audit.services.audit_service import AuditContext


class AbstractPublicationCommandService:
    """Publish accepted abstracts inside an explicit transaction."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def publish(self, *, submission_id, publication_payload: dict, event, user) -> AbstractSubmission:
        try:
            await authorize_abstract_write(self.db, event, user, "abstracts.publish")
            submission = await self.db.scalar(
                select(AbstractSubmission).where(
                    AbstractSubmission.id == submission_id,
                    AbstractSubmission.event_id == event.id,
                    AbstractSubmission.organization_id == event.organization_id,
                ).with_for_update().execution_options(populate_existing=True)
            )
            if submission is None:
                raise HTTPException(status_code=404, detail="Submission not found")
            if submission.status != "ACCEPTED":
                raise HTTPException(status_code=409, detail={"code": "ABSTRACT_NOT_ACCEPTED", "status": submission.status})
            old = {"published_at": submission.published_at.isoformat() if submission.published_at else None}
            submission.publication_payload = publication_payload
            submission.published_at = datetime.now(timezone.utc)
            submission.version = int(submission.version or 1) + 1
            await write_abstract_audit(
                AuditContext(
                    action_type="ABSTRACT_PUBLISHED",
                    resource_type="abstract",
                    resource_id=submission.id,
                    actor_user_id=user.id,
                    organization_id=event.organization_id,
                    actor_role=getattr(user, "role", None),
                    old_state=old,
                    new_state={"published_at": submission.published_at.isoformat(), "event_id": str(event.id)},
                ),
                self.db,
                commit=False,
            )
            await self.db.commit()
            await self.db.refresh(submission)
            return submission
        except Exception:
            await self.db.rollback()
            raise

    async def publish_all(self, *, event, user) -> list[AbstractSubmission]:
        """Publish all currently accepted, unpublished submissions atomically."""
        try:
            await authorize_abstract_write(self.db, event, user, "abstracts.publish")
            rows = list((await self.db.scalars(
                select(AbstractSubmission).where(
                    AbstractSubmission.event_id == event.id,
                    AbstractSubmission.organization_id == event.organization_id,
                    AbstractSubmission.status == "ACCEPTED",
                    AbstractSubmission.published_at.is_(None),
                ).order_by(AbstractSubmission.id).limit(101).with_for_update()
                .execution_options(populate_existing=True)
            )).all())
            if len(rows) > 100:
                raise HTTPException(409, detail={"code": "BOUNDED_PUBLICATION_COMMAND_REQUIRED",
                    "message": "Use a versioned batch of at most 100 submissions."})
            now = datetime.now(timezone.utc)
            for row in rows:
                row.published_at = now
                row.version = int(row.version or 1) + 1
                await write_abstract_audit(
                    AuditContext(
                        action_type="ABSTRACT_PUBLISHED",
                        resource_type="abstract",
                        resource_id=row.id,
                        actor_user_id=user.id,
                        organization_id=event.organization_id,
                        actor_role=getattr(user, "role", None),
                        old_state={},
                        new_state={"bulk": True, "event_id": str(event.id)},
                    ),
                    self.db,
                    commit=False,
                )
            await self.db.commit()
            return rows
        except Exception:
            await self.db.rollback()
            raise
