"""Index terminal upload reconciliation without rewriting earlier migrations.

Revision ID: 20261019_3640
Revises: 20261017_3630
"""
from alembic import op

revision = "20261019_3640"
down_revision = "20261017_3630"
branch_labels = None
depends_on = None

INDEXES = (
    ("content", "ix_upload_failed_reconciliation", "content.durable_uploads",
        "(organization_id, id) WHERE status = 'failed'"),
    ("content", "ix_upload_cleanup_intent_recovery", "content.durable_uploads",
        "(organization_id, updated_at, id) WHERE status = 'cleanup_pending'"),
    ("platform", "ix_upload_reservation_identity_all_states", "platform.usage_reservations",
        "(organization_id, ((metadata_json ->> 'upload_id')))"),
)


def upgrade():
    with op.get_context().autocommit_block():
        for schema, name, table, definition in INDEXES:
            op.execute(f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {name} ON {table} {definition}")
            # An interrupted concurrent build can leave an invalid named index.
            # Do not silently stamp this migration as complete in that case.
            op.execute(f"""DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
                    JOIN pg_namespace n ON n.oid=c.relnamespace
                    WHERE n.nspname='{schema}' AND c.relname='{name}' AND i.indisvalid AND i.indisready)
                THEN RAISE EXCEPTION 'Upload fence index missing/invalid; repair exact index before retry';
                END IF;
                END $$""")


def downgrade():
    raise RuntimeError("Retain additive upload fence indexes during application rollback; use forward recovery.")
