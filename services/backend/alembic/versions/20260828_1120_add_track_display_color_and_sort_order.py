"""add display_color and sort_order to events.tracks

Revision ID: 20260828_1120
Revises: 20260824_1400
Create Date: 2026-08-28 11:20:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260828_1120"
down_revision = "20260824_1400"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add display_color to events.tracks if it does not exist
    op.add_column(
        "tracks",
        sa.Column("display_color", sa.String(length=7), nullable=True),
        schema="events",
    )
    # Add sort_order to events.tracks if it does not exist
    op.add_column(
        "tracks",
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        schema="events",
    )


def downgrade() -> None:
    op.drop_column("tracks", "sort_order", schema="events")
    op.drop_column("tracks", "display_color", schema="events")
