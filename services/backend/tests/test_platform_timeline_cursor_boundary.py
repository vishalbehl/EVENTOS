from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_platform_timeline_cursor_is_bounded_and_query_service_owned():
    router = (ROOT / "app/modules/platform/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/audit/application/queries.py").read_text(encoding="utf-8")

    start = router.index('async def get_organization_timeline_cursor')
    end = router.index("# ═", start)
    endpoint = router[start:end]

    assert "AuditQueryService(db).list_organization_cursor" in endpoint
    assert "decode_cursor(cursor)" in endpoint
    assert "encode_cursor(rows[-1].occurred_at, rows[-1].id)" in endpoint
    assert "bounded_page_size(page_size, maximum=100)" in endpoint
    assert "db.scalars" not in endpoint
    assert "AuditLog.organization_id == organization_id" in queries
    assert ".limit(bounded + 1)" in queries

