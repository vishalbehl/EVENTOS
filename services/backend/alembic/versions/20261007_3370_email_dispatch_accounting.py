"""Explicit delivery generation attribution; never infer historical send intent."""
from alembic import op

revision = "20261007_3370"
down_revision = "20261007_3360"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE communications.email_logs ADD COLUMN send_dispatch_id uuid")
    with op.get_context().autocommit_block():
        op.execute("""CREATE INDEX CONCURRENTLY ix_email_logs_dispatch_outcome
            ON communications.email_logs (event_id,campaign_id,send_dispatch_id,status)""")


def downgrade():
    raise RuntimeError("Preserve delivery attribution and quota evidence; rollback must fail closed")
