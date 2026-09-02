from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_assignment_list_uses_one_bounded_tenant_safe_projection():
    router = (ROOT / "app/modules/platform/roles/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/platform/roles/application/queries.py").read_text(encoding="utf-8")
    region = router.split("async def list_assignments", 1)[1].split("@assignments_router.", 1)[0]
    assert "AssignmentQueryService(service.db).list_page" in region
    assert "await service.db.execute" not in region
    assert "UserAssignment.organization_id == organization_id" in queries
    assert ".order_by(UserAssignment.created_at.desc(), UserAssignment.id.desc())" in queries
    assert ".limit(bounded_limit)" in queries
    assert "await self.db.commit()" not in queries
