"""Persist timer and emergency state for room runtime applications."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260904_1300"
down_revision: Union[str, None] = "20260904_1200"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "room_runtime_states",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("room_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("timer_status", sa.String(length=20), nullable=False, server_default="hidden"),
        sa.Column("timer_duration_seconds", sa.Integer(), nullable=True),
        sa.Column("timer_remaining_seconds", sa.Integer(), nullable=True),
        sa.Column("timer_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("emergency_message", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["room_id"], ["events.rooms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id", "room_id", name="uq_venue_room_runtime_state"),
        schema="venue",
    )
    op.create_index("ix_venue_room_runtime_states_event_id", "room_runtime_states", ["event_id"], schema="venue")
    op.create_index("ix_venue_room_runtime_states_room_id", "room_runtime_states", ["room_id"], schema="venue")


def downgrade() -> None:
    op.drop_index("ix_venue_room_runtime_states_room_id", table_name="room_runtime_states", schema="venue")
    op.drop_index("ix_venue_room_runtime_states_event_id", table_name="room_runtime_states", schema="venue")
    op.drop_table("room_runtime_states", schema="venue")
