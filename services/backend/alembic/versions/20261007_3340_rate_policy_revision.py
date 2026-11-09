"""Authoritative rate configuration revision, independent of cache invalidation."""
from alembic import op

revision = "20261007_3340"
down_revision = "20261007_3330"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""CREATE TABLE developer.rate_policy_revision (
      singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
      revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0)
    )""")
    op.execute("INSERT INTO developer.rate_policy_revision(singleton, revision) VALUES (true, 1)")
    op.execute("ALTER TABLE developer.rate_policy_revision ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE developer.rate_policy_revision FORCE ROW LEVEL SECURITY")
    # Public projection contains only a policy epoch, no tenant/customer data.
    op.execute("CREATE POLICY rate_revision_read ON developer.rate_policy_revision FOR SELECT TO PUBLIC USING (true)")
    owner = "current_user = pg_catalog.pg_get_userbyid((SELECT relowner FROM pg_catalog.pg_class WHERE oid = 'developer.rate_policy_revision'::regclass))"
    op.execute(f"CREATE POLICY rate_revision_owner_update ON developer.rate_policy_revision FOR UPDATE TO PUBLIC USING ({owner}) WITH CHECK ({owner})")
    op.execute("""CREATE FUNCTION developer.advance_rate_policy_revision()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = pg_catalog AS $$
      BEGIN
        UPDATE developer.rate_policy_revision SET revision = revision + 1 WHERE singleton;
        IF NOT FOUND THEN RAISE EXCEPTION 'Rate policy revision missing'; END IF;
        RETURN NULL;
      END $$""")
    op.execute("REVOKE ALL ON FUNCTION developer.advance_rate_policy_revision() FROM PUBLIC")
    # No per-request administrator lookup. A fixed metadata read checks the
    # epoch; every supported source of limits advances it transactionally.
    for schema, table in (("developer", "rate_limits"), ("commerce", "commercial_accounts"),
                          ("commerce", "commercial_contracts"), ("commerce", "commercial_contract_items"),
                          ("commerce", "commercial_offers")):
        op.execute(f"CREATE TRIGGER category_a_rate_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON {schema}.{table} "
                   "FOR EACH STATEMENT EXECUTE FUNCTION developer.advance_rate_policy_revision()")
    op.execute("ALTER TABLE developer.rate_limits ADD CONSTRAINT ck_rate_limits_bounds CHECK (requests_per_minute IS NOT NULL AND requests_per_day IS NOT NULL AND requests_per_minute BETWEEN 1 AND 10000000 AND requests_per_day BETWEEN 1 AND 10000000) NOT VALID")
    op.execute("ALTER TABLE developer.rate_limits VALIDATE CONSTRAINT ck_rate_limits_bounds")
    with op.get_context().autocommit_block():
        for name, columns, predicate in (
            ("uq_rate_limits_tenant", "organization_id", "organization_id IS NOT NULL"),
            ("uq_rate_limits_global_tier", "lower(plan_tier)", "organization_id IS NULL"),
        ):
            op.execute(f"CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS {name} ON developer.rate_limits ({columns}) WHERE {predicate}")
            op.execute(f"""DO $$ BEGIN
              IF EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = 'developer.{name}'::regclass
                         AND (NOT indisvalid OR NOT indisready)) THEN
                RAISE EXCEPTION 'Rate policy index requires approved conflict/index reconciliation';
              END IF;
            END $$""")


def downgrade():
    raise RuntimeError("Keep authoritative rate revisions and bounds on application rollback.")
