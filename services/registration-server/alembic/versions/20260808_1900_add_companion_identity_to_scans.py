"""Add explicit companion identity to scan and check-in records."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "f1a2b3c4d5e6"
down_revision = "e0f1a2b3c4d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("venue_scan_events", sa.Column("companion_id", postgresql.UUID(as_uuid=True), nullable=True), schema="venue")
    op.create_foreign_key("fk_scan_events_companion", "venue_scan_events", "companions", ["companion_id"], ["id"], source_schema="venue", referent_schema="registration", ondelete="SET NULL")
    op.create_index("ix_scan_events_companion_id", "venue_scan_events", ["companion_id"], schema="venue")
    op.add_column("venue_checkins", sa.Column("companion_id", postgresql.UUID(as_uuid=True), nullable=True), schema="venue")
    op.create_foreign_key("fk_checkins_companion", "venue_checkins", "companions", ["companion_id"], ["id"], source_schema="venue", referent_schema="registration", ondelete="SET NULL")
    op.create_index("ix_checkins_companion_id", "venue_checkins", ["companion_id"], schema="venue")
    # Backfill only unambiguous historical rows; legacy placeholder codes are
    # intentionally left null rather than assigned to the wrong companion.
    op.execute(sa.text("UPDATE venue.venue_scan_events s SET companion_id = c.id FROM registration.companions c WHERE s.companion_id IS NULL AND s.badge_code IS NOT NULL AND s.badge_code = c.badge_code"))
    op.execute(sa.text("UPDATE venue.venue_checkins v SET companion_id = c.id FROM registration.companions c WHERE v.companion_id IS NULL AND v.badge_code IS NOT NULL AND v.badge_code = c.badge_code"))


def downgrade() -> None:
    op.drop_index("ix_checkins_companion_id", table_name="venue_checkins", schema="venue")
    op.drop_constraint("fk_checkins_companion", "venue_checkins", schema="venue", type_="foreignkey")
    op.drop_column("venue_checkins", "companion_id", schema="venue")
    op.drop_index("ix_scan_events_companion_id", table_name="venue_scan_events", schema="venue")
    op.drop_constraint("fk_scan_events_companion", "venue_scan_events", schema="venue", type_="foreignkey")
    op.drop_column("venue_scan_events", "companion_id", schema="venue")
