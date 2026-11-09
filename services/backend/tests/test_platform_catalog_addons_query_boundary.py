from pathlib import Path


def test_capacity_catalog_route_delegates_to_canonical_commercial_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/billing/routers/cloud_commercial.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def get_cloud_catalog", 1)[1].split("@router.", 1)[0]
    assert "CloudCommercialService(db).catalog" in region
    assert "await db.execute" not in region


def test_platform_addon_catalog_query_is_bounded_and_stably_ordered():
    queries = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/application/queries.py"
    ).read_text(encoding="utf-8-sig")
    region = queries.split("async def list_addons", 1)[1].split("async def list_features", 1)[0]
    assert 'CommercialOffer.product_family == "CAPACITY_ADDON"' in region
    assert ".limit(200)" in region
    assert "CommercialOffer.display_order.asc(), CommercialOffer.code.asc()" in region


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
    region = queries.split("async def list_features", 1)[1].split("async def addon_template_versions", 1)[0]
    assert "FeatureCatalog.is_active.is_(True)" in region
    assert ".limit(1000)" in region
    assert "FeatureCatalog.category_order.asc()" in region
    assert "FeatureCatalog.feature_order.asc()" in region
