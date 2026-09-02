"""Add evidence-backed indexes for attendee and event hot reads."""

from alembic import op


revision = "20260831_3200"
down_revision = "20260831_3100"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The application normalizes email at lookup time, so plain email indexes
    # cannot support the lower(email) predicates used by portal reads.
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_registration_participants_event_lower_email "
        "ON registration.participants (event_id, lower(email)) "
        "WHERE deleted_at IS NULL AND email IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_speakers_event_lower_email "
        "ON speakers.speakers (event_id, lower(email)) "
        "WHERE deleted_at IS NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_registration_registrations_event_lower_json_email "
        "ON registration.registrations (event_id, lower((registration_data->>'email'))) "
        "WHERE deleted_at IS NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_registration_payments_registration_created_id "
        "ON registration.payment_transactions (registration_id, created_at DESC, id DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_registration_participant_roles_event_sort_name "
        "ON registration.participant_roles (event_id, sort_order, name)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS registration.ix_registration_participant_roles_event_sort_name")
    op.execute("DROP INDEX IF EXISTS registration.ix_registration_payments_registration_created_id")
    op.execute("DROP INDEX IF EXISTS registration.ix_registration_registrations_event_lower_json_email")
    op.execute("DROP INDEX IF EXISTS speakers.ix_speakers_event_lower_email")
    op.execute("DROP INDEX IF EXISTS registration.ix_registration_participants_event_lower_email")
