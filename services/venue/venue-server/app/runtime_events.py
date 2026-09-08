"""Write helper for the device-facing authoritative runtime stream."""

import uuid
import inspect
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.venue_runtime_event import VenueRuntimeEvent


def record_runtime_event(
    db: AsyncSession,
    *,
    event_id: uuid.UUID,
    event_type: str,
    entity_type: str,
    entity_id: str,
    payload: Optional[dict[str, Any]] = None,
    room_id: uuid.UUID | None = None,
    session_id: uuid.UUID | None = None,
) -> VenueRuntimeEvent:
    row = VenueRuntimeEvent(
        event_id=event_id,
        room_id=room_id,
        session_id=session_id,
        entity_type=entity_type,
        entity_id=entity_id,
        event_type=event_type,
        payload=payload or {},
    )
    result = db.add(row)
    # Some router unit tests use AsyncMock for the session. SQLAlchemy's real
    # AsyncSession.add is synchronous, so close a mock coroutine without
    # changing the production write path.
    if inspect.iscoroutine(result):
        result.close()
    return row
