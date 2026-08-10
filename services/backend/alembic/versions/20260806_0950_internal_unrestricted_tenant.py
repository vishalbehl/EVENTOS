"""add the single internal unrestricted tenant marker

Revision ID: 20260806_0950
Revises: 20260804_0945
Create Date: 2026-08-06
"""

from alembic import op


revision = "20260806_0950"
down_revision = "20260804_0945"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE platform.organizations ADD COLUMN IF NOT EXISTS "
        "is_internal_unrestricted BOOLEAN NOT NULL DEFAULT false"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS "
        "uq_organizations_internal_unrestricted "
        "ON platform.organizations (is_internal_unrestricted) "
        "WHERE is_internal_unrestricted"
    )
    op.execute(
        "UPDATE platform.organizations SET is_internal_unrestricted = true, "
        "is_platform_org = true WHERE slug = 'Eventos'"
    )


def downgrade() -> None:
    op.execute(
        "DROP INDEX IF EXISTS platform.uq_organizations_internal_unrestricted"
    )
    op.execute(
        "ALTER TABLE platform.organizations DROP COLUMN IF EXISTS is_internal_unrestricted"
    )
