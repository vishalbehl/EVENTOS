"""add_participant_roles_table

Revision ID: c3f1d9e2a84b
Revises: 819a5a0a6057
Create Date: 2026-05-19 17:15:00.000000+00:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'c3f1d9e2a84b'
down_revision: Union[str, None] = '819a5a0a6057'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'participant_roles',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('event_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('category', sa.String(100), nullable=False, server_default='General'),
        sa.Column('name', sa.String(150), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['event_id'], ['events.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_participant_roles_event_id', 'participant_roles', ['event_id'])


def downgrade() -> None:
    op.drop_index('ix_participant_roles_event_id', table_name='participant_roles')
    op.drop_table('participant_roles')
