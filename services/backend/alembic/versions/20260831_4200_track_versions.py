"""Add optimistic concurrency versions to agenda tracks."""

from alembic import op
import sqlalchemy as sa

revision = "20260831_4200"
down_revision = "20260831_4100"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tracks", sa.Column("version", sa.Integer(), nullable=False, server_default="1"), schema="agenda")
    op.alter_column("tracks", "version", server_default=None, schema="agenda")


def downgrade() -> None:
    op.drop_column("tracks", "version", schema="agenda")
