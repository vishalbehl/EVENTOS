"""Add bounded claims for provider delivery recovery."""

from alembic import op
import sqlalchemy as sa


revision = "20260901_5400"
down_revision = "20260901_5300"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "communication_deliveries",
        sa.Column("processing_owner", sa.String(length=80), nullable=True),
        schema="communications",
    )
    op.add_column(
        "communication_deliveries",
        sa.Column("processing_started_at", sa.DateTime(timezone=True), nullable=True),
        schema="communications",
    )
    op.create_index(
        "ix_communication_deliveries_processing_lease",
        "communication_deliveries",
        ["status", "processing_started_at"],
        schema="communications",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_communication_deliveries_processing_lease",
        table_name="communication_deliveries",
        schema="communications",
    )
    op.drop_column("communication_deliveries", "processing_started_at", schema="communications")
    op.drop_column("communication_deliveries", "processing_owner", schema="communications")
