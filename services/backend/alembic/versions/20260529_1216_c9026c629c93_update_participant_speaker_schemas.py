"""update_participant_speaker_schemas

Revision ID: c9026c629c93
Revises: 7a3f9b1c2d4e
Create Date: 2026-05-29 12:16:34.908000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9026c629c93'
down_revision: Union[str, None] = '7a3f9b1c2d4e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Participants updates
    op.add_column('participants', sa.Column('role_id', sa.UUID(), nullable=True))
    op.add_column('participants', sa.Column('approval_status', sa.String(length=50), nullable=False, server_default='Approved'))
    op.add_column('participants', sa.Column('badge_status', sa.String(length=50), nullable=False, server_default='Unprinted'))
    op.add_column('participants', sa.Column('checkin_status', sa.String(length=50), nullable=False, server_default='Pending'))
    op.add_column('participants', sa.Column('qr_code_url', sa.String(length=1024), nullable=True))
    op.create_index(op.f('ix_participants_role_id'), 'participants', ['role_id'], unique=False)
    op.create_foreign_key(None, 'participants', 'participant_roles', ['role_id'], ['id'], ondelete='SET NULL')
    op.drop_column('participants', 'role')
    op.drop_column('participants', 'name')

    # Speakers updates
    op.add_column('speakers', sa.Column('regno', sa.String(length=50), nullable=True))
    op.add_column('speakers', sa.Column('designation', sa.String(length=255), nullable=True))
    op.create_index(op.f('ix_speakers_regno'), 'speakers', ['regno'], unique=False)


def downgrade() -> None:
    # Speakers downgrades
    op.drop_index(op.f('ix_speakers_regno'), table_name='speakers')
    op.drop_column('speakers', 'designation')
    op.drop_column('speakers', 'regno')

    # Participants downgrades
    op.add_column('participants', sa.Column('name', sa.VARCHAR(length=255), autoincrement=False, nullable=True))
    op.add_column('participants', sa.Column('role', sa.VARCHAR(length=50), server_default=sa.text("'Delegate'::character varying"), autoincrement=False, nullable=True))
    op.drop_constraint(None, 'participants', type_='foreignkey')
    op.drop_index(op.f('ix_participants_role_id'), table_name='participants')
    op.drop_column('participants', 'qr_code_url')
    op.drop_column('participants', 'checkin_status')
    op.drop_column('participants', 'badge_status')
    op.drop_column('participants', 'approval_status')
    op.drop_column('participants', 'role_id')
