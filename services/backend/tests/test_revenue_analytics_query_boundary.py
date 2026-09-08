from pathlib import Path


def _read(path: str) -> str:
    return (Path(__file__).resolve().parents[1] / path).read_text(encoding="utf-8-sig")


def test_revenue_analytics_route_delegates_to_dashboard_query_service():
    router = _read("app/modules/platform/router.py")
    region = router.split('async def get_revenue_analytics', 1)[1].split(
        'async def _legacy_revenue_analytics', 1
    )[0]
    assert "PlatformCoreDashboardQueryService(db).revenue_analytics" in region
    assert "await db.execute" not in region


def test_revenue_analytics_query_is_bounded_and_grouped():
    queries = _read("app/modules/platform/application/queries.py")
    region = queries.split("async def revenue_analytics", 1)[1].split(
        "class PlatformFinancialQueryService", 1
    )[0]
    assert "RevenueMetric.period.in_(periods)" in region
    assert "GROUP BY period ORDER BY period LIMIT 24" in region
    assert ".limit(10)" in region
    assert "LIMIT 1000" in region
