from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_financial_adjustment_list_delegates_to_query_service():
    source = (ROOT / "app/modules/platform/organization_console_router.py").read_text(encoding="utf-8")
    region = source.split("async def list_financial_adjustments", 1)[1].split("async def decide_financial_adjustment", 1)[0]
    assert "FinancialAdjustmentQueryService(db).list" in region
    assert "select(OrganizationFinancialAdjustment)" not in region


def test_financial_adjustment_query_is_scoped_bounded_projected_and_stable():
    source = (ROOT / "app/modules/platform/application/queries.py").read_text(encoding="utf-8")
    region = source.split("class FinancialAdjustmentQueryService", 1)[1].split("class CommercialAccessQueryService", 1)[0]
    assert "OrganizationFinancialAdjustment.organization_id == organization_id" in region
    assert "max(1, min(int(limit), 100))" in region
    assert "load_only(*self._COLUMNS)" in region
    assert "OrganizationFinancialAdjustment.created_at.desc()" in region
