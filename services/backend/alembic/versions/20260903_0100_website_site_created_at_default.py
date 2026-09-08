"""Restore the server default for website site creation timestamps.

Revision ID: 20260903_0100
Revises: 20260902_6200
Create Date: 2026-09-03
"""

from alembic import op


revision = "20260903_0100"
down_revision = "20260902_6200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The website-builder tables were moved from website_builder to websites.
    # The move preserved the NOT NULL constraint on sites.created_at but the
    # original table had no server default. New sites are ORM-created without
    # an explicit timestamp, so the database must supply it.
    op.execute(
        """
        ALTER TABLE websites.sites
        ALTER COLUMN created_at SET DEFAULT timezone('utc'::text, now())
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE websites.sites
        ALTER COLUMN created_at DROP DEFAULT
        """
    )
