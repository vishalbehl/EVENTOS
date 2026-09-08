from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_search_jobs_have_bounded_cursor_query_path():
    router = (ROOT / "app/modules/search/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/search/application/queries.py").read_text(encoding="utf-8")
    region = router.split("async def cursor_search_jobs", 1)[1].split("class ReindexTriggerIn", 1)[0]
    assert "SearchJobQueryService(db).cursor_page" in region
    assert "limit: int = Query(20, ge=1, le=100)" in region
    assert "SearchJob.organization_id == organization_id" in queries
    assert "SearchJob.created_at.desc(), desc(SearchJob.id)" not in queries
    assert "desc(SearchJob.created_at), desc(SearchJob.id)" in queries
    assert ".limit(bounded_limit + 1)" in queries
    assert "decode_cursor(cursor)" in queries
    assert "encode_cursor(page_rows[-1].created_at, page_rows[-1].id)" in queries
