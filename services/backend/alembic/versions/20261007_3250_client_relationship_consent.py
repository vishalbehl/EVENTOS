"""Persist client consent/delegation without rewriting commercial history."""
from alembic import op
import sqlalchemy as sa

revision = "20261007_3250"
down_revision = "20261007_3240"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("emc_client_relationships", sa.Column("approved_at", sa.DateTime(timezone=True)), schema="organizer_access")
    op.add_column("emc_client_relationships", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()), schema="organizer_access")
    op.add_column("emc_client_relationships", sa.Column("policy_revision", sa.BigInteger(), nullable=False, server_default="1"), schema="organizer_access")
    op.create_unique_constraint("uq_relationship_parties", "emc_client_relationships", ["id", "client_organization_id", "emc_organization_id"], schema="organizer_access")
    op.execute("""
        CREATE TABLE organizer_access.emc_client_delegations (
            id uuid PRIMARY KEY, relationship_id uuid NOT NULL,
            client_organization_id uuid NOT NULL, emc_organization_id uuid NOT NULL,
            member_id uuid NOT NULL, workspace_id uuid NOT NULL,
            event_id uuid REFERENCES events.events(id), actions jsonb NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            FOREIGN KEY (relationship_id, client_organization_id, emc_organization_id)
              REFERENCES organizer_access.emc_client_relationships(id, client_organization_id, emc_organization_id),
            FOREIGN KEY (client_organization_id, workspace_id)
              REFERENCES organizer_access.operational_workspaces(organization_id, id),
            FOREIGN KEY (emc_organization_id, member_id)
              REFERENCES organizer_access.organization_members(organization_id, id),
            CONSTRAINT ck_delegation_actions CHECK (jsonb_typeof(actions) = 'array' AND jsonb_array_length(actions) BETWEEN 1 AND 32)
        )
    """)
    op.create_index("ix_delegation_member_context", "emc_client_delegations", ["member_id", "client_organization_id", "workspace_id", "event_id"], schema="organizer_access")
    op.create_index("ix_delegation_relationship", "emc_client_delegations", ["relationship_id"], schema="organizer_access")
    op.execute("ALTER TABLE organizer_access.emc_client_delegations ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE organizer_access.emc_client_delegations FORCE ROW LEVEL SECURITY")
    predicate = "nullif(current_setting('app.current_organization_id', true), '')::uuid IN (client_organization_id, emc_organization_id)"
    op.execute(f"CREATE POLICY tenant_isolation_emc_client_delegations ON organizer_access.emc_client_delegations USING ({predicate}) WITH CHECK ({predicate})")
    op.execute("""
        CREATE TABLE organizer_access.emc_client_provisioning (
            id uuid PRIMARY KEY, emc_organization_id uuid NOT NULL, client_organization_id uuid NOT NULL,
            relationship_id uuid NOT NULL, owner_member_id uuid NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT uq_provisioned_client UNIQUE (client_organization_id),
            FOREIGN KEY (relationship_id, client_organization_id, emc_organization_id)
              REFERENCES organizer_access.emc_client_relationships(id, client_organization_id, emc_organization_id),
            FOREIGN KEY (client_organization_id, owner_member_id)
              REFERENCES organizer_access.organization_members(organization_id, id)
        )
    """)
    op.create_index("ix_client_provisioning_emc", "emc_client_provisioning", ["emc_organization_id", "id"], schema="organizer_access")
    op.execute("ALTER TABLE organizer_access.emc_client_provisioning ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE organizer_access.emc_client_provisioning FORCE ROW LEVEL SECURITY")
    op.execute(f"CREATE POLICY tenant_isolation_emc_client_provisioning ON organizer_access.emc_client_provisioning USING ({predicate}) WITH CHECK ({predicate})")
    # Retain legacy relationship state, but never manufacture approved grants.
    # Existing ACTIVE rows without consent/grants require reconciliation before use.


def downgrade():
    raise RuntimeError("Client consent and delegation history must be retained; use fail-closed application rollback.")
