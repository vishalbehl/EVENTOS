"""add_registration_portal_tables

Revision ID: 35bed70f4a6f
Revises: f4b82646419f
Create Date: 2026-05-19 14:54:30.912124+00:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '35bed70f4a6f'
down_revision: Union[str, None] = 'f4b82646419f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    # 1. participants
    if 'participants' not in existing_tables:
        op.create_table(
            'participants',
            sa.Column('id', sa.UUID(), nullable=False),
            sa.Column('event_id', sa.UUID(), nullable=False),
            sa.Column('regno', sa.String(length=50), nullable=True),
            sa.Column('name', sa.String(length=255), nullable=False),
            sa.Column('email', sa.String(length=320), nullable=True),
            sa.Column('phone', sa.String(length=30), nullable=True),
            sa.Column('role', sa.String(length=50), nullable=False, server_default='Delegate'),
            sa.Column('company', sa.String(length=255), nullable=True),
            sa.Column('designation', sa.String(length=255), nullable=True),
            sa.Column('country', sa.String(length=100), nullable=True),
            sa.Column('paid_status', sa.String(length=30), nullable=False, server_default='Unpaid'),
            sa.Column('source', sa.String(length=30), nullable=False, server_default='offline'),
            sa.Column('custom_fields', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
            sa.Column('registered_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(['event_id'], ['events.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_participants_event_id'), 'participants', ['event_id'], unique=False)
        op.create_index(op.f('ix_participants_regno'), 'participants', ['regno'], unique=False)
        op.create_index(op.f('ix_participants_email'), 'participants', ['email'], unique=False)
    else:
        # Check if custom_fields column exists
        columns = [c['name'] for c in inspector.get_columns('participants')]
        if 'custom_fields' not in columns:
            op.add_column('participants', sa.Column('custom_fields', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'))

    # 2. check_ins
    if 'check_ins' not in existing_tables:
        op.create_table(
            'check_ins',
            sa.Column('id', sa.UUID(), nullable=False),
            sa.Column('event_id', sa.UUID(), nullable=False),
            sa.Column('participant_id', sa.UUID(), nullable=False),
            sa.Column('session_id', sa.UUID(), nullable=False),
            sa.Column('check_in_time', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(['event_id'], ['events.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['participant_id'], ['participants.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['session_id'], ['sessions.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_check_ins_event_id'), 'check_ins', ['event_id'], unique=False)
        op.create_index(op.f('ix_check_ins_participant_id'), 'check_ins', ['participant_id'], unique=False)
        op.create_index(op.f('ix_check_ins_session_id'), 'check_ins', ['session_id'], unique=False)

    # 3. print_templates
    if 'print_templates' not in existing_tables:
        op.create_table(
            'print_templates',
            sa.Column('id', sa.UUID(), nullable=False),
            sa.Column('event_id', sa.UUID(), nullable=True),
            sa.Column('template_name', sa.String(length=255), nullable=False),
            sa.Column('template_data', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(['event_id'], ['events.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_print_templates_event_id'), 'print_templates', ['event_id'], unique=False)

    # 4. ticket_types
    if 'ticket_types' not in existing_tables:
        op.create_table(
            'ticket_types',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('event_id', sa.UUID(), nullable=False),
            sa.Column('role_name', sa.String(length=100), nullable=False),
            sa.Column('tier_name', sa.String(length=100), nullable=False),
            sa.Column('price', sa.Float(), nullable=False),
            sa.ForeignKeyConstraint(['event_id'], ['events.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('event_id', 'role_name', 'tier_name', name='_event_role_tier_uc')
        )
        op.create_index(op.f('ix_ticket_types_event_id'), 'ticket_types', ['event_id'], unique=False)

    # 5. registration_form_configs
    if 'registration_form_configs' not in existing_tables:
        op.create_table(
            'registration_form_configs',
            sa.Column('id', sa.UUID(), nullable=False),
            sa.Column('event_id', sa.UUID(), nullable=False),
            sa.Column('is_live', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('fields', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='[]'),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(['event_id'], ['events.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_registration_form_configs_event_id'), 'registration_form_configs', ['event_id'], unique=True)


def downgrade() -> None:
    op.drop_table('registration_form_configs')
    op.drop_table('ticket_types')
    op.drop_table('print_templates')
    op.drop_table('check_ins')
    op.drop_table('participants')
