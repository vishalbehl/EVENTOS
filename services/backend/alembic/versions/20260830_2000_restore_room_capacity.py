"""Restore room capacity required by scheduling and check-in workflows."""

from alembic import op
import sqlalchemy as sa

revision = "20260830_2000"
down_revision = "20260830_1900"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("rooms", sa.Column("capacity", sa.Integer(), nullable=True), schema="agenda")
    op.add_column("rooms", sa.Column("screen_count", sa.Integer(), nullable=True), schema="agenda")


def downgrade() -> None:
    op.drop_column("rooms", "capacity", schema="agenda")
    op.drop_column("rooms", "screen_count", schema="agenda")
