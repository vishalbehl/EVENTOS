"""align main backend with registration database contract

Revision ID: 20260808_1010
Revises: 20260808_1000
Create Date: 2026-08-08
"""

from alembic import op


revision = "20260808_1010"
down_revision = "20260808_1000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS identity")
    op.execute("CREATE SCHEMA IF NOT EXISTS registration")
    op.execute("CREATE SCHEMA IF NOT EXISTS venue")
    op.execute("ALTER TABLE identity.organizations ADD COLUMN IF NOT EXISTS logo_url TEXT")
    op.execute("ALTER TABLE identity.organizations ADD COLUMN IF NOT EXISTS plan VARCHAR(50) NOT NULL DEFAULT 'trial'")
    op.execute("ALTER TABLE identity.organizations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()")
    op.execute("ALTER TABLE identity.organizations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()")

    op.execute("ALTER TABLE events.events ADD COLUMN IF NOT EXISTS speaker_settings JSONB NOT NULL DEFAULT '{\"enabled\": true}'::jsonb")
    op.execute("ALTER TABLE events.events ADD COLUMN IF NOT EXISTS registration_settings JSONB NOT NULL DEFAULT '{\"enabled\": true}'::jsonb")
    op.execute("ALTER TABLE events.events ADD COLUMN IF NOT EXISTS branding_settings JSONB NOT NULL DEFAULT '{\"theme_color\": \"#1A73E8\"}'::jsonb")
    op.execute("UPDATE events.events SET speaker_settings = COALESCE(licensing_details->'speaker_settings', speaker_settings) WHERE licensing_details IS NOT NULL")
    op.execute("UPDATE events.events SET registration_settings = COALESCE(licensing_details->'registration_settings', registration_settings) WHERE licensing_details IS NOT NULL")
    op.execute("UPDATE events.events SET branding_settings = COALESCE(licensing_details->'branding_settings', branding_settings) WHERE licensing_details IS NOT NULL")

    op.execute("ALTER TABLE registration.participants ADD COLUMN IF NOT EXISTS name VARCHAR(320)")
    op.execute("ALTER TABLE registration.participants ADD COLUMN IF NOT EXISTS role VARCHAR(150)")
    op.execute("UPDATE registration.participants SET name = COALESCE(name, NULLIF(trim(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), ''))")
    op.execute("UPDATE registration.participants SET role = COALESCE(role, 'Delegate')")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS registration.participant_roles (
            id UUID PRIMARY KEY,
            event_id UUID NOT NULL,
            category VARCHAR(100) NOT NULL DEFAULT 'General',
            name VARCHAR(150) NOT NULL,
            role_code VARCHAR(10) NOT NULL DEFAULT 'REG',
            is_active BOOLEAN NOT NULL DEFAULT true,
            is_default BOOLEAN NOT NULL DEFAULT false,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_registration_participant_roles_event_id ON registration.participant_roles(event_id)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS registration.participant_registrations (
            id UUID PRIMARY KEY,
            event_id UUID NOT NULL,
            participant_id UUID,
            registration_status VARCHAR(50) NOT NULL DEFAULT 'submitted',
            registration_data JSONB NOT NULL DEFAULT '{}'::jsonb,
            submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            reviewed_by UUID,
            reviewed_at TIMESTAMPTZ,
            review_notes TEXT,
            waitlist_position INTEGER,
            rejection_reason TEXT,
            approval_source VARCHAR(50) NOT NULL DEFAULT 'portal'
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_registration_participant_registrations_event_id ON registration.participant_registrations(event_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_registration_participant_registrations_participant_id ON registration.participant_registrations(participant_id)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS registration.participant_extensions (
            id UUID PRIMARY KEY,
            participant_id UUID NOT NULL UNIQUE,
            department VARCHAR(150),
            city VARCHAR(100),
            dietary_preference VARCHAR(100) DEFAULT 'Vegetarian',
            emergency_contact VARCHAR(100),
            notes VARCHAR(500),
            custom_attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_registration_participant_extensions_participant_id ON registration.participant_extensions(participant_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS registration.participant_extensions")
    op.execute("DROP TABLE IF EXISTS registration.participant_registrations")
    op.execute("DROP TABLE IF EXISTS registration.participant_roles")
    op.execute("ALTER TABLE registration.participants DROP COLUMN IF EXISTS role")
    op.execute("ALTER TABLE registration.participants DROP COLUMN IF EXISTS name")
    op.execute("ALTER TABLE events.events DROP COLUMN IF EXISTS branding_settings")
    op.execute("ALTER TABLE events.events DROP COLUMN IF EXISTS registration_settings")
    op.execute("ALTER TABLE events.events DROP COLUMN IF EXISTS speaker_settings")
