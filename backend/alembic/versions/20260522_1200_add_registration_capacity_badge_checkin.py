"""add_registration_capacity_badge_checkin

Revision ID: b8d4e3f2a1b9
Revises: a9f3c2e1b4d7
Create Date: 2026-05-22 12:00:00.000000+00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b8d4e3f2a1b9"
down_revision: Union[str, None] = "a9f3c2e1b4d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. participant_registrations
    op.create_table(
        "participant_registrations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("participant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("participants.id", ondelete="SET NULL"), nullable=True),
        sa.Column("registration_status", sa.String(50), nullable=False, server_default="submitted"),
        sa.Column("registration_data", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reviewed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_notes", sa.Text(), nullable=True),
        sa.Column("waitlist_position", sa.Integer(), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("approval_source", sa.String(50), nullable=False, server_default="portal"),
    )
    op.create_index("ix_participant_registrations_event_id", "participant_registrations", ["event_id"])
    op.create_index("ix_participant_registrations_participant_id", "participant_registrations", ["participant_id"])

    # 2. capacity_rules
    op.create_table(
        "capacity_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=True),
        sa.Column("room_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rooms.id", ondelete="CASCADE"), nullable=True),
        sa.Column("capacity", sa.Integer(), nullable=False),
        sa.Column("waitlist_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("auto_promote", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("priority_enabled", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.create_index("ix_capacity_rules_event_id", "capacity_rules", ["event_id"])
    op.create_index("ix_capacity_rules_session_id", "capacity_rules", ["session_id"])
    op.create_index("ix_capacity_rules_room_id", "capacity_rules", ["room_id"])

    # 3. printers
    op.create_table(
        "printers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("ip_address", sa.String(50), nullable=False),
        sa.Column("location", sa.String(150), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="offline"),
    )

    # 4. badges
    op.create_table(
        "badges",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("participant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("participants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("badge_code", sa.String(50), nullable=False, unique=True),
        sa.Column("qr_token", sa.String(255), nullable=False, unique=True),
        sa.Column("barcode", sa.String(100), nullable=False),
        sa.Column("nfc_uid", sa.String(50), nullable=True),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("print_templates.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="created"),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_badges_participant_id", "badges", ["participant_id"])
    op.create_index("ix_badges_badge_code", "badges", ["badge_code"])
    op.create_index("ix_badges_nfc_uid", "badges", ["nfc_uid"])

    # 5. badge_history
    op.create_table(
        "badge_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("badge_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("badges.id", ondelete="CASCADE"), nullable=False),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("performed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("metadata", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_badge_history_badge_id", "badge_history", ["badge_id"])

    # 6. badge_print_jobs
    op.create_table(
        "badge_print_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("badge_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("badges.id", ondelete="CASCADE"), nullable=False),
        sa.Column("printer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("printers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="queued"),
        sa.Column("queued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("printed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_badge_print_jobs_badge_id", "badge_print_jobs", ["badge_id"])
    op.create_index("ix_badge_print_jobs_printer_id", "badge_print_jobs", ["printer_id"])

    # 7. badge_scans
    op.create_table(
        "badge_scans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("badge_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("badges.id", ondelete="CASCADE"), nullable=False),
        sa.Column("location", sa.String(150), nullable=False),
        sa.Column("scan_type", sa.String(50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_badge_scans_badge_id", "badge_scans", ["badge_id"])

    # 8. attendance_logs
    op.create_table(
        "attendance_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("participant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("participants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=True),
        sa.Column("checkin_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("checkout_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration", sa.Integer(), nullable=True),
        sa.Column("method", sa.String(50), nullable=False, server_default="qr"),
        sa.Column("device_id", sa.String(100), nullable=False, server_default="unknown"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_attendance_logs_participant_id", "attendance_logs", ["participant_id"])
    op.create_index("ix_attendance_logs_session_id", "attendance_logs", ["session_id"])


def downgrade() -> None:
    op.drop_table("attendance_logs")
    op.drop_table("badge_scans")
    op.drop_table("badge_print_jobs")
    op.drop_table("badge_history")
    op.drop_table("badges")
    op.drop_table("printers")
    op.drop_table("capacity_rules")
    op.drop_table("participant_registrations")
