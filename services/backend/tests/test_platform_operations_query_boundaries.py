from pathlib import Path


def _read(relative: str) -> str:
    return (Path(__file__).resolve().parents[1] / relative).read_text(encoding="utf-8-sig")


def test_operations_routes_delegate_to_query_service():
    router = _read("app/modules/platform/router.py")
    assert "PlatformOperationsQueryService(db).queue_stats()" in router
    assert "PlatformOperationsQueryService(db).database_stats()" in router
    assert "PlatformOperationsQueryService(db).background_jobs(" in router


def test_operations_query_service_has_bounded_sources_and_known_queues():
    queries = _read("app/modules/platform/application/queries.py")
    region = queries.split("class PlatformOperationsQueryService", 1)[1].split(
        "class PlatformFinancialQueryService", 1
    )[0]
    assert '"default", "files", "sync", "notifications"' in region
    assert region.count("LIMIT 500") >= 5
    assert "bounded_limit = max(1, min(int(limit), 100))" in region
    assert "items[bounded_skip:bounded_skip + bounded_limit]" in region


def test_plan_feature_compatibility_read_is_bounded_and_ordered():
    router = _read("app/modules/platform/router.py")
    queries = _read("app/modules/platform/application/queries.py")
    assert "PlatformCommercialCatalogQueryService(db).plan_feature_keys" in router
    region = queries.split("async def plan_feature_keys", 1)[1].split(
        "async def list_subscriptions", 1
    )[0]
    assert ".limit(1000)" in region
    assert "FeatureCatalog.key.asc()" in region
