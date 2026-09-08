from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_role_mutations_use_shared_event_invalidation():
    router = (ROOT / "app/modules/registration/routers/participant_roles.py").read_text(
        encoding="utf-8"
    )
    commands = (ROOT / "app/modules/registration/application/role_commands.py").read_text(
        encoding="utf-8"
    )
    assert "from app.core.cache import invalidate_event" in router
    assert "from app.core.cache import cache_service" in commands
    assert "await invalidate_event(event.organization_id, event.id)" in router
    assert 'await cache_service.invalidate_domain("registration_roles", organization_id, event_id)' in commands
    assert "delete_pattern" not in router
    assert "delete_pattern" not in commands
