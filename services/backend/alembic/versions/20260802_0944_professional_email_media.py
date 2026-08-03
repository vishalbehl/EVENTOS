"""professional email media library and global branding policy

Revision ID: 20260802_0944
Revises: 20260801_0943
Create Date: 2026-08-02
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260802_0944"
down_revision = "20260801_0943"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "email_asset_folders",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("scope_type", sa.String(20), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_id"], ["communications.email_asset_folders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["identity.users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["deleted_by"], ["identity.users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "(scope_type = 'PLATFORM' AND organization_id IS NULL AND event_id IS NULL) OR "
            "(scope_type = 'ORGANIZATION' AND organization_id IS NOT NULL AND event_id IS NULL) OR "
            "(scope_type = 'EVENT' AND event_id IS NOT NULL)",
            name="ck_email_asset_folders_scope",
        ),
        schema="communications",
    )
    op.create_index("ix_email_asset_folders_organization_id", "email_asset_folders", ["organization_id"], schema="communications")
    op.create_index("ix_email_asset_folders_event_id", "email_asset_folders", ["event_id"], schema="communications")

    additions = (
        sa.Column("folder_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("asset_kind", sa.String(20), nullable=False, server_default="IMAGE"),
        sa.Column("source_type", sa.String(30), nullable=False, server_default="UPLOAD"),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("checksum", sa.String(64), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", postgresql.UUID(as_uuid=True), nullable=True),
    )
    for column in additions:
        op.add_column("email_assets", column, schema="communications")
    op.create_foreign_key("fk_email_assets_folder_id", "email_assets", "email_asset_folders", ["folder_id"], ["id"], source_schema="communications", referent_schema="communications", ondelete="SET NULL")
    op.create_foreign_key("fk_email_assets_deleted_by", "email_assets", "users", ["deleted_by"], ["id"], source_schema="communications", referent_schema="identity", ondelete="SET NULL")
    op.create_index("ix_email_assets_folder_id", "email_assets", ["folder_id"], schema="communications")
    op.create_index("ix_email_assets_checksum", "email_assets", ["checksum"], schema="communications")
    op.create_index("ix_email_assets_deleted_at", "email_assets", ["deleted_at"], schema="communications")
    op.execute("UPDATE communications.email_assets SET checksum = md5(storage_path), updated_at = created_at WHERE checksum IS NULL")

    op.create_table(
        "email_branding_policy",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("text", sa.String(160), nullable=False, server_default="In collaboration with EventOS"),
        sa.Column("icon_url", sa.Text(), nullable=True),
        sa.Column("destination_url", sa.Text(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("id = 1", name="ck_email_branding_policy_singleton"),
        schema="communications",
    )
    op.execute("INSERT INTO communications.email_branding_policy (id) VALUES (1)")

    # Broken pre-v3 fragments are hidden by normal soft-delete filters while
    # retaining their original payload for support-led recovery.
    op.execute(
        """
        UPDATE communications.email_components
           SET deleted_at = now()
         WHERE deleted_at IS NULL
           AND (jsonb_typeof(document_fragment) <> 'object'
                OR jsonb_typeof(document_fragment->'nodes') <> 'object'
                OR jsonb_typeof(document_fragment->'rootIds') <> 'array')
        """
    )


def downgrade() -> None:
    op.drop_table("email_branding_policy", schema="communications")
    for index in ("ix_email_assets_deleted_at", "ix_email_assets_checksum", "ix_email_assets_folder_id"):
        op.drop_index(index, table_name="email_assets", schema="communications")
    op.drop_constraint("fk_email_assets_deleted_by", "email_assets", schema="communications", type_="foreignkey")
    op.drop_constraint("fk_email_assets_folder_id", "email_assets", schema="communications", type_="foreignkey")
    for name in ("deleted_by", "deleted_at", "updated_at", "version", "metadata", "checksum", "height", "width", "tags", "source_url", "source_type", "asset_kind", "folder_id"):
        op.drop_column("email_assets", name, schema="communications")
    op.drop_table("email_asset_folders", schema="communications")
