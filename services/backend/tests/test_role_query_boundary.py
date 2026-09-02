from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_role_lists_use_batched_tenant_safe_projections():
    router = (ROOT / "app/modules/platform/roles/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/platform/roles/application/queries.py").read_text(encoding="utf-8")

    list_region = router.split("async def list_roles", 1)[1].split("@router.", 1)[0]
    admin_region = router.split("async def admin_list_roles", 1)[1].split("@admin_router.", 1)[0]
    detail_region = router.split("async def get_role", 1)[1].split("@router.", 1)[0]
    assert "RoleQueryService(service.db).list_with_counts" in list_region
    assert "RoleQueryService(service.db).list_with_counts" in admin_region
    assert "RoleQueryService(service.db).get_with_counts" in detail_region
    assert "perm_count_stmt" not in router
    assert "user_count_stmt" not in router
    assert "DepartmentRole.organization_id == organization_id" in queries
    assert "func.coalesce(permission_counts.c.permissions_count, 0)" in queries
    assert "func.coalesce(user_counts.c.users_count, 0)" in queries
    assert ".limit(bounded_limit)" in queries
    assert "await self.db.commit()" not in queries
