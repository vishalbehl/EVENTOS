"""Durable upload lifecycle operations shared by storage-backed domains."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.upload_state import TERMINAL_UPLOAD_STATES, transition_upload
from app.core.upload_validation import validate_upload_metadata
from app.modules.files.models.file import DurableUpload


class UploadService:
    @staticmethod
    async def create(
        db: AsyncSession,
        *, organization_id: uuid.UUID, created_by: uuid.UUID,
        object_key: str, original_filename: str, mime_type: str,
        size_bytes: int, checksum: str | None = None, event_id: uuid.UUID | None = None,
        storage_bucket: str = "assets",
    ) -> DurableUpload:
        validate_upload_metadata(
            filename=original_filename,
            mime_type=mime_type,
            size_bytes=size_bytes,
            declared_checksum=checksum,
        )
        row = DurableUpload(
            organization_id=organization_id, event_id=event_id, created_by=created_by,
            object_key=object_key, storage_bucket=storage_bucket, original_filename=original_filename,
            mime_type=mime_type, size_bytes=size_bytes, checksum=checksum,
            status="created",
        )
        db.add(row)
        await db.flush()
        return row

    @staticmethod
    async def transition(
        db: AsyncSession,
        upload_id: uuid.UUID,
        target: str,
        *,
        organization_id: uuid.UUID,
        error: str | None = None,
        task_id: str | None = None,
    ) -> DurableUpload:
        row = await db.scalar(
            select(DurableUpload)
            .where(
                DurableUpload.id == upload_id,
                DurableUpload.organization_id == organization_id,
            )
            .with_for_update()
        )
        if row is None:
            raise LookupError("upload_not_found")
        same_state = row.status == target
        row.status = transition_upload(row.status, target)

        # A duplicate terminal retry must be observationally idempotent. In
        # particular, do not move completion time or transfer ownership to a
        # later task that is replaying an already-finalized operation.
        if same_state and target in TERMINAL_UPLOAD_STATES:
            return row

        if error is not None and (not same_state or not row.processing_error):
            row.processing_error = error[:2000]
        if task_id is not None and (row.task_id is None or row.task_id == task_id):
            row.task_id = task_id[:255]
        row.updated_at = datetime.now(timezone.utc)
        if target == "ready" and row.completed_at is None:
            row.completed_at = datetime.now(timezone.utc)
        await db.flush()
        return row
