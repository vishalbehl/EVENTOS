"""add tenant and file-safety boundaries to support attachments

Revision ID: support_attachment_safety_0760
Revises: crm_engagement_lifecycle_0750
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "support_attachment_safety_0760"
down_revision = "crm_engagement_lifecycle_0750"
branch_labels = None
depends_on = None


TENANT_POLICY = "organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid"


def upgrade() -> None:
    op.add_column("ticket_attachments", sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True), schema="support")
    op.add_column("ticket_attachments", sa.Column("asset_id", postgresql.UUID(as_uuid=True), nullable=True), schema="support")
    op.add_column("ticket_attachments", sa.Column("uploaded_by", postgresql.UUID(as_uuid=True), nullable=True), schema="support")
    op.add_column("ticket_attachments", sa.Column("idempotency_key", sa.String(length=128), nullable=True), schema="support")
    op.add_column("ticket_attachments", sa.Column("request_hash", sa.String(length=64), nullable=True), schema="support")
    op.execute("""
        UPDATE support.ticket_attachments AS attachment
        SET organization_id = ticket.organization_id
        FROM support.support_tickets AS ticket
        WHERE ticket.id = attachment.ticket_id
    """)
    op.alter_column("ticket_attachments", "organization_id", nullable=False, schema="support")
    op.create_foreign_key("fk_ticket_attachments_organization", "ticket_attachments", "organizations", ["organization_id"], ["id"], source_schema="support", referent_schema="platform", ondelete="CASCADE")
    op.create_foreign_key("fk_ticket_attachments_asset", "ticket_attachments", "assets", ["asset_id"], ["id"], source_schema="support", referent_schema="files", ondelete="RESTRICT")
    op.create_foreign_key("fk_ticket_attachments_uploaded_by", "ticket_attachments", "users", ["uploaded_by"], ["id"], source_schema="support", referent_schema="identity", ondelete="SET NULL")
    op.create_index("ix_support_ticket_attachments_organization_id", "ticket_attachments", ["organization_id"], schema="support")
    op.create_index("uq_support_ticket_attachment_asset", "ticket_attachments", ["asset_id"], unique=True, schema="support")
    op.create_index("uq_support_ticket_attachment_idempotency", "ticket_attachments", ["organization_id", "ticket_id", "idempotency_key"], unique=True, schema="support", postgresql_where=sa.text("idempotency_key IS NOT NULL"))
    op.execute("ALTER TABLE support.ticket_attachments ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE support.ticket_attachments FORCE ROW LEVEL SECURITY")
    op.execute(f"CREATE POLICY tenant_isolation ON support.ticket_attachments USING ({TENANT_POLICY}) WITH CHECK ({TENANT_POLICY})")


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON support.ticket_attachments")
    op.execute("ALTER TABLE support.ticket_attachments NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE support.ticket_attachments DISABLE ROW LEVEL SECURITY")
    op.drop_index("uq_support_ticket_attachment_idempotency", table_name="ticket_attachments", schema="support")
    op.drop_index("uq_support_ticket_attachment_asset", table_name="ticket_attachments", schema="support")
    op.drop_index("ix_support_ticket_attachments_organization_id", table_name="ticket_attachments", schema="support")
    op.drop_constraint("fk_ticket_attachments_uploaded_by", "ticket_attachments", schema="support", type_="foreignkey")
    op.drop_constraint("fk_ticket_attachments_asset", "ticket_attachments", schema="support", type_="foreignkey")
    op.drop_constraint("fk_ticket_attachments_organization", "ticket_attachments", schema="support", type_="foreignkey")
    for column in ["request_hash", "idempotency_key", "uploaded_by", "asset_id", "organization_id"]:
        op.drop_column("ticket_attachments", column, schema="support")
