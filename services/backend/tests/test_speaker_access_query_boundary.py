from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_speaker_page_resolves_access_scope_through_query_service():
    router = (ROOT / "app/modules/speakers/routers/speakers.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/speakers/application/queries.py").read_text(encoding="utf-8")
    region = router.split("async def list_speakers_page", 1)[1].split("@router.get(\"\"", 1)[0]

    assert "resolve_access_scope" in region
    assert "select(UserAccessNode" not in region
    assert "select(UserEventAssignment" not in region
    assert "UserAccessNode" in queries
    assert "UserEventAssignment" in queries
    assert "event_id in assigned_event_ids or event_id in legacy_event_ids" in queries


def test_legacy_speaker_list_uses_bounded_query_service():
    router = (ROOT / "app/modules/speakers/routers/speakers.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/speakers/application/queries.py").read_text(encoding="utf-8")
    region = router.split("async def list_speakers(", 1)[1].split("@router.post", 1)[0]

    assert "SpeakerQueryService(db).list_legacy" in region
    assert "select(Speaker)" not in region
    assert "offset(" not in region
    assert "order_by(Speaker.last_name, Speaker.first_name, Speaker.id)" in queries
    assert "min(max(page_size, 1), 1000)" in queries
