"""add is_published column to events.sessions

Revision ID: 20260828_1140
Revises: 20260828_1120
Create Date: 2026-08-28 11:40:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260828_1140"
down_revision = "20260828_1120"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sessions",
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        schema="events",
    )
    op.create_index(
        op.f("ix_events_sessions_is_published"),
        "sessions",
        ["is_published"],
        unique=False,
        schema="events",
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_events_sessions_is_published"), table_name="sessions", schema="events")
    op.drop_column("sessions", "is_published", schema="events")
