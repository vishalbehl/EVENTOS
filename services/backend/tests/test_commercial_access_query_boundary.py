from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_commercial_access_list_delegates_to_query_service():
    source = (ROOT / "app/modules/platform/organization_console_router.py").read_text(encoding="utf-8")
    assert "CommercialAccessQueryService(db).list" in source
    region = source.split("async def list_commercial_access_requests", 1)[1].split("async def decide_commercial_access_request", 1)[0]
    assert "select(CommercialAccessRequest)" not in region


def test_commercial_access_query_is_scoped_bounded_and_projected():
    source = (ROOT / "app/modules/platform/application/queries.py").read_text(encoding="utf-8")
    region = source.split("class CommercialAccessQueryService", 1)[1].split("class OrganizationConsoleQueryService", 1)[0]
    assert "CommercialAccessRequest.organization_id == organization_id" in region
    assert "max(1, min(int(limit), 200))" in region
    assert "load_only(*self._REQUEST_COLUMNS)" in region
    assert "CommercialAccessRequest.created_at.desc()" in region
