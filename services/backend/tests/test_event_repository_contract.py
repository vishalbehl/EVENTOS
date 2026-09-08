from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_event_repository_requires_verified_organization_scope():
    source = (ROOT / "app/modules/events/infrastructure/repositories.py").read_text(
        encoding="utf-8"
    )
    assert "get_for_organization" in source
    assert "organization_id: uuid.UUID" in source
    assert "Event.organization_id == organization_id" in source
    assert "commit(" not in source
    assert "HTTPException" not in source


def test_event_query_service_uses_event_repository_for_both_pagination_modes():
    source = (ROOT / "app/modules/events/application/queries.py").read_text(
        encoding="utf-8"
    )
    assert "EventRepository(self.db).list_page" in source
    assert "EventRepository(self.db).cursor_page" in source
