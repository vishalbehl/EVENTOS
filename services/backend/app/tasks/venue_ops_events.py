"""Retryable delivery for Venue Ops realtime outbox events."""

import asyncio
import sys
from datetime import datetime, timezone

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.modules.technology_services.models import VenueOpsOutboxEvent
from app.modules.venue.services.websocket_service import broadcast_to_event
from app.worker import celery_app
from app.core.task_policy import policy_for

_REALTIME_POLICY = policy_for("notifications")


def _run(coro):
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    return asyncio.run(coro)


@celery_app.task(
    name="app.tasks.venue_ops_events.dispatch_pending",
    max_retries=_REALTIME_POLICY.max_retries,
    soft_time_limit=_REALTIME_POLICY.soft_timeout_seconds,
    time_limit=_REALTIME_POLICY.hard_timeout_seconds,
    acks_late=True,
    queue=_REALTIME_POLICY.queue,
)
def dispatch_pending() -> int:
    return _run(_dispatch_pending())


async def _dispatch_pending() -> int:
    delivered = 0
    async with AsyncSessionLocal() as db:
        records = list((await db.scalars(
            select(VenueOpsOutboxEvent).where(VenueOpsOutboxEvent.status == "PENDING").order_by(VenueOpsOutboxEvent.created_at).limit(100).with_for_update(skip_locked=True)
        )).all())
        has_pending = False
        for record in records:
            try:
                await broadcast_to_event(record.event_id, record.payload, record.event_name)
                record.status = "DISPATCHED"
                record.dispatched_at = datetime.now(timezone.utc)
                delivered += 1
            except Exception:
                record.attempts = int(record.attempts or 0) + 1
                has_pending = True
        await db.commit()
    if has_pending:
        celery_app.send_task("app.tasks.venue_ops_events.dispatch_pending", countdown=60)
    return delivered
