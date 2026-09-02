"""Add optimistic concurrency versions to agenda sessions."""

from alembic import op
import sqlalchemy as sa


revision = "20260831_4000"
down_revision = "20260831_3900"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sessions",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        schema="agenda",
    )
    op.alter_column("sessions", "version", server_default=None, schema="agenda")


def downgrade() -> None:
    op.drop_column("sessions", "version", schema="agenda")
