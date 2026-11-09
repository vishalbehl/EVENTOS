"""Additive bounded dispatch-recovery index; no historical data rewrite."""
from alembic import op

revision = "20261008_3460"
down_revision = "20261008_3450"
branch_labels = None
depends_on = None


def upgrade():
    # Concurrent build avoids blocking normal quota/receipt writers. Runtime
    # checks must still verify the index is valid after an interrupted build.
    with op.get_context().autocommit_block():
        op.execute("CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_program_dispatch_due "
            "ON platform.usage_reservations (organization_id, "
            "((metadata_json ->> 'dispatch_due')::double precision), idempotency_key) "
            "WHERE status = 'CONSUMED' AND idempotency_key LIKE 'program-upload:%'")


def downgrade():
    # Keep the additive index during binary rollback; no access fallback.
    pass
