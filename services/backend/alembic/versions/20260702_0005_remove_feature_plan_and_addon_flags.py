"""remove feature plan and addon flags

Revision ID: 20260702_0005
Revises: 20260702_0004
Create Date: 2026-07-02
"""

from alembic import op
import sqlalchemy as sa


revision = "20260702_0005"
down_revision = "20260702_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE platform.feature_catalog
        DROP COLUMN IF EXISTS is_addon,
        DROP COLUMN IF EXISTS is_billable,
        DROP COLUMN IF EXISTS required_plan
        """
    )


def downgrade() -> None:
    op.add_column(
        "feature_catalog",
        sa.Column("is_addon", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        schema="platform",
    )
    op.add_column(
        "feature_catalog",
        sa.Column("is_billable", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        schema="platform",
    )
    op.add_column(
        "feature_catalog",
        sa.Column("required_plan", sa.String(length=50), nullable=True),
        schema="platform",
    )
