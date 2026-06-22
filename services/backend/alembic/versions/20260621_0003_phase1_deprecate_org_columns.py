"""phase1_deprecate_org_columns

Revision ID: phase1_deprecate_org_columns_003
Revises: phase1_addon_invoice_scope_002
Create Date: 2026-06-21 09:20:00.000000+00:00
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'phase1_deprecate_org_columns_003'
down_revision: Union[str, None] = 'phase1_addon_invoice_scope_002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add comments on deprecated columns in platform.organizations
    op.execute(
        sa.text("COMMENT ON COLUMN platform.organizations.plan IS 'DEPRECATED: Use billing subscription features/plans'")
    )
    op.execute(
        sa.text("COMMENT ON COLUMN platform.organizations.max_events IS 'DEPRECATED: Use billing subscription event limits'")
    )
    op.execute(
        sa.text("COMMENT ON COLUMN platform.organizations.max_users IS 'DEPRECATED: Use billing subscription user limits'")
    )
    op.execute(
        sa.text("COMMENT ON COLUMN platform.organizations.max_storage_gb IS 'DEPRECATED: Use billing subscription storage limits'")
    )


def downgrade() -> None:
    # Remove comments
    op.execute(sa.text("COMMENT ON COLUMN platform.organizations.plan IS NULL"))
    op.execute(sa.text("COMMENT ON COLUMN platform.organizations.max_events IS NULL"))
    op.execute(sa.text("COMMENT ON COLUMN platform.organizations.max_users IS NULL"))
    op.execute(sa.text("COMMENT ON COLUMN platform.organizations.max_storage_gb IS NULL"))
