"""update presentation_files constraints

Revision ID: f4b82646419f
Revises: 4e33e58d8ec1
Create Date: 2026-05-18 04:22:20.418636+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f4b82646419f'
down_revision: Union[str, None] = '4e33e58d8ec1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE presentation_files DROP CONSTRAINT IF EXISTS ck_pf_upload_source")
    op.execute("ALTER TABLE presentation_files DROP CONSTRAINT IF EXISTS ck_pf_upload_status")
    
    op.execute("ALTER TABLE presentation_files ADD CONSTRAINT ck_pf_upload_source CHECK (upload_source IN ('web','kiosk','station','api','portal'))")
    op.execute("ALTER TABLE presentation_files ADD CONSTRAINT ck_pf_upload_status CHECK (upload_status IN ('processing','valid','invalid','approved','rejected','locked','pending_validation'))")


def downgrade() -> None:
    op.execute("ALTER TABLE presentation_files DROP CONSTRAINT IF EXISTS ck_pf_upload_source")
    op.execute("ALTER TABLE presentation_files DROP CONSTRAINT IF EXISTS ck_pf_upload_status")
    
    op.execute("ALTER TABLE presentation_files ADD CONSTRAINT ck_pf_upload_source CHECK (upload_source IN ('web','kiosk','station','api'))")
    op.execute("ALTER TABLE presentation_files ADD CONSTRAINT ck_pf_upload_status CHECK (upload_status IN ('processing','valid','invalid','approved','rejected','locked'))")
