"""Add tenant-scoped commercial quotes and immutable revisions."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


revision = "commercial_quotes_0600"
down_revision = "phase1_exports_0550"
branch_labels = None
depends_on = None


TENANT_POLICY = "organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid"


def upgrade() -> None:
    op.create_table(
        "quotes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_id", UUID(as_uuid=True), sa.ForeignKey("events.events.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("service_request_id", UUID(as_uuid=True), sa.ForeignKey("technology_services.service_requests.id", ondelete="SET NULL"), nullable=True),
        sa.Column("quote_number", sa.String(50), nullable=False, unique=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="DRAFT"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="INR"),
        sa.Column("validity_days", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("valid_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("discount_type", sa.String(20), nullable=False, server_default="NONE"),
        sa.Column("discount_value", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("tax_rate", sa.Numeric(7, 4), nullable=False, server_default="0"),
        sa.Column("subtotal", sa.Numeric(16, 2), nullable=False, server_default="0"),
        sa.Column("discount_amount", sa.Numeric(16, 2), nullable=False, server_default="0"),
        sa.Column("taxable_amount", sa.Numeric(16, 2), nullable=False, server_default="0"),
        sa.Column("tax_amount", sa.Numeric(16, 2), nullable=False, server_default="0"),
        sa.Column("total_amount", sa.Numeric(16, 2), nullable=False, server_default="0"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("internal_notes", sa.Text(), nullable=True),
        sa.Column("idempotency_key", sa.String(128), nullable=True),
        sa.Column("request_hash", sa.String(64), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "idempotency_key", name="uq_quotes_org_idempotency"),
        schema="commercial",
    )
    op.create_index("ix_quotes_org_event_created", "quotes", ["organization_id", "event_id", "created_at"], schema="commercial")
    op.create_index("ix_quotes_org_status", "quotes", ["organization_id", "status"], schema="commercial")
    op.create_index("ix_quotes_service_request", "quotes", ["service_request_id"], schema="commercial")

    op.create_table(
        "quote_line_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("quote_id", UUID(as_uuid=True), sa.ForeignKey("commercial.quotes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category", sa.String(80), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("quantity", sa.Numeric(12, 2), nullable=False),
        sa.Column("duration_days", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("unit_rate", sa.Numeric(14, 2), nullable=False),
        sa.Column("line_subtotal", sa.Numeric(16, 2), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        schema="commercial",
    )
    op.create_index("ix_quote_line_items_quote", "quote_line_items", ["quote_id", "sort_order"], schema="commercial")

    op.create_table(
        "quote_revisions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("quote_id", UUID(as_uuid=True), sa.ForeignKey("commercial.quotes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("snapshot_json", JSONB(), nullable=False),
        sa.Column("reason", sa.String(500), nullable=False),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("quote_id", "version", name="uq_quote_revision_version"),
        schema="commercial",
    )
    op.create_index("ix_quote_revisions_quote_created", "quote_revisions", ["quote_id", "created_at"], schema="commercial")

    for table in ("quotes", "quote_line_items", "quote_revisions"):
        op.execute(f"ALTER TABLE commercial.{table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE commercial.{table} FORCE ROW LEVEL SECURITY")
    op.execute(f"CREATE POLICY tenant_isolation_quotes ON commercial.quotes USING ({TENANT_POLICY}) WITH CHECK ({TENANT_POLICY})")
    op.execute(f"CREATE POLICY tenant_isolation_quote_revisions ON commercial.quote_revisions USING ({TENANT_POLICY}) WITH CHECK ({TENANT_POLICY})")
    op.execute("""
        CREATE POLICY tenant_isolation_quote_line_items ON commercial.quote_line_items
        USING (EXISTS (
            SELECT 1 FROM commercial.quotes q
            WHERE q.id = quote_id
              AND q.organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
        ))
        WITH CHECK (EXISTS (
            SELECT 1 FROM commercial.quotes q
            WHERE q.id = quote_id
              AND q.organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
        ))
    """)


def downgrade() -> None:
    for table, policy in (
        ("quote_line_items", "tenant_isolation_quote_line_items"),
        ("quote_revisions", "tenant_isolation_quote_revisions"),
        ("quotes", "tenant_isolation_quotes"),
    ):
        op.execute(f"DROP POLICY IF EXISTS {policy} ON commercial.{table}")
        op.execute(f"ALTER TABLE commercial.{table} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE commercial.{table} DISABLE ROW LEVEL SECURITY")
    op.drop_table("quote_revisions", schema="commercial")
    op.drop_table("quote_line_items", schema="commercial")
    op.drop_table("quotes", schema="commercial")
