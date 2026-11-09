"""Versioned workspace bindings and retained revocation state."""
from alembic import op
import sqlalchemy as sa

revision = "20261007_3230"
down_revision = "20261006_3220"
branch_labels = None
depends_on = None


def upgrade():
    # Constant defaults are additive, preserve every existing binding and avoid
    # a row-by-row application backfill on supported PostgreSQL versions.
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.add_column("workspace_role_bindings", sa.Column("version", sa.Integer(), nullable=False, server_default="1"), schema="organizer_access")
    op.add_column("workspace_role_bindings", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()), schema="organizer_access")


def downgrade():
    # An old reader ignores revoked bindings' is_active flag and resurrects
    # authority. Block such schema rollback; retain data and roll forward.
    raise RuntimeError("Workspace revocation cannot be downgraded to an active-only reader; use a fail-closed rollback.")
