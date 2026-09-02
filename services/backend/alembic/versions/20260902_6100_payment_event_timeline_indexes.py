"""Add ordering indexes for platform activity timeline reads."""

from alembic import op


revision = "20260902_6100"
down_revision = "20260901_6000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The platform feed orders globally; organization timelines filter first
    # and then use the same stable timestamp-plus-id ordering.
    with op.get_context().autocommit_block():
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
            "ix_payment_events_timestamp_id ON commerce.payment_events "
            "(timestamp, id)"
        )
        op.execute(
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
            "ix_payment_events_organization_timestamp_id ON commerce.payment_events "
            "(organization_id, timestamp, id)"
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute(
            "DROP INDEX CONCURRENTLY IF EXISTS "
            "commerce.ix_payment_events_organization_timestamp_id"
        )
        op.execute(
            "DROP INDEX CONCURRENTLY IF EXISTS "
            "commerce.ix_payment_events_timestamp_id"
        )
