"""Versioned catalogue coverage for the separate programme rubric store.

Preserve old streams/evidence as coverage 1; only new streams claim coverage 2.
Drain older page consumers before resuming dispatch after this additive change.
"""
from alembic import op

revision = "20261022_3670"
down_revision = "20261021_3660"
branch_labels = None
depends_on = None

COMPLETION_CHECK = """status<>'COMPLETED' OR
    (kind='GLOBAL' AND stage='GLOBAL_TEMPLATE' AND pages_completed>=2) OR
    (kind='TENANT' AND coverage_version=1 AND stage='ABSTRACT_FORM' AND pages_completed>=4) OR
    (kind='TENANT' AND coverage_version=2 AND stage='PROGRAMME_RUBRIC' AND pages_completed>=5)"""
STAGE_CHECK = """(kind='GLOBAL' AND stage IN ('GLOBAL_CATEGORY','GLOBAL_TEMPLATE') AND target_organization_id=organization_id) OR
    (kind='TENANT' AND (stage IN ('FORM_CATEGORY','FORM_TEMPLATE','REGISTRATION_FORM','ABSTRACT_FORM') OR
    (coverage_version=2 AND stage='PROGRAMME_RUBRIC')) AND target_organization_id<>organization_id)"""

# Deliberately metadata-only for rubric history, just like abstract/registration
# review. Raw historical JSON can contain unrecognised private fields; correction
# proposals must be explicit, not a leaked or silently normalised raw document.
BLOCKED_REVIEW_SQL = """
CREATE OR REPLACE FUNCTION design.catalogue_blocked_review_v1(
    requested_type text, actor_id uuid, after_at timestamptz,
    after_id uuid, requested_limit integer)
RETURNS TABLE(reconciliation_id uuid, organization_id uuid, event_id uuid,
    resource_type text, resource_id uuid, resource_version integer,
    reason text, created_at timestamptz, current_document jsonb)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog SET row_security = off
AS $function$
    WITH authority AS (
        SELECT 1 FROM identity.users u
        JOIN platform.organizations o ON o.id=u.organization_id
        WHERE u.id=$2 AND u.is_active AND u.deleted_at IS NULL
          AND u.platform_role IS NOT NULL AND o.is_platform_org AND o.is_active
          AND o.suspended_at IS NULL AND o.archived_at IS NULL
          AND o.id=nullif(current_setting('app.current_organization_id',true),'')::uuid
    ), resources AS (
        SELECT f.id, e.organization_id, f.event_id, f.version, NULL::jsonb AS document
          FROM registration.registration_forms f JOIN events.events e ON e.id=f.event_id
         WHERE $1='REGISTRATION_FORM'
        UNION ALL
        SELECT f.id, f.organization_id, f.event_id, f.version, NULL::jsonb
          FROM abstract.abstract_forms f JOIN events.events e
            ON e.id=f.event_id AND e.organization_id=f.organization_id
         WHERE $1='ABSTRACT_FORM'
        UNION ALL
        SELECT c.id, c.organization_id, NULL::uuid, c.version,
               jsonb_build_object('name',c.name,'slug',c.slug,'description',c.description,
                                  'icon',c.icon,'sort_order',c.sort_order)
          FROM design.form_categories c
         WHERE $1='FORM_CATEGORY' AND c.organization_id IS NOT NULL AND c.deleted_at IS NULL
        UNION ALL
        SELECT p.id, p.organization_id, p.event_id, p.version, NULL::jsonb
          FROM programme.evaluation_plans p JOIN events.events e
            ON e.id=p.event_id AND e.organization_id=p.organization_id
         WHERE $1='PROGRAMME_RUBRIC'
    )
    SELECT r.id, r.organization_id, r.event_id, r.resource_type::text,
           r.resource_id, r.resource_version,
           'Stored document requires a reviewed correction.'::text, r.created_at, v.document
      FROM design.catalogue_document_reconciliations r
      JOIN resources v ON v.id=r.resource_id AND v.version=r.resource_version
        AND v.organization_id=r.organization_id AND v.event_id IS NOT DISTINCT FROM r.event_id
     WHERE r.resource_type=$1 AND r.operation='DOCUMENT_VALIDATION' AND r.status='BLOCKED'
       AND $5 BETWEEN 1 AND 101 AND EXISTS (SELECT 1 FROM authority)
       AND (($3 IS NULL AND $4 IS NULL) OR (r.created_at,r.id)>($3,$4))
     ORDER BY r.created_at,r.id LIMIT LEAST(GREATEST(COALESCE($5,0),0),101)
$function$;
"""


