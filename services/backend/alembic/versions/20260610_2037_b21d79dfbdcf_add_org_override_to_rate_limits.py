"""add_org_override_to_rate_limits

Revision ID: b21d79dfbdcf
Revises: 4018c218c647
Create Date: 2026-06-10 20:37:50.605417+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b21d79dfbdcf'
down_revision: Union[str, None] = '4018c218c647'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'rate_limits',
        sa.Column('organization_id', sa.UUID(), nullable=True),
        schema='developer'
    )
    op.create_foreign_key(
        'fk_rate_limits_organization',
        'rate_limits', 'organizations',
        ['organization_id'], ['id'],
        source_schema='developer', referent_schema='platform',
        ondelete='CASCADE'
    )


def downgrade() -> None:
    op.drop_constraint('fk_rate_limits_organization', 'rate_limits', schema='developer')
    op.drop_column('rate_limits', 'organization_id', schema='developer')
