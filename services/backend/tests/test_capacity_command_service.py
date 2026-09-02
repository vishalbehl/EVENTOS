from pathlib import Path


def _backend_root() -> Path:
    mounted = Path("/workspace/services/backend")
    return mounted if mounted.exists() else Path(__file__).resolve().parents[1]


def test_capacity_rule_mutations_use_command_service():
    backend = _backend_root()
    router = (backend / "app/modules/venue/routers/capacity.py").read_text(encoding="utf-8")
    commands = (backend / "app/modules/venue/application/capacity_commands.py").read_text(encoding="utf-8")

    assert "CapacityRuleCommandService" in router
    assert "await db.commit()" not in router.split('@router.get("/status"', 1)[0]
    assert "await self.db.commit()" in commands
    assert "Session.event_id == event_id" in commands
    assert "Room.event_id == event_id" in commands
    assert ".with_for_update()" in commands
