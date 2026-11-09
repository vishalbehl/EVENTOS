"""Bounded owner-safety lookup without scanning a tenant's full membership set."""
from alembic import op
import sqlalchemy as sa

revision = "20261006_3200"
down_revision = "20261006_3190"
branch_labels = None
depends_on = None


def upgrade():
    # PostgreSQL builds the additive index without blocking ordinary writes.
    # A failed/interrupted concurrent build must be reconciled before retry;
    # do not mask an invalid index with IF NOT EXISTS.
    with op.get_context().autocommit_block():
        op.create_index("ix_accepted_active_owners", "organization_members",
            ["organization_id", "id"], schema="organizer_access",
            postgresql_where=sa.text("org_role = 'owner' AND is_active = true AND accepted_at IS NOT NULL"),
            postgresql_concurrently=True)


def downgrade():
    # No destructive rollback of the access foundation or owner protection.
    pass
