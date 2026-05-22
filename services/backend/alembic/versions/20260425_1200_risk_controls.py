"""Add risk control fields and presentation bundles

Revision ID: risk_controls_20260425
Revises: 9433ef8cf3fe
Create Date: 2026-04-25 12:00:00.000000+00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "risk_controls_20260425"
down_revision: Union[str, None] = "9433ef8cf3fe"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("events", sa.Column("event_mode", sa.Boolean(), nullable=False, server_default="false"))

    for name, column_type, default in (
        ("has_animations", sa.Boolean(), "false"),
        ("has_transitions", sa.Boolean(), "false"),
        ("notes_present", sa.Boolean(), "false"),
        ("notes_slide_count", sa.Integer(), "0"),
        ("has_ole_objects", sa.Boolean(), "false"),
        ("has_broken_ole", sa.Boolean(), "false"),
        ("audio_objects_detected", sa.Boolean(), "false"),
        ("audio_format_valid", sa.Boolean(), "true"),
        ("internet_dependent_content", sa.Boolean(), "false"),
        ("external_url_count", sa.Integer(), "0"),
        ("has_broken_internal_media", sa.Boolean(), "false"),
        ("render_diff_detected", sa.Boolean(), "false"),
        ("has_custom_addins", sa.Boolean(), "false"),
        ("has_macros", sa.Boolean(), "false"),
        ("pdf_fallback_forced", sa.Boolean(), "false"),
        ("linked_assets_detected", sa.Boolean(), "false"),
        ("linked_assets_resolved", sa.Boolean(), "true"),
        ("image_links_detected", sa.Integer(), "0"),
        ("absolute_path_links_detected", sa.Integer(), "0"),
    ):
        op.add_column("file_validations", sa.Column(name, column_type, nullable=False, server_default=default))

    # Ensure chainmode ENUM exists before creating the table
    conn = op.get_bind()
    has_chainmode = conn.execute(
        sa.text("SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chainmode')")
    ).scalar()
    
    if not has_chainmode:
        postgresql.ENUM("sequential", "manual", name="chainmode").create(conn)

    # Use the type with create_type=False to avoid DuplicateObject error in op.create_table
    chain_mode = postgresql.ENUM("sequential", "manual", name="chainmode", create_type=False)

    op.create_table(
        "presentation_bundles",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_speaker_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("chain_mode", chain_mode, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_speaker_id"], ["session_speakers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_presentation_bundles_event_id"), "presentation_bundles", ["event_id"], unique=False)
    op.create_index(
        op.f("ix_presentation_bundles_session_speaker_id"),
        "presentation_bundles",
        ["session_speaker_id"],
        unique=False,
    )
    op.add_column(
        "session_speakers",
        sa.Column("presentation_bundle_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_session_speakers_presentation_bundle_id",
        "session_speakers",
        "presentation_bundles",
        ["presentation_bundle_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_table(
        "bundle_files",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("bundle_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("file_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("deck_order", sa.Integer(), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default="false"),
        sa.ForeignKeyConstraint(["bundle_id"], ["presentation_bundles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["file_id"], ["presentation_files.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("bundle_id", "file_id", name="uq_bundle_files_file"),
        sa.UniqueConstraint("bundle_id", "deck_order", name="uq_bundle_files_order"),
    )
    op.create_index(op.f("ix_bundle_files_bundle_id"), "bundle_files", ["bundle_id"], unique=False)
    op.create_index(op.f("ix_bundle_files_file_id"), "bundle_files", ["file_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_bundle_files_file_id"), table_name="bundle_files")
    op.drop_index(op.f("ix_bundle_files_bundle_id"), table_name="bundle_files")
    op.drop_table("bundle_files")
    op.drop_constraint("fk_session_speakers_presentation_bundle_id", "session_speakers", type_="foreignkey")
    op.drop_column("session_speakers", "presentation_bundle_id")
    op.drop_index(op.f("ix_presentation_bundles_session_speaker_id"), table_name="presentation_bundles")
    op.drop_index(op.f("ix_presentation_bundles_event_id"), table_name="presentation_bundles")
    op.drop_table("presentation_bundles")
    postgresql.ENUM(name="chainmode").drop(op.get_bind(), checkfirst=True)

    for name in (
        "absolute_path_links_detected",
        "image_links_detected",
        "linked_assets_resolved",
        "linked_assets_detected",
        "pdf_fallback_forced",
        "has_macros",
        "has_custom_addins",
        "render_diff_detected",
        "has_broken_internal_media",
        "external_url_count",
        "internet_dependent_content",
        "audio_format_valid",
        "audio_objects_detected",
        "has_broken_ole",
        "has_ole_objects",
        "notes_slide_count",
        "notes_present",
        "has_transitions",
        "has_animations",
    ):
        op.drop_column("file_validations", name)

    op.drop_column("events", "event_mode")
