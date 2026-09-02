"""Add event mutation actor for optimistic-concurrency auditability."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260831_4800"
down_revision = "20260831_4700"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), nullable=True),
        schema="events",
    )
    op.create_foreign_key(
        "fk_events_updated_by_users",
        "events",
        "users",
        ["updated_by"],
        ["id"],
        source_schema="events",
        referent_schema="identity",
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_events_events_updated_by",
        "events",
        ["updated_by"],
        schema="events",
    )


def downgrade() -> None:
    op.drop_index("ix_events_events_updated_by", table_name="events", schema="events")
    op.drop_constraint(
        "fk_events_updated_by_users",
        "events",
        type_="foreignkey",
        schema="events",
    )
    op.drop_column("events", "updated_by", schema="events")
