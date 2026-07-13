"""Add durable tenant-scoped export lifecycle and RLS."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = "phase1_exports_0550"
down_revision = "phase1_device_keys_0540"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("data_exports", sa.Column("organization_id", sa.UUID(), nullable=True), schema="audit")
    op.add_column("data_exports", sa.Column("event_id", sa.UUID(), nullable=True), schema="audit")
    op.add_column("data_exports", sa.Column("export_type", sa.String(length=80), nullable=False, server_default="event_summary"), schema="audit")
    op.add_column("data_exports", sa.Column("file_format", sa.String(length=12), nullable=False, server_default="xlsx"), schema="audit")
    op.add_column("data_exports", sa.Column("storage_key", sa.Text(), nullable=True), schema="audit")
    op.add_column("data_exports", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True), schema="audit")
    op.add_column("data_exports", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True), schema="audit")
    op.add_column("data_exports", sa.Column("downloaded_at", sa.DateTime(timezone=True), nullable=True), schema="audit")
    op.add_column("data_exports", sa.Column("failure_reason", sa.Text(), nullable=True), schema="audit")
    op.add_column("data_exports", sa.Column("request_metadata", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")), schema="audit")
    op.execute("UPDATE audit.data_exports SET organization_id = '00000000-0000-0000-0000-000000000000' WHERE organization_id IS NULL")
    op.alter_column("data_exports", "organization_id", nullable=False, schema="audit")
    op.create_index("ix_audit_data_exports_organization_id", "data_exports", ["organization_id"], schema="audit")
    op.create_index("ix_audit_data_exports_event_id", "data_exports", ["event_id"], schema="audit")
    op.execute("ALTER TABLE audit.data_exports ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE audit.data_exports FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY tenant_isolation_data_exports ON audit.data_exports
        USING (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
        WITH CHECK (organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid)
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation_data_exports ON audit.data_exports")
    op.execute("ALTER TABLE audit.data_exports NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE audit.data_exports DISABLE ROW LEVEL SECURITY")
    op.drop_index("ix_audit_data_exports_event_id", table_name="data_exports", schema="audit")
    op.drop_index("ix_audit_data_exports_organization_id", table_name="data_exports", schema="audit")
    for name in ("request_metadata", "failure_reason", "downloaded_at", "completed_at", "expires_at", "storage_key", "file_format", "export_type", "event_id", "organization_id"):
        op.drop_column("data_exports", name, schema="audit")
