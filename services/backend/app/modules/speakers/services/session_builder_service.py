# =============================================================
# Session Builder Service
# Business logic for conflict detection, bulk reorder, duplicate.
# =============================================================
from __future__ import annotations

import uuid
import re
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from sqlalchemy import select, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.events.models.session import Session
from app.modules.events.models.room import Room
from app.modules.events.models.session_speaker import SessionSpeaker
from app.modules.events.models.events_domain_tables import Track
from app.modules.events.models.event import Event
from app.modules.events.models.speaker import Speaker
from app.modules.speakers.schemas.session_builder import (
    ConflictDetail,
    SessionReorderItem,
)


# ── Conflict Detection ─────────────────────────────────────

async def detect_conflicts(
    event_id: uuid.UUID,
    db: AsyncSession,
    candidate_items: Optional[List[SessionReorderItem]] = None,
) -> List[ConflictDetail]:
    """
    Detect scheduling conflicts for an event.

    If `candidate_items` is provided (during a drag operation before saving),
    we use those provisional values. Otherwise we read from the DB.

    Returns a list of ConflictDetail objects.
    """
    conflicts: List[ConflictDetail] = []

    # Fetch all non-deleted sessions with their speakers
    stmt = (
        select(Session)
        .options(
            selectinload(Session.session_speakers).selectinload(SessionSpeaker.speaker),
            selectinload(Session.room),
        )
        .where(Session.event_id == event_id, Session.deleted_at.is_(None))
    )
    result = await db.execute(stmt)
    db_sessions = result.scalars().all()

    # Build working list: merge DB state with candidate overrides
    session_map: dict[uuid.UUID, dict] = {}
    for s in db_sessions:
        session_map[s.id] = {
            "id": s.id,
            "room_id": s.room_id,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "speakers": [ss.speaker_id for ss in s.session_speakers if ss.speaker_id],
        }

    if candidate_items:
        for item in candidate_items:
            if item.session_id in session_map:
                session_map[item.session_id]["room_id"] = item.room_id
                session_map[item.session_id]["start_time"] = item.start_time
                session_map[item.session_id]["end_time"] = item.end_time

    sessions_list = list(session_map.values())

    # ── 1. Room overlap detection ──────────────────────────
    room_sessions: dict[uuid.UUID, list] = {}
    for s in sessions_list:
        if s["room_id"] is None:
            continue
        room_sessions.setdefault(s["room_id"], []).append(s)

    for room_id, room_sess in room_sessions.items():
        for i, a in enumerate(room_sess):
            for b in room_sess[i + 1:]:
                if _overlaps(a["start_time"], a["end_time"], b["start_time"], b["end_time"]):
                    conflicts.append(ConflictDetail(
                        type="room_overlap",
                        session_ids=[a["id"], b["id"]],
                        room_id=room_id,
                        description=(
                            f"Two sessions overlap in the same room between "
                            f"{_fmt(a['start_time'])} and {_fmt(b['end_time'])}"
                        ),
                        severity="error",
                    ))

    # ── 2. Speaker double-booking detection ───────────────
    speaker_sessions: dict[uuid.UUID, list] = {}
    for s in sessions_list:
        for spk_id in s["speakers"]:
            speaker_sessions.setdefault(spk_id, []).append(s)

    for speaker_id, spk_sess in speaker_sessions.items():
        for i, a in enumerate(spk_sess):
            for b in spk_sess[i + 1:]:
                if _overlaps(a["start_time"], a["end_time"], b["start_time"], b["end_time"]):
                    conflicts.append(ConflictDetail(
                        type="speaker_conflict",
                        session_ids=[a["id"], b["id"]],
                        speaker_id=speaker_id,
                        description=(
                            f"Speaker is assigned to two overlapping sessions "
                            f"at {_fmt(a['start_time'])}"
                        ),
                        severity="error",
                    ))

    # ── 3. Out-of-bounds detection ─────────────────────────
    event_result = await db.execute(select(Event).where(Event.id == event_id))
    event = event_result.scalar_one_or_none()

    if event and event.start_date and event.end_date:
        for s in sessions_list:
            oob = False
            if s["start_time"].date() < event.start_date:
                oob = True
            if s["end_time"].date() > event.end_date:
                oob = True
            if oob:
                conflicts.append(ConflictDetail(
                    type="out_of_bounds",
                    session_ids=[s["id"]],
                    description="Session is scheduled outside the event date range",
                    severity="warning",
                ))

    return conflicts


def _overlaps(s1: datetime, e1: datetime, s2: datetime, e2: datetime) -> bool:
    """Return True if two time intervals overlap (exclusive end boundary)."""
    return s1 < e2 and e1 > s2


def _fmt(dt: datetime) -> str:
    return dt.strftime("%H:%M") if dt else "?"


# ── Bulk Reorder ───────────────────────────────────────────

