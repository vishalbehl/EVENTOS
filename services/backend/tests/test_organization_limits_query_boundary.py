from pathlib import Path


def test_organization_limits_route_delegates_to_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def get_organization_limits", 1)[1].split(
        '@router.put("/organizations/{org_id}/limits")', 1
    )[0]
    assert "OrganizationConsoleQueryService(db).organization_limits" in region
    assert "await db.execute" not in region


def test_organization_limits_query_is_scoped_bounded_and_ordered():
    queries = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/application/queries.py"
    ).read_text(encoding="utf-8-sig")
    region = queries.split("async def organization_limits", 1)[1].split(
        "async def organization_addons", 1
    )[0]
    assert "TenantLimit.organization_id == organization_id" in region
    assert ".limit(200)" in region
    assert "TenantLimit.limit_key.asc()" in region
