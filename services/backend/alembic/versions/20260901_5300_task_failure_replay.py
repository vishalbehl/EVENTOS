"""Add safe allow-listed dead-letter replay metadata."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260901_5300"
down_revision = "20260901_5200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("task_failures", sa.Column("replay_queue", sa.String(30), nullable=True), schema="operations")
    op.add_column("task_failures", sa.Column("replay_args", postgresql.JSONB(), nullable=True), schema="operations")
    op.add_column("task_failures", sa.Column("replay_count", sa.Integer(), nullable=False, server_default="0"), schema="operations")
    op.add_column("task_failures", sa.Column("last_replayed_at", sa.DateTime(timezone=True), nullable=True), schema="operations")
    op.alter_column("task_failures", "replay_count", server_default=None, schema="operations")


def downgrade() -> None:
    op.drop_column("task_failures", "last_replayed_at", schema="operations")
    op.drop_column("task_failures", "replay_count", schema="operations")
    op.drop_column("task_failures", "replay_args", schema="operations")
    op.drop_column("task_failures", "replay_queue", schema="operations")
