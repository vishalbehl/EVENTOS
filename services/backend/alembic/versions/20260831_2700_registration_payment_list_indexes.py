"""Add indexes for bounded registration and payment list reads.

Revision ID: 20260831_2700
Revises: 20260831_2600
"""

from alembic import op


revision = "20260831_2700"
down_revision = "20260831_2600"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_registration_registrations_event_submitted_id "
        "ON registration.registrations (event_id, submitted_at DESC, id DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_registration_payments_event_created_id "
        "ON registration.payment_transactions (event_id, created_at DESC, id DESC)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS registration.ix_registration_payments_event_created_id")
    op.execute("DROP INDEX IF EXISTS registration.ix_registration_registrations_event_submitted_id")
