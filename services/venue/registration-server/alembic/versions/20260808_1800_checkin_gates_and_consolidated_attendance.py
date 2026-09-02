"""rename venue capacity rules to check-in gates and consolidate attendance"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "d9e0f1a2b3c4"
down_revision: Union[str, None] = "c8d9e0f1a2b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _rename_column_if_present(table: str, old: str, new: str) -> None:
    op.execute(sa.text(f"""
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='venue' AND table_name='{table}' AND column_name='{old}')
             AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='venue' AND table_name='{table}' AND column_name='{new}') THEN
            ALTER TABLE venue.{table} RENAME COLUMN {old} TO {new};
          END IF;
        END $$;
    """))


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS venue")
    op.execute("""
        DO $$ BEGIN
          IF to_regclass('venue.venue_capacity_rules') IS NOT NULL
             AND to_regclass('venue.venue_checkin_gates') IS NULL THEN
            ALTER TABLE venue.venue_capacity_rules RENAME TO venue_checkin_gates;
          END IF;
        END $$;
    """)
    _rename_column_if_present("venue_checkin_gates", "station_name", "gate_name")
    _rename_column_if_present("venue_checkin_gates", "station_type", "gate_type")
    _rename_column_if_present("venue_checkin_gates", "station_capacity", "gate_capacity")

    # Make VenueCheckIn the authoritative successful attendance/session row.
    op.execute("ALTER TABLE venue.venue_checkins ADD COLUMN IF NOT EXISTS checkin_gate_id UUID")
    op.execute("""
        UPDATE venue.venue_checkins
        SET checkin_gate_id = COALESCE(checkin_gate_id, station_id, capacity_rule_id)
        WHERE checkin_gate_id IS NULL
    """)
    _rename_column_if_present("venue_checkins", "station_name", "gate_name")
    _rename_column_if_present("venue_checkins", "station_type", "gate_type")
    _rename_column_if_present("venue_checkins", "station_capacity", "gate_capacity")
    op.execute("ALTER TABLE venue.venue_checkins ADD COLUMN IF NOT EXISTS checkout_time TIMESTAMPTZ")
    op.execute("ALTER TABLE venue.venue_checkins ADD COLUMN IF NOT EXISTS duration INTEGER")
    op.execute("ALTER TABLE venue.venue_checkins ADD COLUMN IF NOT EXISTS session_id UUID")
    op.execute("ALTER TABLE venue.venue_checkins ADD COLUMN IF NOT EXISTS method VARCHAR(50) NOT NULL DEFAULT 'qr'")
    op.execute("ALTER TABLE venue.venue_checkins ADD COLUMN IF NOT EXISTS device_id VARCHAR(100) NOT NULL DEFAULT 'unknown'")
    op.execute("ALTER TABLE venue.venue_checkins ADD COLUMN IF NOT EXISTS operation_id VARCHAR(120)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_checkins_checkin_gate_id ON venue.venue_checkins(checkin_gate_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_checkins_session_id ON venue.venue_checkins(session_id)")

    # Preserve the old columns only long enough to migrate existing records;
    # application compatibility is provided by SQLAlchemy aliases.
    op.execute("ALTER TABLE venue.venue_checkins DROP COLUMN IF EXISTS station_id")
    op.execute("ALTER TABLE venue.venue_checkins DROP COLUMN IF EXISTS capacity_rule_id")

    _rename_column_if_present("node_assignments", "capacity_rule_id", "checkin_gate_id")
    _rename_column_if_present("badge_scans", "station_id", "checkin_gate_id")

    # AttendanceLog is no longer queried by the application. Keep the legacy
    # table under an explicit name for rollback/audit instead of deleting data.
    op.execute("""
        DO $$ BEGIN
          IF to_regclass('venue.attendance_logs') IS NOT NULL
             AND to_regclass('venue.attendance_logs_legacy') IS NULL THEN
            ALTER TABLE venue.attendance_logs RENAME TO attendance_logs_legacy;
          END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE venue.venue_checkins ADD COLUMN IF NOT EXISTS station_id UUID")
    op.execute("ALTER TABLE venue.venue_checkins ADD COLUMN IF NOT EXISTS capacity_rule_id UUID")
    op.execute("UPDATE venue.venue_checkins SET station_id=checkin_gate_id, capacity_rule_id=checkin_gate_id")
    op.execute("ALTER TABLE venue.venue_checkins DROP COLUMN IF EXISTS checkin_gate_id")
    op.execute("ALTER TABLE venue.venue_checkins DROP COLUMN IF EXISTS checkout_time")
    op.execute("ALTER TABLE venue.venue_checkins DROP COLUMN IF EXISTS duration")
    op.execute("ALTER TABLE venue.venue_checkins DROP COLUMN IF EXISTS operation_id")
    op.execute("""
        DO $$ BEGIN
          IF to_regclass('venue.venue_checkin_gates') IS NOT NULL
             AND to_regclass('venue.venue_capacity_rules') IS NULL THEN
            ALTER TABLE venue.venue_checkin_gates RENAME TO venue_capacity_rules;
          END IF;
        END $$;
    """)
