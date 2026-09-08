from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_forecast_route_uses_bounded_query_service():
    router = (ROOT / "app/modules/pricing/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/pricing/application/queries.py").read_text(encoding="utf-8")

    region = router.split("async def get_forecast", 1)[1].split("# ── SUPER ADMIN", 1)[0]
    assert "PricingQueryService.list_forecasts" in region
    assert "select(RevenueForecast)" not in region
    assert ".limit(bounded_limit)" in queries
    assert "RevenueForecast.organization_id == organization_id" in queries
    assert "desc(RevenueForecast.id)" in queries
