"""Add composite index for event-scoped registration number allocation."""

from alembic import op


revision = "20260831_3700"
down_revision = "20260831_3600"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_registration_participants_event_regno "
        "ON registration.participants (event_id, regno)"
    )


def downgrade() -> None:
    op.execute(
        "DROP INDEX IF EXISTS registration.ix_registration_participants_event_regno"
    )
