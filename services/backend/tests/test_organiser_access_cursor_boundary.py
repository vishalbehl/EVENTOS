from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_organiser_access_cursor_routes_use_keyset_query_methods():
    router = (ROOT / "app/modules/organiser/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/organiser/application/queries.py").read_text(encoding="utf-8")
    assert '"/access/roles/page"' in router
    assert '"/access/assignments/page"' in router
    assert "list_roles_cursor" in router
    assert "list_assignments_cursor" in router
    assert "Role.created_at < position.occurred_at" in queries
    assert "UserRoleAssignment.assigned_at < position.occurred_at" in queries
    assert ".limit(bounded + 1)" in queries
    assert "AuditLog.organization_id" not in queries[queries.index("class OrganiserAccessQueryService"):]

