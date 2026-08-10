"""Store source API keys encrypted for governed recopy.

Revision ID: 20260809_1040
Revises: 20260809_1030
Create Date: 2026-08-09
"""

from __future__ import annotations

from alembic import op


revision = "20260809_1040"
down_revision = "20260809_1030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE IF EXISTS venue.registration_source_api_keys ADD COLUMN IF NOT EXISTS api_key_encrypted TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE IF EXISTS venue.registration_source_api_keys DROP COLUMN IF EXISTS api_key_encrypted")
