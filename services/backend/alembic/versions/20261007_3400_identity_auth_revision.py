"""Authoritative identity authentication revision; deployment requires re-login."""
from alembic import op
import sqlalchemy as sa

revision = "20261007_3400"
down_revision = "20261007_3390"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("auth_revision", sa.Integer(), nullable=False,
        server_default=sa.text("1")), schema="identity")
    op.execute("ALTER TABLE identity.users ADD CONSTRAINT ck_user_auth_revision_positive CHECK (auth_revision >= 1) NOT VALID")
    op.execute("ALTER TABLE identity.users VALIDATE CONSTRAINT ck_user_auth_revision_positive")


def downgrade():
    raise RuntimeError("Authentication revocation must not be removed by application rollback.")
