"""Add the tenant timeline index used by task-failure operations reads."""

from alembic import op


revision = "20260909_1200"
down_revision = "20260909_1100"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_task_failures_org_created_id",
        "task_failures",
        ["organization_id", "created_at", "id"],
        schema="operations",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_task_failures_org_created_id",
        table_name="task_failures",
        schema="operations",
    )
