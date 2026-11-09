"""Expand tenant ownership checks without rewriting conflicting legacy records."""
from alembic import op

revision = "20261007_3290"
down_revision = "20261007_3280"
branch_labels = None
depends_on = None


def upgrade():
    # All identifiers and expressions below are compile-time constants.
    indexes = (
        ("uq_organization_team_owner", "organizer_access.organization_teams", "organization_id, id", True),
        ("uq_event_owner", "events.events", "organization_id, id", True),
        ("ix_team_owner_member", "organizer_access.organization_teams", "organization_id, owner_member_id", False),
        ("ix_team_member_subject", "organizer_access.organization_team_members", "organization_id, organization_member_id", False),
        ("ix_team_event_resource", "organizer_access.organization_team_events", "organization_id, event_id", False),
        ("ix_delegation_event_owner", "organizer_access.emc_client_delegations", "client_organization_id, event_id", False),
    )
    with op.get_context().autocommit_block():
        for name, table, columns, unique in indexes:
            op.execute(f"CREATE {'UNIQUE ' if unique else ''}INDEX CONCURRENTLY IF NOT EXISTS {name} ON {table} ({columns})")
        op.execute("""DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE (n.nspname, c.relname) IN (
              ('organizer_access', 'uq_organization_team_owner'), ('events', 'uq_event_owner'),
              ('organizer_access', 'ix_team_owner_member'), ('organizer_access', 'ix_team_member_subject'),
              ('organizer_access', 'ix_team_event_resource'), ('organizer_access', 'ix_delegation_event_owner'))
            AND (NOT i.indisvalid OR NOT i.indisready)) THEN
            RAISE EXCEPTION 'Ownership indexes require operator-reviewed repair before retry';
          END IF;
        END $$""")
    for name, table, _, unique in indexes:
        if unique:
            op.execute(f"""DO $$ BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conrelid = '{table}'::regclass AND conname = '{name}') THEN
                ALTER TABLE {table} ADD CONSTRAINT {name} UNIQUE USING INDEX {name};
              END IF;
            END $$""")
    constraints = (
        ("organization_teams", "fk_team_owner_tenant", "organization_id, owner_member_id",
         "organizer_access.organization_members", "organization_id, id", "DEFERRABLE INITIALLY DEFERRED"),
        ("organization_team_members", "fk_team_member_team_tenant", "organization_id, team_id",
         "organizer_access.organization_teams", "organization_id, id", "ON DELETE CASCADE"),
        ("organization_team_members", "fk_team_member_subject_tenant", "organization_id, organization_member_id",
         "organizer_access.organization_members", "organization_id, id", "ON DELETE CASCADE"),
        ("organization_team_events", "fk_team_event_team_tenant", "organization_id, team_id",
         "organizer_access.organization_teams", "organization_id, id", "ON DELETE CASCADE"),
        ("organization_team_events", "fk_team_event_resource_tenant", "organization_id, event_id",
         "events.events", "organization_id, id", "ON DELETE CASCADE"),
        ("emc_client_delegations", "fk_delegation_event_tenant", "client_organization_id, event_id",
         "events.events", "organization_id, id", ""),
    )
    for table, name, columns, parent, parent_columns, options in constraints:
        op.execute(f"""DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE
            conrelid = 'organizer_access.{table}'::regclass AND conname = '{name}') THEN
            ALTER TABLE organizer_access.{table} ADD CONSTRAINT {name}
              FOREIGN KEY ({columns}) REFERENCES {parent} ({parent_columns}) {options} NOT VALID;
          END IF;
        END $$""")


def downgrade():
    raise RuntimeError("Retain tenant ownership protection during application rollback.")
