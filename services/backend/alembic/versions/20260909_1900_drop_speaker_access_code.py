"""Drop unique speaker access code capability from speakers table."""

from alembic import op
import sqlalchemy as sa


revision = "20260909_1900"
down_revision = "20260909_1850"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index(
        "ix_events_speakers_speaker_code",
        table_name="speakers",
        schema="speakers",
        if_exists=True,
    )
    op.drop_column("speakers", "speaker_code", schema="speakers")


def downgrade() -> None:
    op.add_column(
        "speakers",
        sa.Column("speaker_code", sa.String(length=32), nullable=True),
        schema="speakers",
    )
    op.create_index(
        "ix_events_speakers_speaker_code",
        "speakers",
        ["speaker_code"],
        unique=True,
        schema="speakers",
    )
