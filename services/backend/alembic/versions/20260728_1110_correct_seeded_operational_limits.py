"""Correct safety ceilings accidentally used as plan allowances.

Revision ID: 20260728_1110
Revises: 20260728_1100
"""

from alembic import op


revision = "20260728_1110"
down_revision = "20260728_1100"
branch_labels = None
depends_on = None


CORRECTED_VALUES_SQL = """
    SELECT *
    FROM (
        VALUES
            ('Free Trial', 'LIMIT_SMS', 0::bigint, 10000000::bigint),
            ('Free Trial', 'LIMIT_WHATSAPP', 0::bigint, 10000000::bigint),
            ('Free Trial', 'LIMIT_API_CALLS_MONTHLY', 0::bigint, 1000000000::bigint),
            ('Free Trial', 'LIMIT_WEBHOOK_DELIVERIES_MONTHLY', 0::bigint, 1000000000::bigint),
            ('Free Trial', 'LIMIT_INTEGRATIONS', 0::bigint, 10000::bigint),
            ('Free Trial', 'LIMIT_EXPORTS', 0::bigint, 1000000::bigint),
            ('Free Trial', 'LIMIT_DEVICES', 0::bigint, 100000::bigint),
            ('Basic', 'LIMIT_SMS', 0::bigint, 10000000::bigint),
            ('Basic', 'LIMIT_WHATSAPP', 0::bigint, 10000000::bigint),
            ('Basic', 'LIMIT_API_CALLS_MONTHLY', 0::bigint, 1000000000::bigint),
            ('Basic', 'LIMIT_WEBHOOK_DELIVERIES_MONTHLY', 0::bigint, 1000000000::bigint),
            ('Basic', 'LIMIT_INTEGRATIONS', 0::bigint, 10000::bigint),
            ('Basic', 'LIMIT_EXPORTS', 50::bigint, 1000000::bigint),
            ('Basic', 'LIMIT_DEVICES', 0::bigint, 100000::bigint),
            ('Professional', 'LIMIT_SMS', 0::bigint, 10000000::bigint),
            ('Professional', 'LIMIT_WHATSAPP', 0::bigint, 10000000::bigint),
            ('Professional', 'LIMIT_API_CALLS_MONTHLY', 0::bigint, 1000000000::bigint),
            ('Professional', 'LIMIT_WEBHOOK_DELIVERIES_MONTHLY', 0::bigint, 1000000000::bigint),
            ('Professional', 'LIMIT_INTEGRATIONS', 0::bigint, 10000::bigint),
            ('Professional', 'LIMIT_EXPORTS', 500::bigint, 1000000::bigint),
            ('Professional', 'LIMIT_DEVICES', 0::bigint, 100000::bigint),
            ('Enterprise', 'LIMIT_SMS', 10000::bigint, 10000000::bigint),
            ('Enterprise', 'LIMIT_WHATSAPP', 10000::bigint, 10000000::bigint),
            ('Enterprise', 'LIMIT_API_CALLS_MONTHLY', 1000000::bigint, 1000000000::bigint),
            ('Enterprise', 'LIMIT_WEBHOOK_DELIVERIES_MONTHLY', 100000::bigint, 1000000000::bigint),
            ('Enterprise', 'LIMIT_INTEGRATIONS', 50::bigint, 10000::bigint),
            ('Enterprise', 'LIMIT_EXPORTS', 10000::bigint, 1000000::bigint),
            ('Enterprise', 'LIMIT_DEVICES', 500::bigint, 100000::bigint)
    ) AS corrected(plan_name, feature_key, allowance, safety_ceiling)
"""


