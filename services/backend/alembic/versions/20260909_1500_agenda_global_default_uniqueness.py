"""Make global agenda defaults idempotent under concurrent startup.

Revision ID: 20260909_1500
Revises: 20260909_1400
"""

from alembic import op


revision = "20260909_1500"
down_revision = "20260909_1400"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_agenda_room_types_global_code "
        "ON agenda.room_types (code) WHERE organization_id IS NULL"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_agenda_session_types_global_code "
        "ON agenda.session_types (code) WHERE organization_id IS NULL"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_agenda_track_types_global_code "
        "ON agenda.track_types (code) WHERE organization_id IS NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS agenda.uq_agenda_track_types_global_code")
    op.execute("DROP INDEX IF EXISTS agenda.uq_agenda_session_types_global_code")
    op.execute("DROP INDEX IF EXISTS agenda.uq_agenda_room_types_global_code")
