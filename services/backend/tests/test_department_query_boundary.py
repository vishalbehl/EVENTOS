from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_department_list_uses_batched_query_service_counts():
    router = (ROOT / "app/modules/platform/departments/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/platform/departments/application/queries.py").read_text(encoding="utf-8")

    region = router.split("async def list_departments", 1)[1].split("@router.", 1)[0]
    assert "DepartmentQueryService(service.db).list_with_counts" in region
    assert "await service.db.execute" not in region
    assert "DepartmentMember.department_id.in_(department_ids)" in queries
    assert "Team.department_id.in_(department_ids)" in queries
    assert "group_by(DepartmentMember.department_id)" in queries
    assert "group_by(Team.department_id)" in queries
    assert "await self.db.commit()" not in queries


def test_department_detail_and_member_identity_use_tenant_safe_query_service():
    router = (ROOT / "app/modules/platform/departments/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/platform/departments/application/queries.py").read_text(encoding="utf-8")

    detail_region = router.split("async def get_department", 1)[1].split("@router.", 1)[0]
    member_region = router.split("async def add_department_member", 1)[1].split("@router.", 1)[0]
    assert "DepartmentQueryService(service.db).get_with_counts" in detail_region
    assert "DepartmentQueryService(service.db).get_member_user" in member_region
    assert "await service.db.get" not in member_region
    assert "User.organization_id == organization_id" in queries
    assert "User.deleted_at.is_(None)" in queries

    repository = (ROOT / "app/modules/platform/departments/repository.py").read_text(encoding="utf-8")
    service = (ROOT / "app/modules/platform/departments/service.py").read_text(encoding="utf-8")
    assert "Department.organization_id == org_id" in repository
    assert "User.organization_id == org_id" in repository
    assert "get_user_for_organization(org_id, user_id)" in service
    assert "list_members(org_id, dept_id)" in service
