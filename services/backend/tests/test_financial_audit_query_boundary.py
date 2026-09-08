from pathlib import Path


def test_financial_audit_route_delegates_to_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def get_financial_audit_trail", 1)[1].split(
        '@router.get("/impersonation-logs")', 1
    )[0]
    assert "PlatformFinancialQueryService(db).financial_audit_trail" in region
    assert "await db.execute" not in region


def test_financial_audit_query_clamps_filters_and_tie_breaks_ordering():
    queries = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/application/queries.py"
    ).read_text(encoding="utf-8-sig")
    region = queries.split("async def financial_audit_trail", 1)[1].split(
        "class OrganizationLifecycleQueryService", 1
    )[0]
    assert "bounded_limit = max(1, min(int(limit), 100))" in region
    assert "a.organization_id = :organization_id" in region
    assert "ORDER BY a.occurred_at DESC, a.id DESC" in region
