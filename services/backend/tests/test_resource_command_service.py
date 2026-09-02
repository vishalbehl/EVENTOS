from pathlib import Path


def _backend_root() -> Path:
    mounted = Path("/workspace/services/backend")
    return mounted if mounted.exists() else Path(__file__).resolve().parents[1]


def test_resource_mutations_use_application_command_service():
    backend = _backend_root()
    router = (backend / "app/modules/resource_management/router.py").read_text(encoding="utf-8")
    commands = (backend / "app/modules/resource_management/application/commands.py").read_text(encoding="utf-8")

    assert "ResourceCommandService" in router
    assert "await db.commit()" not in router
    assert "await self.db.commit()" in commands
    assert "Project.organization_id == organization_id" in commands


def test_resource_allocation_read_is_bounded():
    backend = _backend_root()
    router = (backend / "app/modules/resource_management/router.py").read_text(encoding="utf-8")
    queries = (backend / "app/modules/resource_management/application/queries.py").read_text(encoding="utf-8")

    assert "ResourceQueryService" in router
    assert "select(StaffAssignment.id, StaffAssignment.employee_id)" in queries
    assert "select(EquipmentAssignment.id, EquipmentAssignment.hardware_id)" in queries
    assert "bounded_limit = max(1, min(limit, 500))" in queries


def test_conflict_detection_uses_tenant_safe_query_service():
    backend = _backend_root()
    router = (backend / "app/modules/resource_management/router.py").read_text(encoding="utf-8")
    queries = (backend / "app/modules/resource_management/application/queries.py").read_text(encoding="utf-8")

    region = router.split('async def detect_conflicts', 1)[1]
    assert "project_exists_for_scope" in region
    assert "await db.scalar" not in region
    assert "Project.organization_id == organization_id" in queries
