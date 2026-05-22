"""add_rbac_system_tables

Revision ID: 813c5f286e55
Revises: 7fb946dbe962
Create Date: 2026-05-08 13:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '813c5f286e55'
down_revision: Union[str, None] = '7fb946dbe962'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # 1. roles
    op.create_table(
        'roles',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=True),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_system_role', sa.Boolean(), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_roles_name'), 'roles', ['name'], unique=False)
    op.create_index(op.f('ix_roles_organization_id'), 'roles', ['organization_id'], unique=False)
    op.create_index(op.f('ix_roles_deleted_at'), 'roles', ['deleted_at'], unique=False)

    # 2. permissions
    op.create_table(
        'permissions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('code', sa.String(length=100), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('module', sa.String(length=50), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_permissions_code'), 'permissions', ['code'], unique=True)

    # 3. role_permissions
    op.create_table(
        'role_permissions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('role_id', sa.UUID(), nullable=False),
        sa.Column('permission_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['permission_id'], ['permissions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['role_id'], ['roles.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # 4. user_role_assignments
    op.create_table(
        'user_role_assignments',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('role_id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=True),
        sa.Column('event_id', sa.UUID(), nullable=True),
        sa.Column('assigned_by', sa.UUID(), nullable=False),
        sa.Column('assigned_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['assigned_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['event_id'], ['events.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['role_id'], ['roles.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_user_role_assignments_role_id'), 'user_role_assignments', ['role_id'], unique=False)
    op.create_index(op.f('ix_user_role_assignments_user_id'), 'user_role_assignments', ['user_id'], unique=False)

    # 5. scoped_permissions
    op.create_table(
        'scoped_permissions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('permission_id', sa.UUID(), nullable=False),
        sa.Column('scope_type', sa.String(length=50), nullable=False),
        sa.Column('scope_id', sa.UUID(), nullable=False),
        sa.Column('is_allowed', sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(['permission_id'], ['permissions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_scoped_permissions_scope_id'), 'scoped_permissions', ['scope_id'], unique=False)
    op.create_index(op.f('ix_scoped_permissions_user_id'), 'scoped_permissions', ['user_id'], unique=False)

    # 6. permission_audit_logs
    op.create_table(
        'permission_audit_logs',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('acting_user_id', sa.UUID(), nullable=False),
        sa.Column('target_user_id', sa.UUID(), nullable=True),
        sa.Column('action', sa.String(length=100), nullable=False),
        sa.Column('entity_type', sa.String(length=50), nullable=False),
        sa.Column('entity_id', sa.UUID(), nullable=False),
        sa.Column('old_values', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('new_values', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('request_id', sa.UUID(), nullable=True),
        sa.Column('correlation_id', sa.UUID(), nullable=True),
        sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['acting_user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['target_user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_permission_audit_logs_acting_user_id'), 'permission_audit_logs', ['acting_user_id'], unique=False)
    op.create_index(op.f('ix_permission_audit_logs_target_user_id'), 'permission_audit_logs', ['target_user_id'], unique=False)

    # 7. user_access_nodes
    op.create_table(
        'user_access_nodes',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('node_type', sa.String(length=50), nullable=False),
        sa.Column('node_id', sa.UUID(), nullable=False),
        sa.Column('permissions', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_user_access_nodes_node_id'), 'user_access_nodes', ['node_id'], unique=False)
    op.create_index(op.f('ix_user_access_nodes_user_id'), 'user_access_nodes', ['user_id'], unique=False)

    # 8. access_templates
    op.create_table(
        'access_templates',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('config', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    # 9. role_inheritance_maps
    op.create_table(
        'role_inheritance_maps',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('parent_role_id', sa.UUID(), nullable=False),
        sa.Column('child_role_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['child_role_id'], ['roles.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['parent_role_id'], ['roles.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # 10. add columns to existing audit_logs
    op.add_column('audit_logs', sa.Column('acting_user_id', sa.UUID(), nullable=True))
    op.add_column('audit_logs', sa.Column('target_user_id', sa.UUID(), nullable=True))
    op.create_foreign_key(None, 'audit_logs', 'users', ['acting_user_id'], ['id'], ondelete='SET NULL')
    op.create_foreign_key(None, 'audit_logs', 'users', ['target_user_id'], ['id'], ondelete='SET NULL')

def downgrade() -> None:
    op.drop_constraint(None, 'audit_logs', type_='foreignkey')
    op.drop_constraint(None, 'audit_logs', type_='foreignkey')
    op.drop_column('audit_logs', 'target_user_id')
    op.drop_column('audit_logs', 'acting_user_id')
    op.drop_table('role_inheritance_maps')
    op.drop_table('access_templates')
    op.drop_index(op.f('ix_user_access_nodes_user_id'), table_name='user_access_nodes')
    op.drop_index(op.f('ix_user_access_nodes_node_id'), table_name='user_access_nodes')
    op.drop_table('user_access_nodes')
    op.drop_index(op.f('ix_permission_audit_logs_target_user_id'), table_name='permission_audit_logs')
    op.drop_index(op.f('ix_permission_audit_logs_acting_user_id'), table_name='permission_audit_logs')
    op.drop_table('permission_audit_logs')
    op.drop_index(op.f('ix_scoped_permissions_user_id'), table_name='scoped_permissions')
    op.drop_index(op.f('ix_scoped_permissions_scope_id'), table_name='scoped_permissions')
    op.drop_table('scoped_permissions')
    op.drop_index(op.f('ix_user_role_assignments_user_id'), table_name='user_role_assignments')
    op.drop_index(op.f('ix_user_role_assignments_role_id'), table_name='user_role_assignments')
    op.drop_table('user_role_assignments')
    op.drop_table('role_permissions')
    op.drop_index(op.f('ix_permissions_code'), table_name='permissions')
    op.drop_table('permissions')
    op.drop_index(op.f('ix_roles_organization_id'), table_name='roles')
    op.drop_index(op.f('ix_roles_name'), table_name='roles')
    op.drop_index(op.f('ix_roles_deleted_at'), table_name='roles')
    op.drop_table('roles')
