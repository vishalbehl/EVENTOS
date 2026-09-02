from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_platform_dashboard_core_metrics_use_one_query_service_projection():
    router = (ROOT / "app/modules/platform/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/platform/application/queries.py").read_text(encoding="utf-8")
    region = router.split("async def get_dashboard_metrics", 1)[1].split("@router.", 1)[0]
    assert "PlatformCoreDashboardQueryService(db).metrics" in region
    assert "await db.scalar" not in region
    assert "class PlatformCoreDashboardQueryService" in queries
    assert "select(func.count(Organization.id))" in queries
    assert "PaymentTransaction.created_at" in queries
