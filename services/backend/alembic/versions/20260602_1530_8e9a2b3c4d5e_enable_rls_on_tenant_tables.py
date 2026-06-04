"""enable_rls_on_tenant_tables

Revision ID: 8e9a2b3c4d5e
Revises: 78d3cc08dcf0
Create Date: 2026-06-02 15:30:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8e9a2b3c4d5e'
down_revision: Union[str, None] = '78d3cc08dcf0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop the old events specific policy so we can use the unified dynamic policy name
    op.execute(sa.text("DROP POLICY IF EXISTS event_tenant_isolation ON rbac.events"))

    # Run dynamic RLS policy creation
    op.execute(sa.text("""
    DO $$
    DECLARE
        r RECORD;
    BEGIN
        -- Loop through all tables in the 7 schemas + public
        FOR r IN 
            SELECT table_schema, table_name 
            FROM information_schema.tables 
            WHERE table_schema IN ('auth', 'rbac', 'speakers', 'presentations', 'registration', 'notifications', 'venue', 'public')
              AND table_type = 'BASE TABLE'
        LOOP
            -- Check if the table has organization_id column
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = r.table_schema 
                  AND table_name = r.table_name 
                  AND column_name = 'organization_id'
            ) THEN
                -- Enable RLS
                EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.table_schema, r.table_name);
                -- Drop existing policy if exists
                EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I.%I', r.table_schema, r.table_name);
                -- Create policy checking organization_id
                EXECUTE format('CREATE POLICY tenant_isolation_policy ON %I.%I USING (
                    current_setting(''app.current_organization_id'', true) IS NULL OR
                    current_setting(''app.current_organization_id'', true) = '''' OR
                    organization_id = NULLIF(current_setting(''app.current_organization_id'', true), ''CustomPlaceholder'')::uuid
                ) WITH CHECK (
                    current_setting(''app.current_organization_id'', true) IS NULL OR
                    current_setting(''app.current_organization_id'', true) = '''' OR
                    organization_id = NULLIF(current_setting(''app.current_organization_id'', true), ''CustomPlaceholder'')::uuid
                )', r.table_schema, r.table_name);
                
            -- Check if the table has event_id column (and not organization_id)
            ELSIF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = r.table_schema 
                  AND table_name = r.table_name 
                  AND column_name = 'event_id'
            ) THEN
                -- Enable RLS
                EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.table_schema, r.table_name);
                -- Drop existing policy if exists
                EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I.%I', r.table_schema, r.table_name);
                -- Create policy checking event_id
                EXECUTE format('CREATE POLICY tenant_isolation_policy ON %I.%I USING (
                    current_setting(''app.current_organization_id'', true) IS NULL OR
                    current_setting(''app.current_organization_id'', true) = '''' OR
                    event_id IN (
                        SELECT id FROM rbac.events 
                        WHERE organization_id = NULLIF(current_setting(''app.current_organization_id'', true), ''CustomPlaceholder'')::uuid
                    )
                ) WITH CHECK (
                    current_setting(''app.current_organization_id'', true) IS NULL OR
                    current_setting(''app.current_organization_id'', true) = '''' OR
                    event_id IN (
                        SELECT id FROM rbac.events 
                        WHERE organization_id = NULLIF(current_setting(''app.current_organization_id'', true), ''CustomPlaceholder'')::uuid
                    )
                )', r.table_schema, r.table_name);
                
            -- Check if the table is rbac.organizations itself
            ELSIF r.table_schema = 'rbac' AND r.table_name = 'organizations' THEN
                -- Enable RLS
                EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.table_schema, r.table_name);
                -- Drop existing policy if exists
                EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I.%I', r.table_schema, r.table_name);
                -- Create policy checking id
                EXECUTE format('CREATE POLICY tenant_isolation_policy ON %I.%I USING (
                    current_setting(''app.current_organization_id'', true) IS NULL OR
                    current_setting(''app.current_organization_id'', true) = '''' OR
                    id = NULLIF(current_setting(''app.current_organization_id'', true), ''CustomPlaceholder'')::uuid
                ) WITH CHECK (
                    current_setting(''app.current_organization_id'', true) IS NULL OR
                    current_setting(''app.current_organization_id'', true) = '''' OR
                    id = NULLIF(current_setting(''app.current_organization_id'', true), ''CustomPlaceholder'')::uuid
                )', r.table_schema, r.table_name);
            END IF;
        END LOOP;
    END;
    $$;
    """))
    
    # Fix the CustomPlaceholder in pg_policies
    op.execute(sa.text("""
    DO $$
    DECLARE
        r RECORD;
        q text;
        wc text;
    BEGIN
        FOR r IN 
            SELECT schemaname, tablename, policyname, qual, with_check 
            FROM pg_policies 
            WHERE schemaname IN ('auth', 'rbac', 'speakers', 'presentations', 'registration', 'notifications', 'venue', 'public')
              AND policyname = 'tenant_isolation_policy'
        LOOP
            IF r.qual LIKE '%CustomPlaceholder%' THEN
                q := replace(r.qual, 'CustomPlaceholder', '');
                wc := replace(r.with_check, 'CustomPlaceholder', '');
                EXECUTE format('DROP POLICY tenant_isolation_policy ON %I.%I', r.schemaname, r.tablename);
                IF wc IS NOT NULL THEN
                    EXECUTE format('CREATE POLICY tenant_isolation_policy ON %I.%I USING (%s) WITH CHECK (%s)', r.schemaname, r.tablename, q, wc);
                ELSE
                    EXECUTE format('CREATE POLICY tenant_isolation_policy ON %I.%I USING (%s)', r.schemaname, r.tablename, q);
                END IF;
            END IF;
        END LOOP;
    END;
    $$;
    """))


def downgrade() -> None:
    # Disable RLS and drop policies dynamically
    op.execute(sa.text("""
    DO $$
    DECLARE
        r RECORD;
    BEGIN
        FOR r IN 
            SELECT table_schema, table_name 
            FROM information_schema.tables 
            WHERE table_schema IN ('auth', 'rbac', 'speakers', 'presentations', 'registration', 'notifications', 'venue', 'public')
              AND table_type = 'BASE TABLE'
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I.%I', r.table_schema, r.table_name);
            EXECUTE format('ALTER TABLE %I.%I DISABLE ROW LEVEL SECURITY', r.table_schema, r.table_name);
        END LOOP;
    END;
    $$;
    """))

    # Recreate the old events specific policy
    op.execute(sa.text("ALTER TABLE rbac.events ENABLE ROW LEVEL SECURITY"))
    op.execute(sa.text("""
        CREATE POLICY event_tenant_isolation ON rbac.events
        USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    """))
