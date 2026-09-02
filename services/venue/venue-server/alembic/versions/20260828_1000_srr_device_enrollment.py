"""Add durable SRR device enrollment identity fields."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260828_1000"
down_revision: Union[str, None] = "20260828_0900"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("srr_stations", sa.Column("device_role", sa.String(40), nullable=False, server_default="workstation"), schema="venue")
    op.add_column("srr_stations", sa.Column("mac_address", sa.String(32), nullable=True), schema="venue")
    op.add_column("srr_stations", sa.Column("enrollment_token_hash", sa.String(64), nullable=True), schema="venue")
    op.add_column("srr_stations", sa.Column("enrollment_token_prefix", sa.String(24), nullable=True), schema="venue")
    op.add_column("srr_stations", sa.Column("enrollment_token_revoked_at", sa.DateTime(timezone=True), nullable=True), schema="venue")
    op.create_index("ix_venue_srr_stations_enrollment_token_prefix", "srr_stations", ["enrollment_token_prefix"], schema="venue")
    op.create_index("ix_venue_srr_stations_mac_address", "srr_stations", ["mac_address"], schema="venue")


def downgrade() -> None:
    op.drop_index("ix_venue_srr_stations_mac_address", table_name="srr_stations", schema="venue")
    op.drop_index("ix_venue_srr_stations_enrollment_token_prefix", table_name="srr_stations", schema="venue")
    op.drop_column("srr_stations", "enrollment_token_revoked_at", schema="venue")
    op.drop_column("srr_stations", "enrollment_token_prefix", schema="venue")
    op.drop_column("srr_stations", "enrollment_token_hash", schema="venue")
    op.drop_column("srr_stations", "mac_address", schema="venue")
    op.drop_column("srr_stations", "device_role", schema="venue")
