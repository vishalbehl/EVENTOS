"""Bounded platform-only owner projection for scoped reference reassignment.

Revision ID: 20261016_3590
Revises: 20261016_3580
"""
from alembic import op

revision = "20261016_3590"
down_revision = "20261016_3580"
branch_labels = None
depends_on = None

REFERENCE_OWNER_SQL = """
CREATE OR REPLACE FUNCTION design.catalogue_reference_owners_v1(
    requested_kind text, source_id uuid, actor_id uuid, after_owner uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog SET row_security = off
AS $function$
    WITH authority AS (
        SELECT 1 FROM identity.users u
        JOIN platform.organizations o ON o.id=u.organization_id
        WHERE u.id=$3 AND u.is_active AND u.deleted_at IS NULL
          AND u.platform_role IS NOT NULL AND o.is_platform_org AND o.is_active
          AND o.suspended_at IS NULL AND o.archived_at IS NULL
          AND o.id=nullif(current_setting('app.current_organization_id',true),'')::uuid
    ), global_source AS (
        SELECT id FROM design.form_templates
         WHERE $1='TEMPLATE' AND id=$2 AND organization_id IS NULL
           AND scope_type='GLOBAL' AND deleted_at IS NULL AND is_active
        UNION ALL
        SELECT id FROM design.form_categories
         WHERE $1='CATEGORY' AND id=$2 AND organization_id IS NULL
           AND deleted_at IS NULL AND is_active
    ), owners AS (
        SELECT e.organization_id FROM registration.registration_forms f
        JOIN events.events e ON e.id=f.event_id
        WHERE ($1='TEMPLATE' AND f.template_id=$2)
           OR ($1='CATEGORY' AND f.category_id=$2)
        UNION
        SELECT organization_id FROM abstract.abstract_forms
         WHERE $1='TEMPLATE' AND is_active AND schema->>'template_id'=$2::text
        UNION
        SELECT organization_id FROM design.form_templates
         WHERE $1='CATEGORY' AND category_id=$2
    )
    SELECT organization_id FROM owners
     WHERE organization_id IS NOT NULL AND ($4 IS NULL OR organization_id>$4)
       AND EXISTS (SELECT 1 FROM authority) AND EXISTS (SELECT 1 FROM global_source)
     ORDER BY organization_id LIMIT 100
$function$;
"""


def upgrade():
    op.execute("""DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
            RAISE EXCEPTION 'Catalogue discovery requires the dedicated migration login';
        END IF;
    END $$""")
    op.execute(REFERENCE_OWNER_SQL)
    op.execute("REVOKE ALL ON FUNCTION design.catalogue_reference_owners_v1(text,uuid,uuid,uuid) FROM PUBLIC")
    op.execute("""DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='event_runtime') THEN
            GRANT EXECUTE ON FUNCTION design.catalogue_reference_owners_v1(text,uuid,uuid,uuid) TO event_runtime;
        END IF;
    END $$""")
    # Indexes match source-pointer discovery and each tenant's set-based update.
    with op.get_context().autocommit_block():
        for name, table, columns, predicate in (
            ("ix_registration_form_template_retirement", "registration.registration_forms", "template_id,event_id", "template_id IS NOT NULL"),
            ("ix_registration_form_category_retirement", "registration.registration_forms", "category_id,event_id", "category_id IS NOT NULL"),
            ("ix_template_category_retirement", "design.form_templates", "category_id,organization_id", "category_id IS NOT NULL"),
            ("ix_abstract_template_retirement", "abstract.abstract_forms", "(schema->>'template_id'),organization_id", "is_active"),
        ):
            op.execute(f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {name} ON {table} ({columns}) WHERE {predicate}")
    op.execute("""DO $$ BEGIN
        IF (SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
            JOIN pg_namespace n ON n.oid=c.relnamespace WHERE i.indisvalid AND
            (n.nspname,c.relname) IN (
                ('registration','ix_registration_form_template_retirement'),
                ('registration','ix_registration_form_category_retirement'),
                ('design','ix_template_category_retirement'),
                ('abstract','ix_abstract_template_retirement'))) <> 4 THEN
            RAISE EXCEPTION 'Catalogue retirement indexes are incomplete or invalid';
        END IF;
    END $$""")


def downgrade():
    # Retain additive selectors/indexes for compatible application rollback.
    pass
