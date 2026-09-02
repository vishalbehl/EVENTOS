"""Add optimistic concurrency versions to events."""

from alembic import op
import sqlalchemy as sa


revision = "20260831_3600"
down_revision = "20260831_3500"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        schema="events",
    )
    op.alter_column("events", "version", server_default=None, schema="events")


def downgrade() -> None:
    op.drop_column("events", "version", schema="events")
