"""Add device identity, command scope, and delivery acknowledgement state."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260903_0600"
down_revision: Union[str, None] = "20260903_0500"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _add(table: str, column: sa.Column, *, schema: str = "venue") -> None:
    op.add_column(table, column, schema=schema)


def upgrade() -> None:
    # Room devices need their own credentials; the shared Venue key remains
    # only a bootstrap/legacy compatibility mechanism.
    _add("room_devices", sa.Column("enrollment_token_hash", sa.String(64), nullable=True))
    _add("room_devices", sa.Column("enrollment_token_prefix", sa.String(24), nullable=True))
    _add("room_devices", sa.Column("enrollment_token_revoked_at", sa.DateTime(timezone=True), nullable=True))
    _add("room_devices", sa.Column("last_server_sequence", sa.Integer(), nullable=True))
    op.create_index("ix_venue_room_devices_enrollment_token_hash", "room_devices", ["enrollment_token_hash"], unique=True, schema="venue")

    _add("srr_stations", sa.Column("last_server_sequence", sa.Integer(), nullable=True))

    _add("operational_commands", sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=True))
    _add("operational_commands", sa.Column("room_id", postgresql.UUID(as_uuid=True), nullable=True))
    _add("operational_commands", sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=True))
    _add("operational_commands", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
    _add("operational_commands", sa.Column("idempotency_key", sa.String(160), nullable=True))
    _add("operational_commands", sa.Column("error_message", sa.Text(), nullable=True))
    for name, column in (
        ("event_id", "event_id"),
        ("room_id", "room_id"),
        ("session_id", "session_id"),
        ("expires_at", "expires_at"),
    ):
        op.create_index(f"ix_venue_operational_commands_{name}", "operational_commands", [column], schema="venue")
    op.create_index("ix_venue_operational_commands_idempotency_key", "operational_commands", ["idempotency_key"], unique=True, schema="venue")

    _add("asset_transfers", sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"))
    _add("asset_transfers", sa.Column("target_id", postgresql.UUID(as_uuid=True), nullable=True))
    _add("asset_transfers", sa.Column("target_url", sa.String(500), nullable=True))
    _add("asset_transfers", sa.Column("lease_owner", sa.String(160), nullable=True))
    _add("asset_transfers", sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True))
    _add("asset_transfers", sa.Column("last_transfer_at", sa.DateTime(timezone=True), nullable=True))
    _add("asset_transfers", sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True))
    _add("asset_transfers", sa.Column("acknowledged_sha256", sa.String(64), nullable=True))
    _add("asset_transfers", sa.Column("source_acknowledged_at", sa.DateTime(timezone=True), nullable=True))
    _add("asset_transfers", sa.Column("target_acknowledged_at", sa.DateTime(timezone=True), nullable=True))
    _add("asset_transfers", sa.Column("idempotency_key", sa.String(160), nullable=True))
    op.create_index("ix_venue_asset_transfers_lease_expires_at", "asset_transfers", ["lease_expires_at"], schema="venue")
    op.create_index("ix_venue_asset_transfers_target_id", "asset_transfers", ["target_id"], schema="venue")
    op.create_index("ix_venue_asset_transfers_idempotency_key", "asset_transfers", ["idempotency_key"], unique=True, schema="venue")


def downgrade() -> None:
    op.drop_index("ix_venue_asset_transfers_idempotency_key", table_name="asset_transfers", schema="venue")
    op.drop_index("ix_venue_asset_transfers_lease_expires_at", table_name="asset_transfers", schema="venue")
    op.drop_index("ix_venue_asset_transfers_target_id", table_name="asset_transfers", schema="venue")
    for column in ("idempotency_key", "target_acknowledged_at", "source_acknowledged_at", "acknowledged_sha256", "acknowledged_at", "last_transfer_at", "lease_expires_at", "lease_owner", "attempt_count", "target_url", "target_id"):
        op.drop_column("asset_transfers", column, schema="venue")
    op.drop_index("ix_venue_operational_commands_idempotency_key", table_name="operational_commands", schema="venue")
    for name in ("event_id", "room_id", "session_id", "expires_at"):
        op.drop_index(f"ix_venue_operational_commands_{name}", table_name="operational_commands", schema="venue")
    for column in ("error_message", "idempotency_key", "expires_at", "session_id", "room_id", "event_id"):
        op.drop_column("operational_commands", column, schema="venue")
    op.drop_column("srr_stations", "last_server_sequence", schema="venue")
    op.drop_index("ix_venue_room_devices_enrollment_token_hash", table_name="room_devices", schema="venue")
    for column in ("last_server_sequence", "enrollment_token_revoked_at", "enrollment_token_prefix", "enrollment_token_hash"):
        op.drop_column("room_devices", column, schema="venue")
