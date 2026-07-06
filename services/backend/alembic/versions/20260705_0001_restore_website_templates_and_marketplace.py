"""restore website templates and marketplace tables

Revision ID: 20260705_0001
Revises: 20260702_0005
Create Date: 2026-07-05 11:20:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "20260705_0001"
down_revision: Union[str, None] = "20260702_0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create templates table
    op.execute("""
        CREATE TABLE IF NOT EXISTS templates.templates (
            id UUID PRIMARY KEY,
            organization_id UUID REFERENCES platform.organizations(id) ON DELETE SET NULL,
            category_id UUID REFERENCES templates.template_categories(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            slug VARCHAR(255) NOT NULL,
            description TEXT,
            template_type VARCHAR(50) NOT NULL DEFAULT 'WEBSITE',
            status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
            visibility VARCHAR(50) NOT NULL DEFAULT 'PRIVATE',
            is_system BOOLEAN NOT NULL DEFAULT FALSE,
            is_marketplace BOOLEAN NOT NULL DEFAULT FALSE,
            current_version_id UUID,
            created_by UUID REFERENCES identity.users(id) ON DELETE SET NULL,
            updated_by UUID REFERENCES identity.users(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
            deleted_at TIMESTAMP WITH TIME ZONE,
            deleted_by UUID REFERENCES identity.users(id) ON DELETE SET NULL
        );
    """)

    # 2. Create template_versions table
    op.execute("""
        CREATE TABLE IF NOT EXISTS templates.template_versions (
            id UUID PRIMARY KEY,
            template_id UUID REFERENCES templates.templates(id) ON DELETE CASCADE,
            version_number INTEGER NOT NULL,
            description TEXT,
            content JSONB NOT NULL DEFAULT '{}'::jsonb,
            schema JSONB DEFAULT '{}'::jsonb,
            assets JSONB DEFAULT '{}'::jsonb,
            published_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
            published_by UUID REFERENCES identity.users(id) ON DELETE SET NULL
        );
    """)

    # 3. Add constraint current_version_id on templates
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE templates.templates 
            ADD CONSTRAINT fk_templates_current_version_id 
            FOREIGN KEY (current_version_id) REFERENCES templates.template_versions(id) ON DELETE SET NULL;
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)

    # 4. Create marketplace_listings
    op.execute("""
        CREATE TABLE IF NOT EXISTS templates.marketplace_listings (
            id UUID PRIMARY KEY,
            template_id UUID REFERENCES templates.templates(id) ON DELETE CASCADE,
            price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
            status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
        );
    """)

    # 5. Create marketplace_purchases
    op.execute("""
        CREATE TABLE IF NOT EXISTS templates.marketplace_purchases (
            id UUID PRIMARY KEY,
            listing_id UUID REFERENCES templates.marketplace_listings(id) ON DELETE CASCADE,
            organization_id UUID REFERENCES platform.organizations(id) ON DELETE CASCADE,
            price_paid NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
            purchased_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
        );
    """)

    # 6. Create marketplace_favorites
    op.execute("""
        CREATE TABLE IF NOT EXISTS templates.marketplace_favorites (
            id UUID PRIMARY KEY,
            user_id UUID REFERENCES identity.users(id) ON DELETE CASCADE,
            template_id UUID REFERENCES templates.templates(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
        );
    """)

    # 7. Create template_reviews
    op.execute("""
        CREATE TABLE IF NOT EXISTS templates.template_reviews (
            id UUID PRIMARY KEY,
            template_id UUID REFERENCES templates.templates(id) ON DELETE CASCADE,
            user_id UUID REFERENCES identity.users(id) ON DELETE CASCADE,
            rating INTEGER NOT NULL,
            review TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
        );
    """)

    # 8. Create template_installations
    op.execute("""
        CREATE TABLE IF NOT EXISTS templates.template_installations (
            id UUID PRIMARY KEY,
            organization_id UUID REFERENCES platform.organizations(id) ON DELETE CASCADE,
            event_id UUID REFERENCES events.events(id) ON DELETE CASCADE,
            template_id UUID REFERENCES templates.templates(id) ON DELETE CASCADE,
            installed_version_id UUID REFERENCES templates.template_versions(id) ON DELETE CASCADE,
            installed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
        );
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS templates.template_installations CASCADE;")
    op.execute("DROP TABLE IF EXISTS templates.template_reviews CASCADE;")
    op.execute("DROP TABLE IF EXISTS templates.marketplace_favorites CASCADE;")
    op.execute("DROP TABLE IF EXISTS templates.marketplace_purchases CASCADE;")
    op.execute("DROP TABLE IF EXISTS templates.marketplace_listings CASCADE;")
    op.execute("ALTER TABLE templates.templates DROP CONSTRAINT IF EXISTS fk_templates_current_version_id CASCADE;")
    op.execute("DROP TABLE IF EXISTS templates.template_versions CASCADE;")
    op.execute("DROP TABLE IF EXISTS templates.templates CASCADE;")
