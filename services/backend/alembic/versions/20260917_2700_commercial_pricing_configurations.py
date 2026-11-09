"""Persist Command Center cloud calculator configurations."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260917_2700"
down_revision = "20260917_2600"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "commercial_pricing_configurations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("account_type", sa.String(20), nullable=False),
        sa.Column("payload_json", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("preview_snapshot_json", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("idempotency_key", sa.String(200), nullable=False),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("created_by", "idempotency_key", name="uq_commercial_pricing_config_idempotency"),
        schema="commerce",
    )
    op.create_index(
        "ix_commercial_pricing_config_created_by",
        "commercial_pricing_configurations",
        ["created_by", "created_at"],
        schema="commerce",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_commercial_pricing_config_created_by",
        table_name="commercial_pricing_configurations",
        schema="commerce",
    )
    op.drop_table("commercial_pricing_configurations", schema="commerce")
