"""website builder production lifecycle invariants

Revision ID: 20260814_0900
Revises: 20260812_1200
Create Date: 2026-08-14
"""

from alembic import op


revision = "20260814_0900"
down_revision = "20260812_1200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS website_builder.mutation_requests (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            scope_type VARCHAR(20) NOT NULL,
            scope_id UUID NOT NULL,
            operation VARCHAR(60) NOT NULL,
            idempotency_key VARCHAR(200) NOT NULL,
            request_hash VARCHAR(80) NOT NULL,
            response_type VARCHAR(60),
            response_id UUID,
            response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_by UUID REFERENCES identity.users(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
            CONSTRAINT uq_website_mutation_request_key UNIQUE (scope_type, scope_id, operation, idempotency_key)
        );
        CREATE INDEX IF NOT EXISTS ix_website_mutation_requests_scope
            ON website_builder.mutation_requests (scope_type, scope_id);
        CREATE UNIQUE INDEX IF NOT EXISTS uq_template_drafts_template_id
            ON templates.template_drafts (template_id);
        CREATE UNIQUE INDEX IF NOT EXISTS uq_template_versions_number
            ON templates.template_versions (template_id, version_number);
        ALTER TABLE website_builder.site_deployments
            ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE website_builder.site_domains
            ADD COLUMN IF NOT EXISTS verification_token VARCHAR(120),
            ADD COLUMN IF NOT EXISTS dns_state VARCHAR(30),
            ADD COLUMN IF NOT EXISTS tls_state VARCHAR(30),
            ADD COLUMN IF NOT EXISTS active_deployment_id UUID REFERENCES website_builder.site_deployments(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;
        UPDATE website_builder.site_domains
        SET verification_token = COALESCE(verification_token, md5(random()::text || clock_timestamp()::text || id::text)),
            dns_state = COALESCE(dns_state, 'PENDING'),
            tls_state = COALESCE(tls_state, 'PENDING'),
            created_at = COALESCE(created_at, timezone('utc'::text, now())),
            updated_at = COALESCE(updated_at, timezone('utc'::text, now()));
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'website_builder' AND table_name = 'site_domains' AND column_name = 'status'
            ) THEN
                EXECUTE $sql$
                    UPDATE website_builder.site_domains
                    SET dns_state = CASE WHEN status IN ('VERIFIED', 'ACTIVE') THEN 'VERIFIED' ELSE dns_state END
                $sql$;
            END IF;
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'website_builder' AND table_name = 'site_domains' AND column_name = 'ssl_status'
            ) THEN
                EXECUTE $sql$
                    UPDATE website_builder.site_domains
                    SET tls_state = CASE WHEN ssl_status IN ('ACTIVE', 'ISSUED') THEN 'ACTIVE' ELSE tls_state END
                $sql$;
            END IF;
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'website_builder' AND table_name = 'site_domains' AND column_name = 'verified_at'
            ) THEN
                EXECUTE $sql$
                    UPDATE website_builder.site_domains
                    SET created_at = COALESCE(created_at, verified_at, timezone('utc'::text, now())),
                        updated_at = COALESCE(updated_at, verified_at, timezone('utc'::text, now()))
                $sql$;
            END IF;
        END $$;
        ALTER TABLE website_builder.site_domains
            ALTER COLUMN verification_token SET NOT NULL,
            ALTER COLUMN dns_state SET DEFAULT 'PENDING',
            ALTER COLUMN dns_state SET NOT NULL,
            ALTER COLUMN tls_state SET DEFAULT 'PENDING',
            ALTER COLUMN tls_state SET NOT NULL,
            ALTER COLUMN created_at SET DEFAULT timezone('utc'::text, now()),
            ALTER COLUMN created_at SET NOT NULL,
            ALTER COLUMN updated_at SET DEFAULT timezone('utc'::text, now()),
            ALTER COLUMN updated_at SET NOT NULL;
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'website_builder' AND table_name = 'site_domains' AND column_name = 'status'
            ) THEN
                EXECUTE 'ALTER TABLE website_builder.site_domains ALTER COLUMN status SET DEFAULT ''PENDING''';
            END IF;
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'website_builder' AND table_name = 'site_domains' AND column_name = 'ssl_status'
            ) THEN
                EXECUTE 'ALTER TABLE website_builder.site_domains ALTER COLUMN ssl_status SET DEFAULT ''PENDING''';
            END IF;
        END $$;
        CREATE INDEX IF NOT EXISTS ix_site_domains_site_id
            ON website_builder.site_domains (site_id);
        CREATE UNIQUE INDEX IF NOT EXISTS ix_site_domains_domain
            ON website_builder.site_domains (domain);
        CREATE TABLE IF NOT EXISTS templates.template_previews (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            template_id UUID NOT NULL REFERENCES templates.templates(id) ON DELETE CASCADE,
            checksum VARCHAR(80) NOT NULL,
            rendered_manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_by UUID REFERENCES identity.users(id) ON DELETE CASCADE,
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
        );
        CREATE INDEX IF NOT EXISTS ix_template_previews_template_id ON templates.template_previews (template_id);
        CREATE INDEX IF NOT EXISTS ix_template_previews_expires_at ON templates.template_previews (expires_at);
        WITH ranked_sites AS (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY slug ORDER BY created_at, id) AS position
            FROM website_builder.sites
        )
        UPDATE website_builder.sites AS site
        SET slug = LEFT(site.slug, 100) || '-' || LEFT(site.id::text, 8)
        FROM ranked_sites
        WHERE ranked_sites.id = site.id AND ranked_sites.position > 1;
        CREATE UNIQUE INDEX IF NOT EXISTS ix_website_builder_sites_slug
            ON website_builder.sites (slug);
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS templates.template_previews;")
    op.execute("DROP INDEX IF EXISTS website_builder.ix_website_builder_sites_slug;")
    op.execute("ALTER TABLE website_builder.site_deployments DROP COLUMN IF EXISTS expires_at;")
    op.execute("DROP INDEX IF EXISTS website_builder.ix_site_domains_domain;")
    op.execute("DROP INDEX IF EXISTS website_builder.ix_site_domains_site_id;")
    op.execute("ALTER TABLE website_builder.site_domains DROP COLUMN IF EXISTS updated_at, DROP COLUMN IF EXISTS created_at, DROP COLUMN IF EXISTS active_deployment_id, DROP COLUMN IF EXISTS tls_state, DROP COLUMN IF EXISTS dns_state, DROP COLUMN IF EXISTS verification_token;")
    op.execute("DROP INDEX IF EXISTS templates.uq_template_versions_number;")
    op.execute("DROP INDEX IF EXISTS templates.uq_template_drafts_template_id;")
    op.execute("DROP TABLE IF EXISTS website_builder.mutation_requests;")
