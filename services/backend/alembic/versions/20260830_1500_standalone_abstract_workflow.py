"""Create standalone abstract workflow tables.

Revision ID: 20260830_1500
Revises: 20260830_1200
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260830_1500"
down_revision = "20260830_1200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "abstract_calls",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="DRAFT"),
        sa.Column("opens_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closes_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revision_deadline", sa.DateTime(timezone=True), nullable=True),
        sa.Column("max_words", sa.Integer(), nullable=False, server_default="300"),
        sa.Column("min_words", sa.Integer(), nullable=False, server_default="50"),
        sa.Column("abstract_types", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[\"ORAL\", \"POSTER\"]'::jsonb")),
        sa.Column("topics", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("author_rules", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("attachment_rules", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("disclosure_rules", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("email_triggers", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("blind_review_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id", name="uq_abstract_calls_event_id"),
        schema="events",
    )
    op.create_index("ix_abstract_calls_organization_id", "abstract_calls", ["organization_id"], schema="events")
    op.create_index("ix_abstract_calls_event_id", "abstract_calls", ["event_id"], schema="events")
    op.create_index("ix_abstract_calls_status", "abstract_calls", ["status"], schema="events")

    op.create_table(
        "abstract_forms",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False, server_default="Abstract submission form"),
        sa.Column("schema", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema="events",
    )
    op.create_index("ix_abstract_forms_event_active", "abstract_forms", ["event_id", "is_active"], schema="events")

    op.create_table(
        "abstract_submissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("legacy_session_speaker_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("submitter_speaker_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("presenter_speaker_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("linked_session_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("linked_poster_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("keywords", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("abstract_type", sa.String(length=40), nullable=False, server_default="ORAL"),
        sa.Column("topic", sa.String(length=120), nullable=True),
        sa.Column("track", sa.String(length=120), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="DRAFT"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("form_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("publication_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("final_decision", sa.String(length=32), nullable=True),
        sa.Column("presentation_type", sa.String(length=40), nullable=True),
        sa.Column("average_score", sa.Integer(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["legacy_session_speaker_id"], ["agenda.session_people.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["submitter_speaker_id"], ["speakers.speakers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["presenter_speaker_id"], ["speakers.speakers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["linked_session_id"], ["agenda.sessions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["linked_poster_id"], ["presentations.posters.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        schema="events",
    )
    op.create_index("ix_abstract_submissions_event_status", "abstract_submissions", ["event_id", "status"], schema="events")
    op.create_index("ix_abstract_submissions_event_topic", "abstract_submissions", ["event_id", "topic"], schema="events")
    op.create_index("ix_abstract_submissions_code", "abstract_submissions", ["code"], schema="events")

    op.create_table("abstract_authors", sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("submission_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("full_name", sa.String(length=180), nullable=False), sa.Column("email", sa.String(length=255), nullable=True), sa.Column("affiliation", sa.String(length=255), nullable=True), sa.Column("country", sa.String(length=100), nullable=True), sa.Column("is_presenter", sa.Boolean(), nullable=False, server_default=sa.text("false")), sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"), sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["submission_id"], ["events.abstract_submissions.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"), schema="events")
    op.create_index("ix_abstract_authors_submission_order", "abstract_authors", ["submission_id", "display_order"], schema="events")

    op.create_table("abstract_attachments", sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("submission_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("kind", sa.String(length=40), nullable=False, server_default="SUPPORTING_FILE"), sa.Column("filename", sa.String(length=255), nullable=False), sa.Column("storage_path", sa.String(length=600), nullable=True), sa.Column("mime_type", sa.String(length=120), nullable=True), sa.Column("file_size_bytes", sa.Integer(), nullable=True), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")), sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["submission_id"], ["events.abstract_submissions.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"), schema="events")

    op.create_table("abstract_reviewers", sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True), sa.Column("full_name", sa.String(length=180), nullable=False), sa.Column("email", sa.String(length=255), nullable=False), sa.Column("expertise_topics", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")), sa.Column("capacity", sa.Integer(), nullable=False, server_default="10"), sa.Column("status", sa.String(length=24), nullable=False, server_default="INVITED"), sa.Column("access_token_hash", sa.String(length=128), nullable=True), sa.Column("invited_at", sa.DateTime(timezone=True), nullable=True), sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")), sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["user_id"], ["identity.users.id"], ondelete="SET NULL"), sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("event_id", "email", name="uq_abstract_reviewers_event_email"), schema="events")

    op.create_table("abstract_assignments", sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("submission_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("reviewer_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("status", sa.String(length=24), nullable=False, server_default="ASSIGNED"), sa.Column("due_at", sa.DateTime(timezone=True), nullable=True), sa.Column("conflict_declared", sa.Boolean(), nullable=False, server_default=sa.text("false")), sa.Column("conflict_reason", sa.Text(), nullable=True), sa.Column("assigned_by", postgresql.UUID(as_uuid=True), nullable=True), sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")), sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["submission_id"], ["events.abstract_submissions.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["reviewer_id"], ["events.abstract_reviewers.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["assigned_by"], ["identity.users.id"], ondelete="SET NULL"), sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("submission_id", "reviewer_id", name="uq_abstract_assignment_submission_reviewer"), schema="events")
    op.create_index("ix_abstract_assignments_event_status", "abstract_assignments", ["event_id", "status"], schema="events")

    op.create_table("abstract_reviews", sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("submission_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("assignment_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("reviewer_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("scores", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")), sa.Column("total_score", sa.Integer(), nullable=False, server_default="0"), sa.Column("recommendation", sa.String(length=32), nullable=False, server_default="DISCUSS"), sa.Column("comments_to_committee", sa.Text(), nullable=True), sa.Column("comments_to_author", sa.Text(), nullable=True), sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")), sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["submission_id"], ["events.abstract_submissions.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["assignment_id"], ["events.abstract_assignments.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["reviewer_id"], ["events.abstract_reviewers.id"], ondelete="CASCADE"), sa.PrimaryKeyConstraint("id"), schema="events")

    op.create_table("abstract_decisions", sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("submission_id", postgresql.UUID(as_uuid=True), nullable=False), sa.Column("decision", sa.String(length=32), nullable=False), sa.Column("presentation_type", sa.String(length=40), nullable=True), sa.Column("reason", sa.String(length=1000), nullable=False), sa.Column("notes_to_author", sa.Text(), nullable=True), sa.Column("decided_by", postgresql.UUID(as_uuid=True), nullable=True), sa.Column("decided_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")), sa.Column("idempotency_key", sa.String(length=200), nullable=False), sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["submission_id"], ["events.abstract_submissions.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["decided_by"], ["identity.users.id"], ondelete="SET NULL"), sa.PrimaryKeyConstraint("id"), schema="events")
    op.create_index("ix_abstract_decisions_idempotency_key", "abstract_decisions", ["idempotency_key"], schema="events")

    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'events'
                  AND table_name = 'session_speakers'
                  AND column_name = 'abstract_text'
            ) THEN
                INSERT INTO events.abstract_submissions (
                    id, organization_id, event_id, legacy_session_speaker_id, submitter_speaker_id,
                    presenter_speaker_id, linked_session_id, code, title, body, keywords,
                    abstract_type, topic, track, status, version, submitted_at, decided_at,
                    final_decision, created_at, updated_at
                )
                SELECT
                    gen_random_uuid(), e.organization_id, s.event_id, ss.id, ss.speaker_id,
                    ss.speaker_id, ss.session_id,
                    'LEG-' || row_number() OVER (PARTITION BY s.event_id ORDER BY ss.id)::text,
                    COALESCE(ss.presentation_title, s.name, 'Untitled abstract'),
                    COALESCE(ss.abstract_text, ''),
                    COALESCE(ss.abstract_keywords, '[]'::jsonb),
                    'ORAL',
                    NULL,
                    NULL,
                    ss.abstract_status,
                    ss.abstract_version,
                    ss.abstract_submitted_at,
                    CASE WHEN ss.abstract_status IN ('ACCEPTED', 'REJECTED') THEN ss.abstract_reviewed_at ELSE NULL END,
                    CASE WHEN ss.abstract_status IN ('ACCEPTED', 'REJECTED') THEN ss.abstract_status ELSE NULL END,
                    now(),
                    now()
                FROM events.session_speakers ss
                JOIN events.sessions s ON s.id = ss.session_id
                JOIN events.events e ON e.id = s.event_id
                WHERE COALESCE(ss.abstract_text, '') <> '';
            ELSIF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'agenda'
                  AND table_name = 'session_people'
                  AND column_name = 'abstract_text'
            ) THEN
                INSERT INTO events.abstract_submissions (
                    id, organization_id, event_id, legacy_session_speaker_id, submitter_speaker_id,
                    presenter_speaker_id, linked_session_id, code, title, body, keywords,
                    abstract_type, topic, track, status, version, submitted_at, decided_at,
                    final_decision, created_at, updated_at
                )
                SELECT
                    gen_random_uuid(), e.organization_id, s.event_id, sp.id, sp.speaker_id,
                    sp.speaker_id, sp.session_id,
                    'LEG-' || row_number() OVER (PARTITION BY s.event_id ORDER BY sp.id)::text,
                    COALESCE(s.title, s.name, 'Untitled abstract'),
                    COALESCE(sp.abstract_text, ''),
                    COALESCE(sp.abstract_keywords, '[]'::jsonb),
                    'ORAL',
                    NULL,
                    NULL,
                    sp.abstract_status,
                    sp.abstract_version,
                    sp.abstract_submitted_at,
                    CASE WHEN sp.abstract_status IN ('ACCEPTED', 'REJECTED') THEN sp.abstract_reviewed_at ELSE NULL END,
                    CASE WHEN sp.abstract_status IN ('ACCEPTED', 'REJECTED') THEN sp.abstract_status ELSE NULL END,
                    now(),
                    now()
                FROM agenda.session_people sp
                JOIN agenda.sessions s ON s.id = sp.session_id
                JOIN events.events e ON e.id = s.event_id
                WHERE COALESCE(sp.abstract_text, '') <> '';
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    for table in (
        "abstract_decisions",
        "abstract_reviews",
        "abstract_assignments",
        "abstract_reviewers",
        "abstract_attachments",
        "abstract_authors",
        "abstract_submissions",
        "abstract_forms",
        "abstract_calls",
    ):
        op.drop_table(table, schema="events")
