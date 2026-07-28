"""make canonical API usage billing-period aware

Revision ID: 20260726_0990
Revises: 20260726_0980
"""

from alembic import op
import sqlalchemy as sa


revision = "20260726_0990"
down_revision = "20260726_0980"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # developer.api_usage was deliberately retired by the schema-cleanup
    # migration. analytics.api_usage is the surviving authoritative aggregate
    # used by the rate limiter, metering task, and Command Center.
    op.add_column("api_usage", sa.Column("period_start", sa.DateTime(timezone=True), nullable=True), schema="analytics")
    op.execute("UPDATE analytics.api_usage SET period_start = date_trunc('month', recorded_at)")
    op.alter_column(
        "api_usage",
        "period_start",
        nullable=False,
        server_default=sa.text("date_trunc('month', CURRENT_TIMESTAMP)"),
        schema="analytics",
    )
    op.create_index(
        "ix_analytics_api_usage_period",
        "api_usage",
        ["organization_id", "period_start", "endpoint"],
        schema="analytics",
    )


def downgrade() -> None:
    op.drop_index("ix_analytics_api_usage_period", table_name="api_usage", schema="analytics")
    op.drop_column("api_usage", "period_start", schema="analytics")
