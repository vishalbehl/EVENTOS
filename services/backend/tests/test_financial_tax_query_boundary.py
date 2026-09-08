from pathlib import Path


def test_financial_tax_route_delegates_to_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def get_financial_tax_config", 1)[1].split(
        '@router.get("/financial/transactions")', 1
    )[0]
    assert "PlatformFinancialQueryService(db).tax_configuration" in region
    assert "await db.execute" not in region


def test_financial_tax_query_bounds_and_orders_each_projection():
    queries = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/application/queries.py"
    ).read_text(encoding="utf-8-sig")
    region = queries.split("async def tax_configuration", 1)[1].split(
        "class OrganizationLifecycleQueryService", 1
    )[0]
    assert "LIMIT 500" in region
    assert "LIMIT 100" in region
    assert "ORDER BY name ASC, id ASC" in region
    assert "ORDER BY type ASC" in region
