"""Normalize abstract workflow schema:
1. Add typed relational columns to abstract.abstract_calls for co-author rules, attachment rules, disclosure rules, and evaluation plans.
2. Create abstract.abstract_portal_settings table for submission & review portal configurations.
3. Create abstract.abstract_topics table for relational topics.
4. Create abstract.abstract_categories table for relational abstract categories.
5. Create abstract.abstract_formats table for relational session formats.
6. Create abstract.abstract_reviewer_topics junction table.
7. Backfill existing JSONB data into the new relational tables and columns.

Revision ID: 20260909_2000
Revises: 20260909_1900
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260909_2000"
down_revision = "20260909_1900"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add typed relational columns to abstract.abstract_calls
    op.add_column("abstract_calls", sa.Column("allow_coauthors", sa.Boolean(), nullable=False, server_default=sa.text("true")), schema="abstract")
    op.add_column("abstract_calls", sa.Column("max_coauthors", sa.Integer(), nullable=True, server_default="5"), schema="abstract")
    op.add_column("abstract_calls", sa.Column("require_presenter", sa.Boolean(), nullable=False, server_default=sa.text("true")), schema="abstract")
    op.add_column("abstract_calls", sa.Column("require_affiliation", sa.Boolean(), nullable=False, server_default=sa.text("true")), schema="abstract")
    op.add_column("abstract_calls", sa.Column("require_country", sa.Boolean(), nullable=False, server_default=sa.text("true")), schema="abstract")
    op.add_column("abstract_calls", sa.Column("max_submissions_per_author", sa.Integer(), nullable=True), schema="abstract")
    op.add_column("abstract_calls", sa.Column("require_attachments", sa.Boolean(), nullable=False, server_default=sa.text("false")), schema="abstract")
    op.add_column("abstract_calls", sa.Column("allowed_file_extensions", sa.String(length=100), nullable=False, server_default="pdf,docx"), schema="abstract")
    op.add_column("abstract_calls", sa.Column("max_file_size_mb", sa.Integer(), nullable=False, server_default="25"), schema="abstract")
    op.add_column("abstract_calls", sa.Column("require_disclosures", sa.Boolean(), nullable=False, server_default=sa.text("false")), schema="abstract")
    op.add_column(
        "abstract_calls",
        sa.Column("evaluation_plan_id", postgresql.UUID(as_uuid=True), nullable=True),
        schema="abstract",
    )
    op.add_column("abstract_calls", sa.Column("target_reviews_per_submission", sa.Integer(), nullable=False, server_default="2"), schema="abstract")
    op.create_foreign_key(
        "fk_abstract_calls_evaluation_plan_id",
        "abstract_calls",
        "evaluation_plans",
        ["evaluation_plan_id"],
        ["id"],
        source_schema="abstract",
        referent_schema="programme",
        ondelete="SET NULL",
    )

    # 2. Create abstract.abstract_portal_settings
    op.create_table(
        "abstract_portal_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("call_id", postgresql.UUID(as_uuid=True), nullable=False),
        # Submission portal
        sa.Column("sub_access_mode", sa.String(length=32), nullable=False, server_default="OPEN_PUBLIC"),
        sa.Column("sub_show_countdown", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sub_show_taxonomy_guide", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sub_guidelines_text", sa.Text(), nullable=True),
        sa.Column("sub_allow_edits", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sub_allow_withdrawal", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sub_require_coauthor_verify", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("sub_feedback_policy", sa.String(length=32), nullable=False, server_default="ANONYMIZED_COMMENTS"),
        sa.Column("sub_success_message", sa.Text(), nullable=True),
        sa.Column("sub_support_email", sa.String(length=255), nullable=True),
        sa.Column("sub_support_phone", sa.String(length=50), nullable=True),
        sa.Column("send_confirmation_email", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        # Review portal
        sa.Column("rev_redact_author_names", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("rev_redact_affiliations", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("rev_redact_coauthors", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("rev_peer_visibility", sa.String(length=32), nullable=False, server_default="AFTER_SUBMIT"),
        sa.Column("rev_show_aggregate_scores", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("rev_allow_editing", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("rev_mandatory_comments", sa.String(length=32), nullable=False, server_default="LOW_SCORES_ONLY"),
        sa.Column("rev_enforce_coi", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("rev_auto_warn_institution", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("rev_in_browser_pdf", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("rev_remind_72h", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("rev_remind_48h", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("rev_remind_24h", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["call_id"], ["abstract.abstract_calls.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id", name="uq_abstract_portal_settings_event_id"),
        schema="abstract",
    )

    # 3. Create abstract.abstract_topics
    op.create_table(
        "abstract_topics",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("call_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.String(length=300), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["call_id"], ["abstract.abstract_calls.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id", "name", name="uq_abstract_topics_event_name"),
        schema="abstract",
    )
    op.create_index("ix_abstract_topics_event_id", "abstract_topics", ["event_id"], schema="abstract")

    # 4. Create abstract.abstract_categories
    op.create_table(
        "abstract_categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("call_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["call_id"], ["abstract.abstract_calls.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id", "name", name="uq_abstract_categories_event_name"),
        schema="abstract",
    )
    op.create_index("ix_abstract_categories_event_id", "abstract_categories", ["event_id"], schema="abstract")

    # 5. Create abstract.abstract_formats
    op.create_table(
        "abstract_formats",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("call_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("description", sa.String(length=300), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["call_id"], ["abstract.abstract_calls.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id", "code", name="uq_abstract_formats_event_code"),
        schema="abstract",
    )
    op.create_index("ix_abstract_formats_event_id", "abstract_formats", ["event_id"], schema="abstract")

    # 6. Create abstract.abstract_reviewer_topics
    op.create_table(
        "abstract_reviewer_topics",
        sa.Column("reviewer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("topic_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["reviewer_id"], ["abstract.abstract_reviewers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["topic_id"], ["abstract.abstract_topics.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("reviewer_id", "topic_id"),
        schema="abstract",
    )

    # 7. Data Backfill: Migrate data from JSONB columns to relational tables/columns
    op.execute("""
        -- Backfill typed columns on abstract_calls from JSON
        UPDATE abstract.abstract_calls
        SET
            allow_coauthors = COALESCE((author_rules->>'allow_coauthors')::boolean, true),
            max_coauthors = CASE 
                WHEN (author_rules->'coauthor_rules'->>'max') ~ '^[0-9]+$' THEN (author_rules->'coauthor_rules'->>'max')::int
                WHEN (author_rules->>'co_authors_allowed') ~ '^[0-9]+$' THEN (author_rules->>'co_authors_allowed')::int
                ELSE 5
            END,
            require_presenter = COALESCE((author_rules->'coauthor_rules'->>'presenter_required')::boolean, (author_rules->>'require_presenter')::boolean, true),
            require_affiliation = COALESCE((author_rules->>'require_affiliation')::boolean, true),
            require_country = COALESCE((author_rules->>'require_country')::boolean, true),
            require_attachments = COALESCE((attachment_rules->>'required')::boolean, false),
            allowed_file_extensions = COALESCE(
                CASE 
                    WHEN jsonb_typeof(attachment_rules->'allowed_extensions') = 'array' 
                    THEN (SELECT string_agg(trim('"' FROM elem::text), ',') FROM jsonb_array_elements(attachment_rules->'allowed_extensions') AS elem)
                    ELSE 'pdf,docx'
                END, 'pdf,docx'
            ),
            max_file_size_mb = COALESCE((attachment_rules->>'max_size_mb')::int, 25),
            require_disclosures = COALESCE((disclosure_rules->>'required')::boolean, false),
            target_reviews_per_submission = COALESCE((author_rules->>'target_reviews_per_submission')::int, 2)
        WHERE author_rules IS NOT NULL;
    """)

    op.execute("""
        -- Backfill abstract_portal_settings
        INSERT INTO abstract.abstract_portal_settings (
            id, organization_id, event_id, call_id,
            sub_access_mode, sub_show_countdown, sub_show_taxonomy_guide, sub_guidelines_text,
            sub_allow_edits, sub_allow_withdrawal, sub_require_coauthor_verify, sub_feedback_policy,
            sub_success_message, sub_support_email, sub_support_phone, send_confirmation_email,
            rev_redact_author_names, rev_redact_affiliations, rev_redact_coauthors, rev_peer_visibility,
            rev_show_aggregate_scores, rev_allow_editing, rev_mandatory_comments, rev_enforce_coi,
            rev_auto_warn_institution, rev_in_browser_pdf, rev_remind_72h, rev_remind_48h, rev_remind_24h,
            version, created_at, updated_at
        )
        SELECT
            gen_random_uuid(), c.organization_id, c.event_id, c.id,
            COALESCE(c.author_rules->'portal_settings'->'submission_portal'->>'access_mode', 'OPEN_PUBLIC'),
            COALESCE((c.author_rules->'portal_settings'->'submission_portal'->>'show_countdown_banner')::boolean, true),
            COALESCE((c.author_rules->'portal_settings'->'submission_portal'->>'show_taxonomy_guide')::boolean, true),
            c.author_rules->'portal_settings'->'submission_portal'->>'guidelines_text',
            COALESCE((c.author_rules->'portal_settings'->'submission_portal'->>'allow_author_edits')::boolean, true),
            COALESCE((c.author_rules->'portal_settings'->'submission_portal'->>'allow_author_withdrawal')::boolean, true),
            COALESCE((c.author_rules->'portal_settings'->'submission_portal'->>'require_coauthor_verification')::boolean, false),
            COALESCE(c.author_rules->'portal_settings'->'submission_portal'->>'feedback_release_policy', 'ANONYMIZED_COMMENTS'),
            c.author_rules->'portal_settings'->'submission_portal'->>'success_message',
            c.author_rules->'portal_settings'->'submission_portal'->>'support_email',
            c.author_rules->'portal_settings'->'submission_portal'->>'support_phone',
            COALESCE((c.email_triggers->>'submission_receipt')::boolean, true),
            COALESCE((c.author_rules->'portal_settings'->'review_portal'->>'redact_author_names')::boolean, true),
            COALESCE((c.author_rules->'portal_settings'->'review_portal'->>'redact_affiliations')::boolean, true),
            COALESCE((c.author_rules->'portal_settings'->'review_portal'->>'redact_coauthors')::boolean, true),
            COALESCE(c.author_rules->'portal_settings'->'review_portal'->>'peer_visibility_mode', 'AFTER_SUBMIT'),
            COALESCE((c.author_rules->'portal_settings'->'review_portal'->>'show_aggregate_scores')::boolean, true),
            COALESCE((c.author_rules->'portal_settings'->'review_portal'->>'allow_review_editing')::boolean, true),
            COALESCE(c.author_rules->'portal_settings'->'review_portal'->>'mandatory_comments_policy', 'LOW_SCORES_ONLY'),
            COALESCE((c.author_rules->'portal_settings'->'review_portal'->>'enforce_coi_declaration')::boolean, true),
            COALESCE((c.author_rules->'portal_settings'->'review_portal'->>'auto_warn_institutional_conflict')::boolean, true),
            COALESCE((c.author_rules->'portal_settings'->'review_portal'->>'in_browser_pdf_viewer')::boolean, true),
            COALESCE((c.author_rules->'portal_settings'->'review_portal'->'reminders'->>'remind_72h')::boolean, true),
            COALESCE((c.author_rules->'portal_settings'->'review_portal'->'reminders'->>'remind_48h')::boolean, true),
            COALESCE((c.author_rules->'portal_settings'->'review_portal'->'reminders'->>'remind_24h')::boolean, true),
            1, now(), now()
        FROM abstract.abstract_calls c
        ON CONFLICT (event_id) DO NOTHING;
    """)

    op.execute("""
        -- Backfill abstract_topics from c.topics JSONB array
        INSERT INTO abstract.abstract_topics (id, organization_id, event_id, call_id, name, sort_order, is_active, created_at, updated_at)
        SELECT
            gen_random_uuid(), c.organization_id, c.event_id, c.id,
            trim('"' FROM elem::text), ord - 1, true, now(), now()
        FROM abstract.abstract_calls c,
        jsonb_array_elements(c.topics) WITH ORDINALITY AS t(elem, ord)
        WHERE jsonb_typeof(c.topics) = 'array'
        ON CONFLICT (event_id, name) DO NOTHING;
    """)

    op.execute("""
        -- Backfill abstract_categories from author_rules.categories JSONB array
        INSERT INTO abstract.abstract_categories (id, organization_id, event_id, call_id, name, sort_order, is_active, created_at, updated_at)
        SELECT
            gen_random_uuid(), c.organization_id, c.event_id, c.id,
            trim('"' FROM elem::text), ord - 1, true, now(), now()
        FROM abstract.abstract_calls c,
        jsonb_array_elements(c.author_rules->'categories') WITH ORDINALITY AS cat(elem, ord)
        WHERE jsonb_typeof(c.author_rules->'categories') = 'array'
        ON CONFLICT (event_id, name) DO NOTHING;
    """)

    op.execute("""
        -- Backfill abstract_formats from c.abstract_types JSONB array
        INSERT INTO abstract.abstract_formats (id, organization_id, event_id, call_id, name, code, sort_order, is_active, created_at, updated_at)
        SELECT
            gen_random_uuid(), c.organization_id, c.event_id, c.id,
            initcap(replace(trim('"' FROM elem::text), '_', ' ')),
            upper(trim('"' FROM elem::text)),
            ord - 1, true, now(), now()
        FROM abstract.abstract_calls c,
        jsonb_array_elements(c.abstract_types) WITH ORDINALITY AS fmt(elem, ord)
        WHERE jsonb_typeof(c.abstract_types) = 'array'
        ON CONFLICT (event_id, code) DO NOTHING;
    """)


def downgrade() -> None:
    op.drop_table("abstract_reviewer_topics", schema="abstract")
    op.drop_table("abstract_formats", schema="abstract")
    op.drop_table("abstract_categories", schema="abstract")
    op.drop_table("abstract_topics", schema="abstract")
    op.drop_table("abstract_portal_settings", schema="abstract")
    op.drop_constraint("fk_abstract_calls_evaluation_plan_id", "abstract_calls", schema="abstract", type_="foreignkey")
    op.drop_column("abstract_calls", "target_reviews_per_submission", schema="abstract")
    op.drop_column("abstract_calls", "evaluation_plan_id", schema="abstract")
    op.drop_column("abstract_calls", "require_disclosures", schema="abstract")
    op.drop_column("abstract_calls", "max_file_size_mb", schema="abstract")
    op.drop_column("abstract_calls", "allowed_file_extensions", schema="abstract")
    op.drop_column("abstract_calls", "require_attachments", schema="abstract")
    op.drop_column("abstract_calls", "max_submissions_per_author", schema="abstract")
    op.drop_column("abstract_calls", "require_country", schema="abstract")
    op.drop_column("abstract_calls", "require_affiliation", schema="abstract")
    op.drop_column("abstract_calls", "require_presenter", schema="abstract")
    op.drop_column("abstract_calls", "max_coauthors", schema="abstract")
    op.drop_column("abstract_calls", "allow_coauthors", schema="abstract")
