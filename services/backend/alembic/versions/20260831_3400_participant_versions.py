"""Add optimistic-concurrency versions to participants."""

from alembic import op
import sqlalchemy as sa


revision = "20260831_3400"
down_revision = "20260831_3300"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "participants",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        schema="registration",
    )
    op.alter_column(
        "participants",
        "version",
        server_default=None,
        schema="registration",
    )


def downgrade() -> None:
    op.drop_column("participants", "version", schema="registration")
