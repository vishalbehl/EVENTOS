"""Add optimistic concurrency versions to speakers."""

from alembic import op
import sqlalchemy as sa


revision = "20260831_3900"
down_revision = "20260831_3800"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "speakers",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        schema="speakers",
    )
    op.alter_column("speakers", "version", server_default=None, schema="speakers")


def downgrade() -> None:
    op.drop_column("speakers", "version", schema="speakers")
