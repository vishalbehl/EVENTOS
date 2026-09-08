"""Enforce authoritative presentation, station, device, and delivery identity."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260903_0800"
down_revision: Union[str, None] = "20260903_0700"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Preserve every immutable file version, but leave exactly one current
    # row per session-speaker before creating the partial unique index.
    op.execute(sa.text("""
        UPDATE presentations.presentation_files AS current_file
        SET is_current_version = FALSE
        WHERE current_file.is_current_version = TRUE
          AND current_file.id NOT IN (
              SELECT DISTINCT ON (session_speaker_id) id
              FROM presentations.presentation_files
              WHERE is_current_version = TRUE
              ORDER BY session_speaker_id, version_number DESC, uploaded_at DESC, id DESC
          )
    """))
    op.create_index(
        "uq_presentation_files_current_session_speaker",
        "presentation_files",
        ["session_speaker_id"],
        unique=True,
        schema="presentations",
        postgresql_where=sa.text("is_current_version = TRUE"),
    )

    op.create_index(
        "uq_venue_srr_stations_event_number",
        "srr_stations",
        ["event_id", "station_number"],
        unique=True,
        schema="venue",
    )
    op.create_index(
        "uq_venue_room_devices_event_name",
        "room_devices",
        ["event_id", sa.text("lower(device_name)")],
        unique=True,
        schema="venue",
    )
    op.create_index(
        "uq_venue_asset_transfers_file_version_target_node",
        "asset_transfers",
        ["file_id", "version_number", "target_node"],
        unique=True,
        schema="venue",
    )


def downgrade() -> None:
    op.drop_index(
        "uq_venue_asset_transfers_file_version_target_node",
        table_name="asset_transfers",
        schema="venue",
    )
    op.drop_index("uq_venue_room_devices_event_name", table_name="room_devices", schema="venue")
    op.drop_index("uq_venue_srr_stations_event_number", table_name="srr_stations", schema="venue")
    op.drop_index(
        "uq_presentation_files_current_session_speaker",
        table_name="presentation_files",
        schema="presentations",
    )
