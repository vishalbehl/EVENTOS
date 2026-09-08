from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_usage_read_delegates_key_and_reconciliation_reads():
    source = (ROOT / "app/modules/platform/organization_console_router.py").read_text(encoding="utf-8")
    region = source.split("async def get_usage", 1)[1].split("async def reconcile_usage", 1)[0]
    assert "UsageQueryService(db)" in region
    assert "usage_queries.metric_keys" in region
    assert "usage_queries.latest_reconciliation" in region
    assert "select(UsageLedgerEntry.metric_key" not in region
    assert "select(UsageReconciliationRun)" not in region


def test_usage_query_is_scoped_projected_and_stably_ordered():
    source = (ROOT / "app/modules/platform/application/queries.py").read_text(encoding="utf-8")
    region = source.split("class UsageQueryService", 1)[1].split("class CommercialAccessQueryService", 1)[0]
    assert "UsageLedgerEntry.organization_id == organization_id" in region
    assert "UsageLedgerEntry.event_id == event_id" in region
    assert "UsageReconciliationRun.organization_id == organization_id" in region
    assert "UsageReconciliationRun.event_id == event_id" in region
    assert "load_only(*self._RECONCILIATION_COLUMNS)" in region
    assert "UsageLedgerEntry.metric_key.asc()" in region
    assert "UsageReconciliationRun.reconciled_at.desc()" in region
    assert "UsageReconciliationRun.id.desc()" in region
