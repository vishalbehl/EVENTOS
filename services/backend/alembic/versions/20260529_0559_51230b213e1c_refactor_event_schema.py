"""refactor_event_schema

Revision ID: 51230b213e1c
Revises: 2155c89d2e7c
Create Date: 2026-05-29 05:59:48.533773+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '51230b213e1c'
down_revision: Union[str, None] = '2155c89d2e7c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add columns to events table
    op.add_column('events', sa.Column('country', sa.String(length=100), nullable=True))
    op.add_column('events', sa.Column('state', sa.String(length=100), nullable=True))
    op.add_column('events', sa.Column('organizer_details', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{"name": "", "email": "", "phone": "", "website": ""}'))

    # 2. Data migration: Migrate existing organizer_name to organizer_details
    op.execute(
        "UPDATE events SET organizer_details = "
        "jsonb_build_object('name', COALESCE(organizer_name, ''), 'email', '', 'phone', '', 'website', '')"
    )


def downgrade() -> None:
    op.drop_column('events', 'organizer_details')
    op.drop_column('events', 'state')
    op.drop_column('events', 'country')
