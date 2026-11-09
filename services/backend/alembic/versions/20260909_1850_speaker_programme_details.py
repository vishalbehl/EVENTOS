"""Persist speaker programme travel and event-specific custom fields."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260909_1850"
down_revision = "20260909_1840"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for name in ("programme_custom_fields", "programme_travel_details"):
        op.add_column(
            "speakers",
            sa.Column(name, postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
            schema="speakers",
        )
        op.alter_column("speakers", name, server_default=None, schema="speakers")


def downgrade() -> None:
    op.drop_column("speakers", "programme_travel_details", schema="speakers")
    op.drop_column("speakers", "programme_custom_fields", schema="speakers")
