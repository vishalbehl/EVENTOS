"""add onboarding organization profile fields

Revision ID: 20260718_0800
Revises: 20260718_0790_command_center_auth_security
Create Date: 2026-07-18 22:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20260718_0800'
down_revision = 'command_center_auth_security_0790'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('organizations', sa.Column('organization_type', sa.String(length=50), nullable=True), schema='platform')
    op.add_column('organizations', sa.Column('industry', sa.String(length=50), nullable=True), schema='platform')
    op.add_column('organizations', sa.Column('expected_events_per_year', sa.String(length=20), nullable=True), schema='platform')
    op.add_column('organizations', sa.Column('average_attendees_per_event', sa.String(length=50), nullable=True), schema='platform')
    op.add_column('organizations', sa.Column('primary_goal', sa.String(length=50), nullable=True), schema='platform')
    op.add_column('organizations', sa.Column('language', sa.String(length=50), nullable=False, server_default='English'), schema='platform')
    op.add_column('organizations', sa.Column('portal_name', sa.String(length=255), nullable=True), schema='platform')
    op.add_column('organizations', sa.Column('date_format', sa.String(length=20), nullable=False, server_default='DD/MM/YYYY'), schema='platform')
    op.add_column('organizations', sa.Column('time_format', sa.String(length=20), nullable=False, server_default='24 Hour'), schema='platform')
    op.add_column('organizations', sa.Column('currency', sa.String(length=20), nullable=False, server_default='INR (₹)'), schema='platform')
    op.add_column('organizations', sa.Column('enabled_modules', postgresql.JSONB(astext_type=sa.Text()), nullable=True, server_default='[]'), schema='platform')


def downgrade():
    op.drop_column('organizations', 'enabled_modules', schema='platform')
    op.drop_column('organizations', 'currency', schema='platform')
    op.drop_column('organizations', 'time_format', schema='platform')
    op.drop_column('organizations', 'date_format', schema='platform')
    op.drop_column('organizations', 'portal_name', schema='platform')
    op.drop_column('organizations', 'language', schema='platform')
    op.drop_column('organizations', 'primary_goal', schema='platform')
    op.drop_column('organizations', 'average_attendees_per_event', schema='platform')
    op.drop_column('organizations', 'expected_events_per_year', schema='platform')
    op.drop_column('organizations', 'industry', schema='platform')
    op.drop_column('organizations', 'organization_type', schema='platform')
