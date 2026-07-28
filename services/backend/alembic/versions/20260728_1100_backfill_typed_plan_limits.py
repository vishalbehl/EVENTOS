"""Backfill typed commercial limits for every subscription plan.

Revision ID: 20260728_1100
Revises: 20260728_1090
"""

from alembic import op


revision = "20260728_1100"
down_revision = "20260728_1090"
branch_labels = None
depends_on = None


LIMIT_CATALOGUE_SQL = """
    SELECT *
    FROM (
        VALUES
            ('LIMIT_EVENTS', 'Events', 'ORGANIZATION', 'events', 'CONTRACT', 'active_events'),
            ('LIMIT_ORGANIZER_USERS', 'Organizer Users', 'ORGANIZATION', 'users', 'CONTRACT', 'active_users'),
            ('LIMIT_EVENT_TEAM_MEMBERS', 'Event Team Members', 'EVENT', 'users', 'EVENT', 'event_team_members'),
            ('LIMIT_REGISTRATIONS', 'Registrations', 'EVENT', 'registrations', 'EVENT', 'registrations'),
            ('LIMIT_SPEAKERS', 'Speakers', 'EVENT', 'speakers', 'EVENT', 'speakers'),
            ('LIMIT_SESSIONS', 'Sessions', 'EVENT', 'sessions', 'EVENT', 'sessions'),
            ('LIMIT_ROOMS', 'Rooms', 'EVENT', 'rooms', 'EVENT', 'rooms'),
            ('FEAT_TICKET_CATEGORIES', 'Ticket Categories', 'EVENT', 'categories', 'EVENT', 'ticket_categories'),
            ('FEAT_BADGE_TEMPLATES', 'Badge Templates', 'EVENT', 'templates', 'EVENT', 'badge_templates'),
            ('FEAT_CERTIFICATE_TEMPLATES', 'Certificate Templates', 'EVENT', 'templates', 'EVENT', 'certificate_templates'),
            ('FEAT_EMAIL_NOTIFICATIONS', 'Email Notifications', 'EVENT', 'messages', 'EVENT', 'emails_sent'),
            ('LIMIT_STORAGE', 'Storage', 'EVENT', 'megabytes', 'EVENT', 'storage_bytes')
    ) AS definitions(key, name, scope_type, unit, period, metric_key)
"""


PLAN_LIMIT_VALUES_SQL = """
    SELECT p.id AS plan_id, values.feature_key, values.limit_value, values.hard_ceiling
    FROM billing.subscription_plans p
    CROSS JOIN LATERAL (
        VALUES
            ('LIMIT_EVENTS', COALESCE(p.max_events, 10000)::bigint, 10000::bigint),
            ('LIMIT_ORGANIZER_USERS', COALESCE(p.max_users, 1000000)::bigint, 1000000::bigint),
            ('LIMIT_EVENT_TEAM_MEMBERS', COALESCE(p.max_event_team_members, 100000)::bigint, 100000::bigint),
            ('LIMIT_REGISTRATIONS', COALESCE(p.max_registrations, 10000000)::bigint, 10000000::bigint),
            ('LIMIT_SPEAKERS', COALESCE(p.max_speakers, 100000)::bigint, 100000::bigint),
            ('LIMIT_SESSIONS', COALESCE(p.max_sessions, 100000)::bigint, 100000::bigint),
            ('LIMIT_ROOMS', COALESCE(p.max_rooms, 10000)::bigint, 10000::bigint),
            ('FEAT_TICKET_CATEGORIES', COALESCE(p.max_ticket_categories, 10000)::bigint, 10000::bigint),
            ('FEAT_BADGE_TEMPLATES', COALESCE(p.max_badge_templates, 10000)::bigint, 10000::bigint),
            ('FEAT_CERTIFICATE_TEMPLATES', COALESCE(p.max_certificate_templates, 10000)::bigint, 10000::bigint),
            ('FEAT_EMAIL_NOTIFICATIONS', COALESCE(p.max_emails_per_event, 100000000)::bigint, 100000000::bigint),
            ('LIMIT_STORAGE', COALESCE(p.storage_quota_mb, 10485760)::bigint, 10485760::bigint)
    ) AS values(feature_key, limit_value, hard_ceiling)
"""


def upgrade() -> None:
    op.execute(f"""
        INSERT INTO billing.feature_catalog (
            id, key, name, description, category, scope_type, value_type,
            default_value, allowed_values, unit, period, enforcement_mode,
            portal_routes, backend_operations, required_permissions,
            metric_key, dependencies, conflicts, owner_console, risk_level,
            lifecycle_status, version, category_order, feature_order,
            is_active, created_at, updated_at
        )
        SELECT
            gen_random_uuid(), definitions.key, definitions.name,
            'Canonical quantitative entitlement', 'LIMITS',
            definitions.scope_type, 'LIMIT', '{{"value": 0}}'::jsonb,
            '[]'::jsonb, definitions.unit, definitions.period, 'HARD',
            '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
            definitions.metric_key, '[]'::jsonb, '[]'::jsonb,
            'BUSINESS', 'MEDIUM', 'ACTIVE', 1, 0, 0, true, now(), now()
        FROM ({LIMIT_CATALOGUE_SQL}) definitions
        ON CONFLICT (key) DO UPDATE
        SET value_type = 'LIMIT',
            scope_type = EXCLUDED.scope_type,
            unit = EXCLUDED.unit,
            period = EXCLUDED.period,
            metric_key = EXCLUDED.metric_key,
            updated_at = now()
    """)

    op.execute(f"""
        INSERT INTO billing.plan_features (
            plan_id, feature_id, enabled, value_type, entitlement_value,
            scope_type, enforcement_mode, hard_ceiling, version
        )
        SELECT
            values.plan_id, feature.id, true, 'LIMIT',
            jsonb_build_object('value', values.limit_value),
            feature.scope_type, 'HARD',
            jsonb_build_object('value', values.hard_ceiling), 1
        FROM ({PLAN_LIMIT_VALUES_SQL}) values
        JOIN billing.feature_catalog feature ON feature.key = values.feature_key
        ON CONFLICT (plan_id, feature_id) DO NOTHING
    """)

    # The original typed-schema migration converted every old Boolean row to
    # {"value": true|false}. Replace only missing or Boolean-shaped values;
    # numeric values already saved through Command Center remain untouched.
    op.execute(f"""
        UPDATE billing.plan_features assignment
        SET enabled = true,
            value_type = 'LIMIT',
            entitlement_value = jsonb_build_object('value', values.limit_value),
            scope_type = feature.scope_type,
            enforcement_mode = COALESCE(assignment.enforcement_mode, 'HARD'),
            hard_ceiling = COALESCE(
                assignment.hard_ceiling,
                jsonb_build_object('value', values.hard_ceiling)
            )
        FROM ({PLAN_LIMIT_VALUES_SQL}) values
        JOIN billing.feature_catalog feature ON feature.key = values.feature_key
        WHERE assignment.plan_id = values.plan_id
          AND assignment.feature_id = feature.id
          AND (
              assignment.entitlement_value IS NULL
              OR jsonb_typeof(assignment.entitlement_value -> 'value') = 'boolean'
          )
    """)


def downgrade() -> None:
    # Typed values become immutable commercial-template history once active
    # event contracts reference them, so downgrade intentionally preserves the
    # backfilled assignments.
    pass
