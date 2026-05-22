"""add_respective_configs_and_target_type

Revision ID: 819a5a0a6057
Revises: 35bed70f4a6f
Create Date: 2026-05-19 16:30:50.230617+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '819a5a0a6057'
down_revision: Union[str, None] = '35bed70f4a6f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add columns to events
    op.add_column('events', sa.Column('registration_allowed', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('events', sa.Column('speaker_window_required', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('events', sa.Column('currency', sa.String(length=10), nullable=False, server_default='INR'))
    op.add_column('events', sa.Column('participants_list_allowed', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('events', sa.Column('speaker_settings', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'))
    op.add_column('events', sa.Column('registration_settings', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'))

    # 2. Add target_type to campaigns and templates
    op.add_column('email_campaigns', sa.Column('target_type', sa.String(length=50), server_default='speaker', nullable=False))
    op.add_column('email_templates', sa.Column('target_type', sa.String(length=50), server_default='speaker', nullable=False))

    # 3. Modify email_logs to support participants
    op.alter_column('email_logs', 'speaker_id', existing_type=sa.UUID(), nullable=True)
    op.add_column('email_logs', sa.Column('participant_id', sa.UUID(), nullable=True))
    op.create_index(op.f('ix_email_logs_participant_id'), 'email_logs', ['participant_id'], unique=False)
    op.create_foreign_key('fk_email_logs_participant_id', 'email_logs', 'participants', ['participant_id'], ['id'], ondelete='CASCADE')


def downgrade() -> None:
    op.drop_constraint('fk_email_logs_participant_id', 'email_logs', type_='foreignkey')
    op.drop_index(op.f('ix_email_logs_participant_id'), table_name='email_logs')
    op.drop_column('email_logs', 'participant_id')
    op.alter_column('email_logs', 'speaker_id', existing_type=sa.UUID(), nullable=False)

    op.drop_column('email_templates', 'target_type')
    op.drop_column('email_campaigns', 'target_type')

    op.drop_column('events', 'registration_settings')
    op.drop_column('events', 'speaker_settings')
    op.drop_column('events', 'participants_list_allowed')
    op.drop_column('events', 'currency')
    op.drop_column('events', 'speaker_window_required')
    op.drop_column('events', 'registration_allowed')
