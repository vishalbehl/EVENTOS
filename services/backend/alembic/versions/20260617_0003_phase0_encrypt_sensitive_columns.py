"""encrypt_sensitive_columns

Revision ID: phase0_security_003
Revises: phase0_audit_002
Create Date: 2026-06-17 13:02:00.000000+00:00

PHASE 0 — Security Encryption:
  1. Rename identity.mfa_devices.secret → encrypted_secret, widen to TEXT
  2. Add identity.mfa_devices.backup_codes (TEXT, nullable)
  3. Add registration.registration_theme_settings.encrypted_stripe_credentials (TEXT, nullable)

NOTE: Data migration (encrypting existing plaintext secrets) must be run
separately via scripts/encrypt_sensitive_data.py AFTER this schema migration.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'phase0_security_003'
down_revision: Union[str, None] = 'phase0_audit_002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. MFA — Rename secret → encrypted_secret, widen to TEXT
    op.alter_column(
        'mfa_devices', 'secret',
        schema='identity',
        new_column_name='encrypted_secret',
    )
    op.alter_column(
        'mfa_devices', 'encrypted_secret',
        schema='identity',
        existing_type=sa.String(255),
        type_=sa.Text(),
        existing_nullable=False,
    )

    # 2. MFA — Add backup_codes column
    op.add_column(
        'mfa_devices',
        sa.Column('backup_codes', sa.Text(), nullable=True),
        schema='identity',
    )

    # 3. Registration — Add encrypted_stripe_credentials column
    op.add_column(
        'registration_theme_settings',
        sa.Column('encrypted_stripe_credentials', sa.Text(), nullable=True),
        schema='registration',
    )


def downgrade() -> None:
    # Reverse 3: Drop encrypted_stripe_credentials
    op.drop_column(
        'registration_theme_settings',
        'encrypted_stripe_credentials',
        schema='registration',
    )

    # Reverse 2: Drop backup_codes
    op.drop_column('mfa_devices', 'backup_codes', schema='identity')

    # Reverse 1: Narrow back to varchar(255), rename back to secret
    op.alter_column(
        'mfa_devices', 'encrypted_secret',
        schema='identity',
        existing_type=sa.Text(),
        type_=sa.String(255),
        existing_nullable=False,
    )
    op.alter_column(
        'mfa_devices', 'encrypted_secret',
        schema='identity',
        new_column_name='secret',
    )
