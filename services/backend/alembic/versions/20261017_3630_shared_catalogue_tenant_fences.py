"""Fence shared operational catalogues without breaking ordinary row locks.

Revision ID: 20261017_3630
Revises: 20261016_3620

Frozen SQL only. Visibility admits owned rows and explicitly global rows, but
requires a tenant context. WITH CHECK protects global inserts/updates. The owner
trigger prevents claiming a global row by changing its owner, and protects global
DELETE (which otherwise shares the visibility predicate used by SELECT locks).
"""
from alembic import op

revision = "20261017_3630"
down_revision = "20261016_3620"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""CREATE OR REPLACE FUNCTION design.guard_shared_catalogue_owner_v1()
        RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
        BEGIN
            IF TG_OP='UPDATE' AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN
                RETURN NEW;
            END IF;
            IF TG_OP='DELETE' AND OLD.organization_id IS NOT NULL THEN
                RETURN OLD;
            END IF;
            -- Dedicated database maintenance roles already have power to
            -- alter policies/triggers. Do not give that power to runtime.
            IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user
                      AND (rolsuper OR rolbypassrls)) THEN
                IF TG_OP='DELETE' THEN RETURN OLD; END IF;
                RETURN NEW;
            END IF;
            IF TG_OP='UPDATE' THEN
                RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Catalogue ownership is immutable';
            END IF;
            IF NOT EXISTS(SELECT 1 FROM platform.organizations o
                WHERE o.id=NULLIF(current_setting('app.current_organization_id',true),'')::uuid
                  AND o.is_platform_org AND o.is_active
                  AND o.suspended_at IS NULL AND o.archived_at IS NULL) THEN
                RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Global catalogue mutation requires platform scope';
            END IF;
            RETURN OLD;
        END $$""")
    op.execute("REVOKE ALL ON FUNCTION design.guard_shared_catalogue_owner_v1() FROM PUBLIC")
    op.execute("""DO $$ BEGIN
        IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='event_runtime') THEN
            GRANT EXECUTE ON FUNCTION design.guard_shared_catalogue_owner_v1() TO event_runtime;
        END IF;
    END $$""")
    current = "NULLIF(current_setting('app.current_organization_id',true),'')::uuid"
    platform = f"""EXISTS(SELECT 1 FROM platform.organizations catalogue_platform
        WHERE catalogue_platform.id={current} AND catalogue_platform.is_platform_org
          AND catalogue_platform.is_active AND catalogue_platform.suspended_at IS NULL
          AND catalogue_platform.archived_at IS NULL)"""
    for table in ("form_templates", "form_categories"):
        # Fixed migration-owned identifiers. Unexpected permissive policies
        # cannot be silently combined with this fence using PostgreSQL's OR.
        op.execute(f"""DO $$ BEGIN
            IF EXISTS(SELECT 1 FROM pg_catalog.pg_policy
                WHERE polrelid='design.{table}'::regclass
                  AND polname<>'category_a_shared_catalogue_scope') THEN
                RAISE EXCEPTION 'Unexpected shared catalogue policy requires operator review';
            END IF;
        END $$""")
        global_row = "organization_id IS NULL" + (" AND scope_type='GLOBAL'" if table == "form_templates" else "")
        visible = f"({current} IS NOT NULL AND (organization_id={current} OR ({global_row})))"
        writable = f"({current} IS NOT NULL AND (organization_id={current} OR (({global_row}) AND ({platform}))))"
        op.execute(f"ALTER TABLE design.{table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE design.{table} FORCE ROW LEVEL SECURITY")
        op.execute(f"DROP POLICY IF EXISTS category_a_shared_catalogue_scope ON design.{table}")
        op.execute(f"CREATE POLICY category_a_shared_catalogue_scope ON design.{table} "
            f"USING ({visible}) WITH CHECK ({writable})")
        op.execute(f"DROP TRIGGER IF EXISTS category_a_shared_catalogue_owner_guard ON design.{table}")
        op.execute(f"CREATE TRIGGER category_a_shared_catalogue_owner_guard BEFORE UPDATE OR DELETE "
            f"ON design.{table} FOR EACH ROW EXECUTE FUNCTION design.guard_shared_catalogue_owner_v1()")


def downgrade():
    raise RuntimeError("Retain shared catalogue fences; roll back compatible application binaries, not tenant isolation.")
