"""update check constraints for zip and status

Revision ID: 5afe70425873
Revises: 0ed6e2bcf9c8
Create Date: 2026-05-07 10:44:27.926307+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5afe70425873'
down_revision: Union[str, None] = '0ed6e2bcf9c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop old constraints
    op.drop_constraint('ck_pf_file_format', 'presentation_files', type_='check')
    op.drop_constraint('ck_pf_upload_status', 'presentation_files', type_='check')
    op.drop_constraint('ck_pf_upload_source', 'presentation_files', type_='check')
    
    # Create new constraints
    op.create_check_constraint(
        'ck_pf_file_format',
        'presentation_files',
        "file_format IN ('pptx','pdf','mp4','key','ppt','zip')"
    )
    op.create_check_constraint(
        'ck_pf_upload_status',
        'presentation_files',
        "upload_status IN ('processing','valid','invalid','approved','rejected','locked','pending_validation')"
    )
    op.create_check_constraint(
        'ck_pf_upload_source',
        'presentation_files',
        "upload_source IN ('web','kiosk','station','api','portal')"
    )


def downgrade() -> None:
    # Drop new constraints
    op.drop_constraint('ck_pf_file_format', 'presentation_files', type_='check')
    op.drop_constraint('ck_pf_upload_status', 'presentation_files', type_='check')
    op.drop_constraint('ck_pf_upload_source', 'presentation_files', type_='check')
    
    # Recreate old constraints
    op.create_check_constraint(
        'ck_pf_file_format',
        'presentation_files',
        "file_format IN ('pptx','pdf','mp4','key','ppt')"
    )
    op.create_check_constraint(
        'ck_pf_upload_status',
        'presentation_files',
        "upload_status IN ('processing','valid','invalid','approved','rejected','locked')"
    )
    op.create_check_constraint(
        'ck_pf_upload_source',
        'presentation_files',
        "upload_source IN ('web','kiosk','station','api')"
    )
