"""add speaker_id_list to email_campaigns

Revision ID: add_speaker_id_list_to_campaigns
Revises: add_allow_override_to_speakers
Create Date: 2026-05-16 12:01:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_speaker_id_list_to_campaigns'
down_revision = 'add_allow_override_to_speakers'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Stores comma-separated speaker UUIDs for recipient_filter='specific_speakers'
    op.add_column(
        'email_campaigns',
        sa.Column('speaker_id_list', sa.Text(), nullable=True)
    )
    # Also add 'specific_speakers' to the allowed recipient_filter values
    # (no DB constraint to update — the pattern is only enforced at the Pydantic layer)


def downgrade() -> None:
    op.drop_column('email_campaigns', 'speaker_id_list')
