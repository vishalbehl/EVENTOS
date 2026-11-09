"""Use lifecycle jobs as durable dispatch records; preserve existing jobs/history."""
from alembic import op
import sqlalchemy as sa

revision = "20261008_3430"
down_revision = "20261008_3420"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("organization_lifecycle_jobs", sa.Column("dispatch_attempts", sa.Integer(), nullable=False, server_default="0"), schema="operations")
    op.add_column("organization_lifecycle_jobs", sa.Column("next_dispatch_at", sa.DateTime(timezone=True), nullable=True), schema="operations")
    with op.get_context().autocommit_block():
        op.execute("""CREATE INDEX CONCURRENTLY ix_lifecycle_dispatch_due
            ON operations.organization_lifecycle_jobs (organization_id,next_dispatch_at,id)
            WHERE status IN ('PENDING','RETRY_PENDING')""")


def downgrade():
    raise RuntimeError("Retain durable lifecycle dispatch state during application rollback.")
