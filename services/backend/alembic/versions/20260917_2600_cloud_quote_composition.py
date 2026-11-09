"""Extend commercial quotes for versioned cloud offers and requests."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


revision = "20260917_2600"
down_revision = "20260917_2500"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing venue quotes remain valid; cloud quotes may be workspace- or
    # EMC-scoped and therefore do not necessarily have an event.
    op.alter_column("quotes", "event_id", existing_type=UUID(as_uuid=True), nullable=True, schema="business")
    op.add_column("quotes", sa.Column("product_family", sa.String(30), nullable=True), schema="business")
    op.add_column(
        "quotes",
        sa.Column("commercial_request_id", UUID(as_uuid=True), nullable=True),
        schema="business",
    )
    op.create_foreign_key(
        "fk_business_quotes_commercial_request",
        "quotes",
        "commercial_requests",
        ["commercial_request_id"],
        ["id"],
        source_schema="business",
        referent_schema="commerce",
        ondelete="SET NULL",
    )
    op.add_column("quotes", sa.Column("price_book_version", sa.String(40), nullable=True), schema="business")

    op.add_column("quote_line_items", sa.Column("product_family", sa.String(30), nullable=True), schema="business")
    op.add_column("quote_line_items", sa.Column("offer_code", sa.String(80), nullable=True), schema="business")
    op.add_column("quote_line_items", sa.Column("offer_version_id", UUID(as_uuid=True), nullable=True), schema="business")
    op.add_column("quote_line_items", sa.Column("allocation_version_id", UUID(as_uuid=True), nullable=True), schema="business")
    op.add_column("quote_line_items", sa.Column("event_id", UUID(as_uuid=True), nullable=True), schema="business")
    op.add_column("quote_line_items", sa.Column("client_workspace_id", UUID(as_uuid=True), nullable=True), schema="business")
    op.add_column("quote_line_items", sa.Column("commercial_request_id", UUID(as_uuid=True), nullable=True), schema="business")
    op.add_column("quote_line_items", sa.Column("tax_rate", sa.Numeric(7, 4), nullable=True), schema="business")
    op.add_column("quote_line_items", sa.Column("source_snapshot_json", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")), schema="business")
    op.create_foreign_key(
        "fk_business_quote_items_offer_version",
        "quote_line_items",
        "commercial_offer_versions",
        ["offer_version_id"],
        ["id"],
        source_schema="business",
        referent_schema="commerce",
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_business_quote_items_allocation_version",
        "quote_line_items",
        "commercial_offer_versions",
        ["allocation_version_id"],
        ["id"],
        source_schema="business",
        referent_schema="commerce",
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_business_quote_items_client_workspace",
        "quote_line_items",
        "commercial_account_workspaces",
        ["client_workspace_id"],
        ["id"],
        source_schema="business",
        referent_schema="commerce",
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_business_quote_items_commercial_request",
        "quote_line_items",
        "commercial_requests",
        ["commercial_request_id"],
        ["id"],
        source_schema="business",
        referent_schema="commerce",
        ondelete="SET NULL",
    )
    op.create_index("ix_business_quotes_commercial_request", "quotes", ["commercial_request_id"], schema="business")


def downgrade() -> None:
    op.drop_index("ix_business_quotes_commercial_request", table_name="quotes", schema="business")
    for name in (
        "fk_business_quote_items_commercial_request",
        "fk_business_quote_items_client_workspace",
        "fk_business_quote_items_allocation_version",
        "fk_business_quote_items_offer_version",
    ):
        op.drop_constraint(name, "quote_line_items", schema="business", type_="foreignkey")
    for column in (
        "source_snapshot_json", "tax_rate", "commercial_request_id", "client_workspace_id",
        "event_id", "allocation_version_id", "offer_version_id", "offer_code", "product_family",
    ):
        op.drop_column("quote_line_items", column, schema="business")
    op.drop_constraint("fk_business_quotes_commercial_request", "quotes", schema="business", type_="foreignkey")
    op.drop_column("quotes", "price_book_version", schema="business")
    op.drop_column("quotes", "commercial_request_id", schema="business")
    op.drop_column("quotes", "product_family", schema="business")
    op.alter_column("quotes", "event_id", existing_type=UUID(as_uuid=True), nullable=False, schema="business")
