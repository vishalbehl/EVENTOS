"""superadmin_phase1_foundation

Revision ID: superadmin_phase1_001
Revises: 1bc13e4b24f2
Create Date: 2026-06-23 00:01:00.000000+00:00

Phase 1 — Super Admin Console DB Foundation
============================================
This single migration applies ALL Phase 1 schema changes required for the
Super Admin (EventX Command Centre) console.

Sections:
  1.  FIX   billing.event_activations          — add 8 missing columns
  2.  SEED  billing.addon_features             — add 5 missing mappings (idempotent)
  3.  NEW   billing.subscription_analytics     — monthly MRR/churn analytics
  4.  NEW   billing.org_credits                — manual credit ledger per org
  5.  NEW   billing.payment_gateways           — gateway registry + 3 seed rows
  6.  NEW   billing.financial_audit_trail      — immutable financial event log
  7.  NEW   billing.credit_notes               — CN register (link to invoices)
  8.  FIX   platform.organizations             — 4 new columns + mark platform org
  9.  NEW   platform.org_notification_preferences
 10.  NEW   platform.maintenance_windows
 11.  NEW   platform.platform_integrations     — integration registry + 7 seeds
 12.  FIX   audit.logs                         — make actor_user_id nullable
 13.  FIX   support.sla_policies               — 4 new cols + org_id nullable + 4 seeds
 14.  FIX   support.knowledge_articles         — 7 new cols (content col already exists)
 15.  PERF  Create 7 performance indexes
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# ---------------------------------------------------------------------------
# revision identifiers
# ---------------------------------------------------------------------------
revision: str = 'superadmin_phase1_001'
down_revision: Union[str, None] = '1bc13e4b24f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ===========================================================================
# UPGRADE
# ===========================================================================
def upgrade() -> None:

    # ───────────────────────────────────────────────────────────────────────
    # 1. FIX billing.event_activations — add missing columns
    # ───────────────────────────────────────────────────────────────────────
    op.add_column(
        'event_activations',
        sa.Column('gst_amount', sa.Numeric(12, 2), server_default='0', nullable=True),
        schema='billing'
    )
    op.add_column(
        'event_activations',
        sa.Column('gst_pct', sa.Numeric(5, 2), server_default='18.00', nullable=True),
        schema='billing'
    )
    op.add_column(
        'event_activations',
        sa.Column('payment_reference', sa.String(100), nullable=True),
        schema='billing'
    )
    op.add_column(
        'event_activations',
        sa.Column(
            'is_locked',
            sa.Boolean(),
            nullable=False,
            server_default='false'
        ),
        schema='billing'
    )
    op.add_column(
        'event_activations',
        sa.Column('activation_period_days', sa.Integer(), server_default='30', nullable=True),
        schema='billing'
    )
    op.add_column(
        'event_activations',
        sa.Column(
            'auto_renew',
            sa.Boolean(),
            nullable=False,
            server_default='false'
        ),
        schema='billing'
    )
    op.add_column(
        'event_activations',
        sa.Column('license_value_inr', sa.Numeric(12, 2), nullable=True),
        schema='billing'
    )
    # activated_addons — UUID[] column (add only if missing)
    op.execute("""
        ALTER TABLE billing.event_activations
        ADD COLUMN IF NOT EXISTS activated_addons UUID[]
    """)

    # ───────────────────────────────────────────────────────────────────────
    # 2. SEED billing.addon_features — add 5 missing mappings (idempotent)
    # ───────────────────────────────────────────────────────────────────────
    # Phase0 already seeded: WHATSAPP, EPOSTER, WHITE_LABEL (3 rows)
    # We now add the remaining 5 mappings.
    op.execute("""
        INSERT INTO billing.addon_features (addon_id, feature_id)
        SELECT a.id, f.id
        FROM billing.addons a
        CROSS JOIN platform.feature_catalog f
        WHERE (a.key, f.key) IN (
            ('ADDON_DIGITAL_SIGNAGE',   'FEAT_DIGITAL_SIGNAGE'),
            ('ADDON_VENUE_READY_ROOM',  'FEAT_READY_ROOM'),
            ('ADDON_VENUE_READY_ROOM',  'FEAT_SPEAKER_CHECKIN'),
            ('ADDON_WHITE_LABEL',       'FEAT_CUSTOM_DOMAIN'),
            ('ADDON_MOBILE_APP',        'FEAT_MOBILE_APP')
        )
        AND NOT EXISTS (
            SELECT 1 FROM billing.addon_features af
            WHERE af.addon_id = a.id AND af.feature_id = f.id
        )
    """)

    # ───────────────────────────────────────────────────────────────────────
    # 3. NEW TABLE: billing.subscription_analytics
    # ───────────────────────────────────────────────────────────────────────
    op.create_table(
        'subscription_analytics',
        sa.Column(
            'id',
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text('gen_random_uuid()')
        ),
        sa.Column('period', sa.String(7), nullable=False),           # 'YYYY-MM'
        sa.Column('active_subscriptions', sa.Integer(), server_default='0'),
        sa.Column('trial_subscriptions', sa.Integer(), server_default='0'),
        sa.Column('new_subscriptions', sa.Integer(), server_default='0'),
        sa.Column('cancelled_subscriptions', sa.Integer(), server_default='0'),
        sa.Column('grace_period_subscriptions', sa.Integer(), server_default='0'),
        sa.Column('trial_conversion_rate', sa.Numeric(5, 2), server_default='0'),
        sa.Column('churn_rate', sa.Numeric(5, 2), server_default='0'),
        sa.Column('logo_retention_rate', sa.Numeric(5, 2), server_default='0'),
        sa.Column('arpu_inr', sa.Numeric(12, 2), server_default='0'),
        sa.Column('total_mrr_inr', sa.Numeric(14, 2), server_default='0'),
        sa.Column('new_mrr_inr', sa.Numeric(12, 2), server_default='0'),
        sa.Column('churned_mrr_inr', sa.Numeric(12, 2), server_default='0'),
        sa.Column('expansion_mrr_inr', sa.Numeric(12, 2), server_default='0'),
        sa.Column(
            'computed_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()')
        ),
        sa.UniqueConstraint('period', name='uq_subscription_analytics_period'),
        schema='billing'
    )

    # ───────────────────────────────────────────────────────────────────────
    # 4. NEW TABLE: billing.org_credits
    # ───────────────────────────────────────────────────────────────────────
    op.create_table(
        'org_credits',
        sa.Column(
            'id',
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text('gen_random_uuid()')
        ),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('amount_inr', sa.Numeric(12, 2), nullable=False),
        # credit_type: 'MANUAL' | 'REFUND' | 'PROMOTIONAL' | 'COMPENSATION'
        sa.Column('credit_type', sa.String(30), nullable=False),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('applied_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            'applied_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()')
        ),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_used', sa.Boolean(), server_default='false'),
        sa.Column('used_on_invoice_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ['organization_id'],
            ['platform.organizations.id'],
            ondelete='CASCADE'
        ),
        sa.ForeignKeyConstraint(
            ['applied_by'],
            ['identity.users.id'],
            ondelete='SET NULL'
        ),
        sa.ForeignKeyConstraint(
            ['used_on_invoice_id'],
            ['billing.invoices.id'],
            ondelete='SET NULL'
        ),
        schema='billing'
    )
    op.create_index(
        'idx_org_credits_org',
        'org_credits',
        ['organization_id'],
        schema='billing'
    )

    # ───────────────────────────────────────────────────────────────────────
    # 5. NEW TABLE: billing.payment_gateways + seed
    # ───────────────────────────────────────────────────────────────────────
    op.create_table(
        'payment_gateways',
        sa.Column(
            'id',
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text('gen_random_uuid()')
        ),
        # gateway_name: 'Stripe Live' | 'Razorpay Live' | 'PayU Live' | 'Test Gateway'
        sa.Column('gateway_name', sa.String(50), nullable=False),
        # provider: 'STRIPE' | 'RAZORPAY' | 'PAYU' | 'CCAVENUE' | 'PAYTM' | 'DUMMY'
        sa.Column('provider', sa.String(30), nullable=False),
        # mode: 'LIVE' | 'TEST'
        sa.Column('mode', sa.String(10), nullable=False, server_default='LIVE'),
        sa.Column('is_active', sa.Boolean(), server_default='true'),
        sa.Column('is_default', sa.Boolean(), server_default='false'),
        sa.Column('success_rate_30d', sa.Numeric(5, 2), nullable=True),
        sa.Column('transactions_mtd', sa.Integer(), server_default='0'),
        sa.Column('volume_mtd_inr', sa.Numeric(14, 2), server_default='0'),
        sa.Column('last_health_check', sa.DateTime(timezone=True), nullable=True),
        # health_status: 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN'
        sa.Column('health_status', sa.String(20), server_default='UNKNOWN'),
        sa.Column('credentials_encrypted', postgresql.JSONB(), nullable=True),
        sa.Column('webhook_secret_encrypted', sa.Text(), nullable=True),
        sa.Column('config_metadata', postgresql.JSONB(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()')
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()')
        ),
        schema='billing'
    )
    op.execute("""
        INSERT INTO billing.payment_gateways
          (id, gateway_name, provider, mode, is_active, is_default, health_status)
        VALUES
          (gen_random_uuid(), 'Razorpay Live', 'RAZORPAY', 'LIVE', true,  true,  'UNKNOWN'),
          (gen_random_uuid(), 'Stripe Live',   'STRIPE',   'LIVE', true,  false, 'UNKNOWN'),
          (gen_random_uuid(), 'Test Gateway',  'DUMMY',    'TEST', false, false, 'UNKNOWN')
        ON CONFLICT DO NOTHING
    """)

    # ───────────────────────────────────────────────────────────────────────
    # 6. NEW TABLE: billing.financial_audit_trail + indexes
    # ───────────────────────────────────────────────────────────────────────
    op.create_table(
        'financial_audit_trail',
        sa.Column(
            'id',
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text('gen_random_uuid()')
        ),
        # activity_type: 'INVOICE_CREATED'|'PAYMENT_RECEIVED'|'REFUND_APPROVED'|
        #                'CREDIT_NOTE_ISSUED'|'GATEWAY_CONFIG_CHANGED'|
        #                'SUBSCRIPTION_CREATED'|'PLAN_CHANGED'|'TAX_RULE_UPDATED'
        sa.Column('activity_type', sa.String(50), nullable=False),
        # entity_type: 'INVOICE'|'PAYMENT'|'REFUND'|'CREDIT_NOTE'|'GATEWAY'|'SUBSCRIPTION'
        sa.Column('entity_type', sa.String(30), nullable=False),
        sa.Column('entity_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('entity_name', sa.String(200), nullable=True),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('performed_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('amount_inr', sa.Numeric(12, 2), nullable=True),
        sa.Column('ip_address', postgresql.INET(), nullable=True),
        sa.Column('details', postgresql.JSONB(), nullable=True),
        sa.Column(
            'occurred_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()')
        ),
        sa.ForeignKeyConstraint(
            ['organization_id'],
            ['platform.organizations.id'],
            ondelete='SET NULL'
        ),
        sa.ForeignKeyConstraint(
            ['performed_by'],
            ['identity.users.id'],
            ondelete='SET NULL'
        ),
        schema='billing'
    )
    op.create_index(
        'idx_financial_audit_trail_org_time',
        'financial_audit_trail',
        ['organization_id', 'occurred_at'],
        schema='billing'
    )
    op.create_index(
        'idx_financial_audit_trail_type',
        'financial_audit_trail',
        ['activity_type', 'occurred_at'],
        schema='billing'
    )

    # ───────────────────────────────────────────────────────────────────────
    # 7. NEW TABLE: billing.credit_notes
    # ───────────────────────────────────────────────────────────────────────
    op.create_table(
        'credit_notes',
        sa.Column(
            'id',
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text('gen_random_uuid()')
        ),
        sa.Column(
            'credit_note_number',
            sa.String(30),
            nullable=False,
            unique=True
        ),
        sa.Column('invoice_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('amount_inr', sa.Numeric(12, 2), nullable=False),
        sa.Column('gst_amount', sa.Numeric(12, 2), server_default='0'),
        sa.Column('reason', sa.Text(), nullable=True),
        # status: 'ISSUED' | 'PENDING' | 'CANCELLED' | 'APPLIED'
        sa.Column('status', sa.String(20), server_default='ISSUED'),
        sa.Column('issued_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('issued_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('applied_to_invoice_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()')
        ),
        sa.ForeignKeyConstraint(
            ['invoice_id'],
            ['billing.invoices.id'],
            ondelete='RESTRICT'
        ),
        sa.ForeignKeyConstraint(
            ['organization_id'],
            ['platform.organizations.id'],
            ondelete='CASCADE'
        ),
        sa.ForeignKeyConstraint(
            ['issued_by'],
            ['identity.users.id'],
            ondelete='SET NULL'
        ),
        schema='billing'
    )

    # ───────────────────────────────────────────────────────────────────────
    # 8. FIX platform.organizations — add 4 columns + mark platform org
    # ───────────────────────────────────────────────────────────────────────
    op.add_column(
        'organizations',
        sa.Column('is_platform_org', sa.Boolean(), server_default='false', nullable=False),
        schema='platform'
    )
    op.add_column(
        'organizations',
        sa.Column('event_count', sa.Integer(), server_default='0', nullable=False),
        schema='platform'
    )
    op.add_column(
        'organizations',
        sa.Column('banner_thumbnail_url', sa.Text(), nullable=True),
        schema='platform'
    )
    op.add_column(
        'organizations',
        sa.Column('readiness_score', sa.Numeric(5, 2), nullable=True),
        schema='platform'
    )
    # Mark the earliest-created org as the Super Admin / platform org
    op.execute("""
        UPDATE platform.organizations
        SET is_platform_org = TRUE
        WHERE id = (
            SELECT id FROM platform.organizations ORDER BY created_at ASC LIMIT 1
        )
    """)

    # ───────────────────────────────────────────────────────────────────────
    # 9. NEW TABLE: platform.org_notification_preferences
    # ───────────────────────────────────────────────────────────────────────
    op.create_table(
        'org_notification_preferences',
        sa.Column(
            'id',
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text('gen_random_uuid()')
        ),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), nullable=False),
        # notification_type: 'BILLING_ALERT'|'SECURITY_ALERT'|'SYSTEM_MAINTENANCE'|
        #                    'PLAN_EXPIRY'|'PAYMENT_FAILED'|'NEW_FEATURE'
        sa.Column('notification_type', sa.String(50), nullable=False),
        # channel: 'EMAIL' | 'SMS' | 'IN_APP'
        sa.Column('channel', sa.String(20), nullable=False, server_default='EMAIL'),
        sa.Column('is_enabled', sa.Boolean(), server_default='true'),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()')
        ),
        sa.UniqueConstraint(
            'organization_id', 'notification_type', 'channel',
            name='uq_org_notif_pref'
        ),
        sa.ForeignKeyConstraint(
            ['organization_id'],
            ['platform.organizations.id'],
            ondelete='CASCADE'
        ),
        schema='platform'
    )

    # ───────────────────────────────────────────────────────────────────────
    # 10. NEW TABLE: platform.maintenance_windows
    # ───────────────────────────────────────────────────────────────────────
    op.create_table(
        'maintenance_windows',
        sa.Column(
            'id',
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text('gen_random_uuid()')
        ),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('starts_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('ends_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('affected_services', postgresql.ARRAY(sa.Text()), nullable=True),
        # status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
        sa.Column('status', sa.String(20), server_default='SCHEDULED'),
        sa.Column('notification_sent', sa.Boolean(), server_default='false'),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()')
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()')
        ),
        sa.ForeignKeyConstraint(
            ['created_by'],
            ['identity.users.id'],
            ondelete='SET NULL'
        ),
        schema='platform'
    )

    # ───────────────────────────────────────────────────────────────────────
    # 11. NEW TABLE: platform.platform_integrations + seed
    # ───────────────────────────────────────────────────────────────────────
    op.create_table(
        'platform_integrations',
        sa.Column(
            'id',
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text('gen_random_uuid()')
        ),
        sa.Column('name', sa.String(100), nullable=False),
        # type: 'PAYMENT'|'EMAIL'|'SMS'|'ANALYTICS'|'STORAGE'|'WEBHOOK'
        sa.Column('type', sa.String(50), nullable=False),
        # provider: 'STRIPE'|'RAZORPAY'|'RESEND'|'TWILIO'|'GOOGLE_ANALYTICS'|
        #           'AWS_S3'|'CLOUDFLARE_R2'|'WEBHOOK_RECEIVER'
        sa.Column('provider', sa.String(50), nullable=False),
        # status: 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN'
        sa.Column('status', sa.String(20), server_default='UNKNOWN'),
        sa.Column('last_health_check', sa.DateTime(timezone=True), nullable=True),
        sa.Column('response_time_ms', sa.Integer(), nullable=True),
        sa.Column('error_rate', sa.Numeric(6, 4), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true'),
        sa.Column('config_encrypted', postgresql.JSONB(), nullable=True),
        sa.Column('metadata', postgresql.JSONB(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()')
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()')
        ),
        schema='platform'
    )
    op.execute("""
        INSERT INTO platform.platform_integrations
          (name, type, provider, status, is_active)
        VALUES
          ('Stripe Payments',       'PAYMENT',   'STRIPE',            'UNKNOWN', true),
          ('Razorpay Payments',     'PAYMENT',   'RAZORPAY',          'UNKNOWN', true),
          ('Resend Email',          'EMAIL',     'RESEND',            'UNKNOWN', true),
          ('Twilio SMS',            'SMS',       'TWILIO',            'UNKNOWN', false),
          ('Google Analytics',      'ANALYTICS', 'GOOGLE_ANALYTICS',  'UNKNOWN', false),
          ('Cloudflare R2 Storage', 'STORAGE',   'CLOUDFLARE_R2',     'UNKNOWN', true),
          ('Webhook Receiver',      'WEBHOOK',   'WEBHOOK_RECEIVER',  'UNKNOWN', true)
        ON CONFLICT DO NOTHING
    """)

    # ───────────────────────────────────────────────────────────────────────
    # 12. FIX audit.logs — make actor_user_id nullable
    # ───────────────────────────────────────────────────────────────────────
    op.execute(
        "ALTER TABLE audit.logs ALTER COLUMN actor_user_id DROP NOT NULL"
    )

    # ───────────────────────────────────────────────────────────────────────
    # 13. FIX support.sla_policies — new cols + make organization_id nullable + seed
    # ───────────────────────────────────────────────────────────────────────
    # Make organization_id nullable so platform-wide (no-org) SLA rows can be seeded
    op.alter_column(
        'sla_policies',
        'organization_id',
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
        schema='support'
    )

    # plan_tier: 'ENTERPRISE' | 'PROFESSIONAL' | 'BASIC' | 'TRIAL' | NULL (all)
    op.add_column(
        'sla_policies',
        sa.Column('plan_tier', sa.String(50), nullable=True),
        schema='support'
    )
    op.add_column(
        'sla_policies',
        sa.Column('first_response_hours', sa.Numeric(5, 2), server_default='24'),
        schema='support'
    )
    op.add_column(
        'sla_policies',
        sa.Column('resolution_hours', sa.Numeric(5, 2), server_default='72'),
        schema='support'
    )
    op.add_column(
        'sla_policies',
        sa.Column('escalation_hours', sa.Numeric(5, 2), server_default='48'),
        schema='support'
    )
    # Seed plan-aware SLA policies (platform-wide, no org_id)
    # NOTE: response_time_hours and resolution_time_hours are original NOT NULL columns
    #       from the base enterprise_schema_v2 migration — must be included.
    op.execute("""
        INSERT INTO support.sla_policies
          (id, name, response_time_hours, resolution_time_hours,
           plan_tier, first_response_hours, resolution_hours, escalation_hours)
        VALUES
          (gen_random_uuid(), 'Enterprise SLA',   1,  12,  'ENTERPRISE',   1,  12,  6),
          (gen_random_uuid(), 'Professional SLA', 4,  24,  'PROFESSIONAL', 4,  24,  12),
          (gen_random_uuid(), 'Basic SLA',        24, 72,  'BASIC',        24, 72,  48),
          (gen_random_uuid(), 'Trial SLA',        48, 120, 'TRIAL',        48, 120, 72)
        ON CONFLICT DO NOTHING
    """)

    # ───────────────────────────────────────────────────────────────────────
    # 14. FIX support.knowledge_articles — add 7 missing columns
    #     NOTE: 'content' column already exists in the base schema (NOT NULL),
    #           so we intentionally skip it to avoid a duplicate column error.
    # ───────────────────────────────────────────────────────────────────────
    op.add_column(
        'knowledge_articles',
        sa.Column('view_count', sa.Integer(), server_default='0'),
        schema='support'
    )
    op.add_column(
        'knowledge_articles',
        sa.Column('helpful_count', sa.Integer(), server_default='0'),
        schema='support'
    )
    op.add_column(
        'knowledge_articles',
        sa.Column('not_helpful_count', sa.Integer(), server_default='0'),
        schema='support'
    )
    op.add_column(
        'knowledge_articles',
        sa.Column('category', sa.String(100), nullable=True),
        schema='support'
    )
    op.add_column(
        'knowledge_articles',
        sa.Column('tags', postgresql.ARRAY(sa.Text()), nullable=True),
        schema='support'
    )
    # status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
    op.add_column(
        'knowledge_articles',
        sa.Column('status', sa.String(20), server_default='DRAFT'),
        schema='support'
    )
    op.add_column(
        'knowledge_articles',
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        schema='support'
    )

    # ───────────────────────────────────────────────────────────────────────
    # 15. PERFORMANCE INDEXES
    # ───────────────────────────────────────────────────────────────────────
    op.create_index(
        'idx_billing_org_subs_org_status',
        'organization_subscriptions',
        ['organization_id', 'status'],
        schema='billing'
    )
    # Note: ix_event_activations_org_id already exists from phase1_activations_001.
    #       We create a differently-named composite index for super-admin queries.
    op.create_index(
        'idx_billing_event_act_org',
        'event_activations',
        ['organization_id'],
        schema='billing'
    )
    # Note: A partial unique index on event_id (uq_event_activations_active) already exists.
    #       We do NOT create a separate unique index — instead a plain covering index:
    op.create_index(
        'idx_billing_event_act_event',
        'event_activations',
        ['event_id'],
        unique=False,  # unique=True would conflict with existing partial index
        schema='billing'
    )
    op.create_index(
        'idx_billing_pay_events_org_time',
        'payment_events',
        ['organization_id', 'timestamp'],  # billing.payment_events uses 'timestamp' not 'occurred_at'
        schema='billing'
    )
    op.create_index(
        'idx_audit_logs_org_time',
        'logs',
        ['organization_id', 'occurred_at'],
        schema='audit'
    )
    op.create_index(
        'idx_support_tickets_status_priority',
        'support_tickets',
        ['status', 'priority'],
        schema='support'
    )
    op.create_index(
        'idx_platform_orgs_is_platform',
        'organizations',
        ['is_platform_org'],
        schema='platform'
    )


# ===========================================================================
# DOWNGRADE
# ===========================================================================
def downgrade() -> None:

    # ── 15. Drop performance indexes ──────────────────────────────────────
    op.drop_index('idx_platform_orgs_is_platform', table_name='organizations', schema='platform')
    op.drop_index('idx_support_tickets_status_priority', table_name='support_tickets', schema='support')
    op.drop_index('idx_audit_logs_org_time', table_name='logs', schema='audit')
    op.drop_index('idx_billing_pay_events_org_time', table_name='payment_events', schema='billing')
    op.drop_index('idx_billing_event_act_event', table_name='event_activations', schema='billing')
    op.drop_index('idx_billing_event_act_org', table_name='event_activations', schema='billing')
    op.drop_index('idx_billing_org_subs_org_status', table_name='organization_subscriptions', schema='billing')

    # ── 14. Revert support.knowledge_articles columns ─────────────────────
    op.drop_column('knowledge_articles', 'published_at', schema='support')
    op.drop_column('knowledge_articles', 'status', schema='support')
    op.drop_column('knowledge_articles', 'tags', schema='support')
    op.drop_column('knowledge_articles', 'category', schema='support')
    op.drop_column('knowledge_articles', 'not_helpful_count', schema='support')
    op.drop_column('knowledge_articles', 'helpful_count', schema='support')
    op.drop_column('knowledge_articles', 'view_count', schema='support')

    # ── 13. Revert support.sla_policies ───────────────────────────────────
    op.execute("""
        DELETE FROM support.sla_policies
        WHERE name IN ('Enterprise SLA', 'Professional SLA', 'Basic SLA', 'Trial SLA')
          AND organization_id IS NULL
    """)
    op.drop_column('sla_policies', 'escalation_hours', schema='support')
    op.drop_column('sla_policies', 'resolution_hours', schema='support')
    op.drop_column('sla_policies', 'first_response_hours', schema='support')
    op.drop_column('sla_policies', 'plan_tier', schema='support')
    op.alter_column(
        'sla_policies',
        'organization_id',
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
        schema='support'
    )

    # ── 12. Revert audit.logs actor_user_id ───────────────────────────────
    op.execute(
        "ALTER TABLE audit.logs ALTER COLUMN actor_user_id SET NOT NULL"
    )

    # ── 11. Drop platform.platform_integrations ────────────────────────────
    op.drop_table('platform_integrations', schema='platform')

    # ── 10. Drop platform.maintenance_windows ─────────────────────────────
    op.drop_table('maintenance_windows', schema='platform')

    # ── 9. Drop platform.org_notification_preferences ─────────────────────
    op.drop_table('org_notification_preferences', schema='platform')

    # ── 8. Revert platform.organizations columns ───────────────────────────
    op.drop_column('organizations', 'readiness_score', schema='platform')
    op.drop_column('organizations', 'banner_thumbnail_url', schema='platform')
    op.drop_column('organizations', 'event_count', schema='platform')
    op.drop_column('organizations', 'is_platform_org', schema='platform')

    # ── 7. Drop billing.credit_notes ──────────────────────────────────────
    op.drop_table('credit_notes', schema='billing')

    # ── 6. Drop billing.financial_audit_trail ─────────────────────────────
    op.drop_index('idx_financial_audit_trail_type', table_name='financial_audit_trail', schema='billing')
    op.drop_index('idx_financial_audit_trail_org_time', table_name='financial_audit_trail', schema='billing')
    op.drop_table('financial_audit_trail', schema='billing')

    # ── 5. Drop billing.payment_gateways ──────────────────────────────────
    op.drop_table('payment_gateways', schema='billing')

    # ── 4. Drop billing.org_credits ───────────────────────────────────────
    op.drop_index('idx_org_credits_org', table_name='org_credits', schema='billing')
    op.drop_table('org_credits', schema='billing')

    # ── 3. Drop billing.subscription_analytics ────────────────────────────
    op.drop_table('subscription_analytics', schema='billing')

    # ── 2. Remove seeded addon_features rows ──────────────────────────────
    op.execute("""
        DELETE FROM billing.addon_features af
        USING billing.addons a, platform.feature_catalog f
        WHERE af.addon_id = a.id
          AND af.feature_id = f.id
          AND (a.key, f.key) IN (
            ('ADDON_DIGITAL_SIGNAGE',  'FEAT_DIGITAL_SIGNAGE'),
            ('ADDON_VENUE_READY_ROOM', 'FEAT_READY_ROOM'),
            ('ADDON_VENUE_READY_ROOM', 'FEAT_SPEAKER_CHECKIN'),
            ('ADDON_WHITE_LABEL',      'FEAT_CUSTOM_DOMAIN'),
            ('ADDON_MOBILE_APP',       'FEAT_MOBILE_APP')
          )
    """)

    # ── 1. Revert billing.event_activations columns ───────────────────────
    op.execute(
        "ALTER TABLE billing.event_activations DROP COLUMN IF EXISTS activated_addons"
    )
    op.drop_column('event_activations', 'license_value_inr', schema='billing')
    op.drop_column('event_activations', 'auto_renew', schema='billing')
    op.drop_column('event_activations', 'activation_period_days', schema='billing')
    op.drop_column('event_activations', 'is_locked', schema='billing')
    op.drop_column('event_activations', 'payment_reference', schema='billing')
    op.drop_column('event_activations', 'gst_pct', schema='billing')
    op.drop_column('event_activations', 'gst_amount', schema='billing')
