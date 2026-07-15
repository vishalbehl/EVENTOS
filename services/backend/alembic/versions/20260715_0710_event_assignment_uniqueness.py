"""Enforce one event workspace assignment per internal user.

Revision ID: event_assignment_unique_0710
Revises: invoice_payment_reconciliation_0700
"""

from alembic import op
import sqlalchemy as sa


revision = "event_assignment_unique_0710"
down_revision = "invoice_payment_reconciliation_0700"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "organization_members",
        sa.Column("invite_first_name", sa.String(length=100), nullable=True),
        schema="rbac",
    )
    op.add_column(
        "organization_members",
        sa.Column("invite_last_name", sa.String(length=100), nullable=True),
        schema="rbac",
    )
    op.execute(
        """
        DELETE FROM rbac.user_event_assignments AS duplicate
        USING rbac.user_event_assignments AS keeper
        WHERE duplicate.user_id = keeper.user_id
          AND duplicate.event_id = keeper.event_id
          AND duplicate.id > keeper.id
        """
    )
    op.create_unique_constraint(
        "uq_user_event_assignment",
        "user_event_assignments",
        ["user_id", "event_id"],
        schema="rbac",
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_user_event_assignment",
        "user_event_assignments",
        type_="unique",
        schema="rbac",
    )
    op.drop_column("organization_members", "invite_last_name", schema="rbac")
    op.drop_column("organization_members", "invite_first_name", schema="rbac")
