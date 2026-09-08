from pathlib import Path


def test_organization_domains_route_delegates_to_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def get_organization_domains", 1)[1].split(
        '@router.post("/organizations/{org_id}/domains")', 1
    )[0]
    assert "OrganizationConsoleQueryService(db).organization_domains" in region
    assert "await db.execute" not in region


def test_organization_domains_query_is_tenant_scoped_and_bounded():
    queries = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/application/queries.py"
    ).read_text(encoding="utf-8-sig")
    region = queries.split("async def organization_domains", 1)[1].split(
        "async def organization_addons", 1
    )[0]
    assert "OrganizationDomain.organization_id == organization_id" in region
    assert ".limit(100)" in region
    assert "OrganizationDomain.id.desc()" in region
