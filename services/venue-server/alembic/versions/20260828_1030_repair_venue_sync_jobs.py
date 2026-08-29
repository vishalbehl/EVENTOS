"""Ensure venue sync jobs table exists for upgraded venue databases."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20260828_1030"
down_revision: Union[str, None] = "20260828_1015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    exists = bind.execute(
        sa.text(
            "select exists ("
            "select 1 from information_schema.tables "
            "where table_schema = 'venue' and table_name = 'venue_sync_jobs'"
            ")"
        )
    ).scalar()
    if exists:
        return

    op.create_table(
        "venue_sync_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("file_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sync_type", sa.String(length=30), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("retry_count", sa.Integer(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["file_id"], ["presentations.presentation_files.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema="venue",
    )
    op.create_index("ix_venue_venue_sync_jobs_created_at", "venue_sync_jobs", ["created_at"], unique=False, schema="venue")
    op.create_index("ix_venue_venue_sync_jobs_event_id", "venue_sync_jobs", ["event_id"], unique=False, schema="venue")
    op.create_index("ix_venue_venue_sync_jobs_file_id", "venue_sync_jobs", ["file_id"], unique=False, schema="venue")
    op.create_index("ix_venue_venue_sync_jobs_status", "venue_sync_jobs", ["status"], unique=False, schema="venue")


def downgrade() -> None:
    pass
