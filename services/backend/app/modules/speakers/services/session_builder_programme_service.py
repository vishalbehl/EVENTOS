"""Durable programme operations owned by the Session Builder.

This deliberately keeps scheduling writes separate from the read snapshot so
drag/drop stays fast while publication and rollback remain recoverable.
"""
from __future__ import annotations

import hashlib
import json
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.abstracts.models import AbstractAuthor, AbstractSubmission
from app.modules.agenda.models import Session, SessionPerson
from app.modules.events.models.event import Event
from app.modules.events.models.speaker import Speaker
from app.modules.programme.models import ProgrammeSchedulePublication, ProgrammeScheduleRevision


def _session_payload(session: Session) -> dict[str, Any]:
    return {
        "id": str(session.id), "room_id": str(session.room_id) if session.room_id else None,
        "track_id": str(session.track_id) if session.track_id else None,
        "agenda_id": str(session.agenda_id) if session.agenda_id else None,
        "agenda_day_id": str(session.agenda_day_id) if session.agenda_day_id else None,
        "session_code": session.session_code, "title": session.title,
        "session_type": session.session_type, "description": session.description,
        "start_time": session.start_time.isoformat(), "end_time": session.end_time.isoformat(),
        "status": session.status, "sort_order": session.sort_order,
        "display_color": session.display_color, "is_published": session.is_published,
        "people": [
            {"speaker_id": str(person.speaker_id) if person.speaker_id else None, "role": person.role,
             "name": person.name, "presentation_title": person.presentation_title,
             "talk_order": person.talk_order, "display_order": person.display_order,
             "is_primary": person.is_primary, "is_confirmed": person.is_confirmed, "notes": person.notes}
            for person in session.session_people
        ],
    }


async def create_schedule_revision(*, db: AsyncSession, event_id: uuid.UUID,
                                   organization_id: uuid.UUID, actor_id: uuid.UUID | None,
                                   label: str | None = None, reason: str | None = None) -> ProgrammeScheduleRevision:
    sessions = list((await db.scalars(
        select(Session).options(selectinload(Session.session_people)).where(
            Session.event_id == event_id, Session.deleted_at.is_(None)
        ).order_by(Session.start_time, Session.id)
    )).all())
    snapshot = {"sessions": [_session_payload(session) for session in sessions]}
    canonical = json.dumps(snapshot, sort_keys=True, separators=(",", ":"), default=str)
    revision_number = int((await db.scalar(
        select(func.coalesce(func.max(ProgrammeScheduleRevision.revision_number), 0)).where(
            ProgrammeScheduleRevision.event_id == event_id
        )
    )) or 0) + 1
    revision = ProgrammeScheduleRevision(
        organization_id=organization_id, event_id=event_id, revision_number=revision_number,
        label=label, reason=reason, snapshot=snapshot,
        checksum=hashlib.sha256(canonical.encode("utf-8")).hexdigest(), created_by=actor_id,
    )
    db.add(revision)
    await db.flush()
    return revision


async def restore_schedule_revision(*, db: AsyncSession, event_id: uuid.UUID,
                                    organization_id: uuid.UUID, actor_id: uuid.UUID,
                                    revision_id: uuid.UUID) -> ProgrammeScheduleRevision:
    revision = await db.scalar(select(ProgrammeScheduleRevision).where(
        ProgrammeScheduleRevision.id == revision_id,
        ProgrammeScheduleRevision.event_id == event_id,
        ProgrammeScheduleRevision.organization_id == organization_id,
    ).with_for_update())
    if revision is None:
        raise ValueError("Schedule revision was not found for this event.")
    prior = await create_schedule_revision(
        db=db, event_id=event_id, organization_id=organization_id, actor_id=actor_id,
        label="Automatic checkpoint before restore", reason=f"Before restore of revision {revision.revision_number}",
    )
    existing = {str(row.id): row for row in (await db.scalars(
        select(Session).options(selectinload(Session.session_people)).where(
            Session.event_id == event_id, Session.deleted_at.is_(None)
        ).with_for_update()
    )).all()}
    desired = {str(row["id"]): row for row in revision.snapshot.get("sessions", [])}
    for session_id, session in existing.items():
        if session_id not in desired:
            session.deleted_at = datetime.now(timezone.utc)
            session.version += 1
    for session_id, data in desired.items():
        session = existing.get(session_id)
        if session is None:
            # A deleted historical record cannot safely regain its old UUID.
            session = Session(event_id=event_id, session_code=data["session_code"], title=data["title"],
                              session_type=data["session_type"], start_time=datetime.fromisoformat(data["start_time"]),
                              end_time=datetime.fromisoformat(data["end_time"]))
            db.add(session)
            await db.flush()
        session.room_id = uuid.UUID(data["room_id"]) if data.get("room_id") else None
        session.track_id = uuid.UUID(data["track_id"]) if data.get("track_id") else None
        session.agenda_id = uuid.UUID(data["agenda_id"]) if data.get("agenda_id") else None
        session.agenda_day_id = uuid.UUID(data["agenda_day_id"]) if data.get("agenda_day_id") else None
        session.title, session.session_code, session.session_type = data["title"], data["session_code"], data["session_type"]
        session.description, session.status = data.get("description"), data.get("status", "SCHEDULED")
        session.start_time, session.end_time = datetime.fromisoformat(data["start_time"]), datetime.fromisoformat(data["end_time"])
        session.sort_order, session.display_color, session.is_published = data.get("sort_order", 0), data.get("display_color", "#3b82f6"), data.get("is_published", False)
        session.version += 1
        for person in list(session.session_people):
            await db.delete(person)
        for person_data in data.get("people", []):
            db.add(SessionPerson(session_id=session.id,
                speaker_id=uuid.UUID(person_data["speaker_id"]) if person_data.get("speaker_id") else None,
                role=person_data.get("role", "Speaker"), name=person_data.get("name"),
                presentation_title=person_data.get("presentation_title"), talk_order=person_data.get("talk_order", 0),
                display_order=person_data.get("display_order", 0), is_primary=person_data.get("is_primary", False),
                is_confirmed=person_data.get("is_confirmed", False), notes=person_data.get("notes")))
    return prior


