"""Durable post-commit event staging for Venue Ops workflow updates."""

from datetime import datetime, timezone
from typing import Any
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.technology_services.models import VenueOpsOutboxEvent
from app.modules.venue.services.websocket_service import broadcast_to_event


def stage_event(db: AsyncSession, *, event_id: uuid.UUID, name: str, payload: dict[str, Any]) -> VenueOpsOutboxEvent:
    record = VenueOpsOutboxEvent(event_id=event_id, event_name=name, payload=payload, status="PENDING", attempts=0)
    db.add(record)
    return record


async def dispatch_staged_event(db: AsyncSession, record: VenueOpsOutboxEvent) -> None:
    try:
        await broadcast_to_event(record.event_id, record.payload, record.event_name)
        record.status = "DISPATCHED"
        record.attempts = int(record.attempts or 0) + 1
        record.dispatched_at = datetime.now(timezone.utc)
    except Exception:
        record.status = "PENDING"
        record.attempts = int(record.attempts or 0) + 1
    await db.commit()
    if record.status == "PENDING":
        try:
            from app.worker import celery_app
            celery_app.send_task("app.tasks.venue_ops_events.dispatch_pending", countdown=60)
        except Exception:
            # The outbox remains authoritative; the next explicit dispatch or
            # operational retry can safely pick it up.
            pass
