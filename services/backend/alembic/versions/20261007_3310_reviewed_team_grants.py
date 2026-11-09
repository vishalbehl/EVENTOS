"""Reviewed team grants only; legacy records are not automatically authorised."""
from alembic import op

revision = "20261007_3310"
down_revision = "20261007_3300"
branch_labels = None
depends_on = None


def upgrade():
    # Frozen catalogue v1. Future additions require a new migration/version,
    # never an import of mutable application policy into migration history.
    op.execute("""CREATE OR REPLACE FUNCTION organizer_access.category_a_team_permissions_valid_v1(payload jsonb)
      RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
        SELECT CASE WHEN jsonb_typeof(payload) = 'object' THEN
          (SELECT count(*) <= 100 AND coalesce(bool_and(
            jsonb_typeof(value) = 'boolean' AND key = ANY(ARRAY['EVENTS:VIEW', 'EVENTS:CREATE', 'EVENTS:EDIT', 'EVENTS:DELETE', 'EVENTS:EXPORT', 'SESSIONS:VIEW', 'SESSIONS:CREATE', 'SESSIONS:EDIT', 'SESSIONS:DELETE', 'SESSIONS:APPROVE', 'SESSIONS:OVERRIDE', 'SESSIONS:EXPORT', 'SPEAKERS:VIEW', 'SPEAKERS:CREATE', 'SPEAKERS:EDIT', 'SPEAKERS:DELETE', 'SPEAKERS:APPROVE', 'SPEAKERS:EXPORT', 'FILES:VIEW', 'FILES:CREATE', 'FILES:EDIT', 'FILES:DELETE', 'FILES:APPROVE', 'FILES:REJECT', 'FILES:DOWNLOAD', 'FILES:EXPORT', 'ROOMS:VIEW', 'ROOMS:CREATE', 'ROOMS:EDIT', 'ROOMS:DELETE', 'ROOMS:OVERRIDE', 'QUEUE:VIEW', 'QUEUE:CREATE', 'QUEUE:EDIT', 'QUEUE:DELETE', 'QUEUE:OVERRIDE', 'DEVICES:VIEW', 'DEVICES:CREATE', 'DEVICES:EDIT', 'DEVICES:DELETE', 'POSTERS:VIEW', 'POSTERS:CREATE', 'POSTERS:EDIT', 'POSTERS:DELETE', 'POSTERS:APPROVE', 'POSTERS:EXPORT', 'REPORTS:VIEW', 'REPORTS:EXPORT', 'ANALYTICS:VIEW', 'ANALYTICS:REG_DASHBOARD', 'ANALYTICS:HUB', 'ANALYTICS:EXPORT', 'PARTICIPANTS:VIEW', 'PARTICIPANTS:CREATE', 'PARTICIPANTS:EDIT', 'PARTICIPANTS:DELETE', 'PARTICIPANTS:IMPORT', 'PARTICIPANTS:EXPORT', 'REGISTRATION:VIEW_QUEUE', 'REGISTRATION:APPROVE', 'REGISTRATION:REJECT', 'REGISTRATION:WAITLIST', 'REGISTRATION:OVERRIDE', 'REG_CONFIG:VIEW', 'REG_CONFIG:EDIT', 'REG_CONFIG:PRICING', 'REG_CONFIG:ROLES', 'REG_CONFIG:FORM', 'REG_CONFIG:FAQ', 'BADGES:VIEW', 'BADGES:GENERATE', 'BADGES:PRINT', 'BADGES:REPRINT', 'BADGES:TEMPLATES', 'BADGES:QUEUE', 'BADGES:EXPORT', 'CHECKIN:VIEW', 'CHECKIN:QR', 'CHECKIN:MANUAL', 'CHECKIN:UNDO', 'CHECKIN:LOGS', 'CAMPAIGNS:VIEW', 'CAMPAIGNS:CREATE', 'CAMPAIGNS:EDIT', 'CAMPAIGNS:SEND', 'CAMPAIGNS:DELETE', 'CAMPAIGNS:TEMPLATES', 'ANNOUNCEMENTS:VIEW', 'ANNOUNCEMENTS:EDIT']::text[])), true)
           FROM jsonb_each(payload))
        ELSE false END
      $$""")
    op.execute("ALTER TABLE organizer_access.organization_team_events ADD COLUMN IF NOT EXISTS authorization_version integer NOT NULL DEFAULT 0")
    for name, expression in (
        ("ck_team_event_authorization_version", "authorization_version IN (0, 1)"),
        ("ck_team_event_approved_permissions", "authorization_version = 0 OR organizer_access.category_a_team_permissions_valid_v1(permissions)"),
    ):
        op.execute(f"""DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE
            conrelid = 'organizer_access.organization_team_events'::regclass AND conname = '{name}') THEN
            ALTER TABLE organizer_access.organization_team_events ADD CONSTRAINT {name} CHECK ({expression}) NOT VALID;
          END IF;
        END $$""")
        op.execute(f"ALTER TABLE organizer_access.organization_team_events VALIDATE CONSTRAINT {name}")
    with op.get_context().autocommit_block():
        op.execute("CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_team_event_approved_context ON organizer_access.organization_team_events (organization_id, event_id, team_id) WHERE authorization_version = 1")
        op.execute("""DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'organizer_access'
            AND c.relname = 'ix_team_event_approved_context' AND (NOT i.indisvalid OR NOT i.indisready)) THEN
            RAISE EXCEPTION 'Approved team grant index requires operator-reviewed repair before retry';
          END IF;
        END $$""")


def downgrade():
    raise RuntimeError("Retain reviewed-grant markers and isolation checks during application rollback.")
