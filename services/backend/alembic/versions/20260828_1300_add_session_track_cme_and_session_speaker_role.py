"""Add track_id, CME, ops to sessions and role to session_speakers

Revision ID: 20260828_1300_add_session_track_cme_and_session_speaker_role
Revises: 20260828_1200_add_speaker_track_participant_and_multirole
Create Date: 2026-08-28 13:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '20260828_1300'
down_revision: Union[str, None] = '20260828_1200'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add track_id, CME, operations to events.sessions
    op.add_column(
        'sessions',
        sa.Column('track_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('events.tracks.id', ondelete='SET NULL'), nullable=True),
        schema='events'
    )
    op.create_index(
        op.f('ix_events_sessions_track_id'),
        'sessions',
        ['track_id'],
        unique=False,
        schema='events'
    )
    op.add_column(
        'sessions',
        sa.Column('cme_credits', sa.Numeric(precision=4, scale=2), nullable=True),
        schema='events'
    )
    op.add_column(
        'sessions',
        sa.Column('cme_eligible', sa.Boolean(), server_default='false', nullable=False),
        schema='events'
    )
    op.add_column(
        'sessions',
        sa.Column('operations_notes', sa.Text(), nullable=True),
        schema='events'
    )
    op.add_column(
        'sessions',
        sa.Column('seating_layout', sa.String(length=50), nullable=True),
        schema='events'
    )
    op.add_column(
        'sessions',
        sa.Column('live_stream_url', sa.String(length=500), nullable=True),
        schema='events'
    )

    # 2. Add role to events.session_speakers
    op.add_column(
        'session_speakers',
        sa.Column('role', sa.String(length=100), server_default='Speaker', nullable=False),
        schema='events'
    )


def downgrade() -> None:
    op.drop_column('session_speakers', 'role', schema='events')
    op.drop_column('sessions', 'live_stream_url', schema='events')
    op.drop_column('sessions', 'seating_layout', schema='events')
    op.drop_column('sessions', 'operations_notes', schema='events')
    op.drop_column('sessions', 'cme_eligible', schema='events')
    op.drop_column('sessions', 'cme_credits', schema='events')
    op.drop_index(op.f('ix_events_sessions_track_id'), table_name='sessions', schema='events')
    op.drop_column('sessions', 'track_id', schema='events')