async def bulk_reorder_sessions(
    event_id: uuid.UUID,
    items: List[SessionReorderItem],
    db: AsyncSession,
) -> Tuple[int, List[ConflictDetail]]:
    """
    Atomically update room_id + start_time + end_time for a batch of sessions.
    Returns (updated_count, conflicts).
    Rolls back the entire batch on any validation error.
    """
    # Validate all session IDs belong to this event
    session_ids = [item.session_id for item in items]
    stmt = select(Session).where(
        Session.event_id == event_id,
        Session.id.in_(session_ids),
        Session.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    db_sessions = {s.id: s for s in result.scalars().all()}

    if len(db_sessions) != len(items):
        missing = set(session_ids) - set(db_sessions.keys())
        raise ValueError(f"Sessions not found or don't belong to event: {missing}")

    # Apply updates
    for item in items:
        session = db_sessions[item.session_id]
        if item.room_id is not None:
            session.room_id = item.room_id
        elif item.room_id is None and hasattr(item, '_room_id_explicitly_null'):
            session.room_id = None
        session.start_time = item.start_time
        session.end_time = item.end_time
        session.updated_at = datetime.now(timezone.utc)

    await db.flush()

    # Run conflict detection against the new state
    conflicts = await detect_conflicts(event_id, db)

    return len(items), conflicts


# ── Duplicate Session ──────────────────────────────────────

async def duplicate_session(
    event_id: uuid.UUID,
    session_id: uuid.UUID,
    offset_minutes: int,
    new_room_id: Optional[uuid.UUID],
    include_speakers: bool,
    db: AsyncSession,
) -> Session:
    """
    Deep-copy a session (and optionally its speaker assignments) with a time offset.
    """
    # Load original
    stmt = (
        select(Session)
        .options(
            selectinload(Session.session_speakers).selectinload(SessionSpeaker.speaker)
        )
        .where(Session.id == session_id, Session.event_id == event_id)
    )
    result = await db.execute(stmt)
    original = result.scalar_one_or_none()

    if not original:
        raise ValueError(f"Session {session_id} not found in event {event_id}")

    from datetime import timedelta

    offset = timedelta(minutes=offset_minutes)

    # Generate unique session code
    base_code = original.session_code
    # Strip trailing _copy_N suffix
    base_code = re.sub(r"_copy_\d+$", "", base_code)

    # Count existing copies
    count_stmt = select(func.count()).where(
        Session.event_id == event_id,
        Session.session_code.like(f"{base_code}_copy_%"),
    )
    count_result = await db.execute(count_stmt)
    copy_count = count_result.scalar() or 0
    new_code = f"{base_code}_copy_{copy_count + 1}"

    new_session = Session(
        event_id=event_id,
        room_id=new_room_id if new_room_id is not None else original.room_id,
        session_code=new_code,
        name=f"{original.name} (Copy)",
        session_type=original.session_type,
        start_time=original.start_time + offset,
        end_time=original.end_time + offset,
        moderator_id=original.moderator_id,
        moderator_name=original.moderator_name,
        description=original.description,
        status="scheduled",
    )
    db.add(new_session)
    await db.flush()  # get new_session.id

    if include_speakers:
        for ss in original.session_speakers:
            new_ss = SessionSpeaker(
                session_id=new_session.id,
                speaker_id=ss.speaker_id,
                presentation_title=ss.presentation_title,
                talk_order=ss.talk_order,
                talk_duration_minutes=ss.talk_duration_minutes,
                speaker_type=ss.speaker_type,
                is_confirmed=False,  # New copy requires re-confirmation
                start_time=(ss.start_time + offset) if ss.start_time else None,
                end_time=(ss.end_time + offset) if ss.end_time else None,
            )
            db.add(new_ss)

    return new_session


# ── Builder Snapshot ───────────────────────────────────────

async def get_builder_snapshot_data(
    event_id: uuid.UUID,
    db: AsyncSession,
) -> dict:
    """
    Build the full denormalised snapshot for the session builder initial load.
    Returns a dict with sessions, rooms, tracks, unscheduled_speakers, conflicts.
    """
    # Sessions
    sessions_stmt = (
        select(Session)
        .options(
            selectinload(Session.room),
            selectinload(Session.event),
            selectinload(Session.session_speakers).selectinload(SessionSpeaker.speaker),
        )
        .where(Session.event_id == event_id, Session.deleted_at.is_(None))
        .order_by(Session.start_time)
    )
    sessions_result = await db.execute(sessions_stmt)
    sessions = sessions_result.scalars().all()

    # Rooms
    rooms_stmt = (
        select(Room)
        .where(Room.event_id == event_id)
        .order_by(Room.name)
    )
    rooms_result = await db.execute(rooms_stmt)
    rooms = rooms_result.scalars().all()

    # Tracks
    tracks_stmt = (
        select(Track)
        .where(Track.event_id == event_id)
        .order_by(Track.sort_order, Track.name)
    )
    tracks_result = await db.execute(tracks_stmt)
    tracks = tracks_result.scalars().all()

    # Unscheduled speakers (speakers in this event not yet assigned to any session)
    # i.e. speakers with 0 talks or all talks are unscheduled
    all_speakers_stmt = (
        select(Speaker)
        .where(Speaker.event_id == event_id, Speaker.deleted_at.is_(None))
    )
    all_spk_result = await db.execute(all_speakers_stmt)
    all_speakers = all_spk_result.scalars().all()

    assigned_speaker_ids_stmt = (
        select(SessionSpeaker.speaker_id)
        .join(Session, Session.id == SessionSpeaker.session_id)
        .where(Session.event_id == event_id, Session.deleted_at.is_(None))
    )
    assigned_result = await db.execute(assigned_speaker_ids_stmt)
    assigned_ids = {row[0] for row in assigned_result.fetchall()}

    unscheduled_speakers = [s for s in all_speakers if s.id not in assigned_ids]

    # Event for date bounds
    event_result = await db.execute(select(Event).where(Event.id == event_id))
    event = event_result.scalar_one_or_none()

    # Conflicts
    conflicts = await detect_conflicts(event_id, db)

    return {
        "sessions": sessions,
        "rooms": rooms,
        "tracks": tracks,
        "unscheduled_speakers": unscheduled_speakers,
        "conflicts": conflicts,
        "event": event,
    }
