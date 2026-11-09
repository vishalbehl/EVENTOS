"""Generation-bound exclusive campaign worker identity."""
from alembic import op

revision = "20261007_3380"
down_revision = "20261007_3370"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""ALTER TABLE communications.email_campaigns
        ADD COLUMN worker_token uuid, ADD COLUMN worker_lease_until timestamptz,
        ADD CONSTRAINT ck_campaign_worker_lease CHECK (
          (worker_token IS NULL AND worker_lease_until IS NULL) OR
          (worker_token IS NOT NULL AND worker_lease_until IS NOT NULL))""")


def downgrade():
    raise RuntimeError("Do not restore unfenced campaign workers during rollback")
