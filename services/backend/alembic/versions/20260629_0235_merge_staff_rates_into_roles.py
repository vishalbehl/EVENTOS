"""merge staff rates into roles

Revision ID: a86f7b76a0e1
Revises: 86af6b6460d0
Create Date: 2026-06-29 02:35:00.000000+00:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a86f7b76a0e1'
down_revision: Union[str, None] = '86af6b6460d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # 1. Drop commercial.staff_rates first (relies on staff_roles)
    op.execute(sa.text("DROP TABLE IF EXISTS commercial.staff_rates CASCADE;"))
    
    # 2. Recreate or alter commercial.staff_roles to have exactly the new columns
    op.execute(sa.text("TRUNCATE TABLE commercial.staff_roles CASCADE;"))
    
    # Add new columns
    op.add_column('staff_roles', sa.Column('role_code', sa.String(length=50), nullable=False, server_default='OPS-ROLE'), schema='commercial')
    op.add_column('staff_roles', sa.Column('team_category', sa.String(length=100), nullable=False, server_default='General Operations'), schema='commercial')
    op.add_column('staff_roles', sa.Column('grade', sa.String(length=50), nullable=False, server_default='L1'), schema='commercial')
    op.add_column('staff_roles', sa.Column('cost_per_day', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0.00'), schema='commercial')
    op.add_column('staff_roles', sa.Column('selling_per_day', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0.00'), schema='commercial')
    op.add_column('staff_roles', sa.Column('available_count', sa.Integer(), nullable=False, server_default='10'), schema='commercial')
    op.add_column('staff_roles', sa.Column('status', sa.String(length=50), nullable=False, server_default='ACTIVE'), schema='commercial')

def downgrade() -> None:
    # Drop new columns
    op.drop_column('staff_roles', 'role_code', schema='commercial')
    op.drop_column('staff_roles', 'team_category', schema='commercial')
    op.drop_column('staff_roles', 'grade', schema='commercial')
    op.drop_column('staff_roles', 'cost_per_day', schema='commercial')
    op.drop_column('staff_roles', 'selling_per_day', schema='commercial')
    op.drop_column('staff_roles', 'available_count', schema='commercial')
    op.drop_column('staff_roles', 'status', schema='commercial')
    
    # Recreate staff_rates table
    op.execute(sa.text("""
        CREATE TABLE commercial.staff_rates (
            id UUID PRIMARY KEY,
            role_id UUID NOT NULL REFERENCES commercial.staff_roles(id) ON DELETE CASCADE,
            region VARCHAR(50) NOT NULL,
            hourly_rate NUMERIC(10, 2) NOT NULL,
            daily_rate NUMERIC(10, 2) NOT NULL,
            overtime_rate NUMERIC(10, 2) NOT NULL,
            currency VARCHAR(3) NOT NULL DEFAULT 'USD',
            effective_from TIMESTAMP WITH TIME ZONE NOT NULL,
            effective_to TIMESTAMP WITH TIME ZONE NOT NULL
        );
    """))
