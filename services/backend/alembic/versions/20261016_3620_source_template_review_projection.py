"""Bounded platform review metadata for customer and global source templates.

Revision ID: 20261016_3620
Revises: 20261016_3610
"""
from alembic import op

revision = "20261016_3620"
down_revision = "20261016_3610"
branch_labels = None
depends_on = None

TEMPLATE_REVIEW_SQL = """
CREATE OR REPLACE FUNCTION design.catalogue_template_review_v1(
    actor_id uuid, requested_template uuid, after_at timestamptz,
    after_id uuid, requested_limit integer)
RETURNS TABLE(reconciliation_id uuid,template_id uuid,organization_id uuid,
    template_name text,template_version integer,reason text,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog SET row_security = off
AS $function$
    SELECT r.id,t.id,t.organization_id,t.name::text,t.version,
           'Stored blueprint requires a reviewed correction.'::text,r.created_at
      FROM design.form_templates t
      LEFT JOIN design.form_template_reconciliations r ON r.template_id=t.id
       AND r.template_version=t.version AND r.operation='DOCUMENT_VALIDATION' AND r.status='BLOCKED'
     WHERE t.deleted_at IS NULL
       AND (($2 IS NULL AND r.id IS NOT NULL) OR t.id=$2)
       AND $5 BETWEEN 1 AND 101
       AND (($3 IS NULL AND $4 IS NULL) OR (r.created_at,r.id)>($3,$4))
       AND EXISTS (
         SELECT 1 FROM identity.users u JOIN platform.organizations o ON o.id=u.organization_id
          WHERE u.id=$1 AND u.is_active AND u.deleted_at IS NULL AND u.platform_role='SUPER_ADMIN'
            AND o.is_platform_org AND o.is_active AND o.suspended_at IS NULL AND o.archived_at IS NULL
            AND o.id=nullif(current_setting('app.current_organization_id',true),'')::uuid)
     ORDER BY r.created_at,r.id LIMIT LEAST(GREATEST(COALESCE($5,0),0),101)
$function$;
"""


def upgrade():
    op.execute("""DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
            RAISE EXCEPTION 'Template review projection requires the dedicated migration login';
        END IF;
    END $$""")
    op.execute(TEMPLATE_REVIEW_SQL)
    op.execute("REVOKE ALL ON FUNCTION design.catalogue_template_review_v1(uuid,uuid,timestamptz,uuid,integer) FROM PUBLIC")
    op.execute("""DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='event_runtime') THEN
            GRANT EXECUTE ON FUNCTION design.catalogue_template_review_v1(uuid,uuid,timestamptz,uuid,integer) TO event_runtime;
        END IF;
    END $$""")
    with op.get_context().autocommit_block():
        op.execute("""CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_template_blocked_review_cursor
            ON design.form_template_reconciliations(created_at,id)
            WHERE operation='DOCUMENT_VALIDATION' AND status='BLOCKED'""")
    op.execute("""DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
            JOIN pg_namespace n ON n.oid=c.relnamespace WHERE i.indisvalid
            AND n.nspname='design' AND c.relname='ix_template_blocked_review_cursor') THEN
            RAISE EXCEPTION 'Template review index is missing or invalid';
        END IF;
    END $$""")


def downgrade():
    # Additive, compatible rollback retains the restricted metadata projection.
    pass
