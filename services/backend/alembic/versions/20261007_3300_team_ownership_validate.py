"""Validate ownership only after reconciliation; never guess legacy authority."""
from alembic import op

revision = "20261007_3300"
down_revision = "20261007_3290"
branch_labels = None
depends_on = None


def upgrade():
    # Validation itself is the authoritative concurrent check. A preliminary
    # application count cannot substitute for it or protect against racing writes.
    for table, name in (
        ("organization_teams", "fk_team_owner_tenant"),
        ("organization_team_members", "fk_team_member_team_tenant"),
        ("organization_team_members", "fk_team_member_subject_tenant"),
        ("organization_team_events", "fk_team_event_team_tenant"),
        ("organization_team_events", "fk_team_event_resource_tenant"),
        ("emc_client_delegations", "fk_delegation_event_tenant"),
    ):
        op.execute(f"ALTER TABLE organizer_access.{table} VALIDATE CONSTRAINT {name}")


def downgrade():
    raise RuntimeError("Do not restore unvalidated ownership constraints on rollback.")
