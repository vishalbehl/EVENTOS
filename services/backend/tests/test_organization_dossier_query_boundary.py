from pathlib import Path


def test_platform_organization_dossier_delegates_to_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def get_organization_dossier", 1)[1].split(
        '@router.delete("/organizations/{org_id}")', 1
    )[0]
    assert "OrganizationConsoleQueryService(db).organization_dossier" in region
    assert "await db.execute" not in region
    assert "return dossier" in region


def test_dossier_query_is_bounded_and_tenant_scoped():
    queries = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/application/queries.py"
    ).read_text(encoding="utf-8-sig")
    region = queries.split("async def organization_dossier", 1)[1].split(
        "async def payment_events", 1
    )[0]
    assert "Organization.id == organization_id" in region
    assert ".limit(100)" in region
    assert ".limit(200)" in region
    assert ".limit(1000)" in region
    assert "load_only(*organization_columns)" in region
