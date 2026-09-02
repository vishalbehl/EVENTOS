"""Add an active-row index for registration cursor pages."""

from alembic import op


revision = "20260901_4900"
down_revision = "20260831_4800"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Public and organiser registration pages always exclude soft-deleted rows.
    # Keeping that predicate in the index avoids scanning deleted records before
    # applying the page limit while preserving the existing compatibility index.
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_registration_registrations_event_submitted_active_id "
        "ON registration.registrations (event_id, submitted_at DESC, id DESC) "
        "WHERE deleted_at IS NULL"
    )
    # The previous non-partial index served the same cursor ordering but also
    # indexed soft-deleted rows. Remove the duplicate once the targeted index
    # is present so PostgreSQL has one clear access path for this hot read.
    op.execute(
        "DROP INDEX IF EXISTS registration.ix_registration_registrations_event_submitted_id"
    )


def downgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_registration_registrations_event_submitted_id "
        "ON registration.registrations (event_id, submitted_at DESC, id DESC)"
    )
    op.execute(
        "DROP INDEX IF EXISTS registration.ix_registration_registrations_event_submitted_active_id"
    )
