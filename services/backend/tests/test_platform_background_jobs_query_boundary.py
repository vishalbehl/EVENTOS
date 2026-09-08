from pathlib import Path


def test_background_jobs_route_delegates_to_operations_query_service():
    root = Path(__file__).resolve().parents[1]
    router = (root / "app/modules/platform/router.py").read_text(encoding="utf-8-sig")
    region = router.split('async def get_background_jobs', 1)[1].split(
        'class FeatureOverrideItem', 1
    )[0]
    assert "PlatformOperationsQueryService(db).background_jobs" in region


def test_background_jobs_query_bounds_sources_and_pagination():
    root = Path(__file__).resolve().parents[1]
    queries = (root / "app/modules/platform/application/queries.py").read_text(encoding="utf-8-sig")
    region = queries.split("async def background_jobs", 1)[1].split(
        "class PlatformFinancialQueryService", 1
    )[0]
    assert region.count("LIMIT 500") >= 5
    assert "bounded_limit = max(1, min(int(limit), 100))" in region
    assert "to_regclass(:table_name)" in region
    assert "unavailable_sources" in region
