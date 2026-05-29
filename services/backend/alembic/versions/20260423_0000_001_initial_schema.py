"""initial schema — all tables

Revision ID: 001_initial_schema
Revises:
Create Date: 2026-04-23 00:00:00.000000

Creates the complete database schema for the Conference
Presentation Management Platform including:
  - All 24 tables
  - All foreign key constraints with correct ON DELETE rules
  - All performance indexes from the schema specification
  - PostgreSQL extensions (uuid-ossp, pgcrypto, citext)
  - check constraints on enum-like columns
"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ── Helpers ───────────────────────────────────────────────

def _uuid_pk():
    """Standard UUID primary key column."""
    return sa.Column(
        "id",
        postgresql.UUID(as_uuid=True),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()"),
        nullable=False,
    )


def _timestamps():
    """Standard created_at / updated_at pair."""
    return [
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    ]


# ── Upgrade ───────────────────────────────────────────────

def upgrade() -> None:

    # ── PostgreSQL extensions ──────────────────────────────
    # gen_random_uuid() comes from pgcrypto (PG < 13) or
    # is built-in from PG 13+. We install both for safety.
    op.execute("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"")
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")

    # ══════════════════════════════════════════════════════
    # TABLE 1 — organizations
    # ══════════════════════════════════════════════════════
    op.create_table(
        "organizations",
        _uuid_pk(),
        sa.Column("name",     sa.String(255), nullable=False),
        sa.Column("slug",     sa.String(100), nullable=False),
        sa.Column("logo_url", sa.Text,        nullable=True),
        sa.Column("plan",     sa.String(50),  nullable=False,
                  server_default="starter"),
        *_timestamps(),
    )
    op.create_index("uq_organizations_slug", "organizations", ["slug"], unique=True)
    op.create_check_constraint(
        "ck_organizations_plan",
        "organizations",
        "plan IN ('starter','pro','enterprise')",
    )

    # ══════════════════════════════════════════════════════
    # TABLE 2 — users
    # ══════════════════════════════════════════════════════
    op.create_table(
        "users",
        _uuid_pk(),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("email",         sa.String(320), nullable=False),
        sa.Column("password_hash", sa.Text,        nullable=True),
        sa.Column("first_name",    sa.String(100), nullable=False),
        sa.Column("last_name",     sa.String(100), nullable=False),
        sa.Column("phone",         sa.String(30),  nullable=True),
        sa.Column("role",          sa.String(50),  nullable=False),
        sa.Column("avatar_url",    sa.Text,        nullable=True),
        sa.Column("is_active",     sa.Boolean,     nullable=False,
                  server_default="true"),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )
    op.create_index("uq_users_email",     "users", ["email"],           unique=True)
    op.create_index("ix_users_org",       "users", ["organization_id"], unique=False)
    op.create_index("ix_users_created",   "users", ["created_at"],      unique=False)
    op.create_check_constraint(
        "ck_users_role",
        "users",
        "role IN ('super_admin','event_organizer','session_manager',"
        "'technical_manager','speaker')",
    )

    # ══════════════════════════════════════════════════════
    # TABLE 3 — events
    # ══════════════════════════════════════════════════════
    op.create_table(
        "events",
        _uuid_pk(),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name",            sa.String(255), nullable=False),
        sa.Column("short_code",      sa.String(20),  nullable=False),
        sa.Column("location",        sa.String(255), nullable=True),
        sa.Column("venue_name",      sa.String(255), nullable=True),
        sa.Column("start_date",      sa.Date,        nullable=False),
        sa.Column("end_date",        sa.Date,        nullable=False),
        sa.Column("timezone",        sa.String(60),  nullable=False,
                  server_default="UTC"),
        sa.Column("upload_deadline", sa.DateTime(timezone=True), nullable=True),
        sa.Column("max_file_size_mb",sa.Integer,     nullable=False,
                  server_default="500"),
        sa.Column(
            "allowed_formats",
            postgresql.ARRAY(sa.String),
            nullable=False,
            server_default="{pptx,pdf,mp4}",
        ),
        sa.Column("status",     sa.String(30), nullable=False,
                  server_default="draft"),
        sa.Column("banner_url", sa.Text, nullable=True),
        *_timestamps(),
    )
    op.create_index("uq_events_short_code", "events", ["short_code"], unique=True)
    op.create_index("ix_events_org",        "events", ["organization_id"])
    op.create_index("ix_events_status",     "events", ["status"])
    op.create_index("ix_events_created",    "events", ["created_at"])
    op.create_check_constraint(
        "ck_events_status",
        "events",
        "status IN ('draft','active','completed','archived')",
    )
    op.create_check_constraint(
        "ck_events_dates",
        "events",
        "end_date >= start_date",
    )

    # ══════════════════════════════════════════════════════
    # TABLE 4 — rooms
    # ══════════════════════════════════════════════════════
    op.create_table(
        "rooms",
        _uuid_pk(),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name",            sa.String(100), nullable=False),
        sa.Column("capacity",        sa.Integer,     nullable=True),
        sa.Column("screen_count",    sa.Integer,     nullable=False,
                  server_default="1"),
        sa.Column("room_type",       sa.String(50),  nullable=False,
                  server_default="presentation"),
        sa.Column("av_technician",   sa.String(150), nullable=True),
        sa.Column("location_notes",  sa.Text,        nullable=True),
        sa.Column("is_active",       sa.Boolean,     nullable=False,
                  server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )
    op.create_index("ix_rooms_event", "rooms", ["event_id"])
    op.create_check_constraint(
        "ck_rooms_type",
        "rooms",
        "room_type IN ('presentation','workshop','poster','plenary')",
    )

    # ══════════════════════════════════════════════════════
    # TABLE 5 — sessions
    # ══════════════════════════════════════════════════════
    op.create_table(
        "sessions",
        _uuid_pk(),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "room_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("rooms.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "moderator_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("session_code",    sa.String(50),  nullable=False),
        sa.Column("name",            sa.String(255), nullable=False),
        sa.Column("session_type",    sa.String(50),  nullable=False,
                  server_default="regular"),
        sa.Column("start_time",      sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_time",        sa.DateTime(timezone=True), nullable=False),
        sa.Column("moderator_name",  sa.String(150), nullable=True),
        sa.Column("description",     sa.Text,        nullable=True),
        sa.Column("status",          sa.String(30),  nullable=False,
                  server_default="scheduled"),
        *_timestamps(),
    )
    op.create_index("ix_sessions_event",          "sessions", ["event_id"])
    op.create_index("ix_sessions_room",           "sessions", ["room_id"])
    op.create_index("ix_sessions_status",         "sessions", ["status"])
    op.create_index("ix_sessions_code",           "sessions", ["session_code"])
    op.create_index("ix_sessions_start",          "sessions", ["start_time"])
    # Composite index from schema spec — room schedule queries
    op.create_index(
        "idx_sessions_event_room_time",
        "sessions",
        ["event_id", "room_id", "start_time"],
    )
    op.create_check_constraint(
        "ck_sessions_type",
        "sessions",
        "session_type IN ('regular','keynote','workshop','panel','poster')",
    )
    op.create_check_constraint(
        "ck_sessions_status",
        "sessions",
        "status IN ('scheduled','in_progress','completed','cancelled')",
    )
    op.create_check_constraint(
        "ck_sessions_times",
        "sessions",
        "end_time > start_time",
    )

    # ══════════════════════════════════════════════════════
    # TABLE 6 — speakers
    # ══════════════════════════════════════════════════════
    op.create_table(
        "speakers",
        _uuid_pk(),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("first_name",       sa.String(100), nullable=False),
        sa.Column("last_name",        sa.String(100), nullable=False),
        sa.Column("email",            sa.String(320), nullable=False),
        sa.Column("phone",            sa.String(30),  nullable=True),
        sa.Column("affiliation",      sa.String(255), nullable=True),
        sa.Column("country",          sa.String(100), nullable=True),
        sa.Column("bio",              sa.Text,        nullable=True),
        sa.Column("photo_url",        sa.Text,        nullable=True),
        sa.Column("upload_token",     sa.String(128), nullable=False),
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("upload_status",    sa.String(30),  nullable=False,
                  server_default="pending"),
        sa.Column("qr_code_url",      sa.Text,        nullable=True),
        sa.Column("checked_in_at",    sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
    )
    # Schema spec indexes
    op.create_index(
        "idx_speakers_upload_token",
        "speakers",
        ["upload_token"],
        unique=True,
    )
    op.create_index(
        "idx_speakers_event_status",
        "speakers",
        ["event_id", "upload_status"],
    )
    op.create_index("ix_speakers_email",   "speakers", ["email"])
    op.create_index("ix_speakers_created", "speakers", ["created_at"])
    op.create_check_constraint(
        "ck_speakers_upload_status",
        "speakers",
        "upload_status IN ('pending','uploaded','replaced','approved','rejected')",
    )

    # ══════════════════════════════════════════════════════
    # TABLE 7 — session_speakers
    # ══════════════════════════════════════════════════════
    op.create_table(
        "session_speakers",
        _uuid_pk(),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "speaker_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("speakers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("presentation_title",   sa.String(500), nullable=True),
        sa.Column("talk_order",           sa.Integer,     nullable=False,
                  server_default="0"),
        sa.Column("talk_duration_minutes",sa.Integer,     nullable=True),
        sa.Column("is_confirmed",         sa.Boolean,     nullable=False,
                  server_default="false"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )
    # Schema spec indexes
    op.create_index("idx_ss_session", "session_speakers", ["session_id"])
    op.create_index("idx_ss_speaker", "session_speakers", ["speaker_id"])
    # Prevent same speaker being added to same session twice
    op.create_index(
        "uq_session_speakers_pair",
        "session_speakers",
        ["session_id", "speaker_id"],
        unique=True,
    )

    # ══════════════════════════════════════════════════════
    # TABLE 8 — presentation_files
    # ══════════════════════════════════════════════════════
    op.create_table(
        "presentation_files",
        _uuid_pk(),
        sa.Column(
            "speaker_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("speakers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "session_speaker_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("session_speakers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("original_filename", sa.String(500), nullable=False),
        sa.Column("stored_filename",   sa.String(500), nullable=False),
        sa.Column("storage_path",      sa.Text,        nullable=False),
        sa.Column("file_size_bytes",   sa.BigInteger,  nullable=False),
        sa.Column("mime_type",         sa.String(100), nullable=False),
        sa.Column("file_format",       sa.String(20),  nullable=False),
        sa.Column("version_number",    sa.Integer,     nullable=False,
                  server_default="1"),
        sa.Column("is_current_version",sa.Boolean,     nullable=False,
                  server_default="true"),
        sa.Column("upload_source",     sa.String(30),  nullable=False,
                  server_default="web"),
        sa.Column("upload_status",     sa.String(30),  nullable=False,
                  server_default="processing"),
        sa.Column(
            "approved_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("approved_at",       sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason",  sa.Text,        nullable=True),
        sa.Column("is_locked",         sa.Boolean,     nullable=False,
                  server_default="false"),
        sa.Column("local_cache_path",  sa.Text,        nullable=True),
        sa.Column("local_sync_status", sa.String(30),  nullable=False,
                  server_default="pending"),
        sa.Column("local_synced_at",   sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "uploaded_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )
    # Schema spec indexes
    op.create_index(
        "idx_files_speaker_current",
        "presentation_files",
        ["speaker_id", "is_current_version"],
    )
    op.create_index(
        "idx_files_event_status",
        "presentation_files",
        ["event_id", "upload_status"],
    )
    op.create_index(
        "idx_files_local_sync",
        "presentation_files",
        ["local_sync_status"],
    )
    op.create_index("ix_pf_session_speaker", "presentation_files", ["session_speaker_id"])
    op.create_index("ix_pf_format",          "presentation_files", ["file_format"])
    op.create_index("ix_pf_uploaded",        "presentation_files", ["uploaded_at"])
    op.create_check_constraint(
        "ck_pf_upload_status",
        "presentation_files",
        "upload_status IN ('processing','valid','invalid','approved','rejected','locked')",
    )
    op.create_check_constraint(
        "ck_pf_file_format",
        "presentation_files",
        "file_format IN ('pptx','pdf','mp4','key','ppt')",
    )
    op.create_check_constraint(
        "ck_pf_upload_source",
        "presentation_files",
        "upload_source IN ('web','kiosk','station','api')",
    )
    op.create_check_constraint(
        "ck_pf_local_sync",
        "presentation_files",
        "local_sync_status IN ('pending','synced','failed')",
    )
    op.create_check_constraint(
        "ck_pf_version",
        "presentation_files",
        "version_number >= 1",
    )

    # ══════════════════════════════════════════════════════
    # TABLE 9 — file_validations
    # ══════════════════════════════════════════════════════
    op.create_table(
        "file_validations",
        _uuid_pk(),
        sa.Column(
            "file_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("presentation_files.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("validation_engine_version", sa.String(20),  nullable=False),
        sa.Column("slide_count",               sa.Integer,     nullable=True),
        sa.Column("has_missing_fonts",         sa.Boolean,     nullable=False,
                  server_default="false"),
        sa.Column("missing_fonts_list",
                  postgresql.ARRAY(sa.String),  nullable=True),
        sa.Column("has_unsupported_video",     sa.Boolean,     nullable=False,
                  server_default="false"),
        sa.Column("has_corrupted_slides",      sa.Boolean,     nullable=False,
                  server_default="false"),
        sa.Column("has_large_images",          sa.Boolean,     nullable=False,
                  server_default="false"),
        sa.Column("overall_result",            sa.String(20),  nullable=False),
        sa.Column("error_details",             postgresql.JSONB, nullable=True),
        sa.Column("thumbnail_url",             sa.Text,        nullable=True),
        sa.Column(
            "validated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )
    # One-to-one with presentation_files
    op.create_index("uq_fv_file", "file_validations", ["file_id"], unique=True)
    op.create_index("ix_fv_result", "file_validations", ["overall_result"])
    op.create_check_constraint(
        "ck_fv_result",
        "file_validations",
        "overall_result IN ('pass','warning','fail')",
    )

    # ══════════════════════════════════════════════════════
    # TABLE 10 — email_templates
    # ══════════════════════════════════════════════════════
    op.create_table(
        "email_templates",
        _uuid_pk(),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("events.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name",          sa.String(150), nullable=False),
        sa.Column("template_type", sa.String(50),  nullable=False),
        sa.Column("subject",       sa.String(500), nullable=False),
        sa.Column("body_html",     sa.Text,        nullable=False),
        sa.Column("body_text",     sa.Text,        nullable=True),
        sa.Column("is_default",    sa.Boolean,     nullable=False,
                  server_default="false"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )
    op.create_index("ix_et_event",   "email_templates", ["event_id"])
    op.create_index("ix_et_type",    "email_templates", ["template_type"])
    op.create_check_constraint(
        "ck_et_type",
        "email_templates",
        "template_type IN ('upload_invite','reminder','deadline',"
        "'approval','rejection','confirmation','welcome','promotional')",
    )

    # ══════════════════════════════════════════════════════
    # TABLE 11 — email_campaigns
    # ══════════════════════════════════════════════════════
    op.create_table(
        "email_campaigns",
        _uuid_pk(),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "template_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("email_templates.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "session_id_filter",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sessions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name",               sa.String(150), nullable=False),
        sa.Column("recipient_filter",   sa.String(50),  nullable=False),
        sa.Column("scheduled_at",       sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at",            sa.DateTime(timezone=True), nullable=True),
        sa.Column("status",             sa.String(30),  nullable=False,
                  server_default="draft"),
        sa.Column("total_recipients",   sa.Integer,     nullable=False,
                  server_default="0"),
        sa.Column("sent_count",         sa.Integer,     nullable=False,
                  server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )
    op.create_index("ix_ec_event",  "email_campaigns", ["event_id"])
    op.create_index("ix_ec_status", "email_campaigns", ["status"])
    op.create_check_constraint(
        "ck_ec_status",
        "email_campaigns",
        "status IN ('draft','scheduled','sending','sent','failed')",
    )
    op.create_check_constraint(
        "ck_ec_filter",
        "email_campaigns",
        "recipient_filter IN ('all','pending_upload','specific_session','custom')",
    )

    # ══════════════════════════════════════════════════════
    # TABLE 12 — email_logs
    # ══════════════════════════════════════════════════════
    op.create_table(
        "email_logs",
        _uuid_pk(),
        sa.Column(
            "campaign_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("email_campaigns.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "speaker_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("speakers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("to_email",            sa.String(320), nullable=False),
        sa.Column("subject",             sa.String(500), nullable=False),
        sa.Column("status",              sa.String(30),  nullable=False,
                  server_default="queued"),
        sa.Column("provider_message_id", sa.String(255), nullable=True),
        sa.Column("error_message",       sa.Text,        nullable=True),
        sa.Column("opened_at",           sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "sent_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )
    # Schema spec index
    op.create_index("idx_emaillogs_speaker", "email_logs", ["speaker_id"])
    op.create_index("ix_el_campaign",        "email_logs", ["campaign_id"])
    op.create_index("ix_el_status",          "email_logs", ["status"])
    op.create_index("ix_el_sent",            "email_logs", ["sent_at"])
    op.create_check_constraint(
        "ck_el_status",
        "email_logs",
        "status IN ('queued','sent','delivered','bounced','failed')",
    )

    # ══════════════════════════════════════════════════════
    # TABLE 13 — import_jobs
    # ══════════════════════════════════════════════════════
    op.create_table(
        "import_jobs",
        _uuid_pk(),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "uploaded_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("filename",         sa.String(500), nullable=False),
        sa.Column("storage_path",     sa.Text,        nullable=False),
        sa.Column("status",           sa.String(30),  nullable=False,
                  server_default="uploaded"),
        sa.Column("rows_total",       sa.Integer,     nullable=False,
                  server_default="0"),
        sa.Column("rows_imported",    sa.Integer,     nullable=False,
                  server_default="0"),
        sa.Column("rows_failed",      sa.Integer,     nullable=False,
                  server_default="0"),
        sa.Column("sessions_created", sa.Integer,     nullable=False,
                  server_default="0"),
        sa.Column("speakers_created", sa.Integer,     nullable=False,
                  server_default="0"),
        sa.Column("rooms_created",    sa.Integer,     nullable=False,
                  server_default="0"),
        sa.Column("error_summary",    postgresql.JSONB, nullable=True),
        sa.Column("completed_at",     sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )
    op.create_index("ix_ij_event",   "import_jobs", ["event_id"])
    op.create_index("ix_ij_status",  "import_jobs", ["status"])
    op.create_index("ix_ij_created", "import_jobs", ["created_at"])
    op.create_check_constraint(
        "ck_ij_status",
        "import_jobs",
        "status IN ('uploaded','validating','validated','importing','completed','failed')",
    )

    # ══════════════════════════════════════════════════════
    # TABLE 14 — srr_stations
    # ══════════════════════════════════════════════════════
    op.create_table(
        "srr_stations",
        _uuid_pk(),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "assigned_speaker_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("speakers.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("station_number",    sa.Integer,   nullable=False),
        sa.Column("device_name",       sa.String(100), nullable=True),
        sa.Column("ip_address",        postgresql.INET, nullable=True),
        sa.Column("status",            sa.String(30),  nullable=False,
                  server_default="idle"),
        sa.Column("session_assigned_at",sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes",             sa.Text,        nullable=True),
        sa.Column("is_active",         sa.Boolean,     nullable=False,
                  server_default="true"),
        *_timestamps(),
    )
    # Schema spec index
    op.create_index(
        "idx_stations_event_status",
        "srr_stations",
        ["event_id", "status"],
    )
    op.create_index("ix_ss_speaker",  "srr_stations", ["assigned_speaker_id"])
    # Prevent duplicate station numbers within same event
    op.create_index(
        "uq_station_number_per_event",
        "srr_stations",
        ["event_id", "station_number"],
        unique=True,
    )
    op.create_check_constraint(
        "ck_ss_status",
        "srr_stations",
        "status IN ('idle','occupied','uploading','previewing','completed','error','locked')",
    )

    # ══════════════════════════════════════════════════════
    # TABLE 15 — srr_checkins
    # ══════════════════════════════════════════════════════
    op.create_table(
        "srr_checkins",
        _uuid_pk(),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "speaker_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("speakers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "station_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("srr_stations.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "checked_in_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("checkin_method",  sa.String(30),  nullable=False),
        sa.Column(
            "checked_in_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column("checked_out_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes",          sa.Text,        nullable=True),
    )
    op.create_index("ix_sci_event",   "srr_checkins", ["event_id"])
    op.create_index("ix_sci_speaker", "srr_checkins", ["speaker_id"])
    op.create_index("ix_sci_time",    "srr_checkins", ["checked_in_at"])
    op.create_check_constraint(
        "ck_sci_method",
        "srr_checkins",
        "checkin_method IN ('qr_scan','manual','token')",
    )

    # ══════════════════════════════════════════════════════
    # TABLE 16 — srr_activity_logs
    # ══════════════════════════════════════════════════════
    op.create_table(
        "srr_activity_logs",
        _uuid_pk(),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "station_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("srr_stations.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "speaker_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("speakers.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "performed_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "file_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("presentation_files.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("action",      sa.String(50),    nullable=False),
        sa.Column("details",     postgresql.JSONB, nullable=True),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )
    op.create_index("ix_sal_event",   "srr_activity_logs", ["event_id"])
    op.create_index("ix_sal_station", "srr_activity_logs", ["station_id"])
    op.create_index("ix_sal_speaker", "srr_activity_logs", ["speaker_id"])
    op.create_index("ix_sal_action",  "srr_activity_logs", ["action"])
    op.create_index("ix_sal_time",    "srr_activity_logs", ["occurred_at"])
    op.create_check_constraint(
        "ck_sal_action",
        "srr_activity_logs",
        "action IN ('checkin','checkout','upload','preview','approve','reset','lock','unlock')",
    )

    # ══════════════════════════════════════════════════════
    # TABLE 17 — room_devices
    # ══════════════════════════════════════════════════════
    op.create_table(
        "room_devices",
        _uuid_pk(),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "room_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("rooms.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("device_type",       sa.String(50),  nullable=False),
        sa.Column("device_name",       sa.String(100), nullable=False),
        sa.Column("hostname",          sa.String(100), nullable=True),
        sa.Column("ip_address",        postgresql.INET, nullable=True),
        sa.Column("mac_address",       postgresql.MACADDR, nullable=True),
        sa.Column("os_version",        sa.String(100), nullable=True),
        sa.Column("app_version",       sa.String(30),  nullable=True),
        sa.Column("status",            sa.String(30),  nullable=False,
                  server_default="offline"),
        sa.Column("last_heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "registered_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )
    op.create_index("ix_rd_event",  "room_devices", ["event_id"])
    op.create_index("ix_rd_room",   "room_devices", ["room_id"])
    op.create_index("ix_rd_type",   "room_devices", ["device_type"])
    op.create_index("ix_rd_status", "room_devices", ["status"])
    op.create_check_constraint(
        "ck_rd_type",
        "room_devices",
        "device_type IN ('presentation_pc','technician_tablet',"
        "'moderator_tablet','kiosk','signage')",
    )
    op.create_check_constraint(
        "ck_rd_status",
        "room_devices",
        "status IN ('online','offline','error','maintenance')",
    )

    # ══════════════════════════════════════════════════════
    # TABLE 18 — presentation_queue
    # ══════════════════════════════════════════════════════
    op.create_table(
        "presentation_queue",
        _uuid_pk(),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "session_speaker_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("session_speakers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "file_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("presentation_files.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "device_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("room_devices.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("queue_order", sa.Integer,   nullable=False),
        sa.Column("status",      sa.String(30), nullable=False,
                  server_default="queued"),
        sa.Column("loaded_at",   sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at",  sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at",    sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes",       sa.Text,       nullable=True),
        *_timestamps(),
    )
    # Schema spec index
    op.create_index(
        "idx_queue_session_order",
        "presentation_queue",
        ["session_id", "queue_order"],
    )
    op.create_index("ix_pq_status",   "presentation_queue", ["status"])
    op.create_index("ix_pq_ss",       "presentation_queue", ["session_speaker_id"])
    op.create_index("ix_pq_file",     "presentation_queue", ["file_id"])
    op.create_check_constraint(
        "ck_pq_status",
        "presentation_queue",
        "status IN ('queued','active','completed','skipped')",
    )

    # ══════════════════════════════════════════════════════
    # TABLE 19 — playback_events
    # ══════════════════════════════════════════════════════
    op.create_table(
        "playback_events",
        _uuid_pk(),
        sa.Column(
            "queue_entry_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("presentation_queue.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "device_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("room_devices.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_type",   sa.String(50),    nullable=False),
        sa.Column("slide_number", sa.Integer,       nullable=True),
        sa.Column("details",      postgresql.JSONB, nullable=True),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )
    op.create_index("ix_pe_queue",  "playback_events", ["queue_entry_id"])
    op.create_index("ix_pe_device", "playback_events", ["device_id"])
    op.create_index("ix_pe_type",   "playback_events", ["event_type"])
    op.create_index("ix_pe_time",   "playback_events", ["occurred_at"])
    op.create_check_constraint(
        "ck_pe_event_type",
        "playback_events",
        "event_type IN ('presentation_start','presentation_end','slide_advance',"
        "'slide_back','video_play','video_pause','error')",
    )

    # ══════════════════════════════════════════════════════
    # TABLE 20 — venue_sync_jobs
    # ══════════════════════════════════════════════════════
    op.create_table(
        "venue_sync_jobs",
        _uuid_pk(),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "file_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("presentation_files.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sync_type",     sa.String(30),  nullable=False,
                  server_default="download"),
        sa.Column("priority",      sa.Integer,     nullable=False,
                  server_default="5"),
        sa.Column("status",        sa.String(30),  nullable=False,
                  server_default="pending"),
        sa.Column("retry_count",   sa.Integer,     nullable=False,
                  server_default="0"),
        sa.Column("error_message", sa.Text,        nullable=True),
        sa.Column("started_at",    sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at",  sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )
    op.create_index("ix_vsj_event",    "venue_sync_jobs", ["event_id"])
    op.create_index("ix_vsj_file",     "venue_sync_jobs", ["file_id"])
    op.create_index("ix_vsj_status",   "venue_sync_jobs", ["status"])
    op.create_index("ix_vsj_created",  "venue_sync_jobs", ["created_at"])
    # Composite for priority queue query: WHERE status='pending' ORDER BY priority
    op.create_index(
        "idx_vsj_pending_priority",
        "venue_sync_jobs",
        ["status", "priority", "created_at"],
    )
    op.create_check_constraint(
        "ck_vsj_sync_type",
        "venue_sync_jobs",
        "sync_type IN ('download','upload','delete')",
    )
    op.create_check_constraint(
        "ck_vsj_status",
        "venue_sync_jobs",
        "status IN ('pending','in_progress','completed','failed','skipped')",
    )

    # ══════════════════════════════════════════════════════
    # TABLE 21 — audit_logs
    # ══════════════════════════════════════════════════════
    op.create_table(
        "audit_logs",
        _uuid_pk(),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("events.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("entity_type", sa.String(50),     nullable=False),
        sa.Column("entity_id",   postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("action",      sa.String(80),     nullable=False),
        sa.Column("old_values",  postgresql.JSONB,  nullable=True),
        sa.Column("new_values",  postgresql.JSONB,  nullable=True),
        sa.Column("ip_address",  postgresql.INET,   nullable=True),
        sa.Column("user_agent",  sa.Text,           nullable=True),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )
    # Schema spec index
    op.create_index(
        "idx_audit_entity",
        "audit_logs",
        ["entity_type", "entity_id"],
    )
    op.create_index("ix_al_org",     "audit_logs", ["organization_id"])
    op.create_index("ix_al_event",   "audit_logs", ["event_id"])
    op.create_index("ix_al_user",    "audit_logs", ["user_id"])
    op.create_index("ix_al_action",  "audit_logs", ["action"])
    op.create_index("ix_al_time",    "audit_logs", ["occurred_at"])

    # ══════════════════════════════════════════════════════
    # TABLE 22 — posters
    # ══════════════════════════════════════════════════════
    op.create_table(
        "posters",
        _uuid_pk(),
        sa.Column(
            "event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "speaker_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("speakers.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "reviewed_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title",             sa.String(500), nullable=False),
        sa.Column("authors",           sa.Text,        nullable=True),
        sa.Column("category",          sa.String(150), nullable=True),
        sa.Column("abstract",          sa.Text,        nullable=True),
        sa.Column("storage_path",      sa.Text,        nullable=True),
        sa.Column("original_filename", sa.String(500), nullable=True),
        sa.Column("file_size_bytes",   sa.Integer,     nullable=True),
        sa.Column("thumbnail_url",     sa.Text,        nullable=True),
        sa.Column("status",            sa.String(30),  nullable=False,
                  server_default="pending"),
        sa.Column("rejection_reason",  sa.Text,        nullable=True),
        sa.Column("reviewed_at",       sa.DateTime(timezone=True), nullable=True),
        sa.Column("display_screen",    sa.String(50),  nullable=True),
        sa.Column("display_order",     sa.Integer,     nullable=False,
                  server_default="0"),
        sa.Column("is_featured",       sa.Boolean,     nullable=False,
                  server_default="false"),
        sa.Column("version_number",    sa.Integer,     nullable=False,
                  server_default="1"),
        sa.Column(
            "submitted_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        *_timestamps(),
    )
    op.create_index("ix_po_event",  "posters", ["event_id"])
    op.create_index("ix_po_status", "posters", ["status"])
    op.create_index("ix_po_screen", "posters", ["display_screen"])
    op.create_check_constraint(
        "ck_po_status",
        "posters",
        "status IN ('pending','submitted','under_review','approved','rejected','withdrawn')",
    )

    # ══════════════════════════════════════════════════════
    # TABLE 23 — refresh_tokens
    # ══════════════════════════════════════════════════════
    op.create_table(
        "refresh_tokens",
        _uuid_pk(),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash",     sa.String(64),  nullable=False),
        sa.Column("family_id",      postgresql.UUID(as_uuid=True),
                  nullable=False),
        sa.Column("device_info",    sa.String(255), nullable=True),
        sa.Column("ip_address",     postgresql.INET, nullable=True),
        sa.Column("user_agent",     sa.Text,         nullable=True),
        sa.Column("is_revoked",     sa.Boolean,      nullable=False,
                  server_default="false"),
        sa.Column("revoked_at",     sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_reason", sa.String(100),  nullable=True),
        sa.Column("expires_at",     sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column("last_used_at",   sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("uq_rt_token_hash", "refresh_tokens", ["token_hash"], unique=True)
    op.create_index("ix_rt_user",       "refresh_tokens", ["user_id"])
    op.create_index("ix_rt_family",     "refresh_tokens", ["family_id"])
    op.create_index("ix_rt_revoked",    "refresh_tokens", ["is_revoked"])
    op.create_index("ix_rt_expires",    "refresh_tokens", ["expires_at"])
    op.create_check_constraint(
        "ck_rt_revoked_reason",
        "refresh_tokens",
        "revoked_reason IS NULL OR revoked_reason IN "
        "('logout','password_change','token_reuse','admin_revoke')",
    )

    # ══════════════════════════════════════════════════════
    # TRIGGER — auto-update updated_at columns
    # ══════════════════════════════════════════════════════
    # PostgreSQL function that sets updated_at = NOW() on any UPDATE
    op.execute("""
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ language 'plpgsql';
    """)

    # Apply trigger to all tables that have updated_at
    tables_with_updated_at = [
        "organizations",
        "events",
        "sessions",
        "speakers",
        "srr_stations",
        "room_devices",
        "presentation_queue",
        "posters",
    ]
    for table in tables_with_updated_at:
        op.execute(f"""
            CREATE TRIGGER trigger_{table}_updated_at
            BEFORE UPDATE ON {table}
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
        """)


# ── Downgrade ─────────────────────────────────────────────

def downgrade() -> None:
    """
    Drop all tables in reverse dependency order.
    Tables with foreign keys must be dropped before the
    tables they reference.
    """

    # Drop triggers first
    tables_with_updated_at = [
        "organizations", "events", "sessions", "speakers",
        "srr_stations", "room_devices", "presentation_queue", "posters",
    ]
    for table in tables_with_updated_at:
        op.execute(
            f"DROP TRIGGER IF EXISTS trigger_{table}_updated_at ON {table}"
        )
    op.execute("DROP FUNCTION IF EXISTS update_updated_at_column()")

    # Drop tables in reverse FK dependency order
    op.drop_table("refresh_tokens")
    op.drop_table("posters")
    op.drop_table("audit_logs")
    op.drop_table("venue_sync_jobs")
    op.drop_table("playback_events")
    op.drop_table("presentation_queue")
    op.drop_table("room_devices")
    op.drop_table("srr_activity_logs")
    op.drop_table("srr_checkins")
    op.drop_table("srr_stations")
    op.drop_table("import_jobs")
    op.drop_table("email_logs")
    op.drop_table("email_campaigns")
    op.drop_table("email_templates")
    op.drop_table("file_validations")
    op.drop_table("presentation_files")
    op.drop_table("session_speakers")
    op.drop_table("speakers")
    op.drop_table("sessions")
    op.drop_table("rooms")
    op.drop_table("events")
    op.drop_table("users")
    op.drop_table("organizations")
