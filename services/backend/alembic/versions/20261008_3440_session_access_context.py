"""Persist a validated operational context per refresh-token family.

The expansion is additive and backfills existing sessions to their identity
home organisation. Application rollback must retain these columns and use a
context-aware binary; a home-tenant-only binary is not compatible with activated
delegated sessions.
"""
from alembic import op
import sqlalchemy as sa


revision = "20261008_3440"
down_revision = "20261008_3430"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for name in ("active_organization_id", "acting_organization_id"):
        op.add_column("refresh_tokens", sa.Column(name, sa.UUID(), nullable=True), schema="identity")
    op.add_column("refresh_tokens", sa.Column("access_mode", sa.String(12), nullable=False,
        server_default="DIRECT"), schema="identity")
    op.add_column("refresh_tokens", sa.Column("active_workspace_id", sa.UUID()), schema="identity")
    op.add_column("refresh_tokens", sa.Column("active_event_id", sa.UUID()), schema="identity")
    op.add_column("refresh_tokens", sa.Column("relationship_id", sa.UUID()), schema="identity")
    op.execute("""
        UPDATE identity.refresh_tokens AS token
           SET active_organization_id = actor.organization_id,
               acting_organization_id = actor.organization_id
          FROM identity.users AS actor
         WHERE actor.id = token.user_id
           AND (token.active_organization_id IS NULL OR token.acting_organization_id IS NULL)
    """)
    op.alter_column("refresh_tokens", "active_organization_id", nullable=False, schema="identity")
    op.alter_column("refresh_tokens", "acting_organization_id", nullable=False, schema="identity")
    op.create_index("ix_refresh_tokens_active_organization_id", "refresh_tokens",
        ["active_organization_id"], schema="identity")
    op.create_check_constraint("ck_refresh_token_access_mode", "refresh_tokens",
        "access_mode IN ('DIRECT', 'DELEGATED')", schema="identity")
    op.create_check_constraint("ck_refresh_token_context_shape", "refresh_tokens",
        "(access_mode = 'DIRECT' AND acting_organization_id = active_organization_id "
        "AND relationship_id IS NULL AND active_event_id IS NULL) OR "
        "(access_mode = 'DELEGATED' AND relationship_id IS NOT NULL "
        "AND active_workspace_id IS NOT NULL AND acting_organization_id <> active_organization_id)",
        schema="identity")
    op.create_foreign_key("fk_refresh_context_organization", "refresh_tokens", "organizations",
        ["active_organization_id"], ["id"], source_schema="identity", referent_schema="platform")
    op.create_foreign_key("fk_refresh_context_actor_organization", "refresh_tokens", "organizations",
        ["acting_organization_id"], ["id"], source_schema="identity", referent_schema="platform")
    op.create_foreign_key("fk_refresh_context_workspace", "refresh_tokens", "operational_workspaces",
        ["active_organization_id", "active_workspace_id"], ["organization_id", "id"],
        source_schema="identity", referent_schema="organizer_access")
    op.create_foreign_key("fk_refresh_context_event", "refresh_tokens", "events",
        ["active_organization_id", "active_event_id"], ["organization_id", "id"],
        source_schema="identity", referent_schema="events")
    op.create_foreign_key("fk_refresh_context_relationship", "refresh_tokens", "emc_client_relationships",
        ["relationship_id", "active_organization_id", "acting_organization_id"],
        ["id", "client_organization_id", "emc_organization_id"],
        source_schema="identity", referent_schema="organizer_access")

    # Discovery policies are identity-bound and read-only. They allow the two
    # bounded context-directory queries to run without a tenant-filter bypass.
    op.execute("""
        CREATE POLICY delegation_discovery_identity
        ON organizer_access.emc_client_delegations FOR SELECT
        USING (EXISTS (
            SELECT 1 FROM organizer_access.organization_members AS member
             WHERE member.id = emc_client_delegations.member_id
               AND member.organization_id = emc_client_delegations.emc_organization_id
               AND member.user_id = nullif(current_setting('app.access_discovery_user_id', true), '')::uuid
               AND member.is_active = true AND member.accepted_at IS NOT NULL
        ))
    """)
    op.execute("""
        CREATE POLICY relationship_discovery_identity
        ON organizer_access.emc_client_relationships FOR SELECT
        USING (EXISTS (
            SELECT 1
              FROM organizer_access.emc_client_delegations AS delegation
              JOIN organizer_access.organization_members AS member
                ON member.id = delegation.member_id
               AND member.organization_id = delegation.emc_organization_id
             WHERE delegation.relationship_id = emc_client_relationships.id
               AND member.user_id = nullif(current_setting('app.access_discovery_user_id', true), '')::uuid
               AND member.is_active = true AND member.accepted_at IS NOT NULL
        ))
    """)
    op.execute("""
        CREATE POLICY delegated_workspace_discovery_identity
        ON organizer_access.operational_workspaces FOR SELECT
        USING (EXISTS (
            SELECT 1
              FROM organizer_access.emc_client_delegations AS delegation
              JOIN organizer_access.organization_members AS member
                ON member.id = delegation.member_id
               AND member.organization_id = delegation.emc_organization_id
             WHERE delegation.client_organization_id = operational_workspaces.organization_id
               AND delegation.workspace_id = operational_workspaces.id
               AND member.user_id = nullif(current_setting('app.access_discovery_user_id', true), '')::uuid
               AND member.is_active = true AND member.accepted_at IS NOT NULL
        ))
    """)


def downgrade() -> None:
    # Session context and consent discovery are security history. Keep the
    # additive schema during binary rollback instead of weakening enforcement.
    raise RuntimeError("Session access context is retained; roll back application binaries only.")
