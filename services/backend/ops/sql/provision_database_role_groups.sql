-- Run as the database owner. Login roles and passwords are provisioned through
-- the cloud secret/IAM workflow and then granted one of these NOLOGIN groups.

DO $$ BEGIN
    CREATE ROLE Event_runtime NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    CREATE ROLE Event_migration NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    CREATE ROLE Event_operational NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    CREATE ROLE Event_audit_export NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER ROLE Event_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
ALTER ROLE Event_migration NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;
ALTER ROLE Event_operational NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
ALTER ROLE Event_audit_export NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;

DO $$ BEGIN
    IF to_regprocedure('design.guard_shared_catalogue_owner_v1()') IS NOT NULL THEN
        REVOKE ALL ON FUNCTION design.guard_shared_catalogue_owner_v1() FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION design.guard_shared_catalogue_owner_v1() TO Event_runtime;
    END IF;
    IF to_regprocedure('registration.public_form_owner_v1(uuid)') IS NOT NULL THEN
        REVOKE ALL ON FUNCTION registration.public_form_owner_v1(uuid) FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION registration.public_form_owner_v1(uuid) TO Event_runtime;
    END IF;
    IF to_regprocedure('design.catalogue_template_review_v1(uuid,uuid,timestamptz,uuid,integer)') IS NOT NULL THEN
        REVOKE ALL ON FUNCTION design.catalogue_template_review_v1(uuid,uuid,timestamptz,uuid,integer) FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION design.catalogue_template_review_v1(uuid,uuid,timestamptz,uuid,integer) TO Event_runtime;
    END IF;
    IF to_regprocedure('design.catalogue_blocked_review_v1(text,uuid,timestamptz,uuid,integer)') IS NOT NULL THEN
        REVOKE ALL ON FUNCTION design.catalogue_blocked_review_v1(text,uuid,timestamptz,uuid,integer) FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION design.catalogue_blocked_review_v1(text,uuid,timestamptz,uuid,integer) TO Event_runtime;
    END IF;
    IF to_regprocedure('design.catalogue_reference_owners_v1(text,uuid,uuid,uuid)') IS NOT NULL THEN
        REVOKE ALL ON FUNCTION design.catalogue_reference_owners_v1(text,uuid,uuid,uuid) FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION design.catalogue_reference_owners_v1(text,uuid,uuid,uuid) TO Event_runtime;
    END IF;
END $$;

-- GRANT CONNECT is environment-specific and must target the selected database
-- during infrastructure provisioning.

DO $$
DECLARE
    schema_name text;
BEGIN
    FOREACH schema_name IN ARRAY ARRAY[
        'public', 'platform', 'identity', 'rbac', 'access', 'commerce', 'operations',
        'agenda', 'billing', 'events', 'speakers', 'registration', 'presentations',
        'venue', 'communications', 'analytics', 'audit', 'command_center_audit',
        'integrations', 'files', 'jobs', 'workflow', 'search', 'technology_services',
        'operations_planning', 'organizer_access', 'abstract', 'automation', 'business',
        'command_center_access', 'content', 'deployment_management', 'design',
        'inventory', 'operation_templates', 'platform_compliance', 'procurement',
        'programme', 'resource_management', 'sponsors', 'support', 'websites'
    ]
    LOOP
        IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = schema_name) THEN
            EXECUTE format('GRANT USAGE ON SCHEMA %I TO Event_runtime', schema_name);
            EXECUTE format(
                'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO Event_runtime',
                schema_name
            );
            EXECUTE format(
                'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO Event_runtime',
                schema_name
            );
        END IF;
    END LOOP;
END $$;

-- Reconciliation evidence is immutable to the runtime identity. The bounded
-- Historical migration-preparation receipts belong only to the deployment
-- operator; they are not an application API or worker ledger.
DO $$ BEGIN
    IF to_regclass('public.migration_reconciliation_receipts') IS NOT NULL THEN
        REVOKE ALL ON public.migration_reconciliation_receipts FROM Event_runtime;
    END IF;
END $$;

-- Reconciliation evidence is immutable to the runtime identity. The bounded
-- workers append evidence but cannot rewrite or delete historical decisions.
DO $$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'form_template_reconciliations',
        'form_category_reconciliations',
        'catalogue_document_reconciliations'
    ]
    LOOP
        IF to_regclass(format('design.%I', table_name)) IS NOT NULL THEN
            EXECUTE format(
                'REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON design.%I FROM Event_runtime',
                table_name
            );
            EXECUTE format(
                'GRANT SELECT, INSERT ON design.%I TO Event_runtime',
                table_name
            );
        END IF;
    END LOOP;
    IF to_regclass('design.catalogue_reconciliation_runs') IS NOT NULL THEN
        REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER
          ON design.catalogue_reconciliation_runs FROM Event_runtime;
        GRANT SELECT, INSERT, UPDATE
          ON design.catalogue_reconciliation_runs TO Event_runtime;
    END IF;
END $$;

-- Mandatory audit history is append-only for application identities.
DO $$ BEGIN
    IF to_regclass('command_center_audit.logs') IS NOT NULL THEN
        REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON command_center_audit.logs FROM Event_runtime;
        GRANT SELECT, INSERT ON command_center_audit.logs TO Event_runtime;
    END IF;
END $$;

DO $$ BEGIN
    IF to_regclass('communications.campaign_recipient_snapshots') IS NOT NULL THEN
        REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
          ON communications.campaign_recipient_snapshots FROM Event_runtime;
        GRANT SELECT, INSERT ON communications.campaign_recipient_snapshots TO Event_runtime;
    END IF;
END $$;

-- The migration group is intentionally separate and must never be used by the
DO $$ BEGIN
    IF to_regclass('communications.campaign_attempts') IS NOT NULL THEN
        REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
          ON communications.campaign_attempts FROM Event_runtime;
        GRANT SELECT, INSERT ON communications.campaign_attempts TO Event_runtime;
    END IF;
    IF to_regclass('communications.campaign_attempt_outcomes') IS NOT NULL THEN
        REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
          ON communications.campaign_attempt_outcomes FROM Event_runtime;
        GRANT SELECT, INSERT ON communications.campaign_attempt_outcomes TO Event_runtime;
    END IF;
END $$;

-- The migration group is intentionally separate and must never be used by the
-- API or workers. Object ownership and DDL grants remain environment-managed.
-- Rate policy reads need only the bounded configuration projection and epoch;
-- do not grant runtime DML or ownership on the authoritative revision table.
DO $$ BEGIN
    IF to_regnamespace('developer') IS NOT NULL THEN
        GRANT USAGE ON SCHEMA developer TO Event_runtime;
        IF to_regclass('developer.rate_limits') IS NOT NULL THEN
            GRANT SELECT ON developer.rate_limits TO Event_runtime;
        END IF;
        IF to_regclass('developer.rate_policy_revision') IS NOT NULL THEN
            REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
              ON developer.rate_policy_revision FROM Event_runtime;
            GRANT SELECT ON developer.rate_policy_revision TO Event_runtime;
        END IF;
    END IF;
END $$;

DO $$
DECLARE
    schema_name text;
BEGIN
    FOREACH schema_name IN ARRAY ARRAY['platform', 'billing', 'events', 'technology_services']
    LOOP
        IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = schema_name) THEN
            EXECUTE format('GRANT USAGE ON SCHEMA %I TO Event_migration', schema_name);
        END IF;
    END LOOP;
END $$;
