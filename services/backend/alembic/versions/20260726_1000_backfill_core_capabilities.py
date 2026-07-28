"""backfill newly explicit core capability controls

Revision ID: 20260726_1000
Revises: 20260726_0990
"""

from alembic import op


revision = "20260726_1000"
down_revision = "20260726_0990"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # These areas existed before canonical gating, so backfill them as enabled
    # to preserve active behavior while making every future decision explicit.
    op.execute(r"""
        INSERT INTO billing.feature_catalog
            (id, key, name, description, category, scope_type, value_type,
             default_value, portal_routes, backend_operations, metric_key,
             category_order, feature_order, is_active, created_at, updated_at)
        VALUES
            (gen_random_uuid(), 'FEAT_EVENT_PLANNING', 'Event Planning',
             'Event details, timeline, and planning controls', 'EVENT_MANAGEMENT',
             'EVENT', 'BOOLEAN', '{"value": false}'::jsonb,
             '["/events/\:eventId/planning"]'::jsonb,
             '["events.planning.manage"]'::jsonb, NULL, 0, 0, true, now(), now()),
            (gen_random_uuid(), 'FEAT_SESSION_MANAGEMENT', 'Session Management',
             'Agenda and session administration', 'SESSION_MANAGEMENT',
             'EVENT', 'BOOLEAN', '{"value": false}'::jsonb,
             '["/events/\:eventId/sessions"]'::jsonb,
             '["sessions.manage"]'::jsonb, 'sessions', 0, 0, true, now(), now()),
            (gen_random_uuid(), 'FEAT_COMMUNICATION_CENTER', 'Communication Center',
             'Event communication workspace', 'COMMUNICATIONS',
             'EVENT', 'BOOLEAN', '{"value": false}'::jsonb,
             '["/events/\:eventId/communication"]'::jsonb,
             '[]'::jsonb, NULL, 0, 0, true, now(), now()),
            (gen_random_uuid(), 'FEAT_DATA_EXPORTS', 'Data Exports',
             'Create event-scoped exports', 'ANALYTICS',
             'EVENT', 'BOOLEAN', '{"value": false}'::jsonb,
             '["/events/\:eventId/speakers/export"]'::jsonb,
             '["exports.create"]'::jsonb, 'exports', 0, 0, true, now(), now())
        ON CONFLICT (key) DO NOTHING
    """)

    op.execute("""
        INSERT INTO billing.plan_features
            (plan_id, feature_id, enabled, value_type, entitlement_value,
             scope_type, enforcement_mode, version)
        SELECT p.id, f.id, true, 'BOOLEAN', '{"value": true}'::jsonb,
               'EVENT', 'HARD', 1
        FROM billing.subscription_plans p
        CROSS JOIN billing.feature_catalog f
        WHERE p.is_active IS TRUE
          AND f.key IN (
              'FEAT_EVENT_PLANNING', 'FEAT_SESSION_MANAGEMENT',
              'FEAT_COMMUNICATION_CENTER', 'FEAT_DATA_EXPORTS'
          )
        ON CONFLICT (plan_id, feature_id) DO NOTHING
    """)

    op.execute("""
        INSERT INTO billing.plan_features
            (plan_id, feature_id, enabled, value_type, entitlement_value,
             scope_type, enforcement_mode, hard_ceiling, version)
        SELECT p.id, f.id, true, 'LIMIT', '{"value": 1000000}'::jsonb,
               'EVENT', 'HARD', '{"value": 1000000}'::jsonb, 1
        FROM billing.subscription_plans p
        JOIN billing.feature_catalog f ON f.key = 'LIMIT_EXPORTS'
        WHERE p.is_active IS TRUE
        ON CONFLICT (plan_id, feature_id) DO NOTHING
    """)

    # Event contracts are immutable. Preserve the previous row and create an
    # attributed migration amendment instead of updating entitlements in place.
    op.execute("""
        WITH current_contract AS (
            SELECT c.*
            FROM platform.event_commercial_contracts c
            WHERE c.status = 'ACTIVE'
        ), inserted AS (
            INSERT INTO platform.event_commercial_contracts
                (id, organization_id, event_id, version, status, plan_key,
                 plan_version, currency, entitlements, hard_ceilings, addons,
                 source, effective_at, ends_at, created_by, created_at)
            SELECT gen_random_uuid(), c.organization_id, c.event_id, c.version + 1,
                   'ACTIVE', c.plan_key, c.plan_version, c.currency,
                   c.entitlements || jsonb_build_object(
                       'FEAT_EVENT_PLANNING', jsonb_build_object('type','BOOLEAN','value',true),
                       'FEAT_SESSION_MANAGEMENT', jsonb_build_object('type','BOOLEAN','value',true),
                       'FEAT_COMMUNICATION_CENTER', jsonb_build_object('type','BOOLEAN','value',true),
                       'FEAT_DATA_EXPORTS', jsonb_build_object('type','BOOLEAN','value',true),
                       'max_exports_per_event', jsonb_build_object('type','LIMIT','value',1000000)
                   ),
                   c.hard_ceilings || jsonb_build_object('max_exports_per_event', 1000000),
                   c.addons,
                   c.source || jsonb_build_object(
                       'type', 'CORE_CAPABILITY_BACKFILL',
                       'previous_contract_id', c.id,
                       'backfilled_at', now()
                   ),
                   now(), c.ends_at, c.created_by, now()
            FROM current_contract c
            WHERE NOT (c.entitlements ? 'FEAT_EVENT_PLANNING')
            RETURNING event_id, version
        )
        UPDATE platform.event_commercial_contracts old
        SET status = 'SUPERSEDED'
        FROM inserted replacement
        WHERE old.event_id = replacement.event_id
          AND old.version < replacement.version
          AND old.status = 'ACTIVE'
    """)


def downgrade() -> None:
    # Contract amendments are durable commercial history and intentionally not
    # deleted. A downgrade disables only future plan mappings and definitions.
    op.execute("""
        DELETE FROM billing.plan_features pf
        USING billing.feature_catalog f
        WHERE pf.feature_id = f.id
          AND f.key IN (
              'FEAT_EVENT_PLANNING', 'FEAT_SESSION_MANAGEMENT',
              'FEAT_COMMUNICATION_CENTER', 'FEAT_DATA_EXPORTS'
          )
    """)
    op.execute("""
        UPDATE billing.feature_catalog
        SET is_active = false, lifecycle_status = 'DEPRECATED', updated_at = now()
        WHERE key IN (
            'FEAT_EVENT_PLANNING', 'FEAT_SESSION_MANAGEMENT',
            'FEAT_COMMUNICATION_CENTER', 'FEAT_DATA_EXPORTS'
        )
    """)
