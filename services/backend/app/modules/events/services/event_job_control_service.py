from __future__ import annotations

import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.events.models.event import Event
from app.modules.identity.models.user import User


class EventJobControlService:
    """Governed, lineage-preserving controls for event background jobs."""

    @staticmethod
    async def request_retry(
        db: AsyncSession,
        *,
        event: Event,
        source_type: str,
        job_id: uuid.UUID,
        actor: User,
        idempotency_key: str,
        reason: str,
    ) -> dict[str, Any]:
        del db, event, source_type, job_id, actor, idempotency_key, reason
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={
                "code": "JOB_CONTROL_RETIRED",
                "message": "Legacy job-control requests were removed from the revised schema.",
            },
        )

    @staticmethod
    async def mark_dispatch_succeeded(
        db: AsyncSession, control_id: uuid.UUID
    ) -> None:
        del db, control_id
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Job control request ledger retired.")

    @staticmethod
    async def mark_dispatch_failed(
        db: AsyncSession, control_id: uuid.UUID
    ) -> None:
        del db, control_id
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Job control request ledger retired.")
