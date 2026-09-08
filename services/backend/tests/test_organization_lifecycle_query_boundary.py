from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_lifecycle_job_reads_delegate_to_query_service():
    source = (ROOT / "app/modules/platform/organization_console_router.py").read_text(encoding="utf-8")
    assert "OrganizationLifecycleQueryService(db).list" in source
    assert "OrganizationLifecycleQueryService(db).get" in source


def test_lifecycle_job_query_is_tenant_scoped_bounded_and_projected():
    source = (ROOT / "app/modules/platform/application/queries.py").read_text(encoding="utf-8")
    region = source.split("class OrganizationLifecycleQueryService", 1)[1].split("class OrganizationConsoleQueryService", 1)[0]
    assert "OrganizationLifecycleJob.organization_id == organization_id" in region
    assert "max(1, min(int(limit), 100))" in region
    assert "load_only(*self._COLUMNS)" in region
    assert "OrganizationLifecycleJob.created_at.desc()" in region
    assert "OrganizationLifecycleJob.id.desc()" in region
