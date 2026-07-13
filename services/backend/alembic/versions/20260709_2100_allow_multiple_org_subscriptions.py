"""allow multiple organization subscriptions

Revision ID: 55df9f2c9d10
Revises: 20260707_1902_43d8d97583e5
Create Date: 2026-07-09 21:00:00
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "55df9f2c9d10"
down_revision = "43d8d97583e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE billing.organization_subscriptions
        DROP CONSTRAINT IF EXISTS organization_subscriptions_organization_id_key
        """
    )


def downgrade() -> None:
    op.create_unique_constraint(
        "organization_subscriptions_organization_id_key",
        "organization_subscriptions",
        ["organization_id"],
        schema="billing",
    )
