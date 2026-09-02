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
