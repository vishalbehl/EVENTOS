"""billing_currency_and_addon_features

Revision ID: phase0_billing_005
Revises: phase0_reg_004
Create Date: 2026-06-17 13:04:00.000000+00:00

PHASE 0 — Billing Fixes:
  1. Change billing.invoices default currency from USD to INR
     (existing data untouched — only server_default changes)
  2. Seed billing.addon_features with verified addon↔feature mappings
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'phase0_billing_005'
down_revision: Union[str, None] = 'phase0_reg_004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Change default currency from USD to INR
    op.alter_column(
        'invoices', 'currency',
        schema='billing',
        existing_type=sa.String(10),
        server_default='INR',
    )

    # 2. Seed addon ↔ feature mappings (idempotent via NOT EXISTS)
    op.execute("""
        INSERT INTO billing.addon_features (addon_id, feature_id)
        SELECT
            a.id,
            f.id
        FROM billing.addons a
        CROSS JOIN platform.feature_catalog f
        WHERE (a.key, f.key) IN (
            ('ADDON_WHATSAPP', 'FEAT_WHATSAPP'),
            ('ADDON_EPOSTER', 'FEAT_EPOSTER_MGMT'),
            ('ADDON_WHITE_LABEL', 'FEAT_WHITE_LABEL')
        )
        AND NOT EXISTS (
            SELECT 1 FROM billing.addon_features af
            WHERE af.addon_id = a.id AND af.feature_id = f.id
        );
    """)


def downgrade() -> None:
    # Reverse 2: Remove seeded addon_features
    op.execute("""
        DELETE FROM billing.addon_features af
        USING billing.addons a, platform.feature_catalog f
        WHERE af.addon_id = a.id
          AND af.feature_id = f.id
          AND (a.key, f.key) IN (
            ('ADDON_WHATSAPP', 'FEAT_WHATSAPP'),
            ('ADDON_EPOSTER', 'FEAT_EPOSTER_MGMT'),
            ('ADDON_WHITE_LABEL', 'FEAT_WHITE_LABEL')
          );
    """)

    # Reverse 1: Change default currency back to USD
    op.alter_column(
        'invoices', 'currency',
        schema='billing',
        existing_type=sa.String(10),
        server_default='USD',
    )
