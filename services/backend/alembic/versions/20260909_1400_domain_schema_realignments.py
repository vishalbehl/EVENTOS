"""Realign domain schemas:
1. Remove attendance, attendance_mutations, badge_print_jobs, and badge_scans from registration schema.
2. Move form_categories, form_templates, and form_fields from registration to design schema.
3. Drop legacy speaker_theme_settings table.
4. Move all abstract tables from events to abstract schema.

Revision ID: 20260909_1400
Revises: 20260909_1300
"""

from alembic import op


revision = "20260909_1400"
down_revision = "20260909_1300"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Ensure target schemas exist
    op.execute("CREATE SCHEMA IF NOT EXISTS abstract")
    op.execute("CREATE SCHEMA IF NOT EXISTS design")
    op.execute("CREATE SCHEMA IF NOT EXISTS venue")

    # 2. Remove venue-operational tables from registration schema
    op.execute("DROP TABLE IF EXISTS registration.attendance_mutations CASCADE")
    op.execute("DROP TABLE IF EXISTS registration.attendance CASCADE")
    op.execute("DROP TABLE IF EXISTS registration.badge_scans CASCADE")
    op.execute("DROP TABLE IF EXISTS registration.badge_print_jobs CASCADE")

    # 3. Move form builder engine tables from registration to design schema
    form_tables = ["form_categories", "form_templates", "form_fields"]
    for tbl in form_tables:
        op.execute(f"""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'registration' AND table_name = '{tbl}'
                ) THEN
                    ALTER TABLE registration.{tbl} SET SCHEMA design;
                END IF;
            END $$;
        """)

    # 4. Drop legacy speaker_theme_settings from database (unified into design.portal_theme_settings)
    op.execute("DROP TABLE IF EXISTS speakers.speaker_theme_settings CASCADE")
    op.execute("DROP TABLE IF EXISTS design.speaker_theme_settings CASCADE")

    # 5. Move abstract tables from events to abstract schema
    abstract_tables = [
        "abstract_calls",
        "abstract_forms",
        "abstract_submissions",
        "abstract_authors",
        "abstract_attachments",
        "abstract_reviewers",
        "abstract_assignments",
        "abstract_reviews",
        "abstract_decisions",
    ]
    for tbl in abstract_tables:
        op.execute(f"""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'events' AND table_name = '{tbl}'
                ) THEN
                    ALTER TABLE events.{tbl} SET SCHEMA abstract;
                END IF;
            END $$;
        """)


def downgrade() -> None:
    # Move abstract tables back to events
    abstract_tables = [
        "abstract_decisions",
        "abstract_reviews",
        "abstract_assignments",
        "abstract_reviewers",
        "abstract_attachments",
        "abstract_authors",
        "abstract_submissions",
        "abstract_forms",
        "abstract_calls",
    ]
    for tbl in abstract_tables:
        op.execute(f"""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'abstract' AND table_name = '{tbl}'
                ) THEN
                    ALTER TABLE abstract.{tbl} SET SCHEMA events;
                END IF;
            END $$;
        """)

    # Move form builder tables back to registration
    form_tables = ["form_fields", "form_templates", "form_categories"]
    for tbl in form_tables:
        op.execute(f"""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'design' AND table_name = '{tbl}'
                ) THEN
                    ALTER TABLE design.{tbl} SET SCHEMA registration;
                END IF;
            END $$;
        """)
