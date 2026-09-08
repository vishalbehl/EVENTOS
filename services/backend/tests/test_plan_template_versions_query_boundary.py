from pathlib import Path


def test_plan_template_versions_route_delegates_to_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def list_plan_template_versions", 1)[1].split(
        "@router.put(\"/plans/{plan_id}/features\")", 1
    )[0]
    assert "PlatformCommercialCatalogQueryService(db).plan_template_versions" in region
    assert "await db.scalars" not in region


def test_plan_template_versions_query_is_bounded_and_seek_ordered():
    queries = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/application/queries.py"
    ).read_text(encoding="utf-8-sig")
    region = queries.split("async def plan_template_versions", 1)[1].split(
        "class OrganizationConsoleQueryService", 1
    )[0]
    assert "bounded_limit = max(1, min(int(limit), 100))" in region
    assert "CommercialTemplateVersion.created_at.desc()" in region
    assert "CommercialTemplateVersion.version.desc()" in region
    assert "CommercialTemplateVersion.id.desc()" in region
    assert "limit(bounded_limit + 1)" in region
