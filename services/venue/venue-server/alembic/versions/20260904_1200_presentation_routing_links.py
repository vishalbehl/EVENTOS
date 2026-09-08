"""Persist direct room and session routing links for presentation versions."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260904_1200"
down_revision: Union[str, None] = "20260904_1100"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("presentation_files", sa.Column("session_id", sa.UUID(), nullable=True), schema="presentations")
    op.add_column("presentation_files", sa.Column("room_id", sa.UUID(), nullable=True), schema="presentations")
    op.create_index("ix_presentations_presentation_files_session_id", "presentation_files", ["session_id"], schema="presentations")
    op.create_index("ix_presentations_presentation_files_room_id", "presentation_files", ["room_id"], schema="presentations")
    op.create_foreign_key(
        "fk_presentation_files_session_id",
        "presentation_files",
        "sessions",
        ["session_id"],
        ["id"],
        source_schema="presentations",
        referent_schema="events",
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_presentation_files_room_id",
        "presentation_files",
        "rooms",
        ["room_id"],
        ["id"],
        source_schema="presentations",
        referent_schema="events",
        ondelete="CASCADE",
    )
    op.execute(sa.text("""
        UPDATE presentations.presentation_files AS pf
        SET session_id = ss.session_id,
            room_id = s.room_id
        FROM presentations.session_speakers AS ss
        JOIN events.sessions AS s ON s.id = ss.session_id
        WHERE pf.session_speaker_id = ss.id
    """))
    missing = op.get_bind().execute(sa.text("""
        SELECT count(*) FROM presentations.presentation_files
        WHERE session_id IS NULL OR room_id IS NULL
    """)).scalar_one()
    if missing:
        raise RuntimeError(f"Cannot finalize presentation routing links; {missing} file versions have no session/room.")
    op.alter_column("presentation_files", "session_id", nullable=False, schema="presentations")
    op.alter_column("presentation_files", "room_id", nullable=False, schema="presentations")


def downgrade() -> None:
    op.drop_constraint("fk_presentation_files_room_id", "presentation_files", schema="presentations", type_="foreignkey")
    op.drop_constraint("fk_presentation_files_session_id", "presentation_files", schema="presentations", type_="foreignkey")
    op.drop_index("ix_presentations_presentation_files_room_id", table_name="presentation_files", schema="presentations")
    op.drop_index("ix_presentations_presentation_files_session_id", table_name="presentation_files", schema="presentations")
    op.drop_column("presentation_files", "room_id", schema="presentations")
    op.drop_column("presentation_files", "session_id", schema="presentations")
