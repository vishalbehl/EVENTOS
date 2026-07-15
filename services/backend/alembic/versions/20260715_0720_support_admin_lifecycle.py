"""Add tenant-scoped support administration lifecycle fields.

Revision ID: support_admin_lifecycle_0720
Revises: event_assignment_unique_0710
"""

from alembic import op
import sqlalchemy as sa


revision = "support_admin_lifecycle_0720"
down_revision = "event_assignment_unique_0710"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("support_tickets", sa.Column("category", sa.String(50), nullable=False, server_default="GENERAL"), schema="support")
    op.add_column("support_tickets", sa.Column("version", sa.Integer(), nullable=False, server_default="1"), schema="support")
    for column in (
        "first_response_due_at",
        "resolution_due_at",
        "first_responded_at",
        "resolved_at",
        "closed_at",
        "escalated_at",
    ):
        op.add_column("support_tickets", sa.Column(column, sa.DateTime(timezone=True), nullable=True), schema="support")
    op.add_column("ticket_comments", sa.Column("is_internal", sa.Boolean(), nullable=False, server_default=sa.false()), schema="support")
    op.create_index(
        "ix_support_tickets_org_status_updated",
        "support_tickets",
        ["organization_id", "status", "updated_at"],
        schema="support",
    )


def downgrade() -> None:
    op.drop_index("ix_support_tickets_org_status_updated", table_name="support_tickets", schema="support")
    op.drop_column("ticket_comments", "is_internal", schema="support")
    for column in (
        "escalated_at",
        "closed_at",
        "resolved_at",
        "first_responded_at",
        "resolution_due_at",
        "first_response_due_at",
        "version",
        "category",
    ):
        op.drop_column("support_tickets", column, schema="support")
