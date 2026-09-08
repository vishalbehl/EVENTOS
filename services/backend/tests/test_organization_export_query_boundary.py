from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_console_export_list_delegates_to_query_service():
    source = (ROOT / "app/modules/platform/organization_console_router.py").read_text(encoding="utf-8")
    region = source.split("async def list_console_exports", 1)[1].split("async def download_console_export", 1)[0]
    assert "OrganizationExportQueryService(db).list" in region
    assert "select(DataExport)" not in region


def test_console_export_query_is_tenant_scoped_bounded_projected_and_stable():
    source = (ROOT / "app/modules/platform/application/queries.py").read_text(encoding="utf-8")
    region = source.split("class OrganizationExportQueryService", 1)[1].split("class CommercialAccessQueryService", 1)[0]
    assert "DataExport.organization_id == organization_id" in region
    assert "DataExport.source_type == \"organization_console_export\"" in region
    assert "max(1, min(int(limit), 100))" in region
    assert "load_only(" in region
    assert "DataExport.created_at.desc(), DataExport.id.desc()" in region
