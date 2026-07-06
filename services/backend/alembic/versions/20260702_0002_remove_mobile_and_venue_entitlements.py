"""remove mobile and venue entitlement sections

Revision ID: 20260702_0002
Revises: 20260702_0001
Create Date: 2026-07-02
"""
from alembic import op


revision = "20260702_0002"
down_revision = "20260702_0001"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
        DELETE FROM platform.feature_catalog
        WHERE category IN ('MOBILE_INTEGRATIONS', 'VENUE_OPERATIONS')
        """
    )


def downgrade():
    pass
