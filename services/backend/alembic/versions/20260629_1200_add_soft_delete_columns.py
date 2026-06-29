"""add soft delete columns

Revision ID: f0326e6460e4
Revises: f0326e6460e3
Create Date: 2026-06-29 12:00:00.000000+00:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'f0326e6460e4'
down_revision: Union[str, None] = 'f0326e6460e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # Add deleted_at and deleted_by columns to room_templates
    op.add_column('room_templates', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True), schema='templates')
    op.add_column('room_templates', sa.Column('deleted_by', sa.UUID(as_uuid=True), sa.ForeignKey('identity.users.id', ondelete='SET NULL'), nullable=True), schema='templates')
    op.create_index(op.f('ix_templates_room_templates_deleted_at'), 'room_templates', ['deleted_at'], unique=False, schema='templates')

    # Add deleted_at and deleted_by columns to registration_templates
    op.add_column('registration_templates', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True), schema='templates')
    op.add_column('registration_templates', sa.Column('deleted_by', sa.UUID(as_uuid=True), sa.ForeignKey('identity.users.id', ondelete='SET NULL'), nullable=True), schema='templates')
    op.create_index(op.f('ix_templates_registration_templates_deleted_at'), 'registration_templates', ['deleted_at'], unique=False, schema='templates')

    # Add deleted_at and deleted_by columns to srr_templates
    op.add_column('srr_templates', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True), schema='templates')
    op.add_column('srr_templates', sa.Column('deleted_by', sa.UUID(as_uuid=True), sa.ForeignKey('identity.users.id', ondelete='SET NULL'), nullable=True), schema='templates')
    op.create_index(op.f('ix_templates_srr_templates_deleted_at'), 'srr_templates', ['deleted_at'], unique=False, schema='templates')

    # Add deleted_at and deleted_by columns to network_templates
    op.add_column('network_templates', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True), schema='templates')
    op.add_column('network_templates', sa.Column('deleted_by', sa.UUID(as_uuid=True), sa.ForeignKey('identity.users.id', ondelete='SET NULL'), nullable=True), schema='templates')
    op.create_index(op.f('ix_templates_network_templates_deleted_at'), 'network_templates', ['deleted_at'], unique=False, schema='templates')

def downgrade() -> None:
    # Drop from room_templates
    op.drop_index(op.f('ix_templates_room_templates_deleted_at'), table_name='room_templates', schema='templates')
    op.drop_column('room_templates', 'deleted_by', schema='templates')
    op.drop_column('room_templates', 'deleted_at', schema='templates')

    # Drop from registration_templates
    op.drop_index(op.f('ix_templates_registration_templates_deleted_at'), table_name='registration_templates', schema='templates')
    op.drop_column('registration_templates', 'deleted_by', schema='templates')
    op.drop_column('registration_templates', 'deleted_at', schema='templates')

    # Drop from srr_templates
    op.drop_index(op.f('ix_templates_srr_templates_deleted_at'), table_name='srr_templates', schema='templates')
    op.drop_column('srr_templates', 'deleted_by', schema='templates')
    op.drop_column('srr_templates', 'deleted_at', schema='templates')

    # Drop from network_templates
    op.drop_index(op.f('ix_templates_network_templates_deleted_at'), table_name='network_templates', schema='templates')
    op.drop_column('network_templates', 'deleted_by', schema='templates')
    op.drop_column('network_templates', 'deleted_at', schema='templates')
