from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_permission_role_scope_check_is_tenant_constrained():
    router = (ROOT / "app/modules/platform/permissions/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/platform/permissions/application/queries.py").read_text(encoding="utf-8")
    helper = router.split("async def _require_scoped_role", 1)[1].split("@admin_router.", 1)[0]
    assert "service.role_exists_for_organization" in helper
    assert "await service.db.get(DepartmentRole, role_id)" not in helper
    assert "DepartmentRole.organization_id == organization_id" in queries
    assert "DepartmentRole.deleted_at.is_(None)" in queries
