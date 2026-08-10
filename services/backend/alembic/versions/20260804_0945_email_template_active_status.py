"""add is_active column to email_templates

Revision ID: 20260804_0945
Revises: 20260802_0944
Create Date: 2026-08-04
"""

from alembic import op
import sqlalchemy as sa


revision = "20260804_0945"
down_revision = "20260802_0944"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE communications.email_templates ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;")


def downgrade() -> None:
    op.execute("ALTER TABLE communications.email_templates DROP COLUMN IF EXISTS is_active;")
