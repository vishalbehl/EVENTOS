from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_capability_diagnostics_route_delegates_database_reads():
    source = (ROOT / "app/modules/platform/organization_console_router.py").read_text(encoding="utf-8")
    region = source.split("async def get_capability_diagnostics", 1)[1].split("@router.get(\"/summary\")", 1)[0]
    assert "CapabilityDiagnosticsQueryService(db)" in region
    assert "diagnostics.events" in region
    assert "diagnostics.counts" in region
    assert "diagnostics.rollout_flags" in region
    assert "diagnostics.flag_definitions" in region
    assert "select(CapabilityDiagnosticEvent)" not in region
    assert "select(PlatformFlagDefinition)" not in region


def test_capability_diagnostics_query_is_scoped_projected_bounded_and_stable():
    source = (ROOT / "app/modules/platform/application/queries.py").read_text(encoding="utf-8")
    region = source.split("class CapabilityDiagnosticsQueryService", 1)[1].split("class CommercialAccessQueryService", 1)[0]
    assert "CapabilityDiagnosticEvent.organization_id == organization_id" in region
    assert "CapabilityDiagnosticEvent.occurred_at >= since" in region
    assert "max(1, min(int(limit), 200))" in region
    assert "load_only(*self._EVENT_COLUMNS)" in region
    assert "CapabilityDiagnosticEvent.occurred_at.desc()" in region
    assert "CapabilityDiagnosticEvent.id.desc()" in region
    assert "FeatureFlag.organization_id == organization_id" in region
    assert "PlatformFlagDefinition.updated_at.asc()" in region
