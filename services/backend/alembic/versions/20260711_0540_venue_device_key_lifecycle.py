"""Add expiry, rotation, and revocation state to venue device keys."""

from alembic import op
import sqlalchemy as sa


revision = "phase1_device_keys_0540"
down_revision = "phase1_search_rls_0530"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("devices", sa.Column("device_key_version", sa.Integer(), nullable=False, server_default="1"), schema="venue")
    op.add_column("devices", sa.Column("device_key_expires_at", sa.DateTime(timezone=True), nullable=True), schema="venue")
    op.add_column("devices", sa.Column("device_key_rotated_at", sa.DateTime(timezone=True), nullable=True), schema="venue")
    op.add_column("devices", sa.Column("device_key_revoked_at", sa.DateTime(timezone=True), nullable=True), schema="venue")
    op.add_column("devices", sa.Column("device_key_revocation_reason", sa.String(length=255), nullable=True), schema="venue")
    op.create_index("ix_venue_devices_device_key_expires_at", "devices", ["device_key_expires_at"], schema="venue")


def downgrade() -> None:
    op.drop_index("ix_venue_devices_device_key_expires_at", table_name="devices", schema="venue")
    op.drop_column("devices", "device_key_revocation_reason", schema="venue")
    op.drop_column("devices", "device_key_revoked_at", schema="venue")
    op.drop_column("devices", "device_key_rotated_at", schema="venue")
    op.drop_column("devices", "device_key_expires_at", schema="venue")
    op.drop_column("devices", "device_key_version", schema="venue")
