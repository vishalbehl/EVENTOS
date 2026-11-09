"""Database-backed acceptance checks for the Session Builder conflict matrix."""

from datetime import datetime, time, timezone

import pytest

from app.modules.abstracts.models import AbstractAuthor, AbstractSubmission
from app.modules.agenda.models import Session, SessionPerson
from app.modules.agenda.models import Room
from app.modules.speakers.services.session_builder_programme_service import materialize_accepted_abstract
from app.modules.speakers.services.session_builder_service import detect_conflicts


@pytest.mark.asyncio
async def test_conflict_matrix_blocks_unconfirmed_upload_unavailable_and_overlap(
    db, event, room, session_obj, speaker, session_speaker
):
    speaker.upload_status = "pending"
    speaker.programme_availability = {
        "2026-09-01": [{"start": "13:00", "end": "14:00"}],
    }
    session_speaker.is_confirmed = False

    competing = Session(
        event_id=event.id,
        room_id=room.id,
        session_code="S-002",
        title="Competing Session",
        session_type="talk",
        start_time=datetime(2026, 9, 1, 9, 30, tzinfo=timezone.utc),
        end_time=datetime(2026, 9, 1, 10, 30, tzinfo=timezone.utc),
        status="scheduled",
    )
    db.add(competing)
    await db.flush()

    conflicts = await detect_conflicts(event.id, db)
    by_type = {item.type: item for item in conflicts}

    assert {"room_overlap", "speaker_unconfirmed", "speaker_upload_pending", "speaker_unavailable"}.issubset(by_type)
    assert by_type["room_overlap"].severity == "error"
    assert by_type["speaker_unconfirmed"].severity == "error"
    assert by_type["speaker_upload_pending"].severity == "error"
    assert by_type["speaker_unavailable"].severity == "error"


@pytest.mark.asyncio
async def test_accepted_abstract_materialisation_is_one_logical_candidate_under_retry(
    db, event, speaker
):
    submission = AbstractSubmission(
        organization_id=event.organization_id,
        event_id=event.id,
        presenter_speaker_id=speaker.id,
        code="ABS-RETRY-01",
        title="Durable programme conversion",
        body="A submission used to verify replay-safe conversion.",
        abstract_type="ORAL",
        status="ACCEPTED",
    )
    # Persist the submission first so the author receives the non-null FK.
    # This mirrors the public submission -> author write order.
    db.add(submission)
    await db.flush()
    author = AbstractAuthor(
        organization_id=event.organization_id,
        event_id=event.id,
        submission_id=submission.id,
        full_name="Alice Smith",
        email=speaker.email,
        is_presenter=True,
    )
    db.add(author)
    await db.flush()

    first, first_created = await materialize_accepted_abstract(
        db=db, event=event, submission_id=submission.id, duration_minutes=45
    )
    second, second_created = await materialize_accepted_abstract(
        db=db, event=event, submission_id=submission.id, duration_minutes=45
    )

    assert first_created is True
    assert second_created is False
    assert first.id == second.id
    assert submission.linked_session_id == first.id
    assert len(list((await db.scalars(Session.__table__.select().where(Session.id == first.id))).all())) == 1


@pytest.mark.asyncio
async def test_conflict_matrix_reports_speaker_travel_panel_state_and_event_bounds(
    db, event, room, session_obj, speaker, session_speaker
):
    """The publication gate must expose actionable conflicts, not just overlaps."""
    session_speaker.is_confirmed = True
    speaker.upload_status = "approved"
    speaker.programme_availability = {
        "2026-09-01": [{"start": "09:00", "end": "18:00"}],
    }
    second_room = Room(
        event_id=event.id,
        name="Hall B",
        capacity=200,
        screen_count=1,
        room_type="presentation",
        is_active=True,
    )
    db.add(second_room)
    await db.flush()

    overlapping = Session(
        event_id=event.id,
        room_id=second_room.id,
        session_code="S-OVERLAP",
        title="Overlapping speaker session",
        session_type="talk",
        start_time=datetime(2026, 9, 1, 9, 30, tzinfo=timezone.utc),
        end_time=datetime(2026, 9, 1, 10, 30, tzinfo=timezone.utc),
        status="scheduled",
    )
    travel = Session(
        event_id=event.id,
        room_id=second_room.id,
        session_code="S-TRAVEL",
        title="Tight travel session",
        session_type="talk",
        start_time=datetime(2026, 9, 1, 10, 10, tzinfo=timezone.utc),
        end_time=datetime(2026, 9, 1, 11, 0, tzinfo=timezone.utc),
        status="scheduled",
    )
    panel = Session(
        event_id=event.id,
        room_id=room.id,
        session_code="S-PANEL",
        title="Panel without moderator",
        session_type="PANEL",
        start_time=datetime(2026, 9, 1, 11, 30, tzinfo=timezone.utc),
        end_time=datetime(2026, 9, 1, 12, 30, tzinfo=timezone.utc),
        status="scheduled",
    )
    cancelled = Session(
        event_id=event.id,
        room_id=room.id,
        session_code="S-CANCELLED",
        title="Cancelled session",
        session_type="talk",
        start_time=datetime(2026, 9, 1, 12, 30, tzinfo=timezone.utc),
        end_time=datetime(2026, 9, 1, 13, 0, tzinfo=timezone.utc),
        status="cancelled",
    )
    outside = Session(
        event_id=event.id,
        room_id=room.id,
        session_code="S-OUTSIDE",
        title="Outside event bounds",
        session_type="talk",
        start_time=datetime(2026, 9, 4, 9, 0, tzinfo=timezone.utc),
        end_time=datetime(2026, 9, 4, 10, 0, tzinfo=timezone.utc),
        status="scheduled",
    )
    db.add_all([overlapping, travel, panel, cancelled, outside])
    await db.flush()
    db.add_all([
        SessionPerson(session_id=overlapping.id, speaker_id=speaker.id, role="Speaker", name=speaker.full_name, is_confirmed=True),
        SessionPerson(session_id=travel.id, speaker_id=speaker.id, role="Speaker", name=speaker.full_name, is_confirmed=True),
        SessionPerson(session_id=panel.id, speaker_id=speaker.id, role="Speaker", name=speaker.full_name, is_confirmed=True),
    ])
    await db.flush()

    conflicts = await detect_conflicts(event.id, db)
    types = {item.type for item in conflicts}

    assert {"speaker_conflict", "travel_time", "unassigned_moderator", "invalid_session_state", "out_of_bounds"}.issubset(types)
    assert all(item.severity in {"error", "warning"} for item in conflicts)
