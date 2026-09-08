from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_platform_dashboard_core_metrics_use_one_query_service_projection():
    router = (ROOT / "app/modules/platform/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/platform/application/queries.py").read_text(encoding="utf-8")
    region = router.split("async def get_dashboard_metrics", 1)[1].split("# Platform status checks", 1)[0]
    assert "dashboard_queries.metrics" in region
    assert "await db.scalar" not in region
    assert "await db.execute" not in region
    assert "class PlatformCoreDashboardQueryService" in queries
    assert "select(func.count(Organization.id))" in queries
    assert "PaymentTransaction.created_at" in queries


def test_platform_dashboard_trends_use_one_union_projection():
    router = (ROOT / "app/modules/platform/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/platform/application/queries.py").read_text(encoding="utf-8")
    region = router.split("async def get_dashboard_metrics", 1)[1].split("# Platform status checks", 1)[0]
    assert "seven_day_trends" in region
    assert region.count("await db.execute") == 0
    assert "union_all(" in queries
    assert 'literal("mrr")' in queries


def test_platform_revenue_metrics_route_delegates_to_bounded_query_service():
    router = (ROOT / "app/modules/platform/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/platform/application/queries.py").read_text(encoding="utf-8")
    region = router.split("async def get_revenue_metrics", 1)[1].split("# ── Global Users", 1)[0]
    assert "PlatformCoreDashboardQueryService(db).revenue_metrics" in region
    assert "await db.execute" not in region
    method = queries.split("    async def revenue_metrics", 1)[1].split("    async def seven_day_trends", 1)[0]
    assert ".limit(bounded_months)" in method
    assert "RevenueMetric.period.desc()" in method


def test_platform_dashboard_secondary_reads_use_query_service_methods():
    router = (ROOT / "app/modules/platform/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/platform/application/queries.py").read_text(encoding="utf-8")
    region = router.split("async def get_dashboard_metrics", 1)[1].split("# Platform status checks", 1)[0]
    for method in (
        "open_support_ticket_count",
        "daily_payment_revenue",
        "top_organizations_by_mrr",
        "subscription_status_counts",
        "recent_billing_activity",
        "trials_expiring",
    ):
        assert f"dashboard_queries.{method}" in region
    assert "select(SupportTicket.id)" not in region
    assert "WITH days AS" not in region
    assert "class PlatformCoreDashboardQueryService" in queries
    assert "SupportTicket.id" in queries
