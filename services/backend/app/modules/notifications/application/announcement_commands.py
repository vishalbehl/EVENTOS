"""Transaction-owned commands for event announcements."""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.communications.models.announcement import Announcement
from app.modules.notifications.schemas.announcement import AnnouncementCreate
from app.schemas.common import MessageResponse


class AnnouncementCommandService:
    """Own announcement writes while preserving the legacy response shapes."""

    @staticmethod
    async def create(
        db: AsyncSession,
        *,
        event,
        actor_id: uuid.UUID,
        data: AnnouncementCreate,
        idempotency_key: str,
    ) -> Announcement:
        attachments_dump = None
        announcement_id = data.id or uuid.uuid5(
            uuid.NAMESPACE_URL,
            f"eventos:announcement:{event.organization_id}:{idempotency_key}",
        )
        if data.attachments:
            attachments_dump = [item.model_dump() for item in data.attachments]
            expected_prefix = f"{event.organization_id}/{event.id}/announcements/{announcement_id}/"
            if any(
                item.get("type") == "file"
                and (
                    not item.get("storage_path")
                    or not item["storage_path"].startswith(expected_prefix)
                )
                for item in attachments_dump
            ):
                raise HTTPException(
                    status_code=422,
                    detail={"code": "INVALID_ANNOUNCEMENT_ATTACHMENT_SCOPE"},
                )
        try:
            existing = await db.scalar(
                select(Announcement)
                .where(
                    Announcement.id == announcement_id,
                    Announcement.event_id == event.id,
                )
                .with_for_update()
            )
            if existing is not None:
                expected = {
                    "event_id": event.id,
                    "created_by": actor_id,
                    "title": data.title,
                    "body": data.body,
                    "audience": data.audience,
                    "priority": data.priority,
                    "is_pinned": data.is_pinned,
                    "scheduled_at": data.scheduled_at,
                    "expires_at": data.expires_at,
                    "attachments": attachments_dump,
                }
                if all(getattr(existing, key) == value for key, value in expected.items()):
                    return existing
                raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT"})
            row = Announcement(
                id=announcement_id,
                event_id=event.id,
                title=data.title,
                body=data.body,
                audience=data.audience,
                priority=data.priority,
                is_pinned=data.is_pinned,
                scheduled_at=data.scheduled_at,
                expires_at=data.expires_at,
                attachments=attachments_dump,
                created_by=actor_id,
            )
            db.add(row)
            await db.commit()
            await db.refresh(row)
            return row
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def archive(
        db: AsyncSession,
        *,
        event_id: uuid.UUID,
        announcement_id: uuid.UUID,
        actor_id: uuid.UUID,
    ) -> MessageResponse:
        try:
            row = await db.scalar(
                select(Announcement)
                .where(
                    Announcement.id == announcement_id,
                    Announcement.event_id == event_id,
                    Announcement.deleted_at.is_(None),
                )
                .with_for_update()
            )
            if row is None:
                raise HTTPException(status_code=404, detail="Announcement not found")
            row.deleted_at = datetime.now(timezone.utc)
            row.deleted_by = actor_id
            await db.commit()
            return MessageResponse(
                message="Announcement archived and remains recoverable through Command Center."
            )
        except Exception:
            await db.rollback()
            raise
