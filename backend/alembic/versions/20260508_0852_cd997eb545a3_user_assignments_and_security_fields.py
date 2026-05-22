"""user assignments and security fields

Revision ID: cd997eb545a3
Revises: 4f24d2e30552
Create Date: 2026-05-08 08:52:36.545123+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cd997eb545a3'
down_revision: Union[str, None] = '4f24d2e30552'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add security fields to users
    op.add_column('users', sa.Column('is_2fa_enabled', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('users', sa.Column('two_factor_secret', sa.String(length=100), nullable=True))
    op.add_column('users', sa.Column('allowed_ips', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('notification_preferences', sa.JSON(), server_default='{}', nullable=False))

    # 2. Create user_event_assignments table
    op.create_table(
        'user_event_assignments',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('event_id', sa.UUID(), nullable=False),
        sa.Column('assigned_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.Column('permissions', sa.JSON(), server_default='{}', nullable=False),
        sa.ForeignKeyConstraint(['event_id'], ['events.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'event_id', name='uq_user_event_assignment')
    )
    op.create_index('ix_user_event_assignments_user', 'user_event_assignments', ['user_id'])
    op.create_index('ix_user_event_assignments_event', 'user_event_assignments', ['event_id'])

def downgrade() -> None:
    op.drop_table('user_event_assignments')
    op.drop_column('users', 'notification_preferences')
    op.drop_column('users', 'allowed_ips')
    op.drop_column('users', 'two_factor_secret')
    op.drop_column('users', 'is_2fa_enabled')
