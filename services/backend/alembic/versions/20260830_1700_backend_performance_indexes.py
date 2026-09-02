"""Add hot-path backend performance indexes.

Revision ID: 20260830_1700
Revises: 20260830_1500
Create Date: 2026-08-30 17:00:00.000000
"""

from alembic import op


revision = "20260830_1700"
down_revision = "20260830_1500"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_registration_participants_event_lower_email "
        "ON registration.participants (event_id, lower(email)) "
        "WHERE email IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_events_speakers_event_lower_email "
        "ON speakers.speakers (event_id, lower(email)) "
        "WHERE email IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_registration_registrations_event_participant "
        "ON registration.registrations (event_id, participant_id) "
        "WHERE participant_id IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_registration_registrations_event_data_email "
        "ON registration.registrations (event_id, lower(registration_data->>'email')) "
        "WHERE registration_data ? 'email'"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_registration_payment_transactions_registration_created "
        "ON registration.payment_transactions (registration_id, created_at DESC) "
        "WHERE registration_id IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_registration_participant_roles_event_sort_name "
        "ON registration.participant_roles (event_id, sort_order, name)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS registration.ix_registration_participant_roles_event_sort_name")
    op.execute("DROP INDEX IF EXISTS registration.ix_registration_payment_transactions_registration_created")
    op.execute("DROP INDEX IF EXISTS registration.ix_registration_registrations_event_data_email")
    op.execute("DROP INDEX IF EXISTS registration.ix_registration_registrations_event_participant")
    op.execute("DROP INDEX IF EXISTS speakers.ix_events_speakers_event_lower_email")
    op.execute("DROP INDEX IF EXISTS registration.ix_registration_participants_event_lower_email")
