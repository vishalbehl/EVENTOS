"""realign_hardware_catalog

Revision ID: a997947de4ef
Revises: superadmin_phase1_001
Create Date: 2026-06-28 15:45:22.681547+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a997947de4ef'
down_revision: Union[str, None] = 'superadmin_phase1_001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    has_replacement_cost = bind.execute(sa.text("""
        SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_schema = 'inventory' 
            AND table_name = 'hardware_items' 
            AND column_name = 'replacement_cost'
        );
    """)).scalar()
    if has_replacement_cost:
        op.execute(sa.text("ALTER TABLE inventory.hardware_items RENAME COLUMN replacement_cost TO renting_price;"))

    # 2. Drop deprecated columns
    op.execute(sa.text("ALTER TABLE inventory.hardware_items DROP COLUMN IF EXISTS organization_id CASCADE;"))
    op.execute(sa.text("ALTER TABLE inventory.hardware_items DROP COLUMN IF EXISTS serial_number;"))
    op.execute(sa.text("ALTER TABLE inventory.hardware_items DROP COLUMN IF EXISTS condition;"))
    op.execute(sa.text("ALTER TABLE inventory.hardware_items DROP COLUMN IF EXISTS location;"))
    op.execute(sa.text("ALTER TABLE inventory.hardware_items DROP COLUMN IF EXISTS purchase_date;"))
    op.execute(sa.text("ALTER TABLE inventory.hardware_items DROP COLUMN IF EXISTS notes;"))

    # 3. Add new columns
    op.execute(sa.text("ALTER TABLE inventory.hardware_items ADD COLUMN IF NOT EXISTS pricing_unit VARCHAR(50) DEFAULT 'PER_EVENT' NOT NULL;"))
    op.execute(sa.text("ALTER TABLE inventory.hardware_items ADD COLUMN IF NOT EXISTS description TEXT;"))
    op.execute(sa.text("ALTER TABLE inventory.hardware_items ADD COLUMN IF NOT EXISTS tax_category VARCHAR(50) DEFAULT 'GST_18' NOT NULL;"))


def downgrade() -> None:
    op.execute(sa.text("ALTER TABLE inventory.hardware_items RENAME COLUMN renting_price TO replacement_cost;"))
    op.execute(sa.text("ALTER TABLE inventory.hardware_items ADD COLUMN IF NOT EXISTS organization_id UUID;"))
    op.execute(sa.text("ALTER TABLE inventory.hardware_items ADD COLUMN IF NOT EXISTS serial_number VARCHAR(100);"))
    op.execute(sa.text("ALTER TABLE inventory.hardware_items ADD COLUMN IF NOT EXISTS condition VARCHAR(50);"))
    op.execute(sa.text("ALTER TABLE inventory.hardware_items ADD COLUMN IF NOT EXISTS location VARCHAR(100);"))
    op.execute(sa.text("ALTER TABLE inventory.hardware_items ADD COLUMN IF NOT EXISTS purchase_date TIMESTAMP WITH TIME ZONE;"))
    op.execute(sa.text("ALTER TABLE inventory.hardware_items ADD COLUMN IF NOT EXISTS notes TEXT;"))
    op.execute(sa.text("ALTER TABLE inventory.hardware_items DROP COLUMN IF EXISTS pricing_unit;"))
    op.execute(sa.text("ALTER TABLE inventory.hardware_items DROP COLUMN IF EXISTS description;"))
    op.execute(sa.text("ALTER TABLE inventory.hardware_items DROP COLUMN IF EXISTS tax_category;"))
