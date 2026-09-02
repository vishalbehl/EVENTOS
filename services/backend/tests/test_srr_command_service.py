import ast
from pathlib import Path


def _backend_root() -> Path:
    mounted = Path("/workspace/services/backend")
    return mounted if mounted.exists() else Path(__file__).resolve().parents[1]


def test_srr_station_mutations_use_command_service():
    backend = _backend_root()
    router_path = backend / "app/modules/venue/routers/srr.py"
    router = router_path.read_text(encoding="utf-8")
    commands = (backend / "app/modules/venue/application/commands.py").read_text(encoding="utf-8")

    assert "SrrStationCommandService" in router
    tree = ast.parse(router, filename=str(router_path))
    functions = {
        node.name: ast.get_source_segment(router, node) or ""
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }
    for name in ("create_station", "update_station", "release_station", "assign_speaker_to_station", "qr_checkin"):
        assert "await db.commit()" not in functions[name]
    assert "await self.db.commit()" in commands
    assert ".with_for_update()" in commands
    assert "SRRStation.event_id == event_id" in commands
