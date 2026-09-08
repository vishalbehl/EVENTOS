"""Add optimistic-concurrency version to email campaigns."""

from alembic import op
import sqlalchemy as sa

revision = "20260909_0700"
down_revision = "20260909_0600"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("email_campaigns", sa.Column("version", sa.Integer(), nullable=False, server_default="1"), schema="communications")
    op.alter_column("email_campaigns", "version", server_default=None, schema="communications")


def downgrade() -> None:
    op.drop_column("email_campaigns", "version", schema="communications")
