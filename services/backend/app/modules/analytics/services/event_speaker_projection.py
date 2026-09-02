"""Read-only source aggregation and durable event speaker projection."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.analytics.models.event_speaker_summary import EventSpeakerSummary
from app.modules.agenda.models.session_person import AgendaSessionPerson
from app.modules.agenda.models.session import Session
from app.modules.events.models.event import Event
from app.modules.events.models.speaker import Speaker
from app.modules.presentations.models.presentation_file import PresentationFile


async def refresh_event_speaker_summary(
    db: AsyncSession, *, organization_id: uuid.UUID, event_id: uuid.UUID
) -> EventSpeakerSummary | None:
    event_exists = await db.scalar(
        select(Event.id).where(
            Event.id == event_id,
            Event.organization_id == organization_id,
            Event.deleted_at.is_(None),
        )
    )
    if event_exists is None:
        return None

    speaker_filter = (Speaker.event_id == event_id, Speaker.deleted_at.is_(None))
    file_filter = (PresentationFile.event_id == event_id, PresentationFile.deleted_at.is_(None))
    row = (
        await db.execute(
            select(
                select(func.count(Speaker.id)).where(*speaker_filter).scalar_subquery().label("speaker_count"),
                select(func.count(Speaker.id)).where(*speaker_filter, Speaker.checked_in_at.is_not(None)).scalar_subquery().label("checked_in_count"),
                select(func.count(Speaker.id)).where(*speaker_filter, Speaker.upload_status.in_(["uploaded", "replaced", "approved"])).scalar_subquery().label("uploaded_count"),
                select(func.count(Speaker.id)).where(*speaker_filter, Speaker.upload_status == "approved").scalar_subquery().label("approved_count"),
                select(func.count(func.distinct(AgendaSessionPerson.speaker_id))).where(
                    AgendaSessionPerson.speaker_id.is_not(None),
                    AgendaSessionPerson.speaker_id.in_(select(Speaker.id).where(*speaker_filter)),
                    AgendaSessionPerson.session_id.in_(
                        select(Session.id).where(
                            Session.event_id == event_id,
                            Session.deleted_at.is_(None),
                        )
                    ),
                ).scalar_subquery().label("assigned_speaker_count"),
                select(func.count(PresentationFile.id)).where(*file_filter, PresentationFile.is_current_version.is_(True)).scalar_subquery().label("current_file_count"),
                select(func.count(PresentationFile.id)).where(*file_filter, PresentationFile.is_current_version.is_(True), PresentationFile.upload_status == "approved").scalar_subquery().label("approved_file_count"),
            )
        )
    ).mappings().one()

    projection = await db.get(EventSpeakerSummary, event_id)
    if projection is None:
        projection = EventSpeakerSummary(event_id=event_id, organization_id=organization_id)
        db.add(projection)
    elif projection.organization_id != organization_id:
        return None

    for field in (
        "speaker_count", "checked_in_count", "uploaded_count", "approved_count",
        "assigned_speaker_count", "current_file_count", "approved_file_count",
    ):
        setattr(projection, field, int(row[field] or 0))
    now = datetime.now(timezone.utc)
    projection.freshness_at = now
    projection.updated_at = now
    projection.rebuild_status = "ready"
    projection.last_error = None
    return projection
