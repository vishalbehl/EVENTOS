"""Remove venue supplier readiness workflow.

Revision ID: 20260809_1030
Revises: 20260809_1020
Create Date: 2026-08-09
"""

from __future__ import annotations

from alembic import op


revision = "20260809_1030"
down_revision = "20260809_1020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS venue.ix_venue_devices_supplier_assignment")
    op.execute('ALTER TABLE venue.devices DROP CONSTRAINT IF EXISTS fk_venue_device_supplier_assignment')
    op.execute("ALTER TABLE venue.devices DROP COLUMN IF EXISTS supplier_assignment_id")
    op.execute("DROP TABLE IF EXISTS venue.venue_operational_incidents CASCADE")
    op.execute("DROP TABLE IF EXISTS venue.venue_readiness_attestations CASCADE")
    op.execute("DROP TABLE IF EXISTS venue.venue_supplier_contacts CASCADE")
    op.execute("DROP TABLE IF EXISTS venue.venue_supplier_assignments CASCADE")


def downgrade() -> None:
    # The supplier-readiness workflow has been retired and is intentionally
    # not restored by downgrade.
    pass
