"""Regression contract for speaker talk history query ownership."""

import inspect

from app.modules.speakers.application.queries import SpeakerQueryService


def test_speaker_talk_query_is_scoped_bounded_and_deterministic():
    source = inspect.getsource(SpeakerQueryService.list_talks_for_speaker)
    assert "Event.organization_id == organization_id" in source
    assert "Session.event_id == event_id" in source
    assert "Session.deleted_at.is_(None)" in source
    assert "selectinload(SessionSpeaker.presentation_files)" in source
    assert ".order_by(Session.start_time.asc(), Session.id.asc()).limit(500)" in source


def test_speaker_talk_route_delegates_to_query_service():
    source = inspect.getsource(__import__(
        "app.modules.speakers.routers.speakers", fromlist=["get_speaker_sessions"]
    ).get_speaker_sessions)
    assert "SpeakerQueryService(db).list_talks_for_speaker" in source
    assert "select(SessionSpeaker, Session, Room)" not in source
