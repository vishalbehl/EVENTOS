from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.events.models.event import Event
from app.modules.events.models.speaker import Speaker
from app.modules.notifications.services.email_service import send_file_approved, send_file_rejected
from app.modules.presentations.models.presentation_file import PresentationFile
from app.modules.venue.models.venue_activity_log import VenueActivityLog


class PresentationFileAdministrationService:
    @staticmethod
    async def require_file(db: AsyncSession, event_id: uuid.UUID, file_id: uuid.UUID, *, lock: bool = False) -> PresentationFile:
        query = select(PresentationFile).where(PresentationFile.id == file_id, PresentationFile.event_id == event_id, PresentationFile.deleted_at.is_(None))
        if lock:
            query = query.with_for_update()
        row = await db.scalar(query)
        if not row:
            raise HTTPException(status_code=404, detail="Presentation file not found")
        return row

    @staticmethod
    async def apply(db: AsyncSession, event: Event, file_id: uuid.UUID, actor_id: uuid.UUID, action: str, *, reason: str | None = None, source: str) -> PresentationFile:
        row = await PresentationFileAdministrationService.require_file(db, event.id, file_id, lock=True)
        action = action.upper()
        if action == "APPROVE":
            row.upload_status = "approved"
            row.approved_by = actor_id
            row.approved_at = datetime.now(timezone.utc)
            row.rejection_reason = None
        elif action == "REJECT":
            if not reason or len(reason.strip()) < 3:
                raise HTTPException(status_code=422, detail="A rejection reason is required")
            row.upload_status = "rejected"
            timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
            entry = f"[{timestamp}]: {reason.strip()}"
            row.rejection_reason = f"{row.rejection_reason}\n{entry}" if row.rejection_reason else entry
        elif action == "LOCK":
            row.is_locked = True
        elif action == "UNLOCK":
            row.is_locked = False
        elif action == "RETRY_PROCESSING":
            if row.upload_status not in {"failed", "rejected", "processing"}:
                raise HTTPException(status_code=409, detail="Only failed, rejected, or processing files can be retried")
            row.upload_status = "pending_validation"
        else:
            raise HTTPException(status_code=422, detail="Unsupported file action")

        speaker = await db.get(Speaker, row.speaker_id)
        if speaker and action == "APPROVE":
            speaker.upload_status = "approved"
            await send_file_approved(speaker, event.name, db=db)
        elif speaker and action == "REJECT":
            speaker.upload_status = "rejected"
            upload_url = f"{settings.SPEAKER_PORTAL_BASE_URL}/{event.id}/{speaker.upload_token}"
            await send_file_rejected(speaker, event.name, upload_url, reason or "File rejected", db=db)

        db.add(VenueActivityLog(event_id=event.id, speaker_id=row.speaker_id, file_id=row.id, performed_by=actor_id, action=action.lower(), action_category="FILE_OPS", details={"source": source, "reason": reason}))
        await db.flush()
        return row
