"""add speaker track participant and multirole columns

Revision ID: 20260828_1200
Revises: 20260828_1140
Create Date: 2026-08-28 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "20260828_1200"
down_revision = "20260828_1140"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add track_id, participant_id, role to speakers.speakers
    op.add_column(
        "speakers",
        sa.Column("track_id", postgresql.UUID(as_uuid=True), nullable=True),
        schema="speakers",
    )
    op.add_column(
        "speakers",
        sa.Column("participant_id", postgresql.UUID(as_uuid=True), nullable=True),
        schema="speakers",
    )
    op.add_column(
        "speakers",
        sa.Column("role", sa.String(100), nullable=False, server_default=sa.text("'Speaker'")),
        schema="speakers",
    )

    op.create_foreign_key(
        "fk_speakers_speakers_track_id",
        "speakers",
        "tracks",
        ["track_id"],
        ["id"],
        source_schema="speakers",
        referent_schema="events",
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_speakers_speakers_participant_id",
        "speakers",
        "participants",
        ["participant_id"],
        ["id"],
        source_schema="speakers",
        referent_schema="registration",
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_speakers_speakers_track_id"),
        "speakers",
        ["track_id"],
        unique=False,
        schema="speakers",
    )
    op.create_index(
        op.f("ix_speakers_speakers_participant_id"),
        "speakers",
        ["participant_id"],
        unique=False,
        schema="speakers",
    )

    # 2. Add roles (JSONB) and track_id to registration.participants
    op.add_column(
        "participants",
        sa.Column("roles", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        schema="registration",
    )
    op.add_column(
        "participants",
        sa.Column("track_id", postgresql.UUID(as_uuid=True), nullable=True),
        schema="registration",
    )
    op.create_foreign_key(
        "fk_registration_participants_track_id",
        "participants",
        "tracks",
        ["track_id"],
        ["id"],
        source_schema="registration",
        referent_schema="events",
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_registration_participants_track_id"),
        "participants",
        ["track_id"],
        unique=False,
        schema="registration",
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_registration_participants_track_id"), table_name="participants", schema="registration")
    op.drop_constraint("fk_registration_participants_track_id", "participants", schema="registration", type_="foreignkey")
    op.drop_column("participants", "track_id", schema="registration")
    op.drop_column("participants", "roles", schema="registration")

    op.drop_index(op.f("ix_speakers_speakers_participant_id"), table_name="speakers", schema="speakers")
    op.drop_index(op.f("ix_speakers_speakers_track_id"), table_name="speakers", schema="speakers")
    op.drop_constraint("fk_speakers_speakers_participant_id", "speakers", schema="speakers", type_="foreignkey")
    op.drop_constraint("fk_speakers_speakers_track_id", "speakers", schema="speakers", type_="foreignkey")
    op.drop_column("speakers", "role", schema="speakers")
    op.drop_column("speakers", "participant_id", schema="speakers")
    op.drop_column("speakers", "track_id", schema="speakers")
