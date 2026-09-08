from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_event_contract_read_delegates_to_query_service():
    source = (ROOT / "app/modules/platform/organization_console_router.py").read_text(encoding="utf-8")
    region = source.split("async def get_event_contract", 1)[1].split("async def resolved_entitlements", 1)[0]
    assert "EventContractQueryService(db).list" in region
    assert "select(EventCommercialContract)" not in region


def test_event_contract_query_is_scoped_bounded_projected_and_stable():
    source = (ROOT / "app/modules/platform/application/queries.py").read_text(encoding="utf-8")
    region = source.split("class EventContractQueryService", 1)[1].split("class CommercialAccessQueryService", 1)[0]
    assert "EventCommercialContract.organization_id == organization_id" in region
    assert "EventCommercialContract.event_id == event_id" in region
    assert "max(1, min(int(limit), 100))" in region
    assert "load_only(*self._COLUMNS)" in region
    assert "EventCommercialContract.version.desc()" in region
    assert "EventCommercialContract.id.desc()" in region