async def accepted_abstract_candidates(*, db: AsyncSession, event_id: uuid.UUID) -> list[dict[str, Any]]:
    rows = list((await db.execute(
        select(AbstractSubmission, AbstractAuthor).outerjoin(
            AbstractAuthor, (AbstractAuthor.submission_id == AbstractSubmission.id) & AbstractAuthor.is_presenter.is_(True)
        ).where(AbstractSubmission.event_id == event_id, AbstractSubmission.status == "ACCEPTED",
                AbstractSubmission.linked_session_id.is_(None))
        .order_by(AbstractSubmission.decided_at, AbstractSubmission.id).limit(250)
    )).all())
    speaker_ids = {submission.presenter_speaker_id for submission, _ in rows if submission.presenter_speaker_id}
    speakers = list((await db.scalars(select(Speaker).where(Speaker.id.in_(speaker_ids), Speaker.event_id == event_id, Speaker.deleted_at.is_(None)))).all()) if speaker_ids else []
    speaker_by_id = {speaker.id: speaker for speaker in speakers}
    return [{"id": submission.id, "code": submission.code, "title": submission.title,
             "abstract_type": submission.abstract_type, "topic": submission.topic, "track": submission.track,
             "presenter_name": author.full_name if author else None, "presenter_email": author.email if author else None,
             "speaker_ready": bool((speaker_by_id.get(submission.presenter_speaker_id) and speaker_by_id[submission.presenter_speaker_id].upload_status in {"uploaded", "valid", "approved"}))}
            for submission, author in rows]


async def materialize_accepted_abstract(*, db: AsyncSession, event: Event,
                                        submission_id: uuid.UUID, duration_minutes: int) -> tuple[Session, bool]:
    submission = await db.scalar(select(AbstractSubmission).where(
        AbstractSubmission.id == submission_id, AbstractSubmission.event_id == event.id
    ).with_for_update())
    if submission is None or submission.status != "ACCEPTED":
        raise ValueError("Only accepted abstracts can be placed in the session builder.")
    if submission.linked_session_id:
        existing = await db.scalar(select(Session).where(Session.id == submission.linked_session_id))
        if existing:
            return existing, False
    presenter = await db.scalar(select(AbstractAuthor).where(
        AbstractAuthor.submission_id == submission.id, AbstractAuthor.is_presenter.is_(True)
    ).order_by(AbstractAuthor.display_order).limit(1))
    start = datetime.combine(event.start_date or datetime.now(timezone.utc).date(), datetime.min.time(), tzinfo=timezone.utc).replace(hour=9)
    session = Session(event_id=event.id, session_code=f"ABS-{submission.code}"[:50], title=submission.title,
                      session_type=submission.presentation_type or submission.abstract_type or "Scientific Session",
                      description=submission.body, start_time=start, end_time=start + timedelta(minutes=duration_minutes),
                      status="DRAFT", is_published=False)
    db.add(session)
    await db.flush()
    submission.linked_session_id = session.id
    if presenter:
        speaker = await db.scalar(select(Speaker).where(
            Speaker.event_id == event.id, Speaker.email.ilike(presenter.email or "__no_email__"), Speaker.deleted_at.is_(None)
        ).with_for_update())
        if speaker is None:
            names = presenter.full_name.split(maxsplit=1)
            speaker = Speaker(event_id=event.id, first_name=names[0], last_name=names[1] if len(names) > 1 else "",
                              email=presenter.email or f"abstract-{submission.id}@invalid.local",
                              affiliation=presenter.affiliation, country=presenter.country,
                              upload_token=secrets.token_urlsafe(32))
            db.add(speaker)
            await db.flush()
        submission.presenter_speaker_id = speaker.id
        db.add(SessionPerson(session_id=session.id, speaker_id=speaker.id, role="Speaker", name=speaker.full_name,
                             presentation_title=submission.title, is_primary=True, is_confirmed=False))
    return session, True
