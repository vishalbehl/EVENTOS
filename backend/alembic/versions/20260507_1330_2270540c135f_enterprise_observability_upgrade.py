"""enterprise_observability_upgrade

Revision ID: 2270540c135f
Revises: 51c3e15e5e8d
Create Date: 2026-05-07 13:30:43.689993+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '2270540c135f'
down_revision: Union[str, None] = '51c3e15e5e8d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def create_partitions(table_name):
    # Historical
    op.execute(f"CREATE TABLE {table_name}_y2026m01 PARTITION OF {table_name} FOR VALUES FROM ('2026-01-01') TO ('2026-02-01')")
    op.execute(f"CREATE TABLE {table_name}_y2026m02 PARTITION OF {table_name} FOR VALUES FROM ('2026-02-01') TO ('2026-03-01')")
    op.execute(f"CREATE TABLE {table_name}_y2026m03 PARTITION OF {table_name} FOR VALUES FROM ('2026-03-01') TO ('2026-04-01')")
    op.execute(f"CREATE TABLE {table_name}_y2026m04 PARTITION OF {table_name} FOR VALUES FROM ('2026-04-01') TO ('2026-05-01')")
    # Current & Future
    op.execute(f"CREATE TABLE {table_name}_y2026m05 PARTITION OF {table_name} FOR VALUES FROM ('2026-05-01') TO ('2026-06-01')")
    op.execute(f"CREATE TABLE {table_name}_y2026m06 PARTITION OF {table_name} FOR VALUES FROM ('2026-06-01') TO ('2026-07-01')")
    # Default partition for anything outside the range
    op.execute(f"CREATE TABLE {table_name}_default PARTITION OF {table_name} DEFAULT")


def upgrade() -> None:
    # ── Immutability Function ────────────────────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION block_updates_deletes() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'Table is immutable. UPDATE and DELETE operations are forbidden.';
        END;
        $$ LANGUAGE plpgsql;
    """)

    # ── 1. Rename and Upgrade srr_activity_logs ──────────────
    op.rename_table('srr_activity_logs', 'venue_activity_logs')
    op.add_column('venue_activity_logs', sa.Column('correlation_id', sa.UUID(), nullable=True))
    op.add_column('venue_activity_logs', sa.Column('device_id', sa.UUID(), nullable=True))
    op.add_column('venue_activity_logs', sa.Column('session_id', sa.UUID(), nullable=True))
    op.add_column('venue_activity_logs', sa.Column('action_category', sa.String(length=50), nullable=True))
    op.add_column('venue_activity_logs', sa.Column('duration_ms', sa.Integer(), nullable=True))
    op.add_column('venue_activity_logs', sa.Column('app_version', sa.String(length=50), nullable=True))
    
    # Backfill category
    op.execute("UPDATE venue_activity_logs SET action_category = 'INTAKE'")
    op.alter_column('venue_activity_logs', 'action_category', nullable=False)
    
    op.create_index(op.f('ix_venue_activity_logs_action_category'), 'venue_activity_logs', ['action_category'], unique=False)
    op.create_index(op.f('ix_venue_activity_logs_correlation_id'), 'venue_activity_logs', ['correlation_id'], unique=False)
    op.create_index(op.f('ix_venue_activity_logs_device_id'), 'venue_activity_logs', ['device_id'], unique=False)
    op.create_index(op.f('ix_venue_activity_logs_session_id'), 'venue_activity_logs', ['session_id'], unique=False)

    # ── 2. Create NEW Partitioned Tables ─────────────────────
    
    # api_request_logs
    op.execute("""
        CREATE TABLE api_request_logs (
            id UUID NOT NULL,
            request_id UUID NOT NULL,
            correlation_id UUID,
            method VARCHAR(10) NOT NULL,
            path VARCHAR(1000) NOT NULL,
            status_code INTEGER NOT NULL,
            duration_ms FLOAT NOT NULL,
            db_query_count INTEGER NOT NULL DEFAULT 0,
            db_query_duration_ms FLOAT NOT NULL DEFAULT 0,
            cache_hit BOOLEAN,
            ip_address INET,
            user_id UUID,
            user_agent TEXT,
            request_size_bytes INTEGER DEFAULT 0,
            response_size_bytes INTEGER DEFAULT 0,
            rate_limit_remaining INTEGER,
            occurred_at TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (id, occurred_at)
        ) PARTITION BY RANGE (occurred_at);
    """)
    create_partitions('api_request_logs')
    
    # device_heartbeats
    op.execute("""
        CREATE TABLE device_heartbeats (
            id UUID NOT NULL,
            device_id UUID NOT NULL,
            cpu_usage_percent FLOAT NOT NULL,
            memory_used_bytes BIGINT NOT NULL,
            memory_total_bytes BIGINT NOT NULL,
            disk_free_bytes BIGINT NOT NULL,
            gpu_usage_percent FLOAT,
            gpu_temp_celsius FLOAT,
            fps_telemetry FLOAT,
            network_latency_ms FLOAT NOT NULL,
            sync_status VARCHAR(50) NOT NULL,
            sync_latency_seconds INTEGER NOT NULL,
            health_score FLOAT NOT NULL,
            is_compromised BOOLEAN NOT NULL DEFAULT FALSE,
            tamper_indicators JSONB,
            occurred_at TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (id, occurred_at)
        ) PARTITION BY RANGE (occurred_at);
    """)
    create_partitions('device_heartbeats')

    # websocket_events
    op.execute("""
        CREATE TABLE websocket_events (
            id UUID NOT NULL,
            connection_id VARCHAR(255) NOT NULL,
            device_id UUID,
            action VARCHAR(50) NOT NULL,
            disconnect_reason VARCHAR(255),
            latency_ms FLOAT,
            payload_size_bytes INTEGER,
            channel_name VARCHAR(255),
            occurred_at TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (id, occurred_at)
        ) PARTITION BY RANGE (occurred_at);
    """)
    create_partitions('websocket_events')

    # system_error_logs
    op.execute("""
        CREATE TABLE system_error_logs (
            id UUID NOT NULL,
            request_id UUID,
            correlation_id UUID,
            severity VARCHAR(20) NOT NULL,
            exception_type VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            stack_trace TEXT,
            module VARCHAR(255),
            function_name VARCHAR(255),
            line_number INTEGER,
            worker_name VARCHAR(100),
            app_version VARCHAR(50),
            environment_metadata JSONB,
            occurred_at TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (id, occurred_at)
        ) PARTITION BY RANGE (occurred_at);
    """)
    create_partitions('system_error_logs')

    # ── 3. Handle Existing Tables & Partitioning ─────────────
    
    # audit_logs
    op.rename_table('audit_logs', 'audit_logs_old')
    op.execute("""
        CREATE TABLE audit_logs (
            id UUID NOT NULL,
            request_id UUID,
            correlation_id UUID,
            organization_id UUID,
            event_id UUID,
            user_id UUID,
            entity_type VARCHAR(50) NOT NULL,
            entity_id UUID NOT NULL,
            action VARCHAR(80) NOT NULL,
            severity VARCHAR(20) DEFAULT 'INFO',
            old_values JSONB,
            new_values JSONB,
            ip_address INET,
            user_agent TEXT,
            geo_location JSONB,
            row_hash VARCHAR(64),
            retention_until TIMESTAMPTZ,
            occurred_at TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (id, occurred_at)
        ) PARTITION BY RANGE (occurred_at);
    """)
    create_partitions('audit_logs')
    op.execute("""
        INSERT INTO audit_logs (id, organization_id, event_id, user_id, entity_type, entity_id, action, old_values, new_values, ip_address, user_agent, occurred_at)
        SELECT id, organization_id, event_id, user_id, entity_type, entity_id, action, old_values, new_values, ip_address, user_agent, occurred_at FROM audit_logs_old;
    """)
    op.drop_table('audit_logs_old')

    # playback_events
    op.rename_table('playback_events', 'playback_events_old')
    op.execute("""
        CREATE TABLE playback_events (
            id UUID NOT NULL,
            playback_session_id UUID NOT NULL,
            correlation_id UUID,
            device_id UUID NOT NULL,
            session_id UUID NOT NULL,
            file_id UUID NOT NULL,
            action VARCHAR(50) NOT NULL,
            current_slide INTEGER,
            total_slides INTEGER,
            is_fullscreen BOOLEAN NOT NULL DEFAULT TRUE,
            is_offline BOOLEAN NOT NULL DEFAULT FALSE,
            render_timing_ms FLOAT,
            gpu_load_at_event FLOAT,
            cpu_load_at_event FLOAT,
            metrics JSONB,
            occurred_at TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (id, occurred_at)
        ) PARTITION BY RANGE (occurred_at);
    """)
    create_partitions('playback_events')
    op.drop_table('playback_events_old')

    # ── 4. Create Standard Tables ────────────────────────────
    
    op.create_table('file_integrity_logs',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('file_id', sa.UUID(), nullable=False),
        sa.Column('stage', sa.String(length=50), nullable=False),
        sa.Column('sha256_hash', sa.String(length=64), nullable=False),
        sa.Column('md5_hash', sa.String(length=32), nullable=True),
        sa.Column('etag', sa.String(length=255), nullable=True),
        sa.Column('storage_provider', sa.String(length=50), nullable=False),
        sa.Column('storage_path', sa.String(length=1000), nullable=False),
        sa.Column('is_verified', sa.Boolean(), nullable=False),
        sa.Column('verification_details', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table('notification_events',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('correlation_id', sa.UUID(), nullable=True),
        sa.Column('channel', sa.String(length=20), nullable=False),
        sa.Column('recipient_id', sa.UUID(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('retry_count', sa.Integer(), nullable=False),
        sa.Column('provider_id', sa.String(length=255), nullable=True),
        sa.Column('provider_response', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('latency_ms', sa.Integer(), nullable=True),
        sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table('security_events',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('event_id', sa.UUID(), nullable=True),
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.Column('event_type', sa.String(length=50), nullable=False),
        sa.Column('severity_score', sa.Float(), nullable=False),
        sa.Column('risk_level', sa.String(length=20), nullable=False),
        sa.Column('ip_address', postgresql.INET(), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('geo_metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('request_metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('action_taken', sa.String(length=50), nullable=True),
        sa.Column('mitigation_id', sa.String(length=100), nullable=True),
        sa.Column('evidence', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('correlation_id', sa.UUID(), nullable=True),
        sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['event_id'], ['events.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table('worker_job_logs',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('job_id', sa.String(length=255), nullable=False),
        sa.Column('correlation_id', sa.UUID(), nullable=True),
        sa.Column('task_name', sa.String(length=255), nullable=False),
        sa.Column('queue', sa.String(length=100), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('wait_duration_ms', sa.Float(), nullable=False),
        sa.Column('execution_duration_ms', sa.Float(), nullable=False),
        sa.Column('worker_name', sa.String(length=255), nullable=True),
        sa.Column('memory_usage_bytes', sa.BigInteger(), nullable=True),
        sa.Column('cpu_usage_percent', sa.Float(), nullable=True),
        sa.Column('retry_count', sa.Integer(), nullable=False),
        sa.Column('exception', sa.Text(), nullable=True),
        sa.Column('stack_trace', sa.Text(), nullable=True),
        sa.Column('args', sa.Text(), nullable=True),
        sa.Column('kwargs', sa.Text(), nullable=True),
        sa.Column('queued_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

    # ── 5. Extend Existing Non-Logging Tables ────────────────
    
    # room_devices
    op.add_column('room_devices', sa.Column('health_score', sa.Float(), nullable=False, server_default='100.0'))
    op.add_column('room_devices', sa.Column('last_heartbeat', sa.DateTime(timezone=True), nullable=True))
    op.add_column('room_devices', sa.Column('device_fingerprint', sa.String(length=255), nullable=True))
    op.add_column('room_devices', sa.Column('cpu_model', sa.String(length=255), nullable=True))
    op.add_column('room_devices', sa.Column('gpu_model', sa.String(length=255), nullable=True))
    op.add_column('room_devices', sa.Column('total_ram_gb', sa.Integer(), nullable=True))
    op.add_column('room_devices', sa.Column('trust_status', sa.String(length=20), nullable=False, server_default='TRUSTED'))
    op.add_column('room_devices', sa.Column('compromise_detected', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('room_devices', sa.Column('sync_latency_ms', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('room_devices', sa.Column('local_ip', postgresql.INET(), nullable=True))
    op.add_column('room_devices', sa.Column('device_metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    
    op.execute("ALTER TABLE room_devices ALTER COLUMN mac_address TYPE VARCHAR(17)")
    op.create_unique_constraint('uq_room_devices_fingerprint', 'room_devices', ['device_fingerprint'])

    # venue_sync_jobs
    op.add_column('venue_sync_jobs', sa.Column('request_id', sa.UUID(), nullable=True))
    op.add_column('venue_sync_jobs', sa.Column('correlation_id', sa.UUID(), nullable=True))
    op.add_column('venue_sync_jobs', sa.Column('bytes_transferred', sa.BigInteger(), nullable=True))
    op.add_column('venue_sync_jobs', sa.Column('transfer_speed_mbps', sa.Float(), nullable=True))
    op.add_column('venue_sync_jobs', sa.Column('checksum_verified', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('venue_sync_jobs', sa.Column('integrity_hash', sa.String(length=64), nullable=True))
    op.add_column('venue_sync_jobs', sa.Column('worker_metadata', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('venue_sync_jobs', sa.Column('storage_provider', sa.String(length=50), nullable=False, server_default='R2'))

    # file_validations
    op.add_column('file_validations', sa.Column('sha256_hash', sa.String(length=64), nullable=True))
    op.add_column('file_validations', sa.Column('md5_hash', sa.String(length=32), nullable=True))
    op.add_column('file_validations', sa.Column('entropy_score', sa.Float(), nullable=True))
    op.add_column('file_validations', sa.Column('mime_type_detected', sa.String(length=100), nullable=True))
    op.add_column('file_validations', sa.Column('antivirus_status', sa.String(length=20), nullable=False, server_default='CLEAN'))
    op.add_column('file_validations', sa.Column('validator_telemetry', postgresql.JSONB(astext_type=sa.Text()), nullable=True))

    # ── 6. Apply Immutability Triggers ───────────────────────
    for table in ['audit_logs', 'security_events', 'venue_activity_logs', 'file_integrity_logs']:
        op.execute(f"CREATE TRIGGER tr_immutable_{table} BEFORE UPDATE OR DELETE ON {table} FOR EACH STATEMENT EXECUTE FUNCTION block_updates_deletes()")


def downgrade() -> None:
    pass
