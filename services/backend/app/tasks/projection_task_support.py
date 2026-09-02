"""Shared failure handling for rebuildable analytics projection tasks."""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from sqlalchemy import select, update

from app.database import AsyncSessionLocal, tenant_org_id
from app.config import settings
from app.core.cache import cache_service
from app.modules.events.models.event import Event


@asynccontextmanager
async def projection_execution_lock(
    task_name: str,
    *,
    organization_id: uuid.UUID,
    event_id: uuid.UUID,
):
    """Deduplicate concurrent rebuilds without making Redis a data dependency.

    A Redis outage permits the rebuild to continue because projection rows are
    PostgreSQL-authoritative and rebuilds are themselves idempotent. When Redis
    is available, a duplicate worker exits before doing database work. The
    lease is bounded so a crashed worker cannot strand future retries.
    """
    lock_name = f"lock:projection:{task_name}:{organization_id}:{event_id}"
    token, backend_available = await cache_service.acquire_lock_status(
        lock_name,
        ttl_seconds=max(60, settings.REDIS_LOCK_TTL_SECONDS),
    )
    if backend_available and token is None:
        yield False
        return
    try:
        yield True
    finally:
        if token:
            await cache_service.release_lock(lock_name, token)


async def mark_projection_failed(
    model: type,
    *,
    organization_id: uuid.UUID,
    event_id: uuid.UUID,
    exc: BaseException,
    session_factory=None,
) -> None:
    """Persist a sanitized terminal state without exposing exception details."""
    token = tenant_org_id.set(organization_id)
    try:
        factory = session_factory or AsyncSessionLocal
        async with factory() as db:
            # A projection can fail before its first successful build. Keep a
            # durable marker in that case instead of silently losing the
            # failure and making the analytics read look healthy-by-absence.
            event_exists = await db.scalar(
                select(Event.id).where(
                    Event.id == event_id,
                    Event.organization_id == organization_id,
                    Event.deleted_at.is_(None),
                )
            )
            if event_exists is None:
                return
            now = datetime.now(timezone.utc)
            failure = f"Projection refresh failed after retries: {type(exc).__name__}"[:1000]
            projection = await db.scalar(
                select(model)
                .where(
                    model.organization_id == organization_id,
                    model.event_id == event_id,
                )
                .with_for_update()
            )
            if projection is None:
                # Epoch means "no successful source snapshot"; it must never
                # be mistaken for a fresh projection.
                db.add(
                    model(
                        organization_id=organization_id,
                        event_id=event_id,
                        freshness_at=datetime(1970, 1, 1, tzinfo=timezone.utc),
                        rebuild_status="failed",
                        last_error=failure,
                        updated_at=now,
                    )
                )
            else:
                await db.execute(
                    update(model)
                    .where(
                        model.organization_id == organization_id,
                        model.event_id == event_id,
                    )
                    .values(
                        rebuild_status="failed",
                        last_error=failure,
                        updated_at=now,
                    )
                )
            await db.commit()
    finally:
        tenant_org_id.reset(token)
