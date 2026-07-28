"""backfill immutable contracts from activation snapshots

Revision ID: 20260722_0960
Revises: 20260722_0950
"""

from alembic import op

revision = "20260722_0960"
down_revision = "20260722_0950"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        WITH live AS (
            SELECT a.organization_id, a.event_id, a.current_snapshot_set_id,
                   a.activated_at, a.expires_at, ss.created_by,
                   COALESCE(p.name, 'LEGACY_ACTIVATION') AS plan_key,
                   COALESCE(p.version::text, ss.version::text, '1') AS plan_version,
                   COALESCE(p.currency, 'INR') AS currency
            FROM billing.event_activations a
            JOIN billing.event_entitlement_snapshot_sets ss ON ss.id = a.current_snapshot_set_id
            JOIN billing.organization_subscriptions s ON s.id = a.subscription_id
            LEFT JOIN billing.subscription_plans p ON p.id = s.plan_id
            WHERE a.activation_status IN ('PENDING','ACTIVE','SUSPENDED','EXPIRED','TRANSFER_PENDING')
        ), feature_values AS (
            SELECT i.snapshot_set_id,
                   jsonb_object_agg(i.feature_key, jsonb_build_object('type','BOOLEAN','value',i.is_enabled)) AS values
            FROM billing.event_entitlement_snapshot_items i GROUP BY i.snapshot_set_id
        ), limit_values AS (
            SELECT i.snapshot_set_id,
                   jsonb_object_agg(i.limit_key, jsonb_build_object('type','LIMIT','value',i.limit_value)) AS values
            FROM billing.event_limit_snapshot_items i GROUP BY i.snapshot_set_id
        ), actor AS (
            SELECT (SELECT id FROM identity.users
                    WHERE role = 'super_admin' OR platform_role = 'SUPER_ADMIN' OR is_platform_admin IS TRUE
                    ORDER BY created_at LIMIT 1) AS id
        )
        INSERT INTO platform.event_commercial_contracts
            (id, organization_id, event_id, version, status, plan_key, plan_version, currency,
             entitlements, hard_ceilings, addons, source, effective_at, ends_at, created_by, created_at)
        SELECT gen_random_uuid(), live.organization_id, live.event_id, 1, 'ACTIVE', live.plan_key,
               live.plan_version, live.currency,
               COALESCE(feature_values.values, '{}'::jsonb) || COALESCE(limit_values.values, '{}'::jsonb),
               '{}'::jsonb, '[]'::jsonb,
               jsonb_build_object('type','ACTIVATION_SNAPSHOT_BACKFILL','snapshot_set_id',live.current_snapshot_set_id),
               live.activated_at, live.expires_at, COALESCE(live.created_by, actor.id), now()
        FROM live
        LEFT JOIN feature_values ON feature_values.snapshot_set_id = live.current_snapshot_set_id
        LEFT JOIN limit_values ON limit_values.snapshot_set_id = live.current_snapshot_set_id
        CROSS JOIN actor
        WHERE COALESCE(live.created_by, actor.id) IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM platform.event_commercial_contracts c
            WHERE c.event_id = live.event_id AND c.status = 'ACTIVE'
        )
    """)


def downgrade() -> None:
    op.execute("""
        DELETE FROM platform.event_commercial_contracts
        WHERE source->>'type' = 'ACTIVATION_SNAPSHOT_BACKFILL'
    """)
