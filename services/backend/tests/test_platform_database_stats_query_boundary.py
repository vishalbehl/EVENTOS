from pathlib import Path


def test_database_stats_route_delegates_to_operations_query_service():
    root = Path(__file__).resolve().parents[1]
    router = (root / "app/modules/platform/router.py").read_text(encoding="utf-8-sig")
    region = router.split('async def get_database_stats', 1)[1].split(
        '# D3: Background jobs', 1
    )[0]
    assert "PlatformOperationsQueryService(db).database_stats" in region


def test_database_stats_query_bounds_catalogue_reads_and_sanitizes_query_text():
    root = Path(__file__).resolve().parents[1]
    queries = (root / "app/modules/platform/application/queries.py").read_text(encoding="utf-8-sig")
    region = queries.split("async def database_stats", 1)[1].split(
        "class PlatformFinancialQueryService", 1
    )[0]
    assert "LIMIT 10" in region
    assert 'str(row["query"])[:120]' in region
    assert "pg_stat_activity" in region
