"""Add event-scoped registration source API keys.

Revision ID: 20260809_1020
Revises: 20260808_1010
Create Date: 2026-08-09
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260809_1020"
down_revision = "20260808_1010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('CREATE SCHEMA IF NOT EXISTS "venue"')
    op.create_table(
        "registration_source_api_keys",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("key_prefix", sa.String(length=20), nullable=False),
        sa.Column("key_hash", sa.String(length=64), nullable=False),
        sa.Column("api_key_encrypted", sa.Text(), nullable=True),
        sa.Column("allowed_app", sa.String(length=50), nullable=False, server_default="registration"),
        sa.Column("permissions", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("key_hash", name="uq_registration_source_api_keys_hash"),
        schema="venue",
    )
    op.create_index(
        "ix_registration_source_api_keys_event_id",
        "registration_source_api_keys",
        ["event_id"],
        schema="venue",
    )
    op.create_index(
        "ix_registration_source_api_keys_organization_id",
        "registration_source_api_keys",
        ["organization_id"],
        schema="venue",
    )
    op.create_index(
        "ix_registration_source_api_keys_key_prefix",
        "registration_source_api_keys",
        ["key_prefix"],
        schema="venue",
    )


def downgrade() -> None:
    op.drop_index("ix_registration_source_api_keys_key_prefix", table_name="registration_source_api_keys", schema="venue")
    op.drop_index("ix_registration_source_api_keys_organization_id", table_name="registration_source_api_keys", schema="venue")
    op.drop_index("ix_registration_source_api_keys_event_id", table_name="registration_source_api_keys", schema="venue")
    op.drop_table("registration_source_api_keys", schema="venue")
