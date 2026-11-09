"""Expand legacy category projections without changing any existing values."""
from alembic import op
import sqlalchemy as sa

revision = "20261021_3660"
down_revision = "20261021_3650"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("SET LOCAL lock_timeout='5s'")
    op.execute("SET LOCAL statement_timeout='30s'")
    op.alter_column("form_templates", "category_key", schema="design",
        existing_type=sa.String(50), type_=sa.String(100), existing_nullable=False)


def downgrade():
    # Rollback is not permission to truncate new identities. Serialise the
    # inspection with writes; a refused downgrade leaves the revision/data intact.
    op.execute("SET LOCAL lock_timeout='5s'")
    op.execute("SET LOCAL statement_timeout='30s'")
    op.execute("LOCK TABLE design.form_templates IN ACCESS EXCLUSIVE MODE")
    if op.get_bind().scalar(sa.text(
            "SELECT EXISTS(SELECT 1 FROM design.form_templates WHERE char_length(category_key)>50)")):
        raise RuntimeError("Category keys exceed the old limit; retain the expanded schema and use forward recovery")
    op.alter_column("form_templates", "category_key", schema="design",
        existing_type=sa.String(100), type_=sa.String(50), existing_nullable=False)
