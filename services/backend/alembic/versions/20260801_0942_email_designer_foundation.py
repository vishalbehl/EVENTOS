"""email designer hierarchy, immutable versions, blocks, and assets

Revision ID: 20260801_0942
Revises: 20260801_0941
Create Date: 2026-08-01
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260801_0942"
down_revision = "20260801_0941"
branch_labels = None
depends_on = None


def _table_exists(schema: str, table: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table, schema=schema)


def _column_exists(schema: str, table: str, column: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(item["name"] == column for item in inspector.get_columns(table, schema=schema))


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS communications")

    additions = [
        ("designer_json", postgresql.JSONB(astext_type=sa.Text()), True, None),
        ("organization_id", postgresql.UUID(as_uuid=True), True, None),
        ("scope_type", sa.String(length=20), False, "'EVENT'"),
        ("stable_key", sa.String(length=100), False, "'custom'"),
        ("parent_template_id", postgresql.UUID(as_uuid=True), True, None),
        ("current_published_version_id", postgresql.UUID(as_uuid=True), True, None),
        ("version", sa.Integer(), False, "1"),
        ("updated_at", sa.DateTime(timezone=True), False, "now()"),
    ]
    for name, type_, nullable, server_default in additions:
        if not _column_exists("communications", "email_templates", name):
            op.add_column(
                "email_templates",
                sa.Column(name, type_, nullable=nullable, server_default=sa.text(server_default) if server_default else None),
                schema="communications",
            )

    op.execute(
        """
        UPDATE communications.email_templates
           SET scope_type = CASE WHEN event_id IS NULL THEN 'PLATFORM' ELSE 'EVENT' END,
               stable_key = lower(regexp_replace(template_type || '-' || substr(md5(name || ':' || target_type), 1, 8), '[^a-zA-Z0-9_-]+', '-', 'g')),
               updated_at = COALESCE(created_at, now())
        """
    )
    op.create_foreign_key(
        "fk_email_templates_organization_id",
        "email_templates",
        "organizations",
        ["organization_id"],
        ["id"],
        source_schema="communications",
        referent_schema="platform",
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_email_templates_parent_template_id",
        "email_templates",
        "email_templates",
        ["parent_template_id"],
        ["id"],
        source_schema="communications",
        referent_schema="communications",
        ondelete="SET NULL",
    )
    op.create_check_constraint(
        "ck_email_templates_scope",
        "email_templates",
        "(scope_type = 'PLATFORM' AND organization_id IS NULL AND event_id IS NULL) OR "
        "(scope_type = 'ORGANIZATION' AND organization_id IS NOT NULL AND event_id IS NULL) OR "
        "(scope_type = 'EVENT' AND event_id IS NOT NULL)",
        schema="communications",
    )
    op.create_index("ix_email_templates_organization_id", "email_templates", ["organization_id"], schema="communications")
    op.create_index("ix_email_templates_scope_type", "email_templates", ["scope_type"], schema="communications")
    op.create_index("ix_email_templates_stable_key", "email_templates", ["stable_key"], schema="communications")
    op.create_index(
        "uq_email_templates_platform_family",
        "email_templates",
        ["stable_key", "target_type"],
        unique=True,
        schema="communications",
        postgresql_where=sa.text("scope_type = 'PLATFORM' AND deleted_at IS NULL"),
    )
    op.create_index(
        "uq_email_templates_org_family",
        "email_templates",
        ["organization_id", "stable_key", "target_type"],
        unique=True,
        schema="communications",
        postgresql_where=sa.text("scope_type = 'ORGANIZATION' AND deleted_at IS NULL"),
    )
    op.create_index(
        "uq_email_templates_event_family",
        "email_templates",
        ["event_id", "stable_key", "target_type"],
        unique=True,
        schema="communications",
        postgresql_where=sa.text("scope_type = 'EVENT' AND deleted_at IS NULL"),
    )

    op.create_table(
        "email_template_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("lifecycle_state", sa.String(length=20), nullable=False),
        sa.Column("subject", sa.String(length=500), nullable=False),
        sa.Column("body_html", sa.Text(), nullable=False),
        sa.Column("body_text", sa.Text(), nullable=True),
        sa.Column("designer_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("editor_schema_version", sa.Integer(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("published_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["template_id"], ["communications.email_templates.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["identity.users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["published_by"], ["identity.users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("template_id", "version_number", name="uq_email_template_version_number"),
        schema="communications",
    )
    op.create_index("ix_email_template_versions_template_id", "email_template_versions", ["template_id"], schema="communications")
    op.create_index("ix_email_template_versions_lifecycle_state", "email_template_versions", ["lifecycle_state"], schema="communications")
    op.create_index(
        "uq_email_template_single_draft",
        "email_template_versions",
        ["template_id"],
        unique=True,
        schema="communications",
        postgresql_where=sa.text("lifecycle_state = 'DRAFT'"),
    )
    op.execute(
        """
        INSERT INTO communications.email_template_versions
            (id, template_id, version_number, lifecycle_state, subject, body_html, body_text,
             designer_json, editor_schema_version, created_by, published_by, created_at, published_at)
        SELECT gen_random_uuid(), id, 1,
               CASE WHEN designer_json IS NULL THEN 'LEGACY' ELSE 'PUBLISHED' END,
               subject, body_html, body_text,
               COALESCE(designer_json, jsonb_build_object('editor', 'legacy-html', 'version', 0)),
               CASE WHEN designer_json IS NULL THEN 0 ELSE 1 END,
               created_by, created_by, created_at, created_at
          FROM communications.email_templates
        """
    )
    op.execute(
        """
        UPDATE communications.email_templates t
           SET current_published_version_id = v.id,
               designer_json = v.designer_json
          FROM communications.email_template_versions v
         WHERE v.template_id = t.id AND v.version_number = 1
        """
    )
    op.create_foreign_key(
        "fk_email_templates_current_published_version_id",
        "email_templates",
        "email_template_versions",
        ["current_published_version_id"],
        ["id"],
        source_schema="communications",
        referent_schema="communications",
        ondelete="SET NULL",
    )
    op.add_column(
        "email_campaigns",
        sa.Column("template_version_id", postgresql.UUID(as_uuid=True), nullable=True),
        schema="communications",
    )
    op.create_foreign_key(
        "fk_email_campaigns_template_version_id",
        "email_campaigns",
        "email_template_versions",
        ["template_version_id"],
        ["id"],
        source_schema="communications",
        referent_schema="communications",
        ondelete="RESTRICT",
    )
    op.create_index("ix_email_campaigns_template_version_id", "email_campaigns", ["template_version_id"], schema="communications")
    op.execute(
        """
        UPDATE communications.email_campaigns c
           SET template_version_id = t.current_published_version_id
          FROM communications.email_templates t
         WHERE t.id = c.template_id
        """
    )

    if not _table_exists("communications", "email_components"):
        op.create_table(
            "email_components",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("component_type", sa.String(length=100), nullable=False),
            sa.Column("name", sa.String(length=150), nullable=False),
            sa.Column("default_config", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column("is_global", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("deleted_by", postgresql.UUID(as_uuid=True), nullable=True),
            sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["deleted_by"], ["identity.users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
            schema="communications",
        )

    if not _table_exists("communications", "email_assets"):
        op.create_table(
            "email_assets",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("scope_type", sa.String(length=20), nullable=False, server_default="EVENT"),
            sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("url", sa.Text(), nullable=False),
            sa.Column("storage_path", sa.Text(), nullable=False),
            sa.Column("access_token_hash", sa.String(length=64), nullable=False),
            sa.Column("file_type", sa.String(length=100), nullable=False),
            sa.Column("size_bytes", sa.BigInteger(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["identity.users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("access_token_hash", name="uq_email_assets_access_token_hash"),
            schema="communications",
        )
        op.create_index("ix_email_assets_organization_id", "email_assets", ["organization_id"], schema="communications")
        op.create_index("ix_email_assets_event_id", "email_assets", ["event_id"], schema="communications")
    else:
        # The abandoned 0940/0941 migrations may already have created the
        # event-only asset table. Upgrade it in place to the mixed-scope model.
        if not _column_exists("communications", "email_assets", "scope_type"):
            op.add_column(
                "email_assets",
                sa.Column("scope_type", sa.String(length=20), nullable=False, server_default="EVENT"),
                schema="communications",
            )
        if not _column_exists("communications", "email_assets", "organization_id"):
            op.add_column(
                "email_assets",
                sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
                schema="communications",
            )
            op.create_foreign_key(
                "fk_email_assets_organization_id",
                "email_assets",
                "organizations",
                ["organization_id"],
                ["id"],
                source_schema="communications",
                referent_schema="platform",
                ondelete="CASCADE",
            )
            op.create_index(
                "ix_email_assets_organization_id",
                "email_assets",
                ["organization_id"],
                schema="communications",
            )
        op.alter_column(
            "email_assets",
            "event_id",
            existing_type=postgresql.UUID(as_uuid=True),
            nullable=True,
            schema="communications",
        )


def downgrade() -> None:
    if _table_exists("communications", "email_assets"):
        op.drop_table("email_assets", schema="communications")
    if _table_exists("communications", "email_components"):
        op.drop_table("email_components", schema="communications")
    op.drop_index("ix_email_campaigns_template_version_id", table_name="email_campaigns", schema="communications")
    op.drop_constraint("fk_email_campaigns_template_version_id", "email_campaigns", schema="communications", type_="foreignkey")
    op.drop_column("email_campaigns", "template_version_id", schema="communications")
    op.drop_constraint("fk_email_templates_current_published_version_id", "email_templates", schema="communications", type_="foreignkey")
    op.drop_table("email_template_versions", schema="communications")
    for index in (
        "uq_email_templates_event_family", "uq_email_templates_org_family",
        "uq_email_templates_platform_family", "ix_email_templates_stable_key",
        "ix_email_templates_scope_type", "ix_email_templates_organization_id",
    ):
        op.drop_index(index, table_name="email_templates", schema="communications")
    op.drop_constraint("ck_email_templates_scope", "email_templates", schema="communications", type_="check")
    op.drop_constraint("fk_email_templates_parent_template_id", "email_templates", schema="communications", type_="foreignkey")
    op.drop_constraint("fk_email_templates_organization_id", "email_templates", schema="communications", type_="foreignkey")
    for column in (
        "updated_at", "version", "current_published_version_id", "parent_template_id",
        "stable_key", "scope_type", "organization_id", "designer_json",
    ):
        op.drop_column("email_templates", column, schema="communications")
