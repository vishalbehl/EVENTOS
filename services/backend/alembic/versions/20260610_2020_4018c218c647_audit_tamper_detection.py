"""audit_tamper_detection

Revision ID: 4018c218c647
Revises: b88a342bad97
Create Date: 2026-06-10 20:20:36.199190+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4018c218c647'
down_revision: Union[str, None] = 'b88a342bad97'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Drop old indexes
    op.drop_index('ix_audit_logs_acting_user_id', table_name='logs', schema='audit')
    op.drop_index('ix_audit_logs_action', table_name='logs', schema='audit')
    op.drop_index('ix_audit_logs_event_occurred', table_name='logs', schema='audit')

    # 2. Rename columns
    op.alter_column('logs', 'acting_user_id', new_column_name='actor_user_id', schema='audit')
    op.alter_column('logs', 'ip_address', new_column_name='actor_ip', type_=sa.String(length=45), schema='audit')
    op.alter_column('logs', 'user_agent', new_column_name='actor_user_agent', schema='audit')
    op.alter_column('logs', 'action', new_column_name='action_type', schema='audit')
    op.alter_column('logs', 'entity_type', new_column_name='resource_type', schema='audit')
    op.alter_column('logs', 'entity_id', new_column_name='resource_id', schema='audit')
    op.alter_column('logs', 'old_values', new_column_name='old_state', schema='audit')
    op.alter_column('logs', 'new_values', new_column_name='new_state', schema='audit')

    # 3. Add new columns
    op.add_column('logs', sa.Column('diff', sa.dialects.postgresql.JSONB(astext_type=sa.Text()), nullable=True), schema='audit')
    op.add_column('logs', sa.Column('actor_role', sa.String(length=50), nullable=True), schema='audit')
    op.add_column('logs', sa.Column('impersonated_by', sa.UUID(), nullable=True), schema='audit')
    op.add_column('logs', sa.Column('is_sensitive', sa.Boolean(), server_default='false', nullable=False), schema='audit')

    # 4. Add new foreign key for impersonated_by
    op.create_foreign_key(
        'fk_logs_impersonated_by',
        'logs', 'users',
        ['impersonated_by'], ['id'],
        source_schema='audit', referent_schema='identity',
        ondelete='SET NULL'
    )

    # 5. Drop old columns
    op.drop_column('logs', 'event_id', schema='audit')
    op.drop_column('logs', 'user_id', schema='audit')
    op.drop_column('logs', 'target_user_id', schema='audit')
    op.drop_column('logs', 'severity', schema='audit')

    # 6. Create new indexes
    op.create_index(op.f('ix_audit_logs_actor_user_id'), 'logs', ['actor_user_id'], unique=False, schema='audit')
    op.create_index(op.f('ix_audit_logs_action_type'), 'logs', ['action_type'], unique=False, schema='audit')
    op.create_index(op.f('ix_audit_logs_resource_type'), 'logs', ['resource_type'], unique=False, schema='audit')
    op.create_index(op.f('ix_audit_logs_resource_id'), 'logs', ['resource_id'], unique=False, schema='audit')


def downgrade() -> None:
    # 1. Drop new indexes
    op.drop_index(op.f('ix_audit_logs_actor_user_id'), table_name='logs', schema='audit')
    op.drop_index(op.f('ix_audit_logs_action_type'), table_name='logs', schema='audit')
    op.drop_index(op.f('ix_audit_logs_resource_type'), table_name='logs', schema='audit')
    op.drop_index(op.f('ix_audit_logs_resource_id'), table_name='logs', schema='audit')

    # 2. Add old columns back
    op.add_column('logs', sa.Column('event_id', sa.UUID(), nullable=True), schema='audit')
    op.add_column('logs', sa.Column('user_id', sa.UUID(), nullable=True), schema='audit')
    op.add_column('logs', sa.Column('target_user_id', sa.UUID(), nullable=True), schema='audit')
    op.add_column('logs', sa.Column('severity', sa.String(length=20), nullable=True), schema='audit')

    # Add back foreign keys for dropped columns
    op.create_foreign_key('logs_event_id_fkey', 'logs', 'events', ['event_id'], ['id'], source_schema='audit', referent_schema='events', ondelete='SET NULL')
    op.create_foreign_key('logs_user_id_fkey', 'logs', 'users', ['user_id'], ['id'], source_schema='audit', referent_schema='identity', ondelete='SET NULL')
    op.create_foreign_key('logs_target_user_id_fkey', 'logs', 'users', ['target_user_id'], ['id'], source_schema='audit', referent_schema='identity', ondelete='SET NULL')

    # 3. Drop new foreign keys and columns
    op.drop_constraint('fk_logs_impersonated_by', 'logs', schema='audit', type_='foreignkey')
    op.drop_column('logs', 'diff', schema='audit')
    op.drop_column('logs', 'actor_role', schema='audit')
    op.drop_column('logs', 'impersonated_by', schema='audit')
    op.drop_column('logs', 'is_sensitive', schema='audit')

    # 4. Rename columns back
    op.alter_column('logs', 'actor_user_id', new_column_name='acting_user_id', schema='audit')
    op.alter_column('logs', 'actor_ip', new_column_name='ip_address', schema='audit')
    # Alter actor_ip back to inet using raw sql to be safe
    op.execute("ALTER TABLE audit.logs ALTER COLUMN ip_address TYPE inet USING ip_address::inet")
    op.alter_column('logs', 'actor_user_agent', new_column_name='user_agent', schema='audit')
    op.alter_column('logs', 'action_type', new_column_name='action', schema='audit')
    op.alter_column('logs', 'resource_type', new_column_name='entity_type', schema='audit')
    op.alter_column('logs', 'resource_id', new_column_name='entity_id', schema='audit')
    op.alter_column('logs', 'old_state', new_column_name='old_values', schema='audit')
    op.alter_column('logs', 'new_state', new_column_name='new_values', schema='audit')

    # 5. Recreate old indexes
    op.create_index('ix_audit_logs_acting_user_id', 'logs', ['acting_user_id'], unique=False, schema='audit')
    op.create_index('ix_audit_logs_action', 'logs', ['action'], unique=False, schema='audit')
    op.create_index('ix_audit_logs_event_occurred', 'logs', ['event_id', 'occurred_at'], unique=False, schema='audit')
