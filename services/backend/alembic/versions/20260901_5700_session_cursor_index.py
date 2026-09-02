"""Add the event schedule cursor index."""

from alembic import op


revision = "20260901_5700"
down_revision = "20260901_5600"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_agenda_sessions_event_start_id",
        "sessions",
        ["event_id", "start_time", "id"],
        schema="agenda",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_agenda_sessions_event_start_id",
        table_name="sessions",
        schema="agenda",
    )
