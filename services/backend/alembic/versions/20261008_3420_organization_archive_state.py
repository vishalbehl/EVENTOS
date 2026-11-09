"""Separate operational archive from suspension without guessing legacy intent."""
from alembic import op
import sqlalchemy as sa

revision = "20261008_3420"
down_revision = "20261007_3410"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("organizations", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True), schema="platform")
    # Existing inactive rows remain suspended/unclassified; an operator must
    # reconcile old archive intent. Never enable a tenant or rewrite contracts.
    op.execute("""ALTER TABLE platform.organizations
        ADD CONSTRAINT ck_organization_archive_state
        CHECK (archived_at IS NULL OR (is_active = false AND suspended_at IS NULL)) NOT VALID""")


def downgrade():
    raise RuntimeError("Retain operational archive state and constraints during application rollback.")
