from pathlib import Path


def test_platform_addon_catalog_route_delegates_to_bounded_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def list_platform_addons", 1)[1].split("@router.", 1)[0]
    assert "PlatformCommercialCatalogQueryService(db).list_addons()" in region
    assert "await db.execute" not in region


def test_platform_addon_catalog_query_is_bounded_and_stably_ordered():
    queries = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/application/queries.py"
    ).read_text(encoding="utf-8-sig")
    region = queries.split("async def list_addons", 1)[1].split("async def list_subscription_plans", 1)[0]
    assert "load_only(*addon_columns)" in region
    assert ".limit(200)" in region
    assert "Addon.name.asc(), Addon.id.asc()" in region
    assert "AddonFeature.addon_id.in_" in region


def test_platform_feature_catalog_route_delegates_to_bounded_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def list_features_catalog", 1)[1].split("class FeatureCatalogIn", 1)[0]
    assert "PlatformCommercialCatalogQueryService(db).list_features()" in region
    assert "await db.execute" not in region


def test_platform_feature_catalog_query_is_explicit_and_bounded():
    queries = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/application/queries.py"
    ).read_text(encoding="utf-8-sig")
    region = queries.split("async def list_features", 1)[1].split("async def list_subscription_plans", 1)[0]
    assert "load_only(*feature_columns)" in region
    assert ".limit(1000)" in region
    assert "FeatureCatalog.id.asc()" in region
