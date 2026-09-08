"""Add optimistic-concurrency version to durable uploads."""

from alembic import op
import sqlalchemy as sa

revision = "20260909_0600"
down_revision = "20260908_1800"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("durable_uploads", sa.Column("version", sa.Integer(), nullable=False, server_default="1"), schema="content")
    op.alter_column("durable_uploads", "version", server_default=None, schema="content")


def downgrade() -> None:
    op.drop_column("durable_uploads", "version", schema="content")
