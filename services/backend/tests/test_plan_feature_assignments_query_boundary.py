from pathlib import Path


def test_typed_plan_assignment_route_delegates_to_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def get_typed_plan_feature_assignments", 1)[1].split(
        "@router.get(\"/subscription-plans/{plan_id}/versions\")", 1
    )[0]
    assert "PlatformCommercialCatalogQueryService(db).plan_feature_assignments" in region
    assert "await db.execute" not in region


def test_typed_plan_assignment_query_is_bounded_and_stably_ordered():
    queries = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/application/queries.py"
    ).read_text(encoding="utf-8-sig")
    region = queries.split("async def plan_feature_assignments", 1)[1].split(
        "class OrganizationConsoleQueryService", 1
    )[0]
    assert "SubscriptionPlan.id == plan_id" in region
    assert ".limit(2000)" in region
    assert "FeatureCatalog.category_order.asc()" in region
    assert "FeatureCatalog.id.asc()" in region
