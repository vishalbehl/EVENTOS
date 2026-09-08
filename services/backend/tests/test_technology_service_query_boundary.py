from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTER = ROOT / "app/modules/technology_services/router.py"
SERVICE = ROOT / "app/modules/technology_services/application/queries.py"


def test_technology_service_reads_delegate_to_query_service():
    source = ROUTER.read_text(encoding="utf-8")
    assert "TechnologyServiceQueryService(db).kpis" in source
    assert "TechnologyServiceQueryService(db).kanban" in source
    assert "TechnologyServiceQueryService(db).get" in source
    assert "TechnologyServiceQueryService(db).list" in source
    assert "TechnologyServiceQueryService(db).get_event_for_scope" in source
    assert "await db.scalar" not in source
    for method in (
        "venue_ops_service_definitions",
        "venue_ops_quotes",
        "venue_ops_fulfilment",
    ):
        assert f"TechnologyServiceQueryService(db).{method}" in source


def test_technology_service_query_service_is_bounded_projected_and_read_only():
    source = SERVICE.read_text(encoding="utf-8")
    assert "load_only(*self._columns)" in source
    assert ".limit(bounded_limit)" in source
    assert "await self.db.commit()" not in source
    assert "load_only(" in source and "Event.id" in source and "Event.organization_id" in source
    assert "VenueOpsServiceDefinition.category.asc()" in source
    assert "CommercialQuote.organization_id == organization_id" in source
    assert "DataExport.organization_id == organization_id" in source
    assert "VenueOpsFulfilmentHandoff.event_id == event_id" in source
