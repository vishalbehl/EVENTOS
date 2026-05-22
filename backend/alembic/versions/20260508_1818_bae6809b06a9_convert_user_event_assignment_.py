"""convert_user_event_assignment_permissions_to_jsonb

Revision ID: bae6809b06a9
Revises: 813c5f286e55
Create Date: 2026-05-08 18:18:06.803120+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bae6809b06a9'
down_revision: Union[str, None] = '813c5f286e55'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


from sqlalchemy.dialects import postgresql

def upgrade() -> None:
    # Convert JSON to JSONB for user_event_assignments
    op.execute('ALTER TABLE user_event_assignments ALTER COLUMN permissions TYPE JSONB USING permissions::JSONB')
    
    # Also convert notification_preferences for users just in case
    op.execute('ALTER TABLE users ALTER COLUMN notification_preferences TYPE JSONB USING notification_preferences::JSONB')


def downgrade() -> None:
    # Convert JSONB back to JSON
    op.execute('ALTER TABLE user_event_assignments ALTER COLUMN permissions TYPE JSON USING permissions::JSON')
    op.execute('ALTER TABLE users ALTER COLUMN notification_preferences TYPE JSON USING notification_preferences::JSON')
