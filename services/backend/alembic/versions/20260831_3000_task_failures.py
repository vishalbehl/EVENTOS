"""Persist terminal background-task failure metadata for recovery."""

from alembic import op
import sqlalchemy as sa


revision = "20260831_3000"
down_revision = "20260831_2900"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_failures",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("task_id", sa.String(255), nullable=False),
        sa.Column("task_name", sa.String(255), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="FAILED"),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("exception_type", sa.String(255), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=False),
        sa.Column("args_hash", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("task_id", name="uq_task_failures_task_id"),
        schema="operations",
    )
    op.create_index("ix_task_failures_org_status", "task_failures", ["organization_id", "status"], schema="operations")
    op.create_index("ix_task_failures_created_at", "task_failures", ["created_at"], schema="operations")


def downgrade() -> None:
    op.drop_index("ix_task_failures_created_at", table_name="task_failures", schema="operations")
    op.drop_index("ix_task_failures_org_status", table_name="task_failures", schema="operations")
    op.drop_table("task_failures", schema="operations")
