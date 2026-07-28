"""subscription_plans_v2

Revision ID: 922d300bd1ba
Revises: 511d300bd1ba
Create Date: 2026-06-13 02:01:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '922d300bd1ba'
down_revision: Union[str, None] = '511d300bd1ba'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1A — Add missing limit columns to billing.subscription_plans
    op.add_column('subscription_plans', sa.Column('max_speakers', sa.Integer(), nullable=True), schema='billing')
    op.add_column('subscription_plans', sa.Column('max_sessions', sa.Integer(), nullable=True), schema='billing')
    op.add_column('subscription_plans', sa.Column('max_ticket_categories', sa.Integer(), nullable=True), schema='billing')
    op.add_column('subscription_plans', sa.Column('max_badge_templates', sa.Integer(), nullable=True), schema='billing')
    op.add_column('subscription_plans', sa.Column('max_certificate_templates', sa.Integer(), nullable=True), schema='billing')
    op.add_column('subscription_plans', sa.Column('currency', sa.String(3), nullable=False, server_default='INR'), schema='billing')
    op.add_column('subscription_plans', sa.Column('price_per_event_min', sa.Numeric(12,2), nullable=True), schema='billing')
    op.add_column('subscription_plans', sa.Column('price_per_event_max', sa.Numeric(12,2), nullable=True), schema='billing')
    op.add_column('subscription_plans', sa.Column('billing_model', sa.String(20), nullable=False, server_default='PER_EVENT'), schema='billing')
    # billing_model: 'PER_EVENT' | 'MONTHLY' | 'ANNUAL' | 'CUSTOM'
    op.add_column('subscription_plans', sa.Column('display_order', sa.Integer(), nullable=False, server_default='0'), schema='billing')
    op.add_column('subscription_plans', sa.Column('is_popular', sa.Boolean(), nullable=False, server_default='false'), schema='billing')
    op.add_column('subscription_plans', sa.Column('color_hex', sa.String(7), nullable=True), schema='billing')
    op.add_column('subscription_plans', sa.Column('tagline', sa.String(200), nullable=True), schema='billing')

    # Set server defaults for created_at/updated_at and other columns so raw inserts succeed
    op.alter_column('subscription_plans', 'created_at', server_default=sa.text('now()'), schema='billing')
    op.alter_column('subscription_plans', 'updated_at', server_default=sa.text('now()'), schema='billing')
    op.alter_column('subscription_plans', 'max_registrations', nullable=True, schema='billing')
    op.alter_column('subscription_plans', 'max_rooms', nullable=True, schema='billing')
    
    op.alter_column('addons', 'created_at', server_default=sa.text('now()'), schema='billing')
    op.alter_column('addons', 'monthly_price', server_default='0.0', schema='billing')
    op.alter_column('addons', 'yearly_price', server_default='0.0', schema='billing')
    
    op.alter_column('feature_catalog', 'created_at', server_default=sa.text('now()'), schema='platform')
    op.alter_column('feature_catalog', 'is_addon', server_default='false', schema='platform')
    op.alter_column('feature_catalog', 'is_billable', server_default='false', schema='platform')

    # 1B — Expand billing.addons for the 7 defined add-ons
    op.add_column('addons', sa.Column('key', sa.String(100), nullable=True), schema='billing')
    op.execute("UPDATE billing.addons SET key = UPPER(REPLACE(name, ' ', '_')) WHERE key IS NULL")
    op.alter_column('addons', 'key', nullable=False, schema='billing')
    op.create_unique_constraint('uq_addons_key', 'addons', ['key'], schema='billing')

    op.add_column('addons', sa.Column('price_inr', sa.Numeric(12,2), nullable=True), schema='billing')
    op.add_column('addons', sa.Column('billing_unit', sa.String(20), nullable=True), schema='billing')
    # billing_unit: 'PER_EVENT' | 'PER_MONTH' | 'CUSTOM'
    op.add_column('addons', sa.Column('available_for_plans', sa.ARRAY(sa.String()), nullable=True), schema='billing')
    # e.g. ['PROFESSIONAL', 'ENTERPRISE'] — plans this add-on can be purchased for
    op.add_column('addons', sa.Column('is_optional_for_plan', sa.String(50), nullable=True), schema='billing')
    # if set to 'PROFESSIONAL', means it's "Optional Add-On" for that plan tier
    op.add_column('addons', sa.Column('included_in_plan', sa.String(50), nullable=True), schema='billing')
    # if set to 'ENTERPRISE', means it's included (not extra cost) for that plan
    op.add_column('addons', sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'), schema='billing')
    op.add_column('addons', sa.Column('features_spec', postgresql.JSONB(astext_type=sa.Text()), nullable=True), schema='billing')

    # 1C — Feature catalog: add category ordering
    op.add_column('feature_catalog', sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'), schema='platform')
    op.add_column('feature_catalog', sa.Column('category_order', sa.Integer(), nullable=False, server_default='0'), schema='platform')
    op.add_column('feature_catalog', sa.Column('feature_order', sa.Integer(), nullable=False, server_default='0'), schema='platform')
    op.add_column('feature_catalog', sa.Column('display_value_basic', sa.String(200), nullable=True), schema='platform')
    op.add_column('feature_catalog', sa.Column('display_value_professional', sa.String(200), nullable=True), schema='platform')
    op.add_column('feature_catalog', sa.Column('display_value_enterprise', sa.String(200), nullable=True), schema='platform')

    # 1D — Seed the 3 plans
    op.execute("""
    INSERT INTO billing.subscription_plans 
        (id, name, tagline, billing_model, currency, 
         price_per_event_min, price_per_event_max,
         max_events, max_users, max_registrations, max_speakers,
         max_sessions, max_rooms, max_ticket_categories,
         max_badge_templates, max_certificate_templates,
         storage_quota_mb, display_order, is_popular, 
         color_hex, is_active)
    VALUES
        (gen_random_uuid(), 'Basic', 
         'Registration + Speaker Management',
         'PER_EVENT', 'INR', 15000, 25000,
         1, 2, 150, 30, 25, 5, 3, 3, 3,
         10240, 1, false, '#64748B', true),
        
        (gen_random_uuid(), 'Professional',
         'Registration + Speaker + Campaigns + Venue Operations',
         'PER_EVENT', 'INR', 60000, 120000,
         1, 10, 1000, 100, 100, 20, 10, NULL, NULL,
         51200, 2, true, '#4F46E5', true),
        
        (gen_random_uuid(), 'Enterprise',
         'Complete Conference Ecosystem',
         'PER_EVENT', 'INR', 250000, NULL,
         1, 50, NULL, 500, NULL, NULL, NULL, NULL, NULL,
         204800, 3, false, '#7C3AED', true)
    ON CONFLICT DO NOTHING;
    """)

    # 1E — Seed the 7 add-ons
    op.execute("""
    INSERT INTO billing.addons
        (id, name, key, description, price_inr, billing_unit,
         available_for_plans, is_optional_for_plan, included_in_plan, is_active)
    VALUES
        (gen_random_uuid(), 'WhatsApp Integration', 'ADDON_WHATSAPP',
         'WhatsApp notifications and communication for attendees and speakers',
         10000, 'PER_EVENT',
         ARRAY['PROFESSIONAL','ENTERPRISE'], 'PROFESSIONAL', 'ENTERPRISE', true),
        
        (gen_random_uuid(), 'ePoster Module', 'ADDON_EPOSTER',
         'Digital ePoster display and management system',
         25000, 'PER_EVENT',
         ARRAY['PROFESSIONAL','ENTERPRISE'], 'PROFESSIONAL', 'ENTERPRISE', true),
        
        (gen_random_uuid(), 'Digital Signage', 'ADDON_DIGITAL_SIGNAGE',
         'Digital signage displays for venue wayfinding and announcements',
         20000, 'PER_EVENT',
         ARRAY['PROFESSIONAL','ENTERPRISE'], 'PROFESSIONAL', 'ENTERPRISE', true),
        
        (gen_random_uuid(), 'Venue Ready Room Setup', 'ADDON_VENUE_READY_ROOM',
         'Complete Ready Room setup with SRR stations and device management',
         30000, 'PER_EVENT',
         ARRAY['PROFESSIONAL','ENTERPRISE'], NULL, NULL, true),
        
        (gen_random_uuid(), 'Onsite Technical Team', 'ADDON_ONSITE_TECH',
         'Dedicated technical support team present at your venue',
         NULL, 'CUSTOM',
         ARRAY['BASIC','PROFESSIONAL','ENTERPRISE'], NULL, 'ENTERPRISE', true),
        
        (gen_random_uuid(), 'White Label Deployment', 'ADDON_WHITE_LABEL',
         'Remove all Event branding, use your own domain and identity',
         50000, 'PER_EVENT',
         ARRAY['ENTERPRISE'], NULL, NULL, true),
        
        (gen_random_uuid(), 'Dedicated Mobile App', 'ADDON_MOBILE_APP',
         'Custom-branded mobile app for attendees on iOS and Android',
         75000, 'PER_EVENT',
         ARRAY['ENTERPRISE'], NULL, NULL, true)
    ON CONFLICT (key) DO NOTHING;
    """)

    # 1F — Seed the COMPLETE feature catalog
    op.execute("""
    INSERT INTO platform.feature_catalog
        (id, key, name, category, category_order, feature_order,
         description, is_active,
         display_value_basic, display_value_professional, display_value_enterprise)
    VALUES
    (gen_random_uuid(), 'LIMIT_ORGANIZER_USERS', 'Organizer Users', 'PLATFORM_LIMITS', 1, 1, 'Maximum organizer/staff users allowed', true, '2', '10', '50'),
    (gen_random_uuid(), 'LIMIT_REGISTRATIONS', 'Registrations', 'PLATFORM_LIMITS', 1, 2, 'Maximum attendee registrations per event', true, 'Up to 150', 'Up to 1,000', 'Unlimited'),
    (gen_random_uuid(), 'LIMIT_SPEAKERS', 'Speakers', 'PLATFORM_LIMITS', 1, 3, 'Maximum speakers per event', true, 'Up to 30', 'Up to 100', 'Up to 500'),
    (gen_random_uuid(), 'LIMIT_SESSIONS', 'Sessions', 'PLATFORM_LIMITS', 1, 4, 'Maximum sessions per event', true, 'Up to 25', 'Up to 100', 'Unlimited'),
    (gen_random_uuid(), 'LIMIT_ROOMS', 'Rooms', 'PLATFORM_LIMITS', 1, 5, 'Maximum rooms/halls per event', true, 'Up to 5', 'Up to 20', 'Unlimited'),
    (gen_random_uuid(), 'LIMIT_STORAGE', 'Storage', 'PLATFORM_LIMITS', 1, 6, 'File storage quota', true, '10 GB', '50 GB', '200 GB+ (Custom)'),
    (gen_random_uuid(), 'FEAT_EVENT_WEBSITE', 'Event Website', 'PLATFORM_LIMITS', 1, 7, 'Event website quality and customization', true, 'Basic', 'Customizable', 'Fully Branded'),
    (gen_random_uuid(), 'FEAT_CUSTOM_DOMAIN', 'Custom Domain', 'PLATFORM_LIMITS', 1, 8, 'Use your own domain name for portals', true, '❌', '✅', '✅'),
    (gen_random_uuid(), 'FEAT_WHITE_LABEL', 'White Label', 'PLATFORM_LIMITS', 1, 9, 'Remove all Event branding', true, '❌', '❌', '✅'),
    (gen_random_uuid(), 'FEAT_REGISTRATION_PORTAL', 'Registration Portal', 'REGISTRATION', 2, 1, 'Attendee-facing registration portal', true, 'Basic', 'Advanced', 'Enterprise'),
    (gen_random_uuid(), 'FEAT_REGISTRATION_FORMS', 'Registration Forms', 'REGISTRATION', 2, 2, 'Custom registration form fields', true, 'Standard (Up to 10 Fields)', 'Custom (Unlimited)', 'Custom (Unlimited)'),
    (gen_random_uuid(), 'FEAT_TICKET_CATEGORIES', 'Ticket Categories', 'REGISTRATION', 2, 3, 'Number of registration ticket types', true, '3', '10', 'Unlimited'),
    (gen_random_uuid(), 'FEAT_COUPON_CODES', 'Coupon Codes', 'REGISTRATION', 2, 4, 'Promotional discount codes for registration', true, '❌', '✅', '✅'),
    (gen_random_uuid(), 'FEAT_PAYMENT_GATEWAY', 'Payment Gateway Integration', 'REGISTRATION', 2, 5, 'Online payment collection for registrations', true, '✅', '✅', '✅'),
    (gen_random_uuid(), 'FEAT_REGISTRATION_ANALYTICS', 'Registration Analytics', 'REGISTRATION', 2, 6, 'Registration data reporting and insights', true, 'Basic', 'Advanced', 'Advanced'),
    (gen_random_uuid(), 'FEAT_BULK_IMPORT', 'Bulk Registration Import', 'REGISTRATION', 2, 7, 'Import attendees via CSV/Excel', true, '❌', '✅', '✅'),
    (gen_random_uuid(), 'FEAT_QR_CONFIRMATION', 'QR Registration Confirmation', 'REGISTRATION', 2, 8, 'QR code in confirmation email for check-in', true, '✅', '✅', '✅'),
    (gen_random_uuid(), 'FEAT_ATTENDEE_CHECKIN', 'Attendee Check-In', 'REGISTRATION', 2, 9, 'Attendee check-in system at venue', true, 'Basic', 'Advanced', 'Enterprise'),
    (gen_random_uuid(), 'FEAT_SPEAKER_PORTAL', 'Speaker Portal', 'SPEAKER_MANAGEMENT', 3, 1, 'Speaker-facing portal for profile and file uploads', true, 'Partial', 'Full', 'Full'),
    (gen_random_uuid(), 'FEAT_ABSTRACT_SUBMISSION', 'Abstract Submission', 'SPEAKER_MANAGEMENT', 3, 2, 'Call for papers and abstract review workflow', true, '❌', 'Advanced', 'Advanced'),
    (gen_random_uuid(), 'FEAT_FILE_UPLOADS', 'File Uploads', 'SPEAKER_MANAGEMENT', 3, 3, 'Speaker presentation file upload system', true, '✅', '✅', '✅'),
    (gen_random_uuid(), 'FEAT_PRESENTATION_VALIDATION', 'Presentation Validation', 'SPEAKER_MANAGEMENT', 3, 4, 'Automated deep file validation on upload', true, 'Basic', 'Advanced', 'Advanced'),
    (gen_random_uuid(), 'FEAT_SPEAKER_DASHBOARD', 'Speaker Dashboard', 'SPEAKER_MANAGEMENT', 3, 5, 'Speaker self-service dashboard', true, 'Basic', 'Advanced', 'Advanced'),
    (gen_random_uuid(), 'FEAT_SPEAKER_COMMS', 'Speaker Communications', 'SPEAKER_MANAGEMENT', 3, 6, 'Automated emails and notifications to speakers', true, 'Basic', 'Advanced', 'Advanced'),
    (gen_random_uuid(), 'FEAT_SPEAKER_PROFILES', 'Speaker Profiles', 'SPEAKER_MANAGEMENT', 3, 7, 'Public speaker profile pages', true, 'Basic', 'Customizable', 'Fully Custom'),
    (gen_random_uuid(), 'FEAT_MULTI_PRESENTATION_VERSIONS', 'Multiple Presentation Versions', 'SPEAKER_MANAGEMENT', 3, 8, 'Speakers can upload multiple file versions', true, '❌', '✅', '✅'),
    (gen_random_uuid(), 'FEAT_BADGE_TEMPLATES', 'Badge Templates', 'BADGE_CERTIFICATE', 4, 1, 'Number of badge design templates available', true, '3', 'Unlimited', 'Unlimited'),
    (gen_random_uuid(), 'FEAT_CERTIFICATE_TEMPLATES', 'Certificate Templates', 'BADGE_CERTIFICATE', 4, 2, 'Number of certificate design templates available', true, '3', 'Unlimited', 'Unlimited'),
    (gen_random_uuid(), 'FEAT_CUSTOM_BADGE_DESIGN', 'Custom Badge Design', 'BADGE_CERTIFICATE', 4, 3, 'Fully custom badge layout and design', true, '❌', '✅', '✅'),
    (gen_random_uuid(), 'FEAT_CUSTOM_CERT_DESIGN', 'Custom Certificate Design', 'BADGE_CERTIFICATE', 4, 4, 'Fully custom certificate layout and design', true, '❌', '✅', '✅'),
    (gen_random_uuid(), 'FEAT_QR_BADGE', 'QR Badge Generation', 'BADGE_CERTIFICATE', 4, 5, 'QR codes on badges for scanning', true, '✅', '✅', '✅'),
    (gen_random_uuid(), 'FEAT_BULK_BADGE_EXPORT', 'Bulk Badge Export', 'BADGE_CERTIFICATE', 4, 6, 'Export all badges as ZIP for bulk printing', true, '❌', '✅', '✅'),
    (gen_random_uuid(), 'FEAT_AUTO_CERTIFICATE', 'Auto Certificate Generation', 'BADGE_CERTIFICATE', 4, 7, 'Automatic certificate generation on attendance', true, '✅', '✅', '✅'),
    (gen_random_uuid(), 'FEAT_EMAIL_NOTIFICATIONS', 'Email Notifications', 'COMMUNICATIONS', 5, 1, 'Transactional email notifications', true, '✅', '✅', '✅'),
    (gen_random_uuid(), 'FEAT_REMINDER_EMAILS', 'Reminder Emails', 'COMMUNICATIONS', 5, 2, 'Automated reminder email sequences', true, '✅', '✅', '✅'),
    (gen_random_uuid(), 'FEAT_CAMPAIGN_MGMT', 'Campaign Management', 'COMMUNICATIONS', 5, 3, 'Email campaign creation and scheduling', true, '❌', '✅', '✅'),
    (gen_random_uuid(), 'FEAT_BULK_EMAIL', 'Bulk Email Campaigns', 'COMMUNICATIONS', 5, 4, 'Send bulk emails to attendees/speakers', true, '❌', '✅', '✅'),
    (gen_random_uuid(), 'FEAT_ANNOUNCEMENT_CENTER', 'Announcement Center', 'COMMUNICATIONS', 5, 5, 'In-portal announcement management', true, '❌', '✅', '✅'),
    (gen_random_uuid(), 'FEAT_PUSH_NOTIFICATIONS', 'Push Notifications', 'COMMUNICATIONS', 5, 6, 'Mobile push notifications', true, '❌', '✅', '✅'),
    (gen_random_uuid(), 'FEAT_WHATSAPP', 'WhatsApp Integration', 'COMMUNICATIONS', 5, 7, 'WhatsApp messaging for speakers and attendees', true, '❌', 'Optional Add-On', '✅'),
    (gen_random_uuid(), 'FEAT_SMS', 'SMS Integration', 'COMMUNICATIONS', 5, 8, 'SMS notifications and OTPs', true, '❌', 'Optional Add-On', '✅'),
    (gen_random_uuid(), 'FEAT_DEFAULT_THEME', 'Default Theme', 'BRANDING', 6, 1, 'Standard Event theme for all portals', true, '✅', '✅', '✅'),
    (gen_random_uuid(), 'FEAT_THEME_CUSTOMIZATION', 'Theme Customization', 'BRANDING', 6, 2, 'Customize portal themes', true, '❌', '✅', '✅'),
    (gen_random_uuid(), 'FEAT_CUSTOM_COLORS', 'Custom Colors', 'BRANDING', 6, 3, 'Brand-matching color schemes', true, '❌', '✅', '✅'),
    (gen_random_uuid(), 'FEAT_CUSTOM_FONTS', 'Custom Fonts', 'BRANDING', 6, 4, 'Custom typography selection', true, '❌', 'Limited', 'Unlimited'),
    (gen_random_uuid(), 'FEAT_LOGO_BRANDING', 'Logo Branding', 'BRANDING', 6, 5, 'Organization logo on all portals', true, 'Basic', 'Advanced', 'Full White Label'),
    (gen_random_uuid(), 'FEAT_CUSTOM_LOGIN_PAGE', 'Custom Login Page', 'BRANDING', 6, 6, 'Fully branded login experience', true, '❌', '❌', '✅'),
    (gen_random_uuid(), 'FEAT_EMAIL_SUPPORT', 'Email Support', 'SUPPORT', 7, 1, 'Email-based customer support', true, '✅', '✅', '✅'),
    (gen_random_uuid(), 'FEAT_OFFICE_HOURS_SUPPORT', 'Office Hours Support', 'SUPPORT', 7, 2, 'Support during business hours', true, '✅', '✅', '❌'),
    (gen_random_uuid(), 'FEAT_PRIORITY_SUPPORT', 'Priority Support', 'SUPPORT', 7, 3, 'Priority queue for support tickets', true, '❌', '✅', '✅'),
    (gen_random_uuid(), 'FEAT_DEDICATED_MANAGER', 'Dedicated Account Manager', 'SUPPORT', 7, 4, 'Personal account manager assigned', true, '❌', '❌', '✅'),
    (gen_random_uuid(), 'FEAT_24x7_SUPPORT', '24×7 Support', 'SUPPORT', 7, 5, 'Round-the-clock support availability', true, '❌', '✅', '✅'),
    (gen_random_uuid(), 'FEAT_SLA', 'SLA Commitment', 'SUPPORT', 7, 6, 'Formal service level agreement', true, '❌', '❌', '✅'),
    (gen_random_uuid(), 'FEAT_MOBILE_APP', 'Mobile App Support', 'MOBILE_INTEGRATIONS', 8, 1, 'Mobile app access for attendees', true, '❌', 'External App Support', 'Full Mobile App'),
    (gen_random_uuid(), 'FEAT_EVENT_APP_BRANDING', 'Event App Branding', 'MOBILE_INTEGRATIONS', 8, 2, 'Branded mobile app experience', true, '❌', 'Basic', 'Fully Branded'),
    (gen_random_uuid(), 'FEAT_API_ACCESS', 'API Access', 'MOBILE_INTEGRATIONS', 8, 3, 'REST API for integrations', true, '❌', 'Limited', 'Full'),
    (gen_random_uuid(), 'FEAT_WEBHOOKS', 'Webhooks', 'MOBILE_INTEGRATIONS', 8, 4, 'Event-driven webhook notifications', true, '❌', 'Limited', 'Full'),
    (gen_random_uuid(), 'FEAT_THIRD_PARTY_INTEGRATIONS', 'Third-Party Integrations', 'MOBILE_INTEGRATIONS', 8, 5, 'Connect with external tools and services', true, '❌', 'Basic', 'Enterprise'),
    (gen_random_uuid(), 'FEAT_VENUE_SUPPORT', 'Venue Support', 'VENUE_OPERATIONS', 9, 1, 'Onsite venue operational support', true, 'On Demand', 'On Demand', 'Priority'),
    (gen_random_uuid(), 'FEAT_READY_ROOM', 'Ready Room Operations', 'VENUE_OPERATIONS', 9, 2, 'Speaker ready room check-in and management', true, '❌', '✅', '✅'),
    (gen_random_uuid(), 'FEAT_SPEAKER_CHECKIN', 'Speaker Check-In', 'VENUE_OPERATIONS', 9, 3, 'Venue SRR station speaker check-in', true, '❌', '✅', '✅'),
    (gen_random_uuid(), 'FEAT_SESSION_QUEUE', 'Session Queue Management', 'VENUE_OPERATIONS', 9, 4, 'Presentation queue and scheduling display', true, '❌', '✅', '✅'),
    (gen_random_uuid(), 'FEAT_DEVICE_MONITORING', 'Device Monitoring', 'VENUE_OPERATIONS', 9, 5, 'Venue device health and status monitoring', true, '❌', '✅', '✅'),
    (gen_random_uuid(), 'FEAT_DIGITAL_SIGNAGE', 'Digital Signage', 'VENUE_OPERATIONS', 9, 6, 'Digital display management system', true, '❌', 'Optional', '✅'),
    (gen_random_uuid(), 'FEAT_EPOSTER_MGMT', 'ePoster Management', 'VENUE_OPERATIONS', 9, 7, 'Electronic poster session management', true, '❌', 'Optional', '✅'),
    (gen_random_uuid(), 'FEAT_VENUE_SYNC', 'Venue Sync Services', 'VENUE_OPERATIONS', 9, 8, 'File synchronization to venue devices', true, '❌', '✅', '✅'),
    (gen_random_uuid(), 'FEAT_ONSITE_TECH_SUPPORT', 'Onsite Technical Support', 'VENUE_OPERATIONS', 9, 9, 'Technical team present at venue during event', true, 'Paid', 'Paid', 'Included Option')
    ON CONFLICT (key) DO NOTHING;
    """)

    # 1G — Wire plan features
    op.execute("""
    DO $$
    DECLARE
        basic_id uuid;
        pro_id uuid;
        ent_id uuid;
    BEGIN
        SELECT id INTO basic_id FROM billing.subscription_plans WHERE name = 'Basic' LIMIT 1;
        SELECT id INTO pro_id FROM billing.subscription_plans WHERE name = 'Professional' LIMIT 1;
        SELECT id INTO ent_id FROM billing.subscription_plans WHERE name = 'Enterprise' LIMIT 1;

        -- Basic plan: only ✅ features (where display_value_basic != '❌')
        INSERT INTO billing.plan_features (plan_id, feature_id, enabled)
        SELECT basic_id, id, 
               CASE WHEN display_value_basic = '❌' THEN false ELSE true END
        FROM platform.feature_catalog
        ON CONFLICT (plan_id, feature_id) DO UPDATE SET enabled = EXCLUDED.enabled;

        -- Professional plan: features where display_value_professional != '❌'
        INSERT INTO billing.plan_features (plan_id, feature_id, enabled)
        SELECT pro_id, id,
               CASE WHEN display_value_professional = '❌' THEN false ELSE true END
        FROM platform.feature_catalog
        ON CONFLICT (plan_id, feature_id) DO UPDATE SET enabled = EXCLUDED.enabled;

        -- Enterprise plan: all features enabled except FEAT_OFFICE_HOURS_SUPPORT
        INSERT INTO billing.plan_features (plan_id, feature_id, enabled)
        SELECT ent_id, id,
               CASE WHEN display_value_enterprise = '❌' THEN false ELSE true END
        FROM platform.feature_catalog
        ON CONFLICT (plan_id, feature_id) DO UPDATE SET enabled = EXCLUDED.enabled;

    END $$;
    """)

    op.execute("""
    DO $$ BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'uq_plan_features_plan_feature'
        ) THEN
            ALTER TABLE billing.plan_features 
            ADD CONSTRAINT uq_plan_features_plan_feature 
            UNIQUE (plan_id, feature_id);
        END IF;
    END $$;
    """)


def downgrade() -> None:
    # Remove seeded data
    op.execute("DELETE FROM billing.plan_features")
    op.execute("DELETE FROM billing.addons WHERE key LIKE 'ADDON_%'")
    op.execute("DELETE FROM billing.subscription_plans WHERE name IN ('Basic','Professional','Enterprise')")
    op.execute("DELETE FROM platform.feature_catalog WHERE key LIKE 'FEAT_%' OR key LIKE 'LIMIT_%'")

    # Remove added columns
    for col in ['max_speakers','max_sessions','max_ticket_categories',
                'max_badge_templates','max_certificate_templates',
                'currency','price_per_event_min','price_per_event_max',
                'billing_model','display_order','is_popular',
                'color_hex','tagline']:
        op.drop_column('subscription_plans', col, schema='billing')

    op.drop_constraint('uq_addons_key', 'addons', schema='billing', type_='unique')
    for col in ['key','price_inr','billing_unit','available_for_plans',
                'is_optional_for_plan','included_in_plan','is_active','features_spec']:
        op.drop_column('addons', col, schema='billing')

    for col in ['category_order','feature_order',
                'display_value_basic','display_value_professional',
                'display_value_enterprise','is_active']:
        op.drop_column('feature_catalog', col, schema='platform')

    # Revert server defaults
    op.alter_column('subscription_plans', 'created_at', server_default=None, schema='billing')
    op.alter_column('subscription_plans', 'updated_at', server_default=None, schema='billing')
    op.execute("UPDATE billing.subscription_plans SET max_registrations = 1000 WHERE max_registrations IS NULL")
    op.execute("UPDATE billing.subscription_plans SET max_rooms = 10 WHERE max_rooms IS NULL")
    op.alter_column('subscription_plans', 'max_registrations', nullable=False, schema='billing')
    op.alter_column('subscription_plans', 'max_rooms', nullable=False, schema='billing')
    
    op.alter_column('addons', 'created_at', server_default=None, schema='billing')
    op.alter_column('addons', 'monthly_price', server_default=None, schema='billing')
    op.alter_column('addons', 'yearly_price', server_default=None, schema='billing')
    
    op.alter_column('feature_catalog', 'created_at', server_default=None, schema='platform')
    op.alter_column('feature_catalog', 'is_addon', server_default=None, schema='platform')
    op.alter_column('feature_catalog', 'is_billable', server_default=None, schema='platform')