def upgrade() -> None:
    # Only replace the exact platform-ceiling values produced by the faulty
    # seed path. Any lower value saved through Command Center is preserved.
    op.execute(f"""
        UPDATE billing.plan_features assignment
        SET entitlement_value = jsonb_build_object('value', corrected.allowance),
            hard_ceiling = jsonb_build_object('value', corrected.safety_ceiling),
            value_type = 'LIMIT',
            enforcement_mode = 'HARD'
        FROM billing.subscription_plans plan
        JOIN ({CORRECTED_VALUES_SQL}) corrected
          ON corrected.plan_name = plan.name
        JOIN billing.feature_catalog feature
          ON feature.key = corrected.feature_key
        WHERE assignment.plan_id = plan.id
          AND assignment.feature_id = feature.id
          AND CASE
              WHEN jsonb_typeof(assignment.entitlement_value -> 'value') = 'number'
              THEN (assignment.entitlement_value ->> 'value')::numeric
              ELSE NULL
          END = corrected.safety_ceiling
    """)

    # Treat the correction as a governed template revision rather than a
    # silent mutation of a published commercial definition.
    op.execute(f"""
        WITH changed_plans AS (
            UPDATE billing.subscription_plans plan
            SET version = plan.version + 1,
                updated_at = now()
            WHERE plan.name IN ('Free Trial', 'Basic', 'Professional', 'Enterprise')
              AND EXISTS (
                  SELECT 1
                  FROM billing.plan_features assignment
                  JOIN billing.feature_catalog feature ON feature.id = assignment.feature_id
                  JOIN ({CORRECTED_VALUES_SQL}) corrected
                    ON corrected.plan_name = plan.name
                   AND corrected.feature_key = feature.key
                  WHERE assignment.plan_id = plan.id
                    AND CASE
                        WHEN jsonb_typeof(assignment.entitlement_value -> 'value') = 'number'
                        THEN (assignment.entitlement_value ->> 'value')::numeric
                        ELSE NULL
                    END = corrected.allowance
              )
            RETURNING plan.*
        )
        INSERT INTO billing.commercial_template_versions (
            id, resource_type, resource_id, version, lifecycle_status,
            change_type, snapshot_json, request_hash, reason,
            idempotency_key, actor_user_id, created_at
        )
        SELECT
            gen_random_uuid(), 'PLAN', plan.id, plan.version,
            plan.lifecycle_status, 'DATA_CORRECTION',
            jsonb_build_object(
                'id', plan.id,
                'name', plan.name,
                'version', plan.version,
                'lifecycle_status', plan.lifecycle_status,
                'assignments', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'feature_key', feature.key,
                        'value_type', assignment.value_type,
                        'value', assignment.entitlement_value,
                        'scope_type', assignment.scope_type,
                        'enforcement_mode', assignment.enforcement_mode,
                        'hard_ceiling', assignment.hard_ceiling
                    ) ORDER BY feature.key)
                    FROM billing.plan_features assignment
                    JOIN billing.feature_catalog feature ON feature.id = assignment.feature_id
                    WHERE assignment.plan_id = plan.id
                ), '[]'::jsonb)
            ),
            md5('20260728_1110-' || plan.id::text) || md5(plan.id::text || '-20260728_1110'),
            'Correct platform safety ceilings that were accidentally seeded as customer allowances.',
            'migration-20260728_1110-' || plan.id::text,
            NULL, now()
        FROM changed_plans plan
        ON CONFLICT (resource_type, idempotency_key) DO NOTHING
    """)

    # If an activation occurred while the bad values were present, preserve
    # the original contract and add an attributed migration amendment.
    op.execute("""
        WITH affected AS (
            SELECT contract.*
            FROM platform.event_commercial_contracts contract
            WHERE contract.status = 'ACTIVE'
              AND contract.plan_key IN ('Free Trial', 'Basic', 'Professional', 'Enterprise')
              AND (
                  CASE WHEN jsonb_typeof(contract.entitlements->'max_sms_per_event'->'value') = 'number'
                    THEN (contract.entitlements->'max_sms_per_event'->>'value')::numeric ELSE -1 END = 10000000
                  OR CASE WHEN jsonb_typeof(contract.entitlements->'max_whatsapp_per_event'->'value') = 'number'
                    THEN (contract.entitlements->'max_whatsapp_per_event'->>'value')::numeric ELSE -1 END = 10000000
                  OR CASE WHEN jsonb_typeof(contract.entitlements->'max_api_calls_per_month'->'value') = 'number'
                    THEN (contract.entitlements->'max_api_calls_per_month'->>'value')::numeric ELSE -1 END = 1000000000
                  OR CASE WHEN jsonb_typeof(contract.entitlements->'max_integrations'->'value') = 'number'
                    THEN (contract.entitlements->'max_integrations'->>'value')::numeric ELSE -1 END = 10000
                  OR CASE WHEN jsonb_typeof(contract.entitlements->'max_exports_per_event'->'value') = 'number'
                    THEN (contract.entitlements->'max_exports_per_event'->>'value')::numeric ELSE -1 END = 1000000
                  OR CASE WHEN jsonb_typeof(contract.entitlements->'max_devices_per_event'->'value') = 'number'
                    THEN (contract.entitlements->'max_devices_per_event'->>'value')::numeric ELSE -1 END = 100000
              )
        ), corrected AS (
            INSERT INTO platform.event_commercial_contracts (
                id, organization_id, event_id, version, status, plan_key,
                plan_version, currency, entitlements, hard_ceilings, addons,
                source, effective_at, ends_at, created_by, created_at
            )
            SELECT
                gen_random_uuid(), old.organization_id, old.event_id,
                old.version + 1, 'ACTIVE', old.plan_key, old.plan_version,
                old.currency,
                old.entitlements || CASE old.plan_key
                    WHEN 'Free Trial' THEN jsonb_build_object(
                        'max_sms_per_event', jsonb_build_object('type','LIMIT','value',0),
                        'max_whatsapp_per_event', jsonb_build_object('type','LIMIT','value',0),
                        'max_api_calls_per_month', jsonb_build_object('type','LIMIT','value',0),
                        'max_webhook_deliveries_per_month', jsonb_build_object('type','LIMIT','value',0),
                        'max_integrations', jsonb_build_object('type','LIMIT','value',0),
                        'max_exports_per_event', jsonb_build_object('type','LIMIT','value',0),
                        'max_devices_per_event', jsonb_build_object('type','LIMIT','value',0)
                    )
                    WHEN 'Basic' THEN jsonb_build_object(
                        'max_sms_per_event', jsonb_build_object('type','LIMIT','value',0),
                        'max_whatsapp_per_event', jsonb_build_object('type','LIMIT','value',0),
                        'max_api_calls_per_month', jsonb_build_object('type','LIMIT','value',0),
                        'max_webhook_deliveries_per_month', jsonb_build_object('type','LIMIT','value',0),
                        'max_integrations', jsonb_build_object('type','LIMIT','value',0),
                        'max_exports_per_event', jsonb_build_object('type','LIMIT','value',50),
                        'max_devices_per_event', jsonb_build_object('type','LIMIT','value',0)
                    )
                    WHEN 'Professional' THEN jsonb_build_object(
                        'max_sms_per_event', jsonb_build_object('type','LIMIT','value',0),
                        'max_whatsapp_per_event', jsonb_build_object('type','LIMIT','value',0),
                        'max_api_calls_per_month', jsonb_build_object('type','LIMIT','value',0),
                        'max_webhook_deliveries_per_month', jsonb_build_object('type','LIMIT','value',0),
                        'max_integrations', jsonb_build_object('type','LIMIT','value',0),
                        'max_exports_per_event', jsonb_build_object('type','LIMIT','value',500),
                        'max_devices_per_event', jsonb_build_object('type','LIMIT','value',0)
                    )
                    ELSE jsonb_build_object(
                        'max_sms_per_event', jsonb_build_object('type','LIMIT','value',10000),
                        'max_whatsapp_per_event', jsonb_build_object('type','LIMIT','value',10000),
                        'max_api_calls_per_month', jsonb_build_object('type','LIMIT','value',1000000),
                        'max_webhook_deliveries_per_month', jsonb_build_object('type','LIMIT','value',100000),
                        'max_integrations', jsonb_build_object('type','LIMIT','value',50),
                        'max_exports_per_event', jsonb_build_object('type','LIMIT','value',10000),
                        'max_devices_per_event', jsonb_build_object('type','LIMIT','value',500)
                    )
                END,
                old.hard_ceilings, old.addons,
                old.source || jsonb_build_object(
                    'type', 'SEEDED_LIMIT_CORRECTION',
                    'previous_contract_id', old.id,
                    'migration', '20260728_1110'
                ),
                now(), old.ends_at, old.created_by, now()
            FROM affected old
            RETURNING event_id, version
        )
        UPDATE platform.event_commercial_contracts old
        SET status = 'SUPERSEDED'
        FROM corrected replacement
        WHERE old.event_id = replacement.event_id
          AND old.status = 'ACTIVE'
          AND old.version < replacement.version
    """)


def downgrade() -> None:
    # The correction is retained because restoring safety ceilings as customer
    # allowances would grant access beyond the reviewed commercial plan.
    pass