def upgrade():
    op.execute("SET LOCAL lock_timeout='5s'")
    op.execute("""DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
            RAISE EXCEPTION 'Programme review projection requires the dedicated migration login';
        END IF;
    END $$""")
    op.execute("ALTER TABLE design.catalogue_reconciliation_work ADD COLUMN IF NOT EXISTS coverage_version integer NOT NULL DEFAULT 1")
    op.alter_column("catalogue_reconciliation_work", "coverage_version", server_default="2", schema="design")
    op.execute("ALTER TABLE design.catalogue_reconciliation_work DROP CONSTRAINT IF EXISTS ck_catalogue_work_coverage")
    op.create_check_constraint("ck_catalogue_work_coverage", "catalogue_reconciliation_work",
        "coverage_version IN (1,2)", schema="design")
    for name in ("ck_catalogue_work_completion", "ck_catalogue_work_stage"):
        op.drop_constraint(name, "catalogue_reconciliation_work", type_="check", schema="design")
    op.create_check_constraint("ck_catalogue_work_completion", "catalogue_reconciliation_work", COMPLETION_CHECK, schema="design")
    op.create_check_constraint("ck_catalogue_work_stage", "catalogue_reconciliation_work", STAGE_CHECK, schema="design")
    op.execute(BLOCKED_REVIEW_SQL)
    op.execute("REVOKE ALL ON FUNCTION design.catalogue_blocked_review_v1(text,uuid,timestamptz,uuid,integer) FROM PUBLIC")
    op.execute("""DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='event_runtime') THEN
        GRANT EXECUTE ON FUNCTION design.catalogue_blocked_review_v1(text,uuid,timestamptz,uuid,integer) TO event_runtime;
        END IF; END $$""")
    op.execute("""DO $$ BEGIN
        IF EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='programme.evaluation_plans'::regclass
            AND polname<>'tenant_isolation_evaluation_plans') THEN
            RAISE EXCEPTION 'Unexpected evaluation-plan policies require explicit reconciliation';
        END IF;
    END $$""")
    op.execute("ALTER TABLE programme.evaluation_plans ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE programme.evaluation_plans FORCE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS tenant_isolation_evaluation_plans ON programme.evaluation_plans")
    op.execute("""CREATE POLICY tenant_isolation_evaluation_plans ON programme.evaluation_plans
        USING (organization_id=platform.current_organization_id())
        WITH CHECK (organization_id=platform.current_organization_id())""")
    op.execute("""DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='event_runtime') THEN
        GRANT SELECT,INSERT,UPDATE ON programme.evaluation_plans TO event_runtime;
        REVOKE DELETE,TRUNCATE ON programme.evaluation_plans FROM event_runtime;
        END IF; END $$""")
    with op.get_context().autocommit_block():
        op.execute("""CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_programme_rubric_owner_cursor
            ON programme.evaluation_plans (organization_id,id)""")
    op.execute("""DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_index i WHERE
            i.indexrelid='programme.ix_programme_rubric_owner_cursor'::regclass AND i.indisvalid) THEN
            RAISE EXCEPTION 'Programme rubric cursor index is not valid';
        END IF;
    END $$""")


def downgrade():
    raise RuntimeError("Forward-only: retain rubric evidence and versioned coverage; use fail-closed forward recovery")
