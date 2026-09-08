from pathlib import Path


def _backend_root() -> Path:
    mounted = Path("/workspace/services/backend")
    return mounted if mounted.exists() else Path(__file__).resolve().parents[1]


def test_operations_planning_mutations_use_command_service():
    backend = _backend_root()
    router = (backend / "app/modules/operations_planning/router.py").read_text(encoding="utf-8")
    commands = (backend / "app/modules/operations_planning/application/commands.py").read_text(encoding="utf-8")

    assert "OperationsPlanningCommandService" in router
    assert "await db.commit()" not in router
    assert "await self.db.commit()" in commands
    assert "ProjectRepository(self.db).get_by_id" in commands
    assert "ProjectRepository(self.db).get_by_id" in commands
