"""Read-only source aggregation and durable event attendance projection."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.analytics.models.event_attendance_summary import EventAttendanceSummary
from app.modules.events.models.event import Event
from app.modules.registration.models.check_in import CheckIn
from app.modules.registration.models.participant import Participant


async def refresh_event_attendance_summary(
    db: AsyncSession, *, organization_id: uuid.UUID, event_id: uuid.UUID
) -> EventAttendanceSummary | None:
    event_exists = await db.scalar(
        select(Event.id).where(
            Event.id == event_id,
            Event.organization_id == organization_id,
            Event.deleted_at.is_(None),
        )
    )
    if event_exists is None:
        return None

    row = (
        await db.execute(
            select(
                select(func.count(Participant.id)).where(
                    Participant.event_id == event_id, Participant.deleted_at.is_(None)
                ).scalar_subquery().label("registered_participant_count"),
                select(func.count(func.distinct(CheckIn.participant_id))).where(
                    CheckIn.event_id == event_id
                ).scalar_subquery().label("checked_in_participant_count"),
                select(func.count(CheckIn.id)).where(
                    CheckIn.event_id == event_id
                ).scalar_subquery().label("checkin_count"),
                select(func.count(func.distinct(CheckIn.session_id))).where(
                    CheckIn.event_id == event_id
                ).scalar_subquery().label("session_count"),
            )
        )
    ).mappings().one()

    projection = await db.get(EventAttendanceSummary, event_id)
    if projection is None:
        projection = EventAttendanceSummary(event_id=event_id, organization_id=organization_id)
        db.add(projection)
    elif projection.organization_id != organization_id:
        return None
    for field in (
        "registered_participant_count", "checked_in_participant_count",
        "checkin_count", "session_count",
    ):
        setattr(projection, field, int(row[field] or 0))
    now = datetime.now(timezone.utc)
    projection.freshness_at = now
    projection.updated_at = now
    projection.rebuild_status = "ready"
    projection.last_error = None
    return projection
