from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/technology_services/router.py"
SERVICE = ROOT / "app/modules/technology_services/application/commands.py"


def test_technology_service_mutations_delegate_to_command_service():
    source = ROUTER.read_text(encoding="utf-8")
    assert "TechnologyServiceCommandService(db).create" in source
    assert "TechnologyServiceCommandService(db).transition" in source
    assert "await db.commit()" not in source
    assert "db.add(" not in source


def test_technology_service_commands_own_transactions_and_lock_transitions():
    source = SERVICE.read_text(encoding="utf-8")
    assert "await self.db.commit()" in source
    assert "await self.db.rollback()" in source
    assert ".with_for_update()" in source
    assert "ServiceRequest.organization_id == organization_id" in source


def test_technology_service_commands_invalidate_event_cache_after_commit():
    source = SERVICE.read_text(encoding="utf-8")
    assert "from app.core.cache import invalidate_event" in source
    assert "await self.db.commit()\n            await invalidate_event" in source
    assert "invalidate_event(row.organization_id, row.event_id)" in source
