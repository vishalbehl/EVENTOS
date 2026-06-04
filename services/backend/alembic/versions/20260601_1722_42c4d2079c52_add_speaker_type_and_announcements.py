"""add_speaker_type_and_announcements

Revision ID: 42c4d2079c52
Revises: c9026c629c93
Create Date: 2026-06-01 17:22:49.548103+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '42c4d2079c52'
down_revision: Union[str, None] = 'c9026c629c93'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create announcements table
    op.create_table('announcements',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('event_id', sa.UUID(), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('audience', sa.String(length=50), nullable=False),
        sa.Column('priority', sa.String(length=20), nullable=False),
        sa.Column('is_pinned', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('attachments', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['event_id'], ['events.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_announcements_event_id'), 'announcements', ['event_id'], unique=False)
    
    # Add new columns to session_speakers and speakers
    op.add_column('session_speakers', sa.Column('speaker_type', sa.String(length=10), nullable=True))
    op.add_column('speakers', sa.Column('social_links', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('speakers', sa.Column('research_interests', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column('speakers', 'research_interests')
    op.drop_column('speakers', 'social_links')
    op.drop_column('session_speakers', 'speaker_type')
    op.drop_index(op.f('ix_announcements_event_id'), table_name='announcements')
    op.drop_table('announcements')
