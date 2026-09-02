"""Add optimistic concurrency versions to registrations."""

from alembic import op
import sqlalchemy as sa

revision = "20260831_4400"
down_revision = "20260831_4300"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "registrations",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        schema="registration",
    )
    op.alter_column("registrations", "version", server_default=None, schema="registration")


def downgrade() -> None:
    op.drop_column("registrations", "version", schema="registration")
