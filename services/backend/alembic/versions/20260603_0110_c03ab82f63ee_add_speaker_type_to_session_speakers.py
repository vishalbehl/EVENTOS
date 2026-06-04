"""add_speaker_type_to_session_speakers

Revision ID: c03ab82f63ee
Revises: 8e9a2b3c4d5e
Create Date: 2026-06-03 01:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c03ab82f63ee'
down_revision: Union[str, None] = '8e9a2b3c4d5e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Use IF NOT EXISTS to be idempotent — the column may already exist
    # from the segregate_db_to_schemas migration (20260602_1433_6f52204df2ba)
    op.execute(sa.text(
        "ALTER TABLE speakers.session_speakers "
        "ADD COLUMN IF NOT EXISTS speaker_type VARCHAR(10)"
    ))


def downgrade() -> None:
    op.drop_column('session_speakers', 'speaker_type', schema='speakers')
