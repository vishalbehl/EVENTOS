"""Restore the campaign recovery timestamp expected by the model."""

from alembic import op
import sqlalchemy as sa


revision = "20260909_1100"
down_revision = "20260909_1000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The deployed table predates the model's recovery timestamp.  A server
    # default makes this additive change safe for older writers and existing
    # rows while recovery scans begin using the authoritative timestamp.
    op.add_column(
        "email_campaigns",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        schema="communications",
    )


def downgrade() -> None:
    op.drop_column("email_campaigns", "updated_at", schema="communications")
