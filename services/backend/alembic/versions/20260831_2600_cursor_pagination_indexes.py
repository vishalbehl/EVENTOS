"""Add composite indexes for stable cursor pagination.

Revision ID: 20260831_2600
Revises: 20260830_2500
"""

from alembic import op


revision = "20260831_2600"
down_revision = "20260830_2500"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_registration_participants_event_registered_id "
        "ON registration.participants (event_id, registered_at DESC, id DESC) "
        "WHERE deleted_at IS NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_speakers_event_created_id "
        "ON speakers.speakers (event_id, created_at DESC, id DESC) "
        "WHERE deleted_at IS NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS speakers.ix_speakers_event_created_id")
    op.execute("DROP INDEX IF EXISTS registration.ix_registration_participants_event_registered_id")
