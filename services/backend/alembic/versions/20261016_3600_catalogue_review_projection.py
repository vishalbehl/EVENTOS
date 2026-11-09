"""Allowlisted current blocked-aggregate projection for platform reviewers.

Revision ID: 20261016_3600
Revises: 20261016_3590
"""
from alembic import op

revision = "20261016_3600"
down_revision = "20261016_3590"
branch_labels = None
depends_on = None

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
    op.execute("""DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
            RAISE EXCEPTION 'Catalogue review projection requires the dedicated migration login';
        END IF;
    END $$""")
    op.execute(BLOCKED_REVIEW_SQL)
    op.execute("REVOKE ALL ON FUNCTION design.catalogue_blocked_review_v1(text,uuid,timestamptz,uuid,integer) FROM PUBLIC")
    op.execute("""DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='event_runtime') THEN
            GRANT EXECUTE ON FUNCTION design.catalogue_blocked_review_v1(text,uuid,timestamptz,uuid,integer) TO event_runtime;
        END IF;
    END $$""")
    with op.get_context().autocommit_block():
        op.execute("""CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_catalogue_blocked_review_cursor
            ON design.catalogue_document_reconciliations (resource_type,created_at,id)
            WHERE operation='DOCUMENT_VALIDATION' AND status='BLOCKED'""")
    op.execute("""DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
            JOIN pg_namespace n ON n.oid=c.relnamespace WHERE i.indisvalid
            AND n.nspname='design' AND c.relname='ix_catalogue_blocked_review_cursor') THEN
            RAISE EXCEPTION 'Catalogue review cursor index is missing or invalid';
        END IF;
    END $$""")


def downgrade():
    # Retain additive projection/index for compatible application rollback.
    pass
