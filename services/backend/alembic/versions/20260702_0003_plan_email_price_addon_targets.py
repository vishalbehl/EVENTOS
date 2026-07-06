"""plan email limits, event price, and add-on template targets

Revision ID: 20260702_0003
Revises: 20260702_0002
Create Date: 2026-07-02
"""
from alembic import op
import sqlalchemy as sa


revision = "20260702_0003"
down_revision = "20260702_0002"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE billing.subscription_plans ADD COLUMN IF NOT EXISTS price_per_event NUMERIC(12,2)")
    op.execute("ALTER TABLE billing.subscription_plans ADD COLUMN IF NOT EXISTS max_emails_per_event INTEGER")
    op.execute("UPDATE billing.subscription_plans SET price_per_event = price_per_event_min WHERE price_per_event IS NULL")
    op.execute("ALTER TABLE billing.addons ADD COLUMN IF NOT EXISTS template_types VARCHAR[] NOT NULL DEFAULT '{}'")
    op.execute("ALTER TABLE communications.email_logs ADD COLUMN IF NOT EXISTS event_id UUID")
    op.execute("""DO $$ BEGIN ALTER TABLE communications.email_logs ADD CONSTRAINT fk_email_logs_event_id FOREIGN KEY (event_id) REFERENCES events.events(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_communications_email_logs_event_id ON communications.email_logs (event_id)")


def downgrade():
    op.drop_index("ix_communications_email_logs_event_id", table_name="email_logs", schema="communications")
    op.drop_constraint("fk_email_logs_event_id", "email_logs", schema="communications", type_="foreignkey")
    op.drop_column("email_logs", "event_id", schema="communications")
    op.drop_column("addons", "template_types", schema="billing")
    op.drop_column("subscription_plans", "max_emails_per_event", schema="billing")
    op.drop_column("subscription_plans", "price_per_event", schema="billing")
