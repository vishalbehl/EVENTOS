"""Add moderator_id FK to agenda.sessions.

The agenda.sessions table was created without the moderator_id column that
is present in the AgendaSession ORM model. This migration adds the column
and the FK constraint to identity.users.

Revision ID: 20260901_5100
Revises: 20260901_5000
Create Date: 2026-09-01 10:30:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260901_5100"
down_revision = "20260901_5000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sessions",
        sa.Column(
            "moderator_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
        schema="agenda",
    )
    op.create_foreign_key(
        "fk_agenda_sessions_moderator_id",
        "sessions",
        "users",
        ["moderator_id"],
        ["id"],
        source_schema="agenda",
        referent_schema="identity",
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_agenda_sessions_moderator_id",
        "sessions",
        ["moderator_id"],
        schema="agenda",
    )


def downgrade() -> None:
    op.drop_index("ix_agenda_sessions_moderator_id", table_name="sessions", schema="agenda")
    op.drop_constraint(
        "fk_agenda_sessions_moderator_id",
        "sessions",
        schema="agenda",
        type_="foreignkey",
    )
    op.drop_column("sessions", "moderator_id", schema="agenda")
