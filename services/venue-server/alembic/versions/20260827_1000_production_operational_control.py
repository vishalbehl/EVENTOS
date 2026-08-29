"""Production operational control foundation.

Revision ID: 20260827_1000
Revises: 81dd6aec5840
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260827_1000"
down_revision: Union[str, None] = "81dd6aec5840"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE venue.registration_source_api_keys SET revoked_at = now() WHERE api_key_encrypted IS NOT NULL AND revoked_at IS NULL")
    op.add_column("registration_source_api_keys", sa.Column("scopes", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")), schema="venue")
    op.add_column("registration_source_api_keys", sa.Column("allowed_cidrs", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")), schema="venue")
    op.add_column("registration_source_api_keys", sa.Column("rotation_of_id", sa.UUID(), nullable=True), schema="venue")
    op.add_column("registration_source_api_keys", sa.Column("grace_until", sa.DateTime(timezone=True), nullable=True), schema="venue")
    op.add_column("registration_source_api_keys", sa.Column("last_used_ip", sa.String(length=80), nullable=True), schema="venue")
    op.add_column("registration_source_api_keys", sa.Column("usage_count", sa.Integer(), nullable=False, server_default="0"), schema="venue")
    op.drop_column("registration_source_api_keys", "api_key_encrypted", schema="venue")

    op.create_table(
        "installations",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("installation_name", sa.String(160), nullable=False),
        sa.Column("provisioned_event_id", sa.UUID(), nullable=True, unique=True),
        sa.Column("setup_status", sa.String(30), nullable=False),
        sa.Column("maintenance_mode", sa.Boolean(), nullable=False),
        sa.Column("source_type", sa.String(30), nullable=True),
        sa.Column("source_url", sa.String(500), nullable=True),
        sa.Column("storage_path", sa.String(1000), nullable=True),
        sa.Column("backup_path", sa.String(1000), nullable=True),
        sa.Column("certificate_fingerprint", sa.String(128), nullable=True),
        sa.Column("configuration", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        schema="venue",
    )
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS venue.network_configurations (
            id UUID PRIMARY KEY,
            active_adapter_name VARCHAR(100) NOT NULL,
            adapter_description VARCHAR(200),
            media_type VARCHAR(30) NOT NULL,
            ip_address VARCHAR(50),
            subnet VARCHAR(50),
            gateway VARCHAR(50),
            mac_address VARCHAR(50),
            is_active BOOLEAN NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL
        )
    """))
    op.create_table(
        "service_instances",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("service_key", sa.String(80), nullable=False),
        sa.Column("display_name", sa.String(160), nullable=False),
        sa.Column("service_type", sa.String(60), nullable=False),
        sa.Column("host", sa.String(255), nullable=True),
        sa.Column("version", sa.String(80), nullable=True),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("evidence", sa.Text(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("queue_depth", sa.Integer(), nullable=False),
        sa.Column("capabilities", postgresql.JSONB(), nullable=False),
        sa.Column("metrics", postgresql.JSONB(), nullable=False),
        sa.Column("locally_managed", sa.Boolean(), nullable=False),
        sa.Column("paused", sa.Boolean(), nullable=False),
        sa.Column("last_heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_failure_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("service_key", name="uq_venue_service_key"),
        schema="venue",
    )
    op.create_index("ix_venue_service_instances_status", "service_instances", ["status"], schema="venue")
    op.create_index("ix_venue_service_instances_heartbeat", "service_instances", ["last_heartbeat_at"], schema="venue")
    op.create_table(
        "operational_alerts",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("deduplication_key", sa.String(220), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("source_type", sa.String(50), nullable=False),
        sa.Column("source_id", sa.String(160), nullable=True),
        sa.Column("title", sa.String(240), nullable=False),
        sa.Column("evidence", sa.Text(), nullable=False),
        sa.Column("suggested_action", sa.Text(), nullable=True),
        sa.Column("owner_user_id", sa.UUID(), nullable=True),
        sa.Column("recurrence_count", sa.Integer(), nullable=False),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("snoozed_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        sa.UniqueConstraint("deduplication_key", name="uq_venue_alert_dedup"),
        schema="venue",
    )
    op.create_index("ix_venue_operational_alerts_state", "operational_alerts", ["status", "severity"], schema="venue")
    op.create_table(
        "operational_commands",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("target_type", sa.String(50), nullable=False),
        sa.Column("target_id", sa.String(160), nullable=False),
        sa.Column("command", sa.String(80), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("requested_by", sa.UUID(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("result", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        schema="venue",
    )
    op.create_index("ix_venue_operational_commands_target", "operational_commands", ["target_type", "target_id"], schema="venue")
    op.create_table(
        "audit_events",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("actor_user_id", sa.UUID(), nullable=True),
        sa.Column("actor_role", sa.String(40), nullable=True),
        sa.Column("source_ip", sa.String(80), nullable=True),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("object_type", sa.String(80), nullable=True),
        sa.Column("object_id", sa.String(160), nullable=True),
        sa.Column("result", sa.String(30), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("correlation_id", sa.String(80), nullable=False),
        sa.Column("details", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        schema="venue",
    )
    op.create_index("ix_venue_audit_events_lookup", "audit_events", ["created_at", "category", "action"], schema="venue")
    op.create_table(
        "backup_jobs",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("backup_type", sa.String(30), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("destination", sa.String(1000), nullable=False),
        sa.Column("manifest", postgresql.JSONB(), nullable=False),
        sa.Column("checksum", sa.String(128), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("requested_by", sa.UUID(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        schema="venue",
    )
    op.create_table(
        "setting_revisions",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("section", sa.String(80), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("values", postgresql.JSONB(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("changed_by", sa.UUID(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        schema="venue",
    )
    op.create_index("ix_venue_setting_revisions_section", "setting_revisions", ["section", "is_active"], schema="venue")
    op.create_table(
        "registration_source_key_usage",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("key_id", sa.UUID(), nullable=False),
        sa.Column("endpoint", sa.String(240), nullable=False),
        sa.Column("source_ip", sa.String(80), nullable=True),
        sa.Column("result", sa.String(30), nullable=False),
        sa.Column("cursor", sa.String(120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        schema="venue",
    )
    op.create_index("ix_venue_registration_key_usage", "registration_source_key_usage", ["key_id", "created_at"], schema="venue")
    op.create_table(
        "registration_source_heartbeats",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("key_id", sa.UUID(), nullable=False),
        sa.Column("event_id", sa.UUID(), nullable=False),
        sa.Column("server_name", sa.String(160), nullable=False),
        sa.Column("version", sa.String(80), nullable=True),
        sa.Column("queue_depth", sa.Integer(), nullable=False),
        sa.Column("last_applied_cursor", sa.String(120), nullable=True),
        sa.Column("metrics", postgresql.JSONB(), nullable=False),
        sa.Column("source_ip", sa.String(80), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("key_id", name="uq_registration_source_heartbeat_key"),
        schema="venue",
    )
    op.create_table(
        "registration_operations",
        sa.Column("local_sequence", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("operation_id", sa.String(120), nullable=False, unique=True),
        sa.Column("event_id", sa.UUID(), nullable=False),
        sa.Column("source_key_id", sa.UUID(), nullable=False),
        sa.Column("source_sequence", sa.BigInteger(), nullable=False),
        sa.Column("entity_type", sa.String(60), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=False),
        sa.Column("entity_version", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(60), nullable=False),
        sa.Column("payload_schema_version", sa.Integer(), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("source_timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("conflict_reason", sa.Text(), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        schema="venue",
    )
    op.create_index("ix_venue_registration_operations_event_sequence", "registration_operations", ["event_id", "local_sequence"], schema="venue")
    op.create_index("ix_venue_registration_operations_source", "registration_operations", ["source_key_id", "source_sequence"], schema="venue")


def downgrade() -> None:
    for table in (
        "registration_operations", "registration_source_heartbeats", "registration_source_key_usage", "setting_revisions",
        "backup_jobs", "audit_events", "operational_commands", "operational_alerts",
        "service_instances", "network_configurations", "installations",
    ):
        op.drop_table(table, schema="venue")
    op.add_column("registration_source_api_keys", sa.Column("api_key_encrypted", sa.Text(), nullable=True), schema="venue")
    for column in ("usage_count", "last_used_ip", "grace_until", "rotation_of_id", "allowed_cidrs", "scopes"):
        op.drop_column("registration_source_api_keys", column, schema="venue")
