"""rename BadgeScan audit table to venue_scan_events"""
from typing import Sequence, Union
from alembic import op

revision: str = "e0f1a2b3c4d5"
down_revision: Union[str, None] = "d9e0f1a2b3c4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        DO $$ BEGIN
          IF to_regclass('venue.badge_scans') IS NOT NULL
             AND to_regclass('venue.venue_scan_events') IS NULL THEN
            ALTER TABLE venue.badge_scans RENAME TO venue_scan_events;
          END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("""
        DO $$ BEGIN
          IF to_regclass('venue.venue_scan_events') IS NOT NULL
             AND to_regclass('venue.badge_scans') IS NULL THEN
            ALTER TABLE venue.venue_scan_events RENAME TO badge_scans;
          END IF;
        END $$;
    """)
