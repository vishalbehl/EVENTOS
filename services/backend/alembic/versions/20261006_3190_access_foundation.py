"""Expand operational access ownership; reconciliation precedes enforcement.

No customer or commercial history is converted automatically. Backfill and
validation are explicit release steps, not an unbounded migration transaction.
"""
from alembic import op
import sqlalchemy as sa

revision = "20261006_3190"
down_revision = "20260922_3180"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("organization_kind", sa.String(10), nullable=False, server_default="NORMAL"), schema="platform")
    op.create_check_constraint("ck_organization_kind", "organizations", "organization_kind IN ('NORMAL', 'EMC', 'CLIENT')", schema="platform")
    op.create_unique_constraint("uq_organization_member_owner", "organization_members", ["organization_id", "id"], schema="organizer_access")
    op.execute("""
        CREATE TABLE organizer_access.operational_workspaces (
            id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES platform.organizations(id),
            name varchar(160) NOT NULL, status varchar(20) NOT NULL DEFAULT 'ACTIVE',
            is_default boolean NOT NULL DEFAULT false, version integer NOT NULL DEFAULT 1,
            created_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT uq_operational_workspace_owner UNIQUE (organization_id, id),
            CONSTRAINT ck_operational_workspace_status CHECK (status IN ('ACTIVE', 'ARCHIVED'))
        )
    """)
    op.execute("CREATE UNIQUE INDEX uq_operational_workspace_default ON organizer_access.operational_workspaces(organization_id) WHERE is_default = true")
    op.execute("CREATE INDEX ix_operational_workspace_page ON organizer_access.operational_workspaces(organization_id, status, id)")
    op.execute("""
        CREATE TABLE organizer_access.workspace_role_bindings (
            id uuid PRIMARY KEY, organization_id uuid NOT NULL, workspace_id uuid NOT NULL,
            member_id uuid NOT NULL, role varchar(20) NOT NULL,
            CONSTRAINT uq_workspace_member_binding UNIQUE(organization_id, workspace_id, member_id),
            FOREIGN KEY (organization_id, workspace_id) REFERENCES organizer_access.operational_workspaces(organization_id, id),
            FOREIGN KEY (organization_id, member_id) REFERENCES organizer_access.organization_members(organization_id, id),
            CONSTRAINT ck_workspace_binding_role CHECK (role IN ('admin', 'member', 'viewer'))
        )
    """)
    op.execute("CREATE INDEX ix_workspace_binding_subject ON organizer_access.workspace_role_bindings(member_id, workspace_id)")
    op.execute("""
        CREATE TABLE organizer_access.emc_client_relationships (
            id uuid PRIMARY KEY, emc_organization_id uuid NOT NULL REFERENCES platform.organizations(id),
            client_organization_id uuid NOT NULL REFERENCES platform.organizations(id),
            requested_by uuid NOT NULL REFERENCES identity.users(id),
            approved_by uuid REFERENCES identity.users(id), status varchar(20) NOT NULL DEFAULT 'REQUESTED',
            version integer NOT NULL DEFAULT 1, scopes jsonb NOT NULL DEFAULT '[]',
            created_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT ck_client_relationship_distinct CHECK (emc_organization_id <> client_organization_id),
            CONSTRAINT ck_client_relationship_status CHECK (status IN ('REQUESTED','ACTIVE','SUSPENDED','REJECTED','DETACHED'))
        )
    """)
    op.execute("CREATE UNIQUE INDEX uq_client_managing_emc ON organizer_access.emc_client_relationships(client_organization_id) WHERE status IN ('ACTIVE', 'SUSPENDED')")
    op.execute("CREATE INDEX ix_client_relationship_portfolio ON organizer_access.emc_client_relationships(emc_organization_id, status, id)")
    op.execute("CREATE INDEX ix_client_relationship_inbox ON organizer_access.emc_client_relationships(client_organization_id, status, id)")
    op.execute("""
        CREATE TABLE organizer_access.organization_access_revisions (
            organization_id uuid PRIMARY KEY REFERENCES platform.organizations(id), revision bigint NOT NULL DEFAULT 1
        )
    """)
    op.execute("""
        CREATE TABLE organizer_access.access_mutations (
            organization_id uuid NOT NULL REFERENCES platform.organizations(id),
            actor_id uuid NOT NULL REFERENCES identity.users(id), operation varchar(80) NOT NULL,
            key varchar(200) NOT NULL, request_hash varchar(64) NOT NULL, result jsonb NOT NULL,
            PRIMARY KEY (organization_id, actor_id, operation, key)
        )
    """)
    op.add_column("events", sa.Column("operational_workspace_id", sa.UUID(), nullable=True), schema="events")
    op.create_foreign_key("fk_event_operational_workspace", "events", "operational_workspaces", ["operational_workspace_id"], ["id"], source_schema="events", referent_schema="organizer_access")
    op.execute("ALTER TABLE events.events ADD CONSTRAINT fk_event_workspace_owner FOREIGN KEY (organization_id, operational_workspace_id) REFERENCES organizer_access.operational_workspaces(organization_id, id) NOT VALID")
    # These are new empty tables: building their indexes does not block old event writes.
    # RLS policies enforce both visibility and writes, using transaction-local context.
    for table in ("operational_workspaces", "workspace_role_bindings", "organization_access_revisions", "access_mutations"):
        op.execute(f"ALTER TABLE organizer_access.{table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE organizer_access.{table} FORCE ROW LEVEL SECURITY")
        predicate = "organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid"
        op.execute(f"CREATE POLICY tenant_isolation_{table} ON organizer_access.{table} USING ({predicate}) WITH CHECK ({predicate})")
    op.execute("ALTER TABLE organizer_access.emc_client_relationships ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE organizer_access.emc_client_relationships FORCE ROW LEVEL SECURITY")
    predicate = "nullif(current_setting('app.current_organization_id', true), '')::uuid IN (emc_organization_id, client_organization_id)"
    op.execute(f"CREATE POLICY tenant_isolation_emc_client_relationships ON organizer_access.emc_client_relationships USING ({predicate}) WITH CHECK ({predicate})")


def downgrade() -> None:
    raise RuntimeError("Access history is retained. Roll back application binaries; destructive schema downgrade is not supported.")
