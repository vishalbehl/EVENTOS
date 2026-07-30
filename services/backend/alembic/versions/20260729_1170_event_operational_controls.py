"""add event maintenance and read-only controls

Revision ID: 20260729_1170
Revises: 20260729_1160
"""

import sqlalchemy as sa
from alembic import op


revision = "20260729_1170"
down_revision = "20260729_1160"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column(
            "is_maintenance",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        schema="events",
    )
    op.add_column(
        "events",
        sa.Column(
            "is_read_only",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        schema="events",
    )


def downgrade() -> None:
    op.drop_column("events", "is_read_only", schema="events")
    op.drop_column("events", "is_maintenance", schema="events")
