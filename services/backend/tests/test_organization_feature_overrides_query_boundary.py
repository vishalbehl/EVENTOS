from pathlib import Path


def test_feature_overrides_route_delegates_to_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def get_org_feature_overrides", 1)[1].split(
        "# E2: Save feature overrides", 1
    )[0]
    assert "OrganizationConsoleQueryService(db).organization_feature_overrides" in region
    assert "await db.execute" not in region


def test_feature_overrides_query_is_tenant_scoped_and_bounded():
    queries = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/application/queries.py"
    ).read_text(encoding="utf-8-sig")
    region = queries.split("async def organization_feature_overrides", 1)[1].split(
        "async def organization_addons", 1
    )[0]
    assert "OrganizationSubscription.organization_id == organization_id" in region
    assert "OrganizationFeature.organization_id == organization_id" in region
    assert ".limit(1000)" in region
    assert ".limit(2000)" in region
