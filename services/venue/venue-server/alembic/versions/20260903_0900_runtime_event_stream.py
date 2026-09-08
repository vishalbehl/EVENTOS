"""Add the monotonic event stream used by SRR and room runtime replicas."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260903_0900"
down_revision: Union[str, None] = "20260903_0800"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "runtime_events",
        sa.Column("sequence", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("event_id", sa.UUID(), nullable=False),
        sa.Column("room_id", sa.UUID(), nullable=True),
        sa.Column("session_id", sa.UUID(), nullable=True),
        sa.Column("entity_type", sa.String(length=80), nullable=False),
        sa.Column("entity_id", sa.String(length=160), nullable=False),
        sa.Column("event_type", sa.String(length=100), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("sequence"),
        schema="venue",
    )
    for name, column in [
        ("event_id", "event_id"), ("room_id", "room_id"), ("session_id", "session_id"),
        ("entity_id", "entity_id"), ("event_type", "event_type"), ("created_at", "created_at"),
    ]:
        op.create_index(f"ix_venue_runtime_events_{name}", "runtime_events", [column], schema="venue")


def downgrade() -> None:
    op.drop_table("runtime_events", schema="venue")
