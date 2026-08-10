"""event-scoped workstation assignments and offline node operation ledger"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c8d9e0f1a2b3"
down_revision: Union[str, None] = "b7c8d9e0f1a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "node_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("device_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("venue.room_devices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("mode", sa.String(30), nullable=False, server_default="registration"),
        sa.Column("station_id", sa.String(120), nullable=True),
        sa.Column("capacity_rule_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("venue.venue_capacity_rules.id", ondelete="SET NULL"), nullable=True),
        sa.Column("permissions", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("status", sa.String(30), nullable=False, server_default="pending"),
        sa.Column("snapshot_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_reason", sa.Text(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("identity.venue_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.UniqueConstraint("event_id", "device_id", name="uq_venue_node_event_device"),
        schema="venue",
    )
    op.create_index("ix_node_assignments_event_id", "node_assignments", ["event_id"], schema="venue")
    op.create_index("ix_node_assignments_device_id", "node_assignments", ["device_id"], schema="venue")
    op.create_index("ix_node_assignments_status", "node_assignments", ["status"], schema="venue")
    op.create_table(
        "node_operations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("operation_id", sa.String(120), nullable=False, unique=True),
        sa.Column("assignment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("venue.node_assignments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("action", sa.String(60), nullable=False),
        sa.Column("payload", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="received"),
        sa.Column("conflict_reason", sa.Text(), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        schema="venue",
    )
    op.create_index("ix_node_operations_assignment_id", "node_operations", ["assignment_id"], schema="venue")
    op.create_index("ix_node_operations_event_id", "node_operations", ["event_id"], schema="venue")


def downgrade() -> None:
    op.drop_table("node_operations", schema="venue")
    op.drop_table("node_assignments", schema="venue")
