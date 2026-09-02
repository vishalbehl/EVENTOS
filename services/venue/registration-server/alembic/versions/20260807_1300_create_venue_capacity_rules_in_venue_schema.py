"""create venue_capacity_rules table under venue schema

Revision ID: a1b2c3d4e5f6
Revises: f9e8d7c6b5a4
Create Date: 2026-08-07 13:00:00.000000+00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "f9e8d7c6b5a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Ensure venue schema exists
    op.execute("CREATE SCHEMA IF NOT EXISTS venue;")
    
    op.create_table(
        "venue_capacity_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("station_name", sa.String(255), nullable=False),
        sa.Column("station_type", sa.String(100), nullable=False, server_default="Room"),
        sa.Column("allowed_roles", postgresql.JSONB, nullable=False, server_default='["Delegate", "Speaker", "VIP", "Exhibitor", "Media", "Sponsor"]'),
        sa.Column("max_checkins_per_delegate", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_checkouts_per_delegate", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("station_capacity", sa.Integer(), nullable=False, server_default="500"),
        sa.Column("updated_by", sa.String(150), nullable=True),
        sa.Column("updated_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        schema="venue"
    )
    op.create_index("idx_venue_vcr_station_name", "venue_capacity_rules", ["station_name"], schema="venue")


def downgrade() -> None:
    op.drop_index("idx_venue_vcr_station_name", table_name="venue_capacity_rules", schema="venue")
    op.drop_table("venue_capacity_rules", schema="venue")
