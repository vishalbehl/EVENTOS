from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_organiser_access_routes_delegate_to_bounded_query_service():
    router = (ROOT / "app/modules/organiser/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/organiser/application/queries.py").read_text(encoding="utf-8")
    roles = router.split("async def organiser_user_roles", 1)[1].split("@router.get(\"/access/assignments\"", 1)[0]
    assignments = router.split("async def organiser_role_assignments", 1)[1].split("@router.get(\"/access/effective-preview\"", 1)[0]
    preview = router.split("async def organiser_effective_access_preview", 1)[1].split("@router.get(\"/settings/custom-fields\"", 1)[0]

    assert "OrganiserAccessQueryService(db).list_roles" in roles
    assert "select(Role" not in roles
    assert "OrganiserAccessQueryService(db).list_assignments" in assignments
    assert "select(UserRoleAssignment" not in assignments
    assert "OrganiserAccessQueryService(db).effective_preview" in preview
    assert "class OrganiserAccessQueryService" in queries
    assert "MAX_PAGE_SIZE = 100" in queries
    assert "UserRoleAssignment.assigned_at.desc(), UserRoleAssignment.id.desc()" in queries
