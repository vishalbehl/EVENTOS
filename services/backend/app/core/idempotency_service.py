from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.idempotency import request_hash
from app.modules.platform.models.idempotency import IdempotencyRecord


async def begin_idempotent(db: AsyncSession, *, organization_id, actor_id, operation: str, key: str, payload: Any, ttl_seconds: int = 86400) -> IdempotencyRecord:
    operation = str(operation or "").strip()
    key = str(key or "").strip()
    if not operation or len(operation) > 120:
        raise HTTPException(status_code=400, detail={"code": "INVALID_IDEMPOTENCY_OPERATION", "message": "Operation name is invalid."})
    if not key or len(key) > 255:
        raise HTTPException(status_code=400, detail={"code": "INVALID_IDEMPOTENCY_KEY", "message": "Idempotency key is invalid."})
    if ttl_seconds <= 0:
        raise HTTPException(status_code=400, detail={"code": "INVALID_IDEMPOTENCY_TTL", "message": "Idempotency retention must be positive."})
    digest = request_hash(payload)
    row = await db.scalar(select(IdempotencyRecord).where(IdempotencyRecord.organization_id == organization_id, IdempotencyRecord.operation == operation, IdempotencyRecord.idempotency_key == key).with_for_update())
    if row:
        if row.expires_at <= datetime.now(timezone.utc):
            # Expired retention records must not block a fresh operation.
            await db.delete(row)
            await db.flush()
            row = None
    if row:
        if row.request_hash != digest:
            raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT", "message": "The idempotency key was used with a different request."})
        if row.status == "COMPLETED":
            return row
        raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_IN_PROGRESS", "message": "This operation is already being processed."})
    row = IdempotencyRecord(organization_id=organization_id, actor_id=actor_id, operation=operation, idempotency_key=key, request_hash=digest, expires_at=datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds))
    try:
        async with db.begin_nested():
            db.add(row)
            await db.flush()
    except IntegrityError:
        # Another request won the unique-key race; inspect its authoritative row.
        row = await db.scalar(select(IdempotencyRecord).where(IdempotencyRecord.organization_id == organization_id, IdempotencyRecord.operation == operation, IdempotencyRecord.idempotency_key == key))
        if row is None or row.request_hash != digest:
            raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT", "message": "The idempotency key was used with a different request."})
        raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_IN_PROGRESS", "message": "This operation is already being processed."})
    return row


async def complete_idempotent(db: AsyncSession, row: IdempotencyRecord, *, response_status: int, response_body: dict, resource_id=None) -> None:
    row.status = "COMPLETED"
    row.response_status = response_status
    row.response_body = response_body
    row.resource_id = resource_id
    await db.flush()


def replay_response(row: IdempotencyRecord) -> tuple[int, dict] | None:
    """Return a completed command's original response, or ``None`` if pending."""
    if row.status != "COMPLETED" or row.response_status is None or row.response_body is None:
        return None
    return int(row.response_status), dict(row.response_body)


async def purge_expired(db: AsyncSession, *, batch_size: int = 1000) -> int:
    """Bounded maintenance operation; business records remain authoritative."""
    ids = select(IdempotencyRecord.id).where(IdempotencyRecord.expires_at < datetime.now(timezone.utc)).limit(max(1, min(batch_size, 10000)))
    result = await db.execute(delete(IdempotencyRecord).where(IdempotencyRecord.id.in_(ids)).execution_options(synchronize_session=False))
    return int(result.rowcount or 0)


class IdempotencyService:
    """Standard command-facing facade; legacy function imports remain valid."""

    begin = staticmethod(begin_idempotent)
    complete = staticmethod(complete_idempotent)
    replay = staticmethod(replay_response)
    purge_expired = staticmethod(purge_expired)
