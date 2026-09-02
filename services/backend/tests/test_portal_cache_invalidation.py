from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_attendee_detail_updates_invalidate_event_cache_after_commit():
    source = (ROOT / "app/modules/registration/services/portal_service.py").read_text(encoding="utf-8")
    assert "from app.core.cache import invalidate_event" in source
    assert "organization_id = await db.scalar" in source
    assert source.count("await db.commit()\n        await invalidate_event(organization_id, event_id)") == 1
    assert "await db.commit()\n    await invalidate_event(organization_id, event_id)" in source
