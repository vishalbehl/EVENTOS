from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_organiser_dashboard_metrics_use_one_query_service_projection():
    router = (ROOT / "app/modules/organiser/router.py").read_text(encoding="utf-8")
    queries = (ROOT / "app/modules/organiser/application/queries.py").read_text(encoding="utf-8")
    region = router.split("async def organiser_dashboard", 1)[1].split("@router.get(\"/addons/status\")", 1)[0]

    assert "OrganiserDashboardQueryService(db).metrics" in region
    assert "select(func.count(OrganizationMember.id))" not in region
    assert "select(func.coalesce(func.sum(PaymentTransaction.amount)" not in region
    assert "storage_used_bytes" in queries
    assert ".scalar_subquery()" in queries
