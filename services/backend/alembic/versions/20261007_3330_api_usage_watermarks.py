"""Replay-safe completed-request accounting; reconcile duplicate metrics first."""
from alembic import op

revision = "20261007_3330"
down_revision = "20261007_3320"
branch_labels = None
depends_on = None


def upgrade():
    with op.get_context().autocommit_block():
        # Duplicate aggregates block migration, never silently merge customer
        # financial/operational history. Interrupted indexes require review.
        op.execute("CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_api_usage_period_endpoint ON analytics.api_usage (organization_id, period_start, endpoint)")
        op.execute("""DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = 'analytics.uq_api_usage_period_endpoint'::regclass
                     AND (NOT indisvalid OR NOT indisready)) THEN
            RAISE EXCEPTION 'API usage uniqueness requires operator-reviewed index repair';
          END IF;
        END $$""")
    op.execute("SET LOCAL lock_timeout = '5s'")
    # Existing int4 is insufficient for a full enterprise month. Rehearse this
    # rewrite with an approved maintenance window; do not hide lock failures.
    op.execute("ALTER TABLE analytics.api_usage ALTER COLUMN call_count TYPE bigint")
    op.execute("ALTER TABLE analytics.api_usage ADD CONSTRAINT ck_api_usage_count CHECK (call_count IS NOT NULL AND call_count >= 0) NOT VALID")
    op.execute("ALTER TABLE analytics.api_usage VALIDATE CONSTRAINT ck_api_usage_count")
    op.execute("""CREATE TABLE analytics.api_usage_watermarks (
      organization_id uuid NOT NULL REFERENCES platform.organizations(id),
      generation uuid NOT NULL, endpoint_fingerprint varchar(64) NOT NULL,
      period_start timestamptz NOT NULL, persisted_count bigint NOT NULL DEFAULT 0,
      PRIMARY KEY (organization_id, generation),
      CONSTRAINT ck_api_usage_watermark_count CHECK (persisted_count >= 0 AND persisted_count <= 9007199254740991)
    )""")
    predicate = "organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid"
    for table in ("api_usage", "api_usage_watermarks"):
        op.execute(f"ALTER TABLE analytics.{table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE analytics.{table} FORCE ROW LEVEL SECURITY")
        for prefix, mode in (("category_a_tenant", "PERMISSIVE"), ("category_a_fence", "RESTRICTIVE")):
            name = f"{prefix}_{table}"
            op.execute(f"CREATE POLICY {name} ON analytics.{table} AS {mode} FOR ALL TO PUBLIC USING ({predicate}) WITH CHECK ({predicate})")


def downgrade():
    raise RuntimeError("Retain usage checkpoints and bigint counters during application rollback.")
