"""organize_impersonation_fks

Revision ID: 0000organizeimpersonationfks
Revises: 99f14dfd43d1
Create Date: 2026-06-15 00:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '0000organizeimpersonationfks'
down_revision: Union[str, None] = '99f14dfd43d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('impersonation_logs_approved_by_fkey', 'impersonation_logs', schema='audit', type_='foreignkey')
    op.drop_constraint('impersonation_logs_super_admin_id_fkey', 'impersonation_logs', schema='audit', type_='foreignkey')
    op.drop_constraint('impersonation_logs_target_organization_id_fkey', 'impersonation_logs', schema='audit', type_='foreignkey')
    op.drop_constraint('impersonation_logs_target_user_id_fkey', 'impersonation_logs', schema='audit', type_='foreignkey')

    op.alter_column(
        'impersonation_logs',
        'super_admin_id',
        schema='audit',
        existing_type=sa.UUID(),
        nullable=True,
    )
    op.alter_column(
        'impersonation_logs',
        'target_organization_id',
        schema='audit',
        existing_type=sa.UUID(),
        nullable=True,
    )

    op.create_foreign_key(
        'impersonation_logs_approved_by_fkey',
        'impersonation_logs',
        'users',
        ['approved_by'],
        ['id'],
        source_schema='audit',
        referent_schema='identity',
        ondelete='SET NULL'
    )
    op.create_foreign_key(
        'impersonation_logs_super_admin_id_fkey',
        'impersonation_logs',
        'users',
        ['super_admin_id'],
        ['id'],
        source_schema='audit',
        referent_schema='identity',
        ondelete='SET NULL'
    )
    op.create_foreign_key(
        'impersonation_logs_target_organization_id_fkey',
        'impersonation_logs',
        'organizations',
        ['target_organization_id'],
        ['id'],
        source_schema='audit',
        referent_schema='platform',
        ondelete='SET NULL'
    )
    op.create_foreign_key(
        'impersonation_logs_target_user_id_fkey',
        'impersonation_logs',
        'users',
        ['target_user_id'],
        ['id'],
        source_schema='audit',
        referent_schema='identity',
        ondelete='SET NULL'
    )


def downgrade() -> None:
    op.drop_constraint('impersonation_logs_approved_by_fkey', 'impersonation_logs', schema='audit', type_='foreignkey')
    op.drop_constraint('impersonation_logs_super_admin_id_fkey', 'impersonation_logs', schema='audit', type_='foreignkey')
    op.drop_constraint('impersonation_logs_target_organization_id_fkey', 'impersonation_logs', schema='audit', type_='foreignkey')
    op.drop_constraint('impersonation_logs_target_user_id_fkey', 'impersonation_logs', schema='audit', type_='foreignkey')

    op.create_foreign_key(
        'impersonation_logs_approved_by_fkey',
        'impersonation_logs',
        'users',
        ['approved_by'],
        ['id'],
        source_schema='audit',
        referent_schema='identity'
    )
    op.create_foreign_key(
        'impersonation_logs_super_admin_id_fkey',
        'impersonation_logs',
        'users',
        ['super_admin_id'],
        ['id'],
        source_schema='audit',
        referent_schema='identity'
    )
    op.create_foreign_key(
        'impersonation_logs_target_organization_id_fkey',
        'impersonation_logs',
        'organizations',
        ['target_organization_id'],
        ['id'],
        source_schema='audit',
        referent_schema='platform'
    )
    op.create_foreign_key(
        'impersonation_logs_target_user_id_fkey',
        'impersonation_logs',
        'users',
        ['target_user_id'],
        ['id'],
        source_schema='audit',
        referent_schema='identity'
    )

    op.alter_column(
        'impersonation_logs',
        'super_admin_id',
        schema='audit',
        existing_type=sa.UUID(),
        nullable=False,
    )
    op.alter_column(
        'impersonation_logs',
        'target_organization_id',
        schema='audit',
        existing_type=sa.UUID(),
        nullable=False,
    )