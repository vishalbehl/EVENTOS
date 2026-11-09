"""Reject new unowned events; preserve legacy rows for explicit reconciliation."""
from alembic import op

revision = "20261007_3410"
down_revision = "20261007_3400"
branch_labels = None
depends_on = None


def upgrade():
    # NOT VALID permits additive deployment with an unresolved legacy cohort;
    # inserts/updates must already satisfy the invariant. Validation is a separate
    # reconciliation gate, never an inferred ownership backfill in a migration.
    op.execute("""DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint
          WHERE conrelid = 'events.events'::regclass AND conname = 'ck_event_workspace_required') THEN
          ALTER TABLE events.events ADD CONSTRAINT ck_event_workspace_required
            CHECK (operational_workspace_id IS NOT NULL) NOT VALID;
        END IF;
        END $$""")
    with op.get_context().autocommit_block():
        op.execute("""CREATE INDEX CONCURRENTLY ix_event_workspace_page
            ON events.events (organization_id,operational_workspace_id,id)
            WHERE deleted_at IS NULL""")


def downgrade():
    raise RuntimeError("Retain workspace ownership enforcement during application rollback.")
