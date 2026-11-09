"""Keep the venue/resource catalogue separate from cloud capacity pricing."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260917_3110"
down_revision = "20260917_3100"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)

    if not inspector.has_table("venue_addons", schema="commerce"):
        op.create_table(
            "venue_addons",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("key", sa.String(100), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("addon_type", sa.String(20), nullable=False, server_default="VENUE"),
            sa.Column("short_description", sa.String(255), nullable=True),
            sa.Column("image_url", sa.Text(), nullable=True),
            sa.Column("price_inr", sa.Numeric(12, 2), nullable=True),
            sa.Column("min_price_inr", sa.Numeric(12, 2), nullable=True),
            sa.Column("max_price_inr", sa.Numeric(12, 2), nullable=True),
            sa.Column("billing_unit", sa.String(20), nullable=True),
            sa.Column("price_unit", sa.String(50), nullable=True),
            sa.Column("scope_type", sa.String(30), nullable=False, server_default="VENUE"),
            sa.Column("consumption_model", sa.String(40), nullable=False, server_default="NON_CONSUMABLE"),
            sa.Column("unit_type", sa.String(40), nullable=True),
            sa.Column("available_for_plans", postgresql.ARRAY(sa.String()), nullable=True),
            sa.Column("is_optional_for_plan", sa.String(50), nullable=True),
            sa.Column("included_in_plan", sa.String(50), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("lifecycle_status", sa.String(20), nullable=False, server_default="PUBLISHED"),
            sa.Column("effective_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("retired_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("final_price", sa.Numeric(12, 2), nullable=True, server_default="0"),
            sa.Column("features_spec", postgresql.JSONB(), nullable=True, server_default="[]"),
            sa.Column("hardware_spec", postgresql.JSONB(), nullable=True, server_default="[]"),
            sa.Column("staff_spec", postgresql.JSONB(), nullable=True, server_default="[]"),
            sa.Column("inclusions", postgresql.JSONB(), nullable=True, server_default="[]"),
            sa.Column("exclusions", postgresql.JSONB(), nullable=True, server_default="[]"),
            sa.Column("consumables_cost", sa.Numeric(12, 2), nullable=True, server_default="0"),
            sa.Column("template_types", postgresql.ARRAY(sa.String()), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.UniqueConstraint("key", name="uq_venue_addons_key"),
            schema="commerce",
        )

    if not inspector.has_table("venue_addon_features", schema="commerce"):
        op.create_table(
            "venue_addon_features",
            sa.Column("addon_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.venue_addons.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("feature_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.feature_catalog.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("value_type", sa.String(20), nullable=False, server_default="BOOLEAN"),
            sa.Column("entitlement_value", postgresql.JSONB(), nullable=True),
            sa.Column("operation", sa.String(20), nullable=False, server_default="UNLOCK"),
            sa.Column("scope_type", sa.String(30), nullable=False, server_default="VENUE"),
            sa.Column("validity_days", sa.Integer(), nullable=True),
            sa.Column("stackable", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("max_quantity", sa.Integer(), nullable=True),
            schema="commerce",
        )


def downgrade() -> None:
    raise RuntimeError("Venue catalogue separation is intentionally irreversible")
