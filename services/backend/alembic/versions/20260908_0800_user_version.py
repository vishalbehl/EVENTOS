"""Add optimistic-concurrency versioning to identity users."""

from alembic import op
import sqlalchemy as sa

revision = "20260908_0800"
down_revision = "20260908_0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("version", sa.Integer(), nullable=False, server_default="1"), schema="identity")
    op.alter_column("users", "version", server_default=None, schema="identity")


def downgrade() -> None:
    op.drop_column("users", "version", schema="identity")
