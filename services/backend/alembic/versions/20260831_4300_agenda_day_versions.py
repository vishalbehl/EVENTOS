"""Add optimistic concurrency versions to agenda days."""

from alembic import op
import sqlalchemy as sa

revision = "20260831_4300"
down_revision = "20260831_4200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("agenda_days", sa.Column("version", sa.Integer(), nullable=False, server_default="1"), schema="agenda")
    op.alter_column("agenda_days", "version", server_default=None, schema="agenda")


def downgrade() -> None:
    op.drop_column("agenda_days", "version", schema="agenda")
