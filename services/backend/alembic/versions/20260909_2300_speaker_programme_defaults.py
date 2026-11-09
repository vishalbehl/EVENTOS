"""Add server defaults to speaker programme columns.

Revision ID: 20260909_2300
Revises: 20260909_2200
"""

from alembic import op
import sqlalchemy as sa


revision = "20260909_2300"
down_revision = "20260909_2200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for col in ("programme_availability", "programme_custom_fields", "programme_travel_details"):
        op.alter_column(
            "speakers",
            col,
            server_default=sa.text("'{}'::jsonb"),
            schema="speakers",
        )


def downgrade() -> None:
    for col in ("programme_availability", "programme_custom_fields", "programme_travel_details"):
        op.alter_column(
            "speakers",
            col,
            server_default=None,
            schema="speakers",
        )
