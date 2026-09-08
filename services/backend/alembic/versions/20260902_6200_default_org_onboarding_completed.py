"""Ensure default platform organization has onboarding_completed set to true.

Revision ID: 20260902_6200
Revises: 20260902_6100
Create Date: 2026-09-02
"""

from alembic import op


revision = "20260902_6200"
down_revision = "20260902_6100"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE platform.organizations
        SET onboarding_completed = true
        WHERE is_platform_org = true
           OR is_internal_unrestricted = true
           OR lower(slug) = 'eventos'
           OR slug = 'default-org'
        """
    )


def downgrade() -> None:
    pass
