"""Regression contract for the high-volume Session DOCX export read."""

from pathlib import Path
import inspect

from app.modules.speakers.application.queries import SessionQueryService


ROOT = Path(__file__).resolve().parents[1]


def test_session_export_is_tenant_scoped_bounded_and_eager():
    source = inspect.getsource(SessionQueryService.list_for_export)

    assert "Event.organization_id == organization_id" in source
    assert "Session.event_id == event_id" in source
    assert "Session.deleted_at.is_(None)" in source
    assert "selectinload(Session.room)" in source
    assert "selectinload(Session.session_speakers)" in source
    assert ".order_by(Session.start_time.asc(), Session.id.asc())" in source
    assert ".limit(bound)" in source
    assert "10_000" in source


def test_session_export_router_delegates_the_read_boundary():
    source = (ROOT / "app/modules/speakers/routers/sessions.py").read_text(
        encoding="utf-8"
    )
    start = source.index("async def export_sessions_docx")
    end = source.index("@router.get(\"\", response_model=List[SessionSummary])", start)
    region = source[start:end]

    assert "SessionQueryService(db).list_for_export" in region
    assert "select(Session)" not in region
