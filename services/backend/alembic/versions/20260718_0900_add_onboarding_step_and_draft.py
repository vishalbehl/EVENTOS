"""add onboarding_step and onboarding_draft

Revision ID: 20260718_0900
Revises: 20260718_0800
Create Date: 2026-07-18 23:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20260718_0900'
down_revision = '20260718_0800'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('organizations', sa.Column('onboarding_step', sa.Integer(), nullable=False, server_default='0'), schema='platform')
    op.add_column('organizations', sa.Column('onboarding_draft', postgresql.JSONB(astext_type=sa.Text()), nullable=True, server_default='{}'), schema='platform')


def downgrade():
    op.drop_column('organizations', 'onboarding_draft', schema='platform')
    op.drop_column('organizations', 'onboarding_step', schema='platform')
