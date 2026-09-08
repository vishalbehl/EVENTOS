from pathlib import Path


def test_platform_subscription_route_delegates_to_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def list_all_subscriptions", 1)[1].split(
        '@router.get("/invoices"', 1
    )[0]
    assert "PlatformCommercialCatalogQueryService(db).list_subscriptions" in region
    assert "await db.execute" not in region


def test_platform_subscription_query_clamps_and_tie_breaks_offset_pagination():
    queries = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/application/queries.py"
    ).read_text(encoding="utf-8-sig")
    region = queries.split("async def list_subscriptions", 1)[1].split(
        "async def subscription_health_summary", 1
    )[0]
    assert "bounded_skip = max(int(skip), 0)" in region
    assert "bounded_limit = max(1, min(int(limit), 100))" in region
    assert "ORDER BY os.created_at DESC, os.id DESC" in region
    assert "COUNT(*) OVER() AS total_count" in region
