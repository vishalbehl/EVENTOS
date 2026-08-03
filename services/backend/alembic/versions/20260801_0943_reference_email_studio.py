"""reference email studio preheaders and scoped reusable fragments

Revision ID: 20260801_0943
Revises: 20260801_0942
Create Date: 2026-08-01
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260801_0943"
down_revision = "20260801_0942"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("email_templates", sa.Column("preheader", sa.String(500), nullable=True), schema="communications")
    op.add_column("email_template_versions", sa.Column("preheader", sa.String(500), nullable=True), schema="communications")

    additions = (
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("scope_type", sa.String(20), nullable=False, server_default="EVENT"),
        sa.Column("component_kind", sa.String(20), nullable=False, server_default="BLOCK"),
        sa.Column("stable_key", sa.String(100), nullable=False, server_default="custom"),
        sa.Column("category", sa.String(100), nullable=False, server_default="saved"),
        sa.Column("document_fragment", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("preview_metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    for column in additions:
        op.add_column("email_components", column, schema="communications")
    op.create_foreign_key(
        "fk_email_components_organization_id", "email_components", "organizations",
        ["organization_id"], ["id"], source_schema="communications", referent_schema="platform", ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_email_components_created_by", "email_components", "users",
        ["created_by"], ["id"], source_schema="communications", referent_schema="identity", ondelete="SET NULL",
    )
    op.execute(
        """
        UPDATE communications.email_components
           SET scope_type = CASE WHEN event_id IS NULL OR is_global THEN 'PLATFORM' ELSE 'EVENT' END,
               stable_key = lower(regexp_replace(name || '-' || substr(md5(id::text), 1, 8), '[^a-zA-Z0-9_-]+', '-', 'g')),
               category = component_type,
               document_fragment = COALESCE(default_config, '{}'::jsonb),
               updated_at = COALESCE(created_at, now())
        """
    )
    op.create_check_constraint(
        "ck_email_components_scope", "email_components",
        "(scope_type = 'PLATFORM' AND organization_id IS NULL AND event_id IS NULL) OR "
        "(scope_type = 'ORGANIZATION' AND organization_id IS NOT NULL AND event_id IS NULL) OR "
        "(scope_type = 'EVENT' AND event_id IS NOT NULL)", schema="communications",
    )
    op.create_check_constraint(
        "ck_email_components_kind", "email_components", "component_kind IN ('BLOCK', 'SECTION')", schema="communications",
    )
    op.create_index("ix_email_components_organization_id", "email_components", ["organization_id"], schema="communications")
    op.create_index("ix_email_components_scope_type", "email_components", ["scope_type"], schema="communications")
    op.create_index("ix_email_components_stable_key", "email_components", ["stable_key"], schema="communications")


def downgrade() -> None:
    for index in ("ix_email_components_stable_key", "ix_email_components_scope_type", "ix_email_components_organization_id"):
        op.drop_index(index, table_name="email_components", schema="communications")
    op.drop_constraint("ck_email_components_kind", "email_components", schema="communications", type_="check")
    op.drop_constraint("ck_email_components_scope", "email_components", schema="communications", type_="check")
    op.drop_constraint("fk_email_components_created_by", "email_components", schema="communications", type_="foreignkey")
    op.drop_constraint("fk_email_components_organization_id", "email_components", schema="communications", type_="foreignkey")
    for name in ("updated_at", "created_by", "version", "preview_metadata", "document_fragment", "category", "stable_key", "component_kind", "scope_type", "organization_id"):
        op.drop_column("email_components", name, schema="communications")
    op.drop_column("email_template_versions", "preheader", schema="communications")
    op.drop_column("email_templates", "preheader", schema="communications")
