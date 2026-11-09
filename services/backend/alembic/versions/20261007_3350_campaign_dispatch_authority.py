"""Explicit campaign dispatch identity; no legacy creator/role inference."""
from alembic import op

revision = "20261007_3350"
down_revision = "20261007_3340"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""ALTER TABLE communications.email_campaigns
      ADD COLUMN send_actor_id uuid,
      ADD COLUMN send_organization_id uuid,
      ADD COLUMN send_audience varchar(20),
      ADD COLUMN send_dispatch_id uuid,
      ADD COLUMN send_authorized_at timestamptz""")
    op.execute("""ALTER TABLE communications.email_campaigns ADD CONSTRAINT ck_campaign_dispatch_authority CHECK (
      (send_actor_id IS NULL AND send_organization_id IS NULL AND send_audience IS NULL
       AND send_dispatch_id IS NULL AND send_authorized_at IS NULL)
      OR (send_actor_id IS NOT NULL AND send_organization_id IS NOT NULL
       AND send_audience IS NOT NULL AND send_audience IN ('CUSTOMER','PLATFORM')
       AND send_dispatch_id IS NOT NULL AND send_authorized_at IS NOT NULL)) NOT VALID""")
    op.execute("ALTER TABLE communications.email_campaigns VALIDATE CONSTRAINT ck_campaign_dispatch_authority")


def downgrade():
    raise RuntimeError("Category A rollback must preserve dispatch authority and fail closed")
