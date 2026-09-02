"""Transaction-owning commands for abstract submissions."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.abstracts.models import AbstractAuthor, AbstractSubmission
from app.modules.audit.services.audit_service import AuditContext, AuditService


class AbstractSubmissionCommandService:
    """Create a submission and its authors as one durable operation."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, *, payload: dict[str, Any], event, user) -> AbstractSubmission:
        try:
            count = int(
                await self.db.scalar(
                    select(func.count(AbstractSubmission.id)).where(
                        AbstractSubmission.event_id == event.id,
                        AbstractSubmission.organization_id == event.organization_id,
                    )
                )
                or 0
            )
            row = AbstractSubmission(
                organization_id=event.organization_id,
                event_id=event.id,
                code=f"ABS-{count + 1:04d}",
                title=payload["title"],
                body=payload["body"].strip(),
                keywords=list(dict.fromkeys(k.strip() for k in payload["keywords"] if k.strip())),
                abstract_type=payload["abstract_type"].upper(),
                topic=payload["topic"],
                track=payload["track"],
                presenter_speaker_id=payload["presenter_speaker_id"],
                submitter_speaker_id=payload["submitter_speaker_id"],
                linked_session_id=payload["linked_session_id"],
                form_payload=payload["form_payload"],
                status="SUBMITTED",
                submitted_at=datetime.now(timezone.utc),
            )
            self.db.add(row)
            await self.db.flush()
            await self.db.execute(delete(AbstractAuthor).where(AbstractAuthor.submission_id == row.id))
            for index, author in enumerate(payload["authors"]):
                full_name = str(author.get("full_name") or author.get("name") or "").strip()
                if not full_name:
                    continue
                self.db.add(
                    AbstractAuthor(
                        organization_id=event.organization_id,
                        event_id=event.id,
                        submission_id=row.id,
                        full_name=full_name,
                        email=author.get("email"),
                        affiliation=author.get("affiliation"),
                        country=author.get("country"),
                        is_presenter=bool(author.get("is_presenter")),
                        display_order=index,
                    )
                )
            await self.db.flush()
            await AuditService.write_log_sync(
                AuditContext(
                    action_type="ABSTRACT_SUBMISSION_CREATED",
                    resource_type="abstract",
                    resource_id=row.id,
                    actor_user_id=user.id,
                    organization_id=event.organization_id,
                    actor_role=getattr(user, "role", None),
                    old_state={},
                    new_state={"status": row.status, "code": row.code, "event_id": str(event.id)},
                ),
                self.db,
            )
            await self.db.commit()
            await self.db.refresh(row)
            return row
        except Exception:
            await self.db.rollback()
            raise

    async def update(self, *, submission_id, payload: dict[str, Any], expected_version: int, event, user) -> AbstractSubmission:
        try:
            row = await self.db.scalar(
                select(AbstractSubmission).where(
                    AbstractSubmission.id == submission_id,
                    AbstractSubmission.event_id == event.id,
                    AbstractSubmission.organization_id == event.organization_id,
                ).with_for_update()
            )
            if row is None:
                raise HTTPException(status_code=404, detail="Submission not found")
            if row.version != expected_version:
                raise HTTPException(status_code=412, detail={"code": "VERSION_CONFLICT", "current_version": row.version})
            if row.status in {"ACCEPTED", "REJECTED"}:
                raise HTTPException(status_code=409, detail={"code": "ABSTRACT_LOCKED", "status": row.status})
            old = {"status": row.status, "version": row.version}
            row.title = payload["title"]
            row.body = payload["body"].strip()
            row.keywords = list(dict.fromkeys(keyword.strip() for keyword in payload["keywords"] if keyword.strip()))
            row.abstract_type = payload["abstract_type"].upper()
            row.topic = payload["topic"]
            row.track = payload["track"]
            row.presenter_speaker_id = payload["presenter_speaker_id"]
            row.submitter_speaker_id = payload["submitter_speaker_id"]
            row.linked_session_id = payload["linked_session_id"]
            row.form_payload = payload["form_payload"]
            row.version = int(row.version or 1) + 1
            await self._replace_authors(row, payload["authors"], event)
            await self._audit(event, user, "ABSTRACT_SUBMISSION_UPDATED", row.id, old, {"version": row.version})
            await self.db.commit()
            await self.db.refresh(row)
            return row
        except Exception:
            await self.db.rollback()
            raise

    async def delete(self, *, submission_id, expected_version: int, event, user) -> None:
        try:
            row = await self.db.scalar(
                select(AbstractSubmission).where(
                    AbstractSubmission.id == submission_id,
                    AbstractSubmission.event_id == event.id,
                    AbstractSubmission.organization_id == event.organization_id,
                ).with_for_update()
            )
            if row is None:
                raise HTTPException(status_code=404, detail="Submission not found")
            if row.version != expected_version:
                raise HTTPException(status_code=412, detail={"code": "VERSION_CONFLICT", "current_version": row.version})
            if row.status == "ACCEPTED":
                raise HTTPException(status_code=409, detail={"code": "ACCEPTED_ABSTRACT_DELETE_BLOCKED"})
            await self._audit(event, user, "ABSTRACT_SUBMISSION_DELETED", row.id, {"status": row.status, "version": row.version}, {})
            await self.db.delete(row)
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise

    async def _replace_authors(self, submission: AbstractSubmission, authors: list[dict[str, Any]], event) -> None:
        await self.db.execute(delete(AbstractAuthor).where(AbstractAuthor.submission_id == submission.id))
        for index, author in enumerate(authors):
            full_name = str(author.get("full_name") or author.get("name") or "").strip()
            if not full_name:
                continue
            self.db.add(AbstractAuthor(
                organization_id=event.organization_id,
                event_id=event.id,
                submission_id=submission.id,
                full_name=full_name,
                email=author.get("email"),
                affiliation=author.get("affiliation"),
                country=author.get("country"),
                is_presenter=bool(author.get("is_presenter")),
                display_order=index,
            ))

    async def _audit(self, event, user, action: str, resource_id, old: dict[str, Any], new: dict[str, Any]) -> None:
        await AuditService.write_log_sync(
            AuditContext(
                action_type=action,
                resource_type="abstract",
                resource_id=resource_id,
                actor_user_id=user.id,
                organization_id=event.organization_id,
                actor_role=getattr(user, "role", None),
                old_state=old,
                new_state={**new, "event_id": str(event.id)},
            ),
            self.db,
        )
