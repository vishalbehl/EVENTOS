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

-- GRANT CONNECT is environment-specific and must target the selected database
-- during infrastructure provisioning.

DO $$
DECLARE
    schema_name text;
BEGIN
    FOREACH schema_name IN ARRAY ARRAY[
        'platform', 'identity', 'rbac', 'billing', 'events', 'speakers',
        'registration', 'presentations', 'venue', 'communications',
        'analytics', 'audit', 'integrations', 'files', 'jobs', 'workflow', 'search',
        'technology_services', 'operations_planning'
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

-- The migration group is intentionally separate and must never be used by the
-- API or workers. Object ownership and DDL grants remain environment-managed.
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
