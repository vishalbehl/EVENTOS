"""create and align portal theme settings table

Revision ID: 20260828_2000
Revises: 20260828_1920
"""

from alembic import op


revision = "20260828_2000"
down_revision = "20260828_1920"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS design")
    
    # Rename if legacy table exists
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_schema = 'design' AND table_name = 'registration_theme_settings'
            ) AND NOT EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_schema = 'design' AND table_name = 'portal_theme_settings'
            ) THEN
                ALTER TABLE design.registration_theme_settings RENAME TO portal_theme_settings;
            END IF;
        END $$;
    """)

    # Create table if not exists
    op.execute("""
        CREATE TABLE IF NOT EXISTS design.portal_theme_settings (
            id UUID PRIMARY KEY,
            event_id UUID NOT NULL REFERENCES events.events(id) ON DELETE CASCADE UNIQUE,
            theme_color VARCHAR(32),
            primary_color VARCHAR(32) DEFAULT '#6366F1',
            secondary_color VARCHAR(32) DEFAULT '#A855F7',
            theme_preset VARCHAR(64) DEFAULT 'dark-luxury',
            svg_pattern VARCHAR(64) DEFAULT 'glow-wave',
            dark_mode_default BOOLEAN DEFAULT TRUE,
            font_family VARCHAR(64),
            custom_css TEXT,
            logo_url VARCHAR(512),
            banner_url VARCHAR(512),
            favicon_url VARCHAR(512),
            theme VARCHAR(64) DEFAULT 'light',
            header_images JSONB DEFAULT '[]'::jsonb,
            tagline VARCHAR(255),
            hero_description TEXT,
            stats JSONB DEFAULT '[]'::jsonb,
            use_dynamic_stats BOOLEAN DEFAULT TRUE,
            terms_and_conditions TEXT,
            faqs JSONB DEFAULT '[]'::jsonb,
            include_default_faqs BOOLEAN DEFAULT TRUE,
            program_url VARCHAR(512),
            speaker_guidelines_url VARCHAR(512),
            presentation_template_url VARCHAR(512),
            support_email VARCHAR(255),
            support_phone VARCHAR(64),
            additional_contacts JSONB DEFAULT '[]'::jsonb,
            enabled BOOLEAN DEFAULT TRUE,
            registration_allowed BOOLEAN DEFAULT TRUE,
            participants_list_allowed BOOLEAN DEFAULT FALSE,
            window_required BOOLEAN DEFAULT FALSE,
            profile_settings JSONB DEFAULT '{}'::jsonb,
            payment_enabled BOOLEAN DEFAULT FALSE,
            active_gateway VARCHAR(32) DEFAULT 'manual',
            stripe_credentials JSONB,
            encrypted_stripe_credentials TEXT,
            tier_cutoffs JSONB DEFAULT '{}'::jsonb,
            disabled_categories JSONB DEFAULT '[]'::jsonb,
            extra_settings JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        );
    """)

    # Ensure all columns exist if created from older schema
    columns = (
        ("primary_color", "VARCHAR(32) DEFAULT '#6366F1'"),
        ("secondary_color", "VARCHAR(32) DEFAULT '#A855F7'"),
        ("theme_preset", "VARCHAR(64) DEFAULT 'dark-luxury'"),
        ("svg_pattern", "VARCHAR(64) DEFAULT 'glow-wave'"),
        ("dark_mode_default", "BOOLEAN DEFAULT TRUE"),
        ("font_family", "VARCHAR(64)"),
        ("custom_css", "TEXT"),
        ("favicon_url", "VARCHAR(512)"),
        ("tagline", "VARCHAR(255)"),
        ("hero_description", "TEXT"),
        ("stats", "JSONB DEFAULT '[]'::jsonb"),
        ("use_dynamic_stats", "BOOLEAN DEFAULT TRUE"),
        ("program_url", "VARCHAR(512)"),
        ("speaker_guidelines_url", "VARCHAR(512)"),
        ("presentation_template_url", "VARCHAR(512)"),
        ("support_email", "VARCHAR(255)"),
        ("support_phone", "VARCHAR(64)"),
        ("additional_contacts", "JSONB DEFAULT '[]'::jsonb"),
        ("window_required", "BOOLEAN DEFAULT FALSE"),
        ("profile_settings", "JSONB DEFAULT '{}'::jsonb"),
    )
    for col, col_type in columns:
        op.execute(f"ALTER TABLE design.portal_theme_settings ADD COLUMN IF NOT EXISTS {col} {col_type}")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS design.portal_theme_settings CASCADE")
