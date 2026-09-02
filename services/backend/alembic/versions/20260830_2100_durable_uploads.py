"""Add a tenant-scoped durable upload lifecycle record."""
from alembic import op
import sqlalchemy as sa

revision = "20260830_2100"
down_revision = "20260830_2000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "durable_uploads",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("event_id", sa.UUID(), nullable=True),
        sa.Column("created_by", sa.UUID(), nullable=True),
        sa.Column("object_key", sa.Text(), nullable=False),
        sa.Column("original_filename", sa.String(500), nullable=False),
        sa.Column("mime_type", sa.String(150), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("checksum", sa.String(64), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("processing_error", sa.Text(), nullable=True),
        sa.Column("task_id", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("object_key"),
        schema="content",
    )
    op.create_index("ix_content_durable_uploads_organization_id", "durable_uploads", ["organization_id"], schema="content")
    op.create_index("ix_content_durable_uploads_event_id", "durable_uploads", ["event_id"], schema="content")
    op.create_index("ix_content_durable_uploads_status", "durable_uploads", ["status"], schema="content")
    op.create_index("ix_content_durable_uploads_task_id", "durable_uploads", ["task_id"], schema="content")


def downgrade() -> None:
    op.drop_table("durable_uploads", schema="content")
