"""Persist speaker availability windows used by the programme scheduler."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260909_1840"
down_revision = "20260909_1830"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "speakers",
        sa.Column("programme_availability", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        schema="speakers",
    )
    op.alter_column("speakers", "programme_availability", server_default=None, schema="speakers")


def downgrade() -> None:
    op.drop_column("speakers", "programme_availability", schema="speakers")
