"""add soft delete to users

Revision ID: 17ee3558c6d7
Revises: 44f156d6379f
Create Date: 2026-05-08 10:09:53.945055+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '17ee3558c6d7'
down_revision: Union[str, None] = '44f156d6379f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index(op.f('ix_users_deleted_at'), 'users', ['deleted_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_users_deleted_at'), table_name='users')
    op.drop_column('users', 'deleted_at')
