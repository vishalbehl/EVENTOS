"""phase1_event_activations

Revision ID: phase1_activations_001
Revises: phase0_billing_005
Create Date: 2026-06-21 09:00:00.000000+00:00
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'phase1_activations_001'
down_revision: Union[str, None] = 'phase0_billing_005'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create billing.event_activations table
    op.create_table(
        'event_activations',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('event_id', sa.UUID(), nullable=False),
        sa.Column('subscription_id', sa.UUID(), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='ACTIVE'),
        sa.Column('activated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['event_id'], ['events.events.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['organization_id'], ['platform.organizations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['subscription_id'], ['billing.organization_subscriptions.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        schema='billing'
    )
    # Indexes
    op.create_index('ix_event_activations_org_id', 'event_activations', ['organization_id'], unique=False, schema='billing')
    op.create_index('ix_event_activations_event_id', 'event_activations', ['event_id'], unique=False, schema='billing')
    op.create_index('ix_event_activations_subscription_id', 'event_activations', ['subscription_id'], unique=False, schema='billing')
    op.create_index('ix_event_activations_status', 'event_activations', ['status'], unique=False, schema='billing')
    
    # Partial unique index: One active activation per event
    op.create_index(
        'uq_event_activations_active',
        'event_activations',
        ['event_id'],
        unique=True,
        schema='billing',
        postgresql_where=sa.text("status = 'ACTIVE'")
    )


def downgrade() -> None:
    # Drop indexes
    op.drop_index('uq_event_activations_active', table_name='event_activations', schema='billing')
    op.drop_index('ix_event_activations_status', table_name='event_activations', schema='billing')
    op.drop_index('ix_event_activations_subscription_id', table_name='event_activations', schema='billing')
    op.drop_index('ix_event_activations_event_id', table_name='event_activations', schema='billing')
    op.drop_index('ix_event_activations_org_id', table_name='event_activations', schema='billing')
    # Drop table
    op.drop_table('event_activations', schema='billing')
