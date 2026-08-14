"""website builder canonical documents, drafts, revisions, and deployments

Revision ID: 20260812_1200
Revises: 20260809_1050
Create Date: 2026-08-12
"""

from alembic import op


revision = "20260812_1200"
down_revision = "20260809_1050"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS templates;")
    op.execute("CREATE SCHEMA IF NOT EXISTS website_builder;")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS templates.template_drafts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            template_id UUID NOT NULL REFERENCES templates.templates(id) ON DELETE CASCADE,
            document JSONB NOT NULL,
            schema_version INTEGER NOT NULL DEFAULT 1,
            checksum VARCHAR(80) NOT NULL,
            optimistic_version INTEGER NOT NULL DEFAULT 1,
            lock_owner_id UUID REFERENCES identity.users(id) ON DELETE SET NULL,
            lock_expires_at TIMESTAMP WITH TIME ZONE,
            updated_by UUID REFERENCES identity.users(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
            UNIQUE(template_id)
        );
        """
    )
    op.execute(
        """
        ALTER TABLE templates.template_versions
            ADD COLUMN IF NOT EXISTS document JSONB,
            ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1,
            ADD COLUMN IF NOT EXISTS checksum VARCHAR(80);
        """
    )

    op.execute(
        """
        ALTER TABLE website_builder.sites
            ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES platform.organizations(id) ON DELETE CASCADE,
            ADD COLUMN IF NOT EXISTS current_draft_id UUID,
            ADD COLUMN IF NOT EXISTS current_deployment_id UUID,
            ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS editor_schema_version INTEGER NOT NULL DEFAULT 1,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now());
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS website_builder.site_drafts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            site_id UUID NOT NULL REFERENCES website_builder.sites(id) ON DELETE CASCADE,
            document JSONB NOT NULL,
            schema_version INTEGER NOT NULL DEFAULT 1,
            checksum VARCHAR(80) NOT NULL,
            revision_counter INTEGER NOT NULL DEFAULT 1,
            editor_schema_version INTEGER NOT NULL DEFAULT 1,
            updated_by UUID REFERENCES identity.users(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
            UNIQUE(site_id)
        );
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS website_builder.site_revisions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            site_id UUID NOT NULL REFERENCES website_builder.sites(id) ON DELETE CASCADE,
            revision_number INTEGER NOT NULL,
            reason VARCHAR(40) NOT NULL,
            document JSONB NOT NULL,
            schema_version INTEGER NOT NULL DEFAULT 1,
            checksum VARCHAR(80) NOT NULL,
            diagnostics JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_by UUID REFERENCES identity.users(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
            UNIQUE(site_id, revision_number)
        );
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS website_builder.site_deployments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            site_id UUID NOT NULL REFERENCES website_builder.sites(id) ON DELETE CASCADE,
            revision_id UUID REFERENCES website_builder.site_revisions(id) ON DELETE SET NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
            storage_prefix TEXT NOT NULL,
            rendered_manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
            diagnostics JSONB NOT NULL DEFAULT '[]'::jsonb,
            activated_at TIMESTAMP WITH TIME ZONE,
            created_by UUID REFERENCES identity.users(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
        );
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS website_builder.site_editor_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            site_id UUID NOT NULL REFERENCES website_builder.sites(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
            mode VARCHAR(20) NOT NULL DEFAULT 'EDITOR',
            heartbeat_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
        );
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS website_builder.site_asset_refs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            site_id UUID NOT NULL REFERENCES website_builder.sites(id) ON DELETE CASCADE,
            asset_id UUID,
            kind VARCHAR(30) NOT NULL,
            source VARCHAR(40) NOT NULL DEFAULT 'upload',
            url TEXT,
            storage_path TEXT,
            creator TEXT,
            license TEXT,
            attribution TEXT,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
        );
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS website_builder.site_link_index (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            site_id UUID NOT NULL REFERENCES website_builder.sites(id) ON DELETE CASCADE,
            source_instance_id VARCHAR(120) NOT NULL,
            source_page_id VARCHAR(120),
            target_type VARCHAR(40) NOT NULL,
            target_value TEXT,
            target_page_id VARCHAR(120),
            target_anchor_id VARCHAR(120),
            status VARCHAR(30) NOT NULL DEFAULT 'OK',
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
        );
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS website_builder.site_domains (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            site_id UUID NOT NULL REFERENCES website_builder.sites(id) ON DELETE CASCADE,
            domain VARCHAR(255) NOT NULL UNIQUE,
            verification_token VARCHAR(120) NOT NULL,
            dns_state VARCHAR(30) NOT NULL DEFAULT 'PENDING',
            tls_state VARCHAR(30) NOT NULL DEFAULT 'PENDING',
            active_deployment_id UUID REFERENCES website_builder.site_deployments(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
        );
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS website_builder.form_submissions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            site_id UUID NOT NULL REFERENCES website_builder.sites(id) ON DELETE CASCADE,
            event_id UUID REFERENCES events.events(id) ON DELETE CASCADE,
            component_instance_id VARCHAR(120) NOT NULL,
            payload JSONB NOT NULL,
            consent JSONB NOT NULL DEFAULT '{}'::jsonb,
            spam_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
            ip_hash VARCHAR(128),
            user_agent TEXT,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
        );
        """
    )

    op.execute("CREATE INDEX IF NOT EXISTS ix_template_drafts_template_id ON templates.template_drafts(template_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_site_drafts_site_id ON website_builder.site_drafts(site_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_site_revisions_site_id ON website_builder.site_revisions(site_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_site_deployments_site_id ON website_builder.site_deployments(site_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_site_editor_sessions_site_id ON website_builder.site_editor_sessions(site_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_site_asset_refs_site_id ON website_builder.site_asset_refs(site_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_site_link_index_site_id ON website_builder.site_link_index(site_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_site_domains_site_id ON website_builder.site_domains(site_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_form_submissions_site_id ON website_builder.form_submissions(site_id);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS website_builder.form_submissions CASCADE;")
    op.execute("DROP TABLE IF EXISTS website_builder.site_domains CASCADE;")
    op.execute("DROP TABLE IF EXISTS website_builder.site_link_index CASCADE;")
    op.execute("DROP TABLE IF EXISTS website_builder.site_asset_refs CASCADE;")
    op.execute("DROP TABLE IF EXISTS website_builder.site_editor_sessions CASCADE;")
    op.execute("DROP TABLE IF EXISTS website_builder.site_deployments CASCADE;")
    op.execute("DROP TABLE IF EXISTS website_builder.site_revisions CASCADE;")
    op.execute("DROP TABLE IF EXISTS website_builder.site_drafts CASCADE;")
    op.execute("DROP TABLE IF EXISTS templates.template_drafts CASCADE;")
    op.execute("ALTER TABLE templates.template_versions DROP COLUMN IF EXISTS checksum;")
    op.execute("ALTER TABLE templates.template_versions DROP COLUMN IF EXISTS schema_version;")
    op.execute("ALTER TABLE templates.template_versions DROP COLUMN IF EXISTS document;")
