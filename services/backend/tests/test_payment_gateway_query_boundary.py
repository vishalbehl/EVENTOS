from pathlib import Path


def test_payment_gateway_route_delegates_to_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def get_financial_gateways", 1)[1].split(
        '@router.get("/financial/tax-config")', 1
    )[0]
    assert "PlatformCoreDashboardQueryService(db).payment_gateway_health" in region
    assert "await db.execute" not in region


def test_payment_gateway_query_is_explicit_bounded_and_trend_aggregated():
    queries = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/application/queries.py"
    ).read_text(encoding="utf-8-sig")
    region = queries.split("async def payment_gateway_health", 1)[1].split(
        "class OrganizationLifecycleQueryService", 1
    )[0]
    assert "load_only(" in region
    assert ".limit(50)" in region
    assert ".limit(1000)" in region
    assert "PaymentTransaction.created_at >=" in region
