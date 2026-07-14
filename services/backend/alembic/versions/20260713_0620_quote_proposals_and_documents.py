"""Extend proposals and durable exports for approved quote documents."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


revision = "quote_proposals_0620"
down_revision = "quote_approval_0610"
branch_labels = None
depends_on = None


TENANT_POLICY = "organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid"


def upgrade() -> None:
    for column in (
        sa.Column("event_id", UUID(as_uuid=True), sa.ForeignKey("events.events.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("quote_id", UUID(as_uuid=True), sa.ForeignKey("commercial.quotes.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("proposal_number", sa.String(50), nullable=True),
        sa.Column("current_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("idempotency_key", sa.String(128), nullable=True),
        sa.Column("request_hash", sa.String(64), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    ):
        op.add_column("proposals", column, schema="crm")
    op.alter_column("proposals", "opportunity_id", nullable=True, schema="crm")
    op.create_unique_constraint("uq_crm_proposals_quote_id", "proposals", ["quote_id"], schema="crm")
    op.create_unique_constraint("uq_crm_proposals_number", "proposals", ["proposal_number"], schema="crm")
    op.create_unique_constraint("uq_proposals_org_idempotency", "proposals", ["organization_id", "idempotency_key"], schema="crm")
    op.create_index("ix_crm_proposals_org_status", "proposals", ["organization_id", "status"], schema="crm")

    op.create_table(
        "proposal_versions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("proposal_id", UUID(as_uuid=True), sa.ForeignKey("crm.proposals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("source_quote_id", UUID(as_uuid=True), sa.ForeignKey("commercial.quotes.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("source_quote_version", sa.Integer(), nullable=False),
        sa.Column("snapshot_json", JSONB(), nullable=False),
        sa.Column("reason", sa.String(500), nullable=False),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("proposal_id", "version", name="uq_proposal_version"),
        schema="crm",
    )
    op.create_index("ix_proposal_versions_org_proposal", "proposal_versions", ["organization_id", "proposal_id"], schema="crm")

    for column in (
        sa.Column("source_type", sa.String(50), nullable=True),
        sa.Column("source_id", UUID(as_uuid=True), nullable=True),
        sa.Column("source_version", sa.Integer(), nullable=True),
        sa.Column("idempotency_key", sa.String(128), nullable=True),
        sa.Column("request_hash", sa.String(64), nullable=True),
    ):
        op.add_column("data_exports", column, schema="audit")
    op.create_index("ix_audit_data_exports_source_id", "data_exports", ["source_id"], schema="audit")
    op.create_unique_constraint(
        "uq_data_exports_org_type_idempotency",
        "data_exports",
        ["organization_id", "export_type", "idempotency_key"],
        schema="audit",
    )

    for table in ("proposals", "proposal_versions"):
        op.execute(f"ALTER TABLE crm.{table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE crm.{table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation_{table} ON crm.{table} "
            f"USING ({TENANT_POLICY}) WITH CHECK ({TENANT_POLICY})"
        )


def downgrade() -> None:
    for table in ("proposal_versions", "proposals"):
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation_{table} ON crm.{table}")
        op.execute(f"ALTER TABLE crm.{table} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE crm.{table} DISABLE ROW LEVEL SECURITY")
    op.drop_table("proposal_versions", schema="crm")
    op.drop_index("ix_crm_proposals_org_status", table_name="proposals", schema="crm")
    op.drop_constraint("uq_proposals_org_idempotency", "proposals", schema="crm", type_="unique")
    op.drop_constraint("uq_crm_proposals_number", "proposals", schema="crm", type_="unique")
    op.drop_constraint("uq_crm_proposals_quote_id", "proposals", schema="crm", type_="unique")
    for name in ("updated_at", "created_at", "created_by", "request_hash", "idempotency_key", "current_version", "proposal_number", "quote_id", "event_id"):
        op.drop_column("proposals", name, schema="crm")

    op.drop_constraint("uq_data_exports_org_type_idempotency", "data_exports", schema="audit", type_="unique")
    op.drop_index("ix_audit_data_exports_source_id", table_name="data_exports", schema="audit")
    for name in ("request_hash", "idempotency_key", "source_version", "source_id", "source_type"):
        op.drop_column("data_exports", name, schema="audit")
