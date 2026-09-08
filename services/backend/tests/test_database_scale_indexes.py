from pathlib import Path


def test_database_evidence_can_emit_bounded_index_plans():
    evidence = Path(__file__).resolve().parents[1].joinpath(
        "ops/database_evidence.py"
    ).read_text(encoding="utf-8-sig")
    assert "--include-index-plans" in evidence
    assert "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)" in evidence
    assert '"index_plans"' in evidence
    assert "_plan_summary" in evidence


def test_payment_event_timeline_migration_matches_read_orderings():
    migration = next(
        Path(__file__).resolve().parents[1]
        .joinpath("alembic/versions")
        .glob("20260902_6100_payment_event_timeline_indexes.py")
    ).read_text(encoding="utf-8-sig")
    assert "commerce.payment_events" in migration
    assert "commerce.ix_payment_events" in migration
    assert "(timestamp, id)" in migration
    assert "(organization_id, timestamp, id)" in migration
    assert "CREATE INDEX CONCURRENTLY IF NOT EXISTS" in migration
    assert "DROP INDEX CONCURRENTLY IF EXISTS" in migration
    assert "autocommit_block" in migration
    assert 'down_revision = "20260901_6000"' in migration


def test_task_failure_timeline_migration_matches_tenant_read_ordering():
    migration = next(
        Path(__file__).resolve().parents[1]
        .joinpath("alembic/versions")
        .glob("20260909_1200_task_failure_timeline_index.py")
    ).read_text(encoding="utf-8-sig")
    assert 'revision = "20260909_1200"' in migration
    assert 'down_revision = "20260909_1100"' in migration
    assert '"organization_id", "created_at", "id"' in migration
    assert '"ix_task_failures_org_created_id"' in migration
