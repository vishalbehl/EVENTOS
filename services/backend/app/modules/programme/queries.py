from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.abstracts.models import AbstractCall, AbstractReviewer, AbstractSubmission
from app.modules.agenda.models import Session
from app.modules.events.models.speaker import Speaker
from app.modules.events.models.event import Event
from app.modules.programme.models import ProgrammeEvaluationPlan, ProgrammeMembership, ProgrammeSchedulePublication


@dataclass(frozen=True)
class ProgrammeLifecycleRead:
    call_status: str | None
    submissions: dict[str, int]
    reviewers: dict[str, int]
    speakers: dict[str, int]
    schedule: dict[str, object]
    actions: list[dict[str, str]]


class ProgrammeQueryService:
    """Bounded, event-scoped programme read boundary."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def lifecycle(self, *, event_id: uuid.UUID, organization_id: uuid.UUID) -> ProgrammeLifecycleRead:
        event = await self.db.scalar(select(Event).where(Event.id == event_id, Event.organization_id == organization_id))
        if event is None:
            return ProgrammeLifecycleRead(None, {}, {}, {}, {"total_sessions": 0, "scheduled_sessions": 0, "publication_status": "DRAFT", "embed_enabled": False, "json_feed_enabled": False}, [])
        call = await self.db.scalar(select(AbstractCall).where(AbstractCall.event_id == event_id, AbstractCall.organization_id == organization_id))
        submission_rows = (await self.db.execute(
            select(AbstractSubmission.status, func.count(AbstractSubmission.id))
            .where(AbstractSubmission.event_id == event_id, AbstractSubmission.organization_id == organization_id)
            .group_by(AbstractSubmission.status)
        )).all()
        reviewer_rows = (await self.db.execute(
            select(AbstractReviewer.status, func.count(AbstractReviewer.id))
            .where(AbstractReviewer.event_id == event_id, AbstractReviewer.organization_id == organization_id)
            .group_by(AbstractReviewer.status)
        )).all()
        speaker_total = int(await self.db.scalar(select(func.count(Speaker.id)).where(Speaker.event_id == event_id)) or 0)
        session_total = int(await self.db.scalar(select(func.count(Session.id)).where(Session.event_id == event_id, Session.deleted_at.is_(None))) or 0)
        scheduled_total = int(await self.db.scalar(select(func.count(Session.id)).where(
            Session.event_id == event_id,
            Session.deleted_at.is_(None),
            Session.start_time.is_not(None),
            Session.end_time.is_not(None),
            Session.room_id.is_not(None),
        )) or 0)
        publication = await self.db.scalar(select(ProgrammeSchedulePublication).where(ProgrammeSchedulePublication.event_id == event_id, ProgrammeSchedulePublication.organization_id == organization_id))
        submitted = {status: int(count) for status, count in submission_rows}
        reviewers = {status: int(count) for status, count in reviewer_rows}
        actions: list[dict[str, str]] = []
        if call is None or call.status == "DRAFT":
            actions.append({"severity": "info", "label": "Configure the call for abstracts", "destination": "/abstracts/setup"})
        if submitted.get("SUBMITTED", 0) and not reviewers.get("ACTIVE", 0):
            actions.append({"severity": "warning", "label": "Invite reviewers before decisions begin", "destination": "/abstracts/reviewers"})
        if submitted.get("ACCEPTED", 0) > scheduled_total:
            actions.append({"severity": "warning", "label": "Accepted content is waiting to be scheduled", "destination": "/sessions/builder"})
        if session_total and scheduled_total < session_total:
            actions.append({"severity": "info", "label": "Complete room and time allocation", "destination": "/sessions/builder"})
        if publication is None or publication.status != "PUBLISHED":
            actions.append({"severity": "info", "label": "Review schedule publication settings", "destination": "/sessions/builder"})
        return ProgrammeLifecycleRead(
            call_status=call.status if call else None,
            submissions=submitted,
            reviewers=reviewers,
            speakers={"TOTAL": speaker_total},
            schedule={
                "total_sessions": session_total,
                "scheduled_sessions": scheduled_total,
                "publication_status": publication.status if publication else "DRAFT",
                "embed_enabled": bool(publication and publication.embed_enabled),
                "json_feed_enabled": bool(publication and publication.json_feed_enabled),
            },
            actions=actions[:8],
        )

    async def memberships(self, *, event_id: uuid.UUID) -> list[ProgrammeMembership]:
        return list((await self.db.scalars(
            select(ProgrammeMembership)
            .where(ProgrammeMembership.event_id == event_id)
            .order_by(ProgrammeMembership.role, ProgrammeMembership.display_name, ProgrammeMembership.id)
            .limit(500)
        )).all())

    async def evaluation_plans(self, *, event_id: uuid.UUID, organization_id: uuid.UUID) -> list[ProgrammeEvaluationPlan]:
        return list((await self.db.scalars(
            select(ProgrammeEvaluationPlan)
            .join(Event, Event.id == ProgrammeEvaluationPlan.event_id)
            .where(ProgrammeEvaluationPlan.event_id == event_id,
                ProgrammeEvaluationPlan.organization_id == organization_id,
                Event.organization_id == organization_id)
            .order_by(ProgrammeEvaluationPlan.created_at.desc(), ProgrammeEvaluationPlan.id)
            .limit(100)
        )).all())
