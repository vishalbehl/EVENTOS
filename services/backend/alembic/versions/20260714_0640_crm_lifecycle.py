"""Add tenant-safe CRM lifecycle and idempotency fields."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "crm_lifecycle_0640"
down_revision = "proposal_sharing_0630"
branch_labels = None
depends_on = None

TENANT_POLICY = "organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid"


def _add_lifecycle_columns(table_name: str) -> None:
    op.add_column(table_name, sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()), schema="crm")
    op.add_column(table_name, sa.Column("version", sa.Integer(), nullable=False, server_default="1"), schema="crm")
    op.add_column(table_name, sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True), schema="crm")
    op.add_column(table_name, sa.Column("archived_by", UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True), schema="crm")
    op.add_column(table_name, sa.Column("archive_reason", sa.Text(), nullable=True), schema="crm")
    op.create_index(f"ix_crm_{table_name}_org_archived", table_name, ["organization_id", "archived_at"], schema="crm")


def upgrade() -> None:
    for table_name in ("accounts", "contacts", "leads", "opportunities"):
        _add_lifecycle_columns(table_name)

    op.drop_constraint("contacts_email_key", "contacts", schema="crm", type_="unique")
    op.create_unique_constraint("uq_crm_contacts_org_email", "contacts", ["organization_id", "email"], schema="crm")

    op.create_table(
        "operation_requests",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("operation_type", sa.String(80), nullable=False),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDING"),
        sa.Column("result_ref_type", sa.String(50), nullable=True),
        sa.Column("result_ref_id", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "operation_type", "idempotency_key", name="uq_crm_operation_request"),
        schema="crm",
    )
    op.create_index("ix_crm_operation_requests_org_created", "operation_requests", ["organization_id", "created_at"], schema="crm")
    op.create_index("ix_rls_crm_operation_requests_organization", "operation_requests", ["organization_id"], schema="crm")
    op.execute("ALTER TABLE crm.operation_requests ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE crm.operation_requests FORCE ROW LEVEL SECURITY")
    op.execute(f"CREATE POLICY tenant_isolation ON crm.operation_requests USING ({TENANT_POLICY}) WITH CHECK ({TENANT_POLICY})")


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON crm.operation_requests")
    op.drop_table("operation_requests", schema="crm")
    op.drop_constraint("uq_crm_contacts_org_email", "contacts", schema="crm", type_="unique")
    op.create_unique_constraint("contacts_email_key", "contacts", ["email"], schema="crm")
    for table_name in reversed(("accounts", "contacts", "leads", "opportunities")):
        op.drop_index(f"ix_crm_{table_name}_org_archived", table_name=table_name, schema="crm")
        for column_name in ("archive_reason", "archived_by", "archived_at", "version", "updated_at"):
            op.drop_column(table_name, column_name, schema="crm")
