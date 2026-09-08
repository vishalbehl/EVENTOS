from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_capability_restriction_list_delegates_to_query_service():
    source = (ROOT / "app/modules/platform/organization_console_router.py").read_text(encoding="utf-8")
    region = source.split("async def list_capability_restrictions", 1)[1].split("async def request_capability_restriction", 1)[0]
    assert "CapabilityRestrictionQueryService(db).list" in region
    assert "select(CapabilityRestriction)" not in region


def test_capability_restriction_query_is_scoped_bounded_projected_and_stable():
    source = (ROOT / "app/modules/platform/application/queries.py").read_text(encoding="utf-8")
    region = source.split("class CapabilityRestrictionQueryService", 1)[1].split("class CommercialAccessQueryService", 1)[0]
    assert "CapabilityRestriction.organization_id == organization_id" in region
    assert "CapabilityRestriction.event_id == event_id" in region
    assert "CapabilityRestriction.status == status_filter.upper()" in region
    assert "max(1, min(int(limit), 100))" in region
    assert "load_only(*self._COLUMNS)" in region
    assert "CapabilityRestriction.created_at.desc()" in region
    assert "CapabilityRestriction.id.desc()" in region
