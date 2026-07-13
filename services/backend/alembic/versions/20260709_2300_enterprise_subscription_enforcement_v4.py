"""enterprise subscription enforcement v4

Revision ID: 91a2b6e7d4c1
Revises: 55df9f2c9d10
Create Date: 2026-07-09 23:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "91a2b6e7d4c1"
down_revision = "55df9f2c9d10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("subscription_plans", sa.Column("max_event_team_members", sa.Integer(), nullable=True), schema="billing")
    op.add_column("feature_catalog", sa.Column("scope_type", sa.String(length=30), nullable=False, server_default="ORG_SCOPED"), schema="platform")
    op.add_column("addons", sa.Column("scope_type", sa.String(length=30), nullable=False, server_default="ORG_SCOPED"), schema="billing")
    op.add_column("addons", sa.Column("consumption_model", sa.String(length=40), nullable=False, server_default="NON_CONSUMABLE"), schema="billing")
    op.add_column("addons", sa.Column("unit_type", sa.String(length=40), nullable=True), schema="billing")

    op.create_table(
        "entitlement_grants",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("subscription_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("grant_type", sa.String(length=50), nullable=False),
        sa.Column("scope_type", sa.String(length=30), nullable=False),
        sa.Column("consumption_model", sa.String(length=40), nullable=False),
        sa.Column("unit_type", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("source_type", sa.String(length=40), nullable=False),
        sa.Column("source_ref", sa.String(length=255), nullable=True),
        sa.Column("quantity_total", sa.BigInteger(), nullable=True),
        sa.Column("quantity_consumed", sa.BigInteger(), nullable=True),
        sa.Column("quantity_reserved", sa.BigInteger(), nullable=True),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("valid_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subscription_id"], ["billing.organization_subscriptions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        schema="billing",
    )
    op.create_index("ix_entitlement_grants_org_id", "entitlement_grants", ["organization_id"], unique=False, schema="billing")
    op.create_index("ix_entitlement_grants_subscription_id", "entitlement_grants", ["subscription_id"], unique=False, schema="billing")
    op.create_index("ix_entitlement_grants_status", "entitlement_grants", ["status"], unique=False, schema="billing")

    op.create_table(
        "grant_consumptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("grant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("quantity", sa.BigInteger(), nullable=False),
        sa.Column("unit_type", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("reserved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reservation_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("transferred_to_consumption_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["grant_id"], ["billing.entitlement_grants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["transferred_to_consumption_id"], ["billing.grant_consumptions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        schema="billing",
    )
    op.create_index("ix_grant_consumptions_grant_id", "grant_consumptions", ["grant_id"], unique=False, schema="billing")
    op.create_index("ix_grant_consumptions_org_id", "grant_consumptions", ["organization_id"], unique=False, schema="billing")
    op.create_index("ix_grant_consumptions_event_id", "grant_consumptions", ["event_id"], unique=False, schema="billing")
    op.create_index("ix_grant_consumptions_status", "grant_consumptions", ["status"], unique=False, schema="billing")

    op.execute("ALTER TABLE billing.event_activations RENAME COLUMN status TO activation_status")
    op.add_column("event_activations", sa.Column("grant_id", postgresql.UUID(as_uuid=True), nullable=True), schema="billing")
    op.add_column("event_activations", sa.Column("grant_consumption_id", postgresql.UUID(as_uuid=True), nullable=True), schema="billing")
    op.add_column("event_activations", sa.Column("activation_policy", sa.String(length=40), nullable=False, server_default="SNAPSHOT_LOCKED"), schema="billing")
    op.add_column("event_activations", sa.Column("current_snapshot_set_id", postgresql.UUID(as_uuid=True), nullable=True), schema="billing")
    op.add_column("event_activations", sa.Column("usage_locked_at", sa.DateTime(timezone=True), nullable=True), schema="billing")
    op.add_column("event_activations", sa.Column("transfer_locked_at", sa.DateTime(timezone=True), nullable=True), schema="billing")
    op.add_column("event_activations", sa.Column("deactivation_reason", sa.String(length=255), nullable=True), schema="billing")
    op.add_column("event_activations", sa.Column("suspension_reason", sa.String(length=255), nullable=True), schema="billing")
    op.add_column("event_activations", sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True), schema="billing")
    op.add_column("event_activations", sa.Column("transferred_from_activation_id", postgresql.UUID(as_uuid=True), nullable=True), schema="billing")
    op.add_column("event_activations", sa.Column("transferred_to_event_id", postgresql.UUID(as_uuid=True), nullable=True), schema="billing")
    op.execute("DROP INDEX IF EXISTS billing.uq_event_activations_active")
    op.create_index("ix_event_activations_grant_id", "event_activations", ["grant_id"], unique=False, schema="billing")
    op.create_index("ix_event_activations_grant_consumption_id", "event_activations", ["grant_consumption_id"], unique=False, schema="billing")
    op.create_foreign_key(None, "event_activations", "entitlement_grants", ["grant_id"], ["id"], source_schema="billing", referent_schema="billing", ondelete="RESTRICT")
    op.create_foreign_key(None, "event_activations", "grant_consumptions", ["grant_consumption_id"], ["id"], source_schema="billing", referent_schema="billing", ondelete="RESTRICT")
    op.create_foreign_key(None, "event_activations", "event_activations", ["transferred_from_activation_id"], ["id"], source_schema="billing", referent_schema="billing", ondelete="SET NULL")
    op.create_foreign_key(None, "event_activations", "events", ["transferred_to_event_id"], ["id"], source_schema="billing", referent_schema="events", ondelete="SET NULL")
    op.create_unique_constraint("uq_event_activations_grant_consumption_id", "event_activations", ["grant_consumption_id"], schema="billing")
    op.create_index(
        "uq_event_activations_live_event",
        "event_activations",
        ["event_id"],
        unique=True,
        schema="billing",
        postgresql_where=sa.text("activation_status IN ('PENDING','ACTIVE','SUSPENDED','EXPIRED','TRANSFER_PENDING')"),
    )

    op.create_table(
        "event_entitlement_snapshot_sets",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("activation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("resolution_reason", sa.String(length=50), nullable=False),
        sa.Column("resolver_version", sa.String(length=50), nullable=False),
        sa.Column("policy_type", sa.String(length=40), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("previous_snapshot_set_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("checksum", sa.String(length=128), nullable=False),
        sa.ForeignKeyConstraint(["activation_id"], ["billing.event_activations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["identity.users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["previous_snapshot_set_id"], ["billing.event_entitlement_snapshot_sets.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("activation_id", "version", name="uq_event_entitlement_snapshot_sets_activation_version"),
        schema="billing",
    )
    op.create_index("ix_event_entitlement_snapshot_sets_activation_id", "event_entitlement_snapshot_sets", ["activation_id"], unique=False, schema="billing")

    op.create_table(
        "event_entitlement_snapshot_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("snapshot_set_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("feature_key", sa.String(length=100), nullable=False),
        sa.Column("scope_type", sa.String(length=30), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False),
        sa.Column("source_type", sa.String(length=40), nullable=False),
        sa.Column("source_ref", sa.String(length=255), nullable=True),
        sa.Column("override_source", sa.String(length=255), nullable=True),
        sa.Column("denial_reason_default", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(["snapshot_set_id"], ["billing.event_entitlement_snapshot_sets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("snapshot_set_id", "feature_key", name="uq_event_entitlement_snapshot_items_feature"),
        schema="billing",
    )

    op.create_table(
        "event_limit_snapshot_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("snapshot_set_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("limit_key", sa.String(length=100), nullable=False),
        sa.Column("scope_type", sa.String(length=30), nullable=False),
        sa.Column("limit_value", sa.BigInteger(), nullable=True),
        sa.Column("source_type", sa.String(length=40), nullable=False),
        sa.Column("source_ref", sa.String(length=255), nullable=True),
        sa.Column("override_source", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(["snapshot_set_id"], ["billing.event_entitlement_snapshot_sets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("snapshot_set_id", "limit_key", name="uq_event_limit_snapshot_items_limit"),
        schema="billing",
    )

    op.create_foreign_key(None, "event_activations", "event_entitlement_snapshot_sets", ["current_snapshot_set_id"], ["id"], source_schema="billing", referent_schema="billing", ondelete="SET NULL")

    op.create_table(
        "activation_transfer_policies",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("policy_key", sa.String(length=100), nullable=False),
        sa.Column("metric_key", sa.String(length=100), nullable=False),
        sa.Column("operator", sa.String(length=20), nullable=False),
        sa.Column("threshold_value", sa.BigInteger(), nullable=True),
        sa.Column("action", sa.String(length=30), nullable=False),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("grant_type", sa.String(length=50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["plan_id"], ["billing.subscription_plans.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema="billing",
    )
    op.create_index("ix_activation_transfer_policies_policy_key", "activation_transfer_policies", ["policy_key"], unique=False, schema="billing")

    op.create_table(
        "operation_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("operation_type", sa.String(length=50), nullable=False),
        sa.Column("idempotency_key", sa.String(length=255), nullable=False),
        sa.Column("request_hash", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("result_ref_type", sa.String(length=50), nullable=True),
        sa.Column("result_ref_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "operation_type", "idempotency_key", name="uq_billing_operation_request"),
        schema="billing",
    )

    op.execute(
        """
        INSERT INTO billing.entitlement_grants (
            id, organization_id, subscription_id, grant_type, scope_type, consumption_model,
            unit_type, status, source_type, source_ref, quantity_total, quantity_consumed,
            quantity_reserved, valid_from, valid_until, metadata_json, created_at, updated_at
        )
        SELECT
            gen_random_uuid(),
            s.organization_id,
            s.id,
            'EVENT_UNIT',
            'EVENT',
            'SINGLE_USE',
            'EVENT',
            CASE
                WHEN s.status IN ('ACTIVE', 'TRIAL') THEN 'ACTIVE'
                WHEN s.status = 'SUSPENDED' THEN 'SUSPENDED'
                WHEN s.status = 'EXPIRED' THEN 'EXPIRED'
                WHEN s.status = 'CANCELLED' THEN 'CANCELLED'
                ELSE 'PENDING'
            END,
            'PLAN',
            s.plan_id::text,
            1,
            0,
            0,
            s.created_at,
            s.current_period_end,
            '{}'::jsonb,
            now(),
            now()
        FROM billing.organization_subscriptions s
        WHERE NOT EXISTS (
            SELECT 1 FROM billing.entitlement_grants g WHERE g.subscription_id = s.id
        )
        """
    )

    op.execute(
        """
        UPDATE billing.event_activations ea
        SET grant_id = g.id
        FROM billing.entitlement_grants g
        WHERE ea.subscription_id = g.subscription_id
          AND ea.grant_id IS NULL
        """
    )

    op.execute(
        """
        INSERT INTO billing.grant_consumptions (
            id, grant_id, organization_id, event_id, quantity, unit_type, status,
            reserved_at, consumed_at, metadata_json, created_at
        )
        SELECT
            gen_random_uuid(),
            ea.grant_id,
            ea.organization_id,
            ea.event_id,
            1,
            'EVENT',
            CASE WHEN ea.activation_status IN ('ACTIVE','SUSPENDED','EXPIRED','TRANSFER_PENDING','DEACTIVATED') THEN 'CONSUMED' ELSE 'RESERVED' END,
            ea.created_at,
            ea.activated_at,
            '{}'::jsonb,
            ea.created_at
        FROM billing.event_activations ea
        WHERE ea.grant_id IS NOT NULL
          AND ea.grant_consumption_id IS NULL
        """
    )

    op.execute(
        """
        UPDATE billing.event_activations ea
        SET grant_consumption_id = gc.id
        FROM billing.grant_consumptions gc
        WHERE gc.event_id = ea.event_id
          AND gc.grant_id = ea.grant_id
          AND ea.grant_consumption_id IS NULL
        """
    )

    op.execute(
        """
        UPDATE billing.entitlement_grants g
        SET quantity_consumed = COALESCE((
            SELECT SUM(gc.quantity) FROM billing.grant_consumptions gc
            WHERE gc.grant_id = g.id AND gc.status IN ('CONSUMED','TRANSFERRED')
        ), 0),
            quantity_reserved = COALESCE((
                SELECT SUM(gc.quantity) FROM billing.grant_consumptions gc
                WHERE gc.grant_id = g.id AND gc.status = 'RESERVED'
            ), 0)
        """
    )

    op.execute(
        """
        INSERT INTO billing.activation_transfer_policies (
            id, policy_key, metric_key, operator, threshold_value, action, plan_id, grant_type, created_at
        ) VALUES
            (gen_random_uuid(), 'default', 'registration_count', '>=', 1, 'LOCK_TRANSFER', NULL, NULL, now()),
            (gen_random_uuid(), 'default', 'email_sent_count', '>=', 1, 'LOCK_TRANSFER', NULL, NULL, now()),
            (gen_random_uuid(), 'default', 'event_started', '>=', 1, 'LOCK_TRANSFER', NULL, NULL, now()),
            (gen_random_uuid(), 'default', 'certificate_issued_count', '>=', 1, 'LOCK_TRANSFER', NULL, NULL, now()),
            (gen_random_uuid(), 'default', 'session_count', '>=', 1, 'REVIEW_REQUIRED', NULL, NULL, now()),
            (gen_random_uuid(), 'default', 'room_count', '>=', 1, 'REVIEW_REQUIRED', NULL, NULL, now()),
            (gen_random_uuid(), 'default', 'speaker_count', '>=', 1, 'REVIEW_REQUIRED', NULL, NULL, now()),
            (gen_random_uuid(), 'default', 'storage_mb', '>=', 100, 'REVIEW_REQUIRED', NULL, NULL, now())
        """
    )

    op.alter_column("feature_catalog", "scope_type", schema="platform", server_default=None)
    op.alter_column("addons", "scope_type", schema="billing", server_default=None)
    op.alter_column("addons", "consumption_model", schema="billing", server_default=None)
    op.alter_column("event_activations", "activation_policy", schema="billing", server_default=None)


def downgrade() -> None:
    op.drop_table("operation_requests", schema="billing")
    op.drop_index("ix_activation_transfer_policies_policy_key", table_name="activation_transfer_policies", schema="billing")
    op.drop_table("activation_transfer_policies", schema="billing")
    op.drop_constraint(None, "event_activations", schema="billing", type_="foreignkey")
    op.drop_table("event_limit_snapshot_items", schema="billing")
    op.drop_table("event_entitlement_snapshot_items", schema="billing")
    op.drop_index("ix_event_entitlement_snapshot_sets_activation_id", table_name="event_entitlement_snapshot_sets", schema="billing")
    op.drop_table("event_entitlement_snapshot_sets", schema="billing")
    op.drop_index("uq_event_activations_live_event", table_name="event_activations", schema="billing")
    op.drop_constraint("uq_event_activations_grant_consumption_id", "event_activations", schema="billing", type_="unique")
    op.drop_index("ix_event_activations_grant_consumption_id", table_name="event_activations", schema="billing")
    op.drop_index("ix_event_activations_grant_id", table_name="event_activations", schema="billing")
    op.drop_column("event_activations", "transferred_to_event_id", schema="billing")
    op.drop_column("event_activations", "transferred_from_activation_id", schema="billing")
    op.drop_column("event_activations", "cancelled_at", schema="billing")
    op.drop_column("event_activations", "suspension_reason", schema="billing")
    op.drop_column("event_activations", "deactivation_reason", schema="billing")
    op.drop_column("event_activations", "transfer_locked_at", schema="billing")
    op.drop_column("event_activations", "usage_locked_at", schema="billing")
    op.drop_column("event_activations", "current_snapshot_set_id", schema="billing")
    op.drop_column("event_activations", "activation_policy", schema="billing")
    op.drop_column("event_activations", "grant_consumption_id", schema="billing")
    op.drop_column("event_activations", "grant_id", schema="billing")
    op.execute("ALTER TABLE billing.event_activations RENAME COLUMN activation_status TO status")
    op.create_index(
        "uq_event_activations_active",
        "event_activations",
        ["event_id"],
        unique=True,
        schema="billing",
        postgresql_where=sa.text("status = 'ACTIVE'"),
    )
    op.drop_index("ix_grant_consumptions_status", table_name="grant_consumptions", schema="billing")
    op.drop_index("ix_grant_consumptions_event_id", table_name="grant_consumptions", schema="billing")
    op.drop_index("ix_grant_consumptions_org_id", table_name="grant_consumptions", schema="billing")
    op.drop_index("ix_grant_consumptions_grant_id", table_name="grant_consumptions", schema="billing")
    op.drop_table("grant_consumptions", schema="billing")
    op.drop_index("ix_entitlement_grants_status", table_name="entitlement_grants", schema="billing")
    op.drop_index("ix_entitlement_grants_subscription_id", table_name="entitlement_grants", schema="billing")
    op.drop_index("ix_entitlement_grants_org_id", table_name="entitlement_grants", schema="billing")
    op.drop_table("entitlement_grants", schema="billing")
    op.drop_column("addons", "unit_type", schema="billing")
    op.drop_column("addons", "consumption_model", schema="billing")
    op.drop_column("addons", "scope_type", schema="billing")
    op.drop_column("feature_catalog", "scope_type", schema="platform")
    op.drop_column("subscription_plans", "max_event_team_members", schema="billing")
