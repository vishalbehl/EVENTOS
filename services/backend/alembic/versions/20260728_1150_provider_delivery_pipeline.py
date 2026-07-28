"""Add tenant-scoped SMS, WhatsApp, and push delivery pipeline.

Revision ID: 20260728_1150
Revises: 20260728_1140
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260728_1150"
down_revision = "20260728_1140"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "communication_delivery_batches",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("channel_config_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("channel", sa.String(length=24), nullable=False),
        sa.Column("provider", sa.String(length=60), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="QUEUED"),
        sa.Column("requested_count", sa.Integer(), nullable=False),
        sa.Column("accepted_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("content_ciphertext", sa.Text(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=200), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("reservation_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reason", sa.String(length=1000), nullable=False),
        sa.Column("case_reference", sa.String(length=160), nullable=True),
        sa.Column("error_code", sa.String(length=80), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "channel IN ('SMS', 'WHATSAPP', 'PUSH')",
            name="ck_communication_delivery_batch_channel",
        ),
        sa.CheckConstraint(
            "status IN ('QUEUED', 'PROCESSING', 'RETRY_PENDING', 'SENT', 'PARTIAL', 'FAILED')",
            name="ck_communication_delivery_batch_status",
        ),
        sa.CheckConstraint(
            "requested_count > 0 AND accepted_count >= 0 AND failed_count >= 0",
            name="ck_communication_delivery_batch_counts",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["platform.organizations.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["event_id"], ["events.events.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["channel_config_id"],
            ["platform.organization_notification_channel_configs.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["reservation_id"],
            ["platform.usage_reservations.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["identity.users.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organization_id",
            "idempotency_key",
            name="uq_communication_delivery_batch_idempotency",
        ),
        schema="communications",
    )
    op.create_index(
        "ix_communication_delivery_batches_event_created",
        "communication_delivery_batches",
        ["event_id", "created_at"],
        schema="communications",
    )
    op.create_index(
        "ix_communication_delivery_batches_org_status",
        "communication_delivery_batches",
        ["organization_id", "status"],
        schema="communications",
    )

    op.create_table(
        "communication_deliveries",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("batch_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("channel", sa.String(length=24), nullable=False),
        sa.Column("recipient_ciphertext", sa.Text(), nullable=False),
        sa.Column("recipient_hash", sa.String(length=64), nullable=False),
        sa.Column("recipient_masked", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="QUEUED"),
        sa.Column("provider_message_id", sa.String(length=255), nullable=True),
        sa.Column(
            "provider_response",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("error_code", sa.String(length=80), nullable=True),
        sa.Column("error_message", sa.String(length=500), nullable=True),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "channel IN ('SMS', 'WHATSAPP', 'PUSH')",
            name="ck_communication_delivery_channel",
        ),
        sa.CheckConstraint(
            "status IN ('QUEUED', 'ACCEPTED', 'RETRYABLE', 'FAILED')",
            name="ck_communication_delivery_status",
        ),
        sa.CheckConstraint(
            "attempt_count >= 0", name="ck_communication_delivery_attempts"
        ),
        sa.ForeignKeyConstraint(
            ["batch_id"],
            ["communications.communication_delivery_batches.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["platform.organizations.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["event_id"], ["events.events.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "batch_id",
            "recipient_hash",
            name="uq_communication_delivery_batch_recipient",
        ),
        schema="communications",
    )
    op.create_index(
        "ix_communication_deliveries_event_channel",
        "communication_deliveries",
        ["event_id", "channel", "created_at"],
        schema="communications",
    )
    op.create_index(
        "ix_communication_deliveries_org_status",
        "communication_deliveries",
        ["organization_id", "status"],
        schema="communications",
    )

    for table in (
        "communication_delivery_batches",
        "communication_deliveries",
    ):
        op.execute(
            f"ALTER TABLE communications.{table} ENABLE ROW LEVEL SECURITY"
        )
        op.execute(
            f"CREATE POLICY tenant_isolation_{table} "
            f"ON communications.{table} "
            "USING (organization_id = platform.current_organization_id()) "
            "WITH CHECK (organization_id = platform.current_organization_id())"
        )

    op.execute(
        """
        INSERT INTO billing.feature_catalog (
            id, key, name, description, category, scope_type, value_type,
            default_value, allowed_values, unit, period, enforcement_mode,
            portal_routes, backend_operations, required_permissions,
            metric_key, dependencies, conflicts, owner_console, risk_level,
            lifecycle_status, version, category_order, feature_order,
            is_active, created_at, updated_at
        )
        VALUES (
            gen_random_uuid(), 'LIMIT_PUSH', 'Push Notifications',
            'Maximum provider-accepted push recipients per event',
            'LIMITS', 'EVENT', 'LIMIT', '{"value": 0}'::jsonb, '[]'::jsonb,
            'messages', 'EVENT', 'HARD', '[]'::jsonb, '[]'::jsonb,
            '[]'::jsonb, 'push_sent', '[]'::jsonb, '[]'::jsonb,
            'BUSINESS', 'MEDIUM', 'ACTIVE', 1, 0, 0, true, now(), now()
        )
        ON CONFLICT (key) DO UPDATE
        SET value_type = 'LIMIT',
            scope_type = 'EVENT',
            unit = 'messages',
            period = 'EVENT',
            metric_key = 'push_sent',
            updated_at = now()
        """
    )
    op.execute(
        """
        INSERT INTO billing.plan_features (
            plan_id, feature_id, enabled, value_type, entitlement_value,
            scope_type, enforcement_mode, hard_ceiling, version
        )
        SELECT
            plan.id, feature.id, true, 'LIMIT',
            jsonb_build_object(
                'value',
                CASE
                    WHEN lower(plan.name) LIKE '%enterprise%' THEN 1000000
                    WHEN lower(plan.name) LIKE '%professional%' THEN 10000
                    ELSE 0
                END
            ),
            'EVENT', 'HARD', '{"value": 100000000}'::jsonb, 1
        FROM billing.subscription_plans plan
        JOIN billing.feature_catalog feature ON feature.key = 'LIMIT_PUSH'
        ON CONFLICT (plan_id, feature_id) DO NOTHING
        """
    )

    # Preserve immutable contract history: adding the new quantitative control
    # creates an attributed amendment instead of mutating active snapshots.
    op.execute(
        """
        WITH active_contracts AS (
            SELECT contract.*
            FROM platform.event_commercial_contracts contract
            WHERE contract.status = 'ACTIVE'
              AND NOT (contract.entitlements ? 'max_push_per_event')
        ), amendments AS (
            INSERT INTO platform.event_commercial_contracts (
                id, organization_id, event_id, version, status, plan_key,
                plan_version, currency, entitlements, hard_ceilings, addons,
                source, effective_at, ends_at, created_by, created_at
            )
            SELECT
                gen_random_uuid(), old.organization_id, old.event_id,
                old.version + 1, 'ACTIVE', old.plan_key, old.plan_version,
                old.currency,
                old.entitlements || jsonb_build_object(
                    'max_push_per_event',
                    jsonb_build_object(
                        'type', 'LIMIT',
                        'value', CASE
                            WHEN lower(old.plan_key) LIKE '%enterprise%' THEN 1000000
                            WHEN lower(old.plan_key) LIKE '%professional%' THEN 10000
                            ELSE 0
                        END
                    )
                ),
                old.hard_ceilings || jsonb_build_object(
                    'max_push_per_event', 100000000
                ),
                old.addons,
                old.source || jsonb_build_object(
                    'type', 'PROVIDER_PIPELINE_LIMIT_AMENDMENT',
                    'previous_contract_id', old.id,
                    'migration', '20260728_1150'
                ),
                now(), old.ends_at, old.created_by, now()
            FROM active_contracts old
            RETURNING event_id, version
        )
        UPDATE platform.event_commercial_contracts old
        SET status = 'SUPERSEDED'
        FROM amendments replacement
        WHERE old.event_id = replacement.event_id
          AND old.status = 'ACTIVE'
          AND old.version < replacement.version
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP POLICY IF EXISTS tenant_isolation_communication_deliveries "
        "ON communications.communication_deliveries"
    )
    op.execute(
        "DROP POLICY IF EXISTS tenant_isolation_communication_delivery_batches "
        "ON communications.communication_delivery_batches"
    )
    op.drop_index(
        "ix_communication_deliveries_org_status",
        table_name="communication_deliveries",
        schema="communications",
    )
    op.drop_index(
        "ix_communication_deliveries_event_channel",
        table_name="communication_deliveries",
        schema="communications",
    )
    op.drop_table("communication_deliveries", schema="communications")
    op.drop_index(
        "ix_communication_delivery_batches_org_status",
        table_name="communication_delivery_batches",
        schema="communications",
    )
    op.drop_index(
        "ix_communication_delivery_batches_event_created",
        table_name="communication_delivery_batches",
        schema="communications",
    )
    op.drop_table("communication_delivery_batches", schema="communications")
