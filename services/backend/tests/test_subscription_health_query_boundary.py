from pathlib import Path


def test_subscription_health_route_delegates_to_query_service():
    router = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/router.py"
    ).read_text(encoding="utf-8-sig")
    region = router.split("async def get_subscriptions_health_summary", 1)[1].split(
        "class ChangePlanRequest", 1
    )[0]
    assert "PlatformCommercialCatalogQueryService(db).subscription_health_summary()" in region
    assert "await db.execute" not in region


def test_subscription_health_query_returns_fixed_status_contract():
    queries = (
        Path(__file__).resolve().parents[1]
        / "app/modules/platform/application/queries.py"
    ).read_text(encoding="utf-8-sig")
    region = queries.split("async def subscription_health_summary", 1)[1].split(
        "async def list_addons", 1
    )[0]
    assert "OrganizationSubscription.status" in region
    assert "func.count(OrganizationSubscription.id)" in region
    for status in ("ACTIVE", "TRIAL", "GRACE_PERIOD", "SUSPENDED", "EXPIRED", "CANCELLED"):
        assert f'"{status}"' in region
