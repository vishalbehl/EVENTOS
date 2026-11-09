"""Retain revoked assignments and enforce active scoped uniqueness.

Duplicates block upgrade for explicit reconciliation; authority is never inferred.
"""
from alembic import op

revision = "20261007_3270"
down_revision = "20261007_3260"
branch_labels = None
depends_on = None


def upgrade():
    # Concurrent-index failure can leave the expanded columns committed.
    # Restart preserves those columns and still refuses unreconciled duplicates.
    op.execute("ALTER TABLE organizer_access.user_role_assignments ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1")
    op.execute("ALTER TABLE organizer_access.user_role_assignments ADD COLUMN IF NOT EXISTS revoked_at timestamptz")
    with op.get_context().autocommit_block():
        op.execute("CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_active_org_role_assignment ON organizer_access.user_role_assignments (organization_id, user_id, role_id) WHERE organization_id IS NOT NULL AND event_id IS NULL AND revoked_at IS NULL")
        op.execute("CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_active_event_role_assignment ON organizer_access.user_role_assignments (organization_id, user_id, role_id, event_id) WHERE organization_id IS NOT NULL AND event_id IS NOT NULL AND revoked_at IS NULL")
        op.execute("CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_active_assignment_page ON organizer_access.user_role_assignments (organization_id, id) WHERE revoked_at IS NULL")
        op.execute("""DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'organizer_access'
            AND c.relname IN ('uq_active_org_role_assignment', 'uq_active_event_role_assignment', 'ix_active_assignment_page')
            AND (NOT i.indisvalid OR NOT i.indisready OR
              (c.relname != 'ix_active_assignment_page' AND NOT i.indisunique))) THEN
            RAISE EXCEPTION 'Assignment index requires operator-reviewed repair before retry';
          END IF;
        END $$""")


def downgrade():
    raise RuntimeError("Retain assignment history and additive schema during application rollback.")
