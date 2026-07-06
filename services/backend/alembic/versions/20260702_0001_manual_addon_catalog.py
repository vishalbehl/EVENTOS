"""manual add-on catalog

Revision ID: 20260702_0001
Revises: 20260623_0001
Create Date: 2026-07-02
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260702_0001"
down_revision = "20260701_1430"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE billing.addons ADD COLUMN IF NOT EXISTS addon_type VARCHAR(20) NOT NULL DEFAULT 'PLAN'")
    op.execute("ALTER TABLE billing.addons ADD COLUMN IF NOT EXISTS short_description VARCHAR(255)")
    op.execute("ALTER TABLE billing.addons ADD COLUMN IF NOT EXISTS image_url TEXT")
    op.execute("ALTER TABLE billing.addons ADD COLUMN IF NOT EXISTS hardware_spec JSONB NOT NULL DEFAULT '[]'::jsonb")
    op.execute("ALTER TABLE billing.addons ADD COLUMN IF NOT EXISTS staff_spec JSONB NOT NULL DEFAULT '[]'::jsonb")
    op.execute("ALTER TABLE billing.addons ADD COLUMN IF NOT EXISTS inclusions JSONB NOT NULL DEFAULT '[]'::jsonb")
    op.execute("ALTER TABLE billing.addons ADD COLUMN IF NOT EXISTS exclusions JSONB NOT NULL DEFAULT '[]'::jsonb")
    op.execute("ALTER TABLE billing.addons ADD COLUMN IF NOT EXISTS consumables_cost NUMERIC(12,2) NOT NULL DEFAULT 0")
    op.execute("""
        DO $$ BEGIN
          ALTER TABLE billing.addons ADD CONSTRAINT ck_addons_type CHECK (addon_type IN ('PLAN', 'VENUE'));
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)


def downgrade():
    op.drop_constraint("ck_addons_type", "addons", schema="billing", type_="check")
    for column in ("consumables_cost", "exclusions", "inclusions", "staff_spec", "hardware_spec", "image_url", "short_description", "addon_type"):
        op.drop_column("addons", column, schema="billing")
