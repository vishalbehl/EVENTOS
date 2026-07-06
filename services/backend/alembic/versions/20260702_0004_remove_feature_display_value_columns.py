"""remove feature display value columns

Revision ID: 20260702_0004
Revises: 20260702_0003
Create Date: 2026-07-02
"""

from alembic import op
import sqlalchemy as sa


revision = "20260702_0004"
down_revision = "20260702_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE platform.feature_catalog
        DROP COLUMN IF EXISTS display_value_basic,
        DROP COLUMN IF EXISTS display_value_professional,
        DROP COLUMN IF EXISTS display_value_enterprise
        """
    )


def downgrade() -> None:
    op.add_column(
        "feature_catalog",
        sa.Column("display_value_basic", sa.String(length=200), nullable=True),
        schema="platform",
    )
    op.add_column(
        "feature_catalog",
        sa.Column("display_value_professional", sa.String(length=200), nullable=True),
        schema="platform",
    )
    op.add_column(
        "feature_catalog",
        sa.Column("display_value_enterprise", sa.String(length=200), nullable=True),
        schema="platform",
    )
