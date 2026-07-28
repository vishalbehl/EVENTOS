"""Add durable feature-flag mutation replay and conflict detection.

Revision ID: 20260728_1090
Revises: 20260728_1080
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260728_1090"
down_revision = "20260728_1080"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "platform_flag_overrides",
        sa.Column("request_hash", sa.String(length=64), nullable=True),
        schema="platform",
    )
    op.execute("""
        UPDATE platform.platform_flag_overrides
        SET request_hash = md5(id::text || ':' || idempotency_key) || md5(idempotency_key || ':' || id::text)
        WHERE request_hash IS NULL
    """)
    op.alter_column("platform_flag_overrides", "request_hash", nullable=False, schema="platform")
    op.create_table(
        "platform_flag_mutations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("flag_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("override_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("operation_type", sa.String(length=30), nullable=False),
        sa.Column("idempotency_key", sa.String(length=200), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("response_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("requested_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["flag_id"], ["platform.platform_flag_definitions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["override_id"], ["platform.platform_flag_overrides.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["requested_by"], ["identity.users.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("idempotency_key", name="uq_platform_flag_mutation_idempotency"),
        schema="platform",
    )
    op.create_index(
        "ix_platform_flag_mutation_flag_created",
        "platform_flag_mutations",
        ["flag_id", "created_at"],
        schema="platform",
    )


def downgrade() -> None:
    op.drop_index("ix_platform_flag_mutation_flag_created", table_name="platform_flag_mutations", schema="platform")
    op.drop_table("platform_flag_mutations", schema="platform")
    op.drop_column("platform_flag_overrides", "request_hash", schema="platform")
