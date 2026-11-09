"""Bounded, allowlisted related data for one sealed campaign page."""
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import and_, case, func, select

from app.modules.agenda.models import Room, Session, SessionPerson, PresentationSlot
from app.modules.events.models.event import Event
from app.modules.presentations.models.poster import Poster
from app.modules.presentations.models.presentation_file import PresentationFile

# Resource ceiling, not pagination: oversized pages must never send partial tables.
RELATED_ROWS_PER_PAGE = 5_000


def _session_columns():
    return (
        Session.id.label("session_id"), Session.title.label("session_name"),
        Session.session_code, Session.start_time.label("session_start"),
        Room.name.label("room_name"),
    )


def _session(row):
    if row.session_id is None:
        return None
    return SimpleNamespace(
        name=row.session_name, session_code=row.session_code, start_time=row.session_start,
        room=SimpleNamespace(name=row.room_name) if row.room_name is not None else None,
    )


async def _bounded_rows(db, statement):
    rows = (await db.execute(statement.limit(RELATED_ROWS_PER_PAGE + 1))).all()
    if len(rows) > RELATED_ROWS_PER_PAGE:
        raise HTTPException(503, detail={"code": "CAMPAIGN_RELATED_DATA_CAPACITY_EXCEEDED"})
    if any(row._mapping.get("oversized_text", False) for row in rows):
        raise HTTPException(503, detail={"code": "CAMPAIGN_RELATED_DATA_BYTE_LIMIT_EXCEEDED"})
    return rows


async def campaign_speaker_data(db, *, organization_id, event_id, speaker_ids):
    ids = tuple(dict.fromkeys(speaker_ids))
    if not ids or len(ids) > 50:
        raise ValueError("Speaker hydration requires one bounded campaign page")
    groups = {sid: {"sessions": [], "posters": [], "files": []} for sid in ids}
    owned_event = select(Event.id).where(
        Event.id == event_id, Event.organization_id == organization_id,
        Event.deleted_at.is_(None),
    ).exists()
    room_join = and_(Room.id == Session.room_id, Room.event_id == event_id)
    sessions = await _bounded_rows(db, select(
        SessionPerson.speaker_id, SessionPerson.presentation_title,
        PresentationSlot.start_time.label("talk_start"), *_session_columns(),
    ).select_from(SessionPerson).join(Session, Session.id == SessionPerson.session_id).outerjoin(Room, room_join)
      .outerjoin(PresentationSlot, and_(
          PresentationSlot.id == SessionPerson.presentation_slot_id,
          PresentationSlot.session_id == SessionPerson.session_id,
      )).where(owned_event, SessionPerson.speaker_id.in_(ids),
               Session.event_id == event_id, Session.deleted_at.is_(None))
      .order_by(Session.start_time.asc().nulls_last(), SessionPerson.talk_order, SessionPerson.id))
    for row in sessions:
        groups[row.speaker_id]["sessions"].append(SimpleNamespace(
            session=_session(row), presentation_title=row.presentation_title, start_time=row.talk_start))

    posters = await _bounded_rows(db, select(
        Poster.speaker_id, Poster.title, *_session_columns(),
    ).select_from(Poster).outerjoin(Session, and_(Session.id == Poster.session_id,
                            Session.event_id == event_id, Session.deleted_at.is_(None)))
      .outerjoin(Room, room_join).where(owned_event, Poster.speaker_id.in_(ids), Poster.event_id == event_id)
      .order_by(Poster.created_at, Poster.id))
    for row in posters:
        groups[row.speaker_id]["posters"].append(SimpleNamespace(title=row.title, session=_session(row)))

    files = await _bounded_rows(db, select(
        PresentationFile.speaker_id, PresentationFile.original_filename,
        case((func.octet_length(PresentationFile.rejection_reason) <= 16_384,
              PresentationFile.rejection_reason), else_=None).label("rejection_reason"),
        (func.octet_length(PresentationFile.rejection_reason) > 16_384).label("oversized_text"),
        PresentationFile.upload_status,
        PresentationFile.file_size_bytes, *_session_columns(),
    ).select_from(PresentationFile).outerjoin(SessionPerson, and_(
        SessionPerson.id == PresentationFile.session_speaker_id,
        SessionPerson.speaker_id == PresentationFile.speaker_id,
    )).outerjoin(Session, and_(Session.id == SessionPerson.session_id,
                             Session.event_id == event_id, Session.deleted_at.is_(None)))
      .outerjoin(Room, room_join).where(owned_event, PresentationFile.speaker_id.in_(ids),
          PresentationFile.event_id == event_id, PresentationFile.deleted_at.is_(None))
      .order_by(PresentationFile.uploaded_at.desc(), PresentationFile.id))
    for row in files:
        groups[row.speaker_id]["files"].append(SimpleNamespace(
            original_filename=row.original_filename, rejection_reason=row.rejection_reason,
            upload_status=row.upload_status, file_size_bytes=row.file_size_bytes,
            session_speaker=SimpleNamespace(session=_session(row)),
        ))
    return groups
