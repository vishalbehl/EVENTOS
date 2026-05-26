"""add_portal_otp_tokens

Revision ID: a1f4c89d2e7b
Revises: 036eeb9fac68
Create Date: 2026-05-26 05:17:00.000000+00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a1f4c89d2e7b'
down_revision: Union[str, None] = '036eeb9fac68'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'portal_otp_tokens',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('email', sa.String(320), nullable=False),
        sa.Column('event_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('otp_hash', sa.String(255), nullable=False),
        sa.Column(
            'expires_at',
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column('attempts', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('used', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text('now()'),
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    # Composite index — the primary query pattern for all OTP lookups
    op.create_index(
        'ix_portal_otp_email_event',
        'portal_otp_tokens',
        ['email', 'event_id'],
    )


def downgrade() -> None:
    op.drop_index('ix_portal_otp_email_event', table_name='portal_otp_tokens')
    op.drop_table('portal_otp_tokens')
