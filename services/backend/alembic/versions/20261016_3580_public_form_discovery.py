"""Narrow public event owner discovery; no customer table bypass grant.

Revision ID: 20261016_3580
Revises: 20261015_3570
"""
from alembic import op

revision = "20261016_3580"
down_revision = "20261015_3570"
branch_labels = None
depends_on = None

PUBLIC_FORM_OWNER_SQL = """
CREATE OR REPLACE FUNCTION registration.public_form_owner_v1(requested_event uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $function$
    SELECT event.organization_id
      FROM events.events AS event
      JOIN platform.organizations AS organization ON organization.id=event.organization_id
     WHERE event.id=requested_event
       AND event.deleted_at IS NULL AND event.status IN ('active','completed')
       AND organization.is_active IS TRUE
       AND organization.suspended_at IS NULL AND organization.archived_at IS NULL
       AND organization.is_platform_org IS FALSE
$function$;
"""


def upgrade():
    # FORCE RLS must not depend on object-owner bypass or an inherited role
    # attribute. The dedicated migration login itself must be privileged.
    op.execute("""DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user
                       AND (rolsuper OR rolbypassrls)) THEN
            RAISE EXCEPTION 'Public discovery requires the dedicated migration login';
        END IF;
    END $$""")
    op.execute(PUBLIC_FORM_OWNER_SQL)
    op.execute("REVOKE ALL ON FUNCTION registration.public_form_owner_v1(uuid) FROM PUBLIC")
    op.execute("""DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='event_runtime') THEN
            GRANT EXECUTE ON FUNCTION registration.public_form_owner_v1(uuid) TO event_runtime;
        END IF;
    END $$""")


def downgrade():
    # Preserve the additive function for compatible application rollback.
    # No table policy, event ownership, membership or customer data is removed.
    pass
