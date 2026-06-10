"""security_updates

Revision ID: b88a342bad97
Revises: 1b39bb2f0e3d
Create Date: 2026-06-10 20:06:30.152510+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b88a342bad97'
down_revision: Union[str, None] = '1b39bb2f0e3d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add column encrypted_totp_secret to identity.users
    op.add_column('users', sa.Column('encrypted_totp_secret', sa.Text(), nullable=True), schema='identity')
    
    # 2. Data migration: encrypt two_factor_secret
    bind = op.get_bind()
    session = sa.orm.Session(bind=bind)
    
    import sys
    import os
    sys.path.insert(0, os.path.abspath('.'))
    sys.path.insert(0, os.path.abspath('services/backend'))
    
    from app.config import settings
    from app.core.encryption import encrypt
    
    # Check if FERNET_KEY is set (usually it will be since we added it to settings)
    if settings.FERNET_KEY:
        users = session.execute(
            sa.text("SELECT id, two_factor_secret FROM identity.users WHERE two_factor_secret IS NOT NULL")
        ).all()
        for user_id, plain_secret in users:
            if plain_secret:
                decrypted_secret = plain_secret
                if plain_secret.startswith("v1:"):
                    try:
                        from app.services.credential_cipher import cipher
                        decrypted_secret = cipher.decrypt(plain_secret)
                    except Exception:
                        pass
                encrypted = encrypt(decrypted_secret)
                session.execute(
                    sa.text("UPDATE identity.users SET encrypted_totp_secret = :enc WHERE id = :id"),
                    {"enc": encrypted, "id": user_id}
                )
        session.commit()

    # 3. Drop column two_factor_secret from identity.users
    op.drop_column('users', 'two_factor_secret', schema='identity')

    # 4. Rename encrypted_totp_secret to two_factor_secret
    op.alter_column('users', 'encrypted_totp_secret', new_column_name='two_factor_secret', schema='identity')

    # 5. Add session_token_hash to audit.impersonation_logs
    op.add_column('impersonation_logs', sa.Column('session_token_hash', sa.String(length=255), nullable=True), schema='audit')


def downgrade() -> None:
    # 1. Drop session_token_hash from audit.impersonation_logs
    op.drop_column('impersonation_logs', 'session_token_hash', schema='audit')

    # 2. Add two_factor_secret_plain to identity.users
    op.add_column('users', sa.Column('two_factor_secret_plain', sa.Text(), nullable=True), schema='identity')

    # 3. Decrypt two_factor_secret
    bind = op.get_bind()
    session = sa.orm.Session(bind=bind)
    
    import sys
    import os
    sys.path.insert(0, os.path.abspath('.'))
    sys.path.insert(0, os.path.abspath('services/backend'))
    
    from app.core.encryption import decrypt
    
    users = session.execute(
        sa.text("SELECT id, two_factor_secret FROM identity.users WHERE two_factor_secret IS NOT NULL")
    ).all()
    for user_id, enc_secret in users:
        if enc_secret:
            try:
                decrypted = decrypt(enc_secret)
            except Exception:
                decrypted = enc_secret
            session.execute(
                sa.text("UPDATE identity.users SET two_factor_secret_plain = :dec WHERE id = :id"),
                {"dec": decrypted, "id": user_id}
            )
    session.commit()

    # 4. Drop two_factor_secret column
    op.drop_column('users', 'two_factor_secret', schema='identity')

    # 5. Rename two_factor_secret_plain to two_factor_secret
    op.alter_column('users', 'two_factor_secret_plain', new_column_name='two_factor_secret', schema='identity')
