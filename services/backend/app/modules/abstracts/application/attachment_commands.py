"""Transaction-owning commands for abstract attachments."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.abstracts.models import AbstractAttachment, AbstractSubmission
from app.modules.audit.services.audit_service import AuditContext, AuditService


class AbstractAttachmentCommandService:
    """Attach verified file metadata to a submission."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def add(self, *, submission_id, payload: dict, event, user) -> AbstractSubmission:
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
            self.db.add(AbstractAttachment(
                organization_id=event.organization_id,
                event_id=event.id,
                submission_id=submission.id,
                kind=payload["kind"],
                filename=payload["filename"],
                storage_path=payload["storage_path"],
                mime_type=payload.get("mime_type"),
                file_size_bytes=payload.get("file_size_bytes"),
            ))
            submission.version = int(submission.version or 1) + 1
            await AuditService.write_log_sync(
                AuditContext(
                    action_type="ABSTRACT_ATTACHMENT_ADDED",
                    resource_type="abstract",
                    resource_id=submission.id,
                    actor_user_id=user.id,
                    organization_id=event.organization_id,
                    actor_role=getattr(user, "role", None),
                    old_state={},
                    new_state={"filename": payload["filename"], "event_id": str(event.id)},
                ),
                self.db,
            )
            await self.db.commit()
            await self.db.refresh(submission)
            return submission
        except Exception:
            await self.db.rollback()
            raise
