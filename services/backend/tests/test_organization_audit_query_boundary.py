from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_organization_audit_router_delegates_cursor_read_to_query_service():
    router = (ROOT / "app/modules/platform/organization_console_router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/audit/application/queries.py").read_text(encoding="utf-8")
    start = router.index("async def list_organization_audit")
    end = router.index('@router.post("/impersonation-handoffs"', start)
    endpoint = router[start:end]

    assert "AuditQueryService(db).list_organization_cursor" in endpoint
    assert "db.scalars" not in endpoint
    assert "list_organization_cursor" in queries
    assert "limit(bounded + 1)" in queries
    assert "AuditLog.organization_id," in queries
