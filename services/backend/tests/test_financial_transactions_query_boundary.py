from pathlib import Path


def test_financial_transactions_route_delegates_to_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def get_financial_transactions", 1)[1].split(
        '@router.get("/financial/audit-trail")', 1
    )[0]
    assert "PlatformFinancialQueryService(db).payment_transactions" in region
    assert "await db.execute" not in region


def test_financial_transactions_query_clamps_and_tie_breaks_pagination():
    queries = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/application/queries.py"
    ).read_text(encoding="utf-8-sig")
    region = queries.split("async def payment_transactions", 1)[1].split(
        "class OrganizationLifecycleQueryService", 1
    )[0]
    assert "bounded_limit = max(1, min(int(limit), 100))" in region
    assert "ORDER BY t.created_at DESC, t.id DESC" in region
    assert "LIMIT :limit OFFSET :skip" in region
