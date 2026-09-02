"""Clean agenda rooms and seed default agenda types

Revision ID: 20260829_1845
Revises: 20260828_2000
Create Date: 2026-08-29 18:45:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20260829_1845'
down_revision = '20260828_2000'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Drop removed columns from agenda.rooms
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'agenda' AND table_name = 'rooms') THEN
                ALTER TABLE agenda.rooms DROP COLUMN IF EXISTS capacity;
                ALTER TABLE agenda.rooms DROP COLUMN IF EXISTS screen_count;
                ALTER TABLE agenda.rooms DROP COLUMN IF EXISTS floor;
                ALTER TABLE agenda.rooms DROP COLUMN IF EXISTS building;
                ALTER TABLE agenda.rooms DROP COLUMN IF EXISTS location;
                ALTER TABLE agenda.rooms DROP COLUMN IF EXISTS location_notes;
                ALTER TABLE agenda.rooms DROP COLUMN IF EXISTS sort_order;
                ALTER TABLE agenda.rooms DROP COLUMN IF EXISTS av_technician;
            END IF;
            
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'events' AND table_name = 'rooms') THEN
                ALTER TABLE events.rooms DROP COLUMN IF EXISTS capacity;
                ALTER TABLE events.rooms DROP COLUMN IF EXISTS screen_count;
                ALTER TABLE events.rooms DROP COLUMN IF EXISTS floor;
                ALTER TABLE events.rooms DROP COLUMN IF EXISTS building;
                ALTER TABLE events.rooms DROP COLUMN IF EXISTS location;
                ALTER TABLE events.rooms DROP COLUMN IF EXISTS location_notes;
                ALTER TABLE events.rooms DROP COLUMN IF EXISTS sort_order;
                ALTER TABLE events.rooms DROP COLUMN IF EXISTS av_technician;
            END IF;
        END $$;
    """)

    # 2. Seed default agenda room types
    op.execute("""
        INSERT INTO agenda.room_types (id, name, code, description, is_system, is_active, created_at, updated_at)
        VALUES
            (gen_random_uuid(), 'Main Hall / Auditorium', 'MAIN_HALL', 'Primary conference hall for keynotes and plenary sessions', true, true, now(), now()),
            (gen_random_uuid(), 'Breakout Room', 'BREAKOUT', 'Medium-sized room for parallel tracks and interactive sessions', true, true, now(), now()),
            (gen_random_uuid(), 'Workshop / Hands-on Lab', 'WORKSHOP', 'Equipped room for training, workshops, and practical demos', true, true, now(), now()),
            (gen_random_uuid(), 'Boardroom / Meeting Room', 'BOARDROOM', 'Executive meeting and committee room', true, true, now(), now()),
            (gen_random_uuid(), 'Poster Exhibition Area', 'POSTER', 'Exhibition area for scientific posters and ePosters', true, true, now(), now()),
            (gen_random_uuid(), 'Virtual / Streaming Stage', 'VIRTUAL', 'Digital stage for virtual or hybrid live streaming', true, true, now(), now()),
            (gen_random_uuid(), 'Other / Miscellaneous', 'OTHER', 'General purpose space or custom setup', true, true, now(), now())
        ON CONFLICT DO NOTHING;
    """)

    # 3. Seed default agenda session types
    op.execute("""
        INSERT INTO agenda.session_types (id, name, code, category, default_duration_minutes, configuration, is_system, is_active, created_at, updated_at)
        VALUES
            (gen_random_uuid(), 'Keynote Address', 'KEYNOTE', 'Scientific', 45, '{}'::jsonb, true, true, now(), now()),
            (gen_random_uuid(), 'Plenary Session', 'PLENARY', 'Scientific', 60, '{}'::jsonb, true, true, now(), now()),
            (gen_random_uuid(), 'Oral Presentation', 'ORAL', 'Scientific', 15, '{}'::jsonb, true, true, now(), now()),
            (gen_random_uuid(), 'Panel Discussion', 'PANEL', 'Discussion', 45, '{}'::jsonb, true, true, now(), now()),
            (gen_random_uuid(), 'Workshop / Masterclass', 'WORKSHOP', 'Practical', 90, '{}'::jsonb, true, true, now(), now()),
            (gen_random_uuid(), 'Symposium', 'SYMPOSIUM', 'Scientific', 60, '{}'::jsonb, true, true, now(), now()),
            (gen_random_uuid(), 'Poster Presentation Session', 'POSTER_SESSION', 'Exhibition', 60, '{}'::jsonb, true, true, now(), now()),
            (gen_random_uuid(), 'Break / Networking', 'BREAK', 'Social', 30, '{}'::jsonb, true, true, now(), now()),
            (gen_random_uuid(), 'Inauguration / Ceremony', 'INAUGURATION', 'Ceremony', 45, '{}'::jsonb, true, true, now(), now())
        ON CONFLICT DO NOTHING;
    """)

    # 4. Seed default agenda roles
    op.execute("""
        INSERT INTO agenda.agenda_roles (id, code, name, category, description, is_system, is_active, sort_order, created_at, updated_at)
        VALUES
            (gen_random_uuid(), 'SPEAKER', 'Speaker / Presenter', 'Faculty', 'Delivers scientific presentation or lecture', true, true, 1, now(), now()),
            (gen_random_uuid(), 'KEYNOTE_SPEAKER', 'Keynote Speaker', 'Faculty', 'Delivers keynote or plenary address', true, true, 2, now(), now()),
            (gen_random_uuid(), 'CHAIRPERSON', 'Session Chairperson', 'Moderation', 'Leads and moderates session proceedings', true, true, 3, now(), now()),
            (gen_random_uuid(), 'CO_CHAIR', 'Co-Chairperson', 'Moderation', 'Assists session chairperson', true, true, 4, now(), now()),
            (gen_random_uuid(), 'MODERATOR', 'Moderator', 'Moderation', 'Facilitates Q&A and interactive discussions', true, true, 5, now(), now()),
            (gen_random_uuid(), 'PANELIST', 'Panelist', 'Discussion', 'Participates in panel debate and discussion', true, true, 6, now(), now()),
            (gen_random_uuid(), 'DISCUSSANT', 'Discussant', 'Discussion', 'Critiques and discusses presented papers', true, true, 7, now(), now()),
            (gen_random_uuid(), 'JUDGE', 'Poster / Presentation Judge', 'Evaluation', 'Evaluates oral or poster presentations', true, true, 8, now(), now())
        ON CONFLICT (code) DO NOTHING;
    """)

    # 5. Seed default agenda track types
    op.execute("""
        INSERT INTO agenda.track_types (id, name, code, description, is_system, is_active, created_at, updated_at)
        VALUES
            (gen_random_uuid(), 'Scientific & Clinical', 'SCIENTIFIC', 'Core scientific, clinical, and medical tracks', true, true, now(), now()),
            (gen_random_uuid(), 'Hands-on Workshop', 'WORKSHOP', 'Interactive skills and hands-on laboratory tracks', true, true, now(), now()),
            (gen_random_uuid(), 'Industry & Innovation', 'INDUSTRY', 'Industry symposia, tech talks, and sponsor presentations', true, true, now(), now()),
            (gen_random_uuid(), 'Poster & Abstracts', 'POSTER', 'Poster presentations and abstract displays', true, true, now(), now()),
            (gen_random_uuid(), 'Plenary & Ceremonies', 'PLENARY', 'General assemblies, inaugurations, and keynote tracks', true, true, now(), now())
        ON CONFLICT DO NOTHING;
    """)


def downgrade() -> None:
    pass
