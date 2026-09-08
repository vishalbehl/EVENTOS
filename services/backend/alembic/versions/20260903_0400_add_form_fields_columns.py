"""Add missing columns to registration.form_fields table idempotently.

Revision ID: 20260903_0400
Revises: 20260903_0300
Create Date: 2026-09-03
"""

from alembic import op


revision = "20260903_0400"
down_revision = "20260903_0300"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE registration.form_fields
        ADD COLUMN IF NOT EXISTS label VARCHAR(255),
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS placeholder VARCHAR(255),
        ADD COLUMN IF NOT EXISTS options JSONB NOT NULL DEFAULT '[]'::jsonb;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE registration.form_fields
        DROP COLUMN IF EXISTS options,
        DROP COLUMN IF EXISTS placeholder,
        DROP COLUMN IF EXISTS is_default,
        DROP COLUMN IF EXISTS is_active,
        DROP COLUMN IF EXISTS label;
        """
    )
