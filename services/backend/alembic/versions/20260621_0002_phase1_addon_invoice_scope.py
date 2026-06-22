"""phase1_addon_invoice_scope

Revision ID: phase1_addon_invoice_scope_002
Revises: phase1_activations_001
Create Date: 2026-06-21 09:10:00.000000+00:00
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'phase1_addon_invoice_scope_002'
down_revision: Union[str, None] = 'phase1_activations_001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add columns to billing.organization_addons
    op.add_column('organization_addons', sa.Column('event_id', sa.UUID(), nullable=True), schema='billing')
    op.add_column('organization_addons', sa.Column('activation_id', sa.UUID(), nullable=True), schema='billing')
    op.create_foreign_key(
        'fk_organization_addons_event_id_events',
        'organization_addons', 'events',
        ['event_id'], ['id'],
        source_schema='billing', referent_schema='events',
        ondelete='CASCADE'
    )
    op.create_foreign_key(
        'fk_organization_addons_activation_id_event_activations',
        'organization_addons', 'event_activations',
        ['activation_id'], ['id'],
        source_schema='billing', referent_schema='billing',
        ondelete='CASCADE'
    )
    op.create_index('ix_organization_addons_event_id', 'organization_addons', ['event_id'], unique=False, schema='billing')
    op.create_index('ix_organization_addons_activation_id', 'organization_addons', ['activation_id'], unique=False, schema='billing')

    # Add columns to billing.invoices
    op.add_column('invoices', sa.Column('event_id', sa.UUID(), nullable=True), schema='billing')
    op.add_column('invoices', sa.Column('activation_id', sa.UUID(), nullable=True), schema='billing')
    op.create_foreign_key(
        'fk_invoices_event_id_events',
        'invoices', 'events',
        ['event_id'], ['id'],
        source_schema='billing', referent_schema='events',
        ondelete='SET NULL'
    )
    op.create_foreign_key(
        'fk_invoices_activation_id_event_activations',
        'invoices', 'event_activations',
        ['activation_id'], ['id'],
        source_schema='billing', referent_schema='billing',
        ondelete='SET NULL'
    )
    op.create_index('ix_invoices_event_id', 'invoices', ['event_id'], unique=False, schema='billing')
    op.create_index('ix_invoices_activation_id', 'invoices', ['activation_id'], unique=False, schema='billing')


def downgrade() -> None:
    # Drop foreign keys and indexes on billing.invoices
    op.drop_constraint('fk_invoices_activation_id_event_activations', 'invoices', schema='billing', type_='foreignkey')
    op.drop_constraint('fk_invoices_event_id_events', 'invoices', schema='billing', type_='foreignkey')
    op.drop_index('ix_invoices_activation_id', table_name='invoices', schema='billing')
    op.drop_index('ix_invoices_event_id', table_name='invoices', schema='billing')
    op.drop_column('invoices', 'activation_id', schema='billing')
    op.drop_column('invoices', 'event_id', schema='billing')

    # Drop foreign keys and indexes on billing.organization_addons
    op.drop_constraint('fk_organization_addons_activation_id_event_activations', 'organization_addons', schema='billing', type_='foreignkey')
    op.drop_constraint('fk_organization_addons_event_id_events', 'organization_addons', schema='billing', type_='foreignkey')
    op.drop_index('ix_organization_addons_activation_id', table_name='organization_addons', schema='billing')
    op.drop_index('ix_organization_addons_event_id', table_name='organization_addons', schema='billing')
    op.drop_column('organization_addons', 'activation_id', schema='billing')
    op.drop_column('organization_addons', 'event_id', schema='billing')
