"""Add partial indexes for active event aggregate counts.

Evidence source: services/backend/ops/database_hot_query_plans.py on the
100,000-row staging fixture showed sequential scans for both counts because
the existing event_id indexes also contain soft-deleted rows.
"""

from alembic import op


revision = "20260831_3800"
down_revision = "20260831_3700"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_registration_participants_active_event "
        "ON registration.participants (event_id) WHERE deleted_at IS NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_registration_registrations_active_event "
        "ON registration.registrations (event_id) WHERE deleted_at IS NULL"
    )


def downgrade() -> None:
    op.execute(
        "DROP INDEX IF EXISTS registration.ix_registration_registrations_active_event"
    )
    op.execute(
        "DROP INDEX IF EXISTS registration.ix_registration_participants_active_event"
    )
