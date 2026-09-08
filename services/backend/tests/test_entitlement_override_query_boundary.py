from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_override_request_list_delegates_to_query_service():
    source = (ROOT / "app/modules/platform/organization_console_router.py").read_text(encoding="utf-8")
    region = source.split("async def list_override_requests", 1)[1].split("async def decide_override", 1)[0]
    assert "EntitlementOverrideQueryService(db).list" in region
    assert "select(EntitlementOverrideRequest)" not in region


def test_override_query_is_scoped_bounded_projected_and_stable():
    source = (ROOT / "app/modules/platform/application/queries.py").read_text(encoding="utf-8")
    region = source.split("class EntitlementOverrideQueryService", 1)[1].split("class CommercialAccessQueryService", 1)[0]
    assert "EntitlementOverrideRequest.organization_id == organization_id" in region
    assert "EntitlementOverrideRequest.event_id == event_id" in region
    assert "EntitlementOverrideRequest.status == status_filter.upper()" in region
    assert "max(1, min(int(limit), 100))" in region
    assert "load_only(*self._COLUMNS)" in region
    assert "EntitlementOverrideRequest.created_at.desc()" in region
    assert "EntitlementOverrideRequest.id.desc()" in region
