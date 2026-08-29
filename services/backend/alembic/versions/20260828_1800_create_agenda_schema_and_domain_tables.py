"""Create agenda schema and domain tables

Revision ID: 20260828_1800
Revises: 20260828_1315
Create Date: 2026-08-28 18:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '20260828_1800'
down_revision: Union[str, None] = '20260828_1315'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create agenda schema cleanly
    op.execute("DROP SCHEMA IF EXISTS agenda CASCADE; CREATE SCHEMA IF NOT EXISTS agenda;")

    # 2. agenda.agendas
    op.create_table(
        'agendas',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('event_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('events.events.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('name', sa.String(150), nullable=False, server_default='Main Conference Agenda'),
        sa.Column('code', sa.String(50), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.String(30), nullable=False, server_default='DRAFT'),
        sa.Column('version', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('timezone', sa.String(100), nullable=False, server_default='UTC'),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('published_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('identity.users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        schema='agenda'
    )

    # 3. agenda.agenda_days
    op.create_table(
        'agenda_days',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('agenda_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('agenda.agendas.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('day_number', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('name', sa.String(150), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('start_time', sa.String(10), nullable=False, server_default='09:00'),
        sa.Column('end_time', sa.String(10), nullable=False, server_default='18:00'),
        sa.Column('timezone', sa.String(100), nullable=False, server_default='UTC'),
        sa.Column('status', sa.String(30), nullable=False, server_default='DRAFT'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        schema='agenda'
    )

    # 4. agenda.room_types
    op.create_table(
        'room_types',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('identity.organizations.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('code', sa.String(50), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_system', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        schema='agenda'
    )

    # 5. agenda.rooms
    op.create_table(
        'rooms',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('agenda_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('agenda.agendas.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('event_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('events.events.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('room_type_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('agenda.room_types.id', ondelete='SET NULL'), nullable=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('code', sa.String(50), nullable=True),
        sa.Column('room_type', sa.String(50), nullable=False, server_default='presentation'),
        sa.Column('capacity', sa.Integer(), nullable=True),
        sa.Column('screen_count', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('floor', sa.String(50), nullable=True),
        sa.Column('building', sa.String(100), nullable=True),
        sa.Column('location', sa.String(150), nullable=True),
        sa.Column('room_coordinator', sa.String(150), nullable=True),
        sa.Column('av_technician', sa.String(150), nullable=True),
        sa.Column('location_notes', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        schema='agenda'
    )

    # 6. agenda.track_types
    op.create_table(
        'track_types',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('identity.organizations.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('code', sa.String(50), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_system', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        schema='agenda'
    )

    # 7. agenda.tracks
    op.create_table(
        'tracks',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('agenda_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('agenda.agendas.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('event_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('events.events.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('track_type_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('agenda.track_types.id', ondelete='SET NULL'), nullable=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('code', sa.String(50), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('display_color', sa.String(30), nullable=False, server_default='#3b82f6'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        schema='agenda'
    )

    # 8. agenda.session_types
    op.create_table(
        'session_types',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('identity.organizations.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('code', sa.String(50), nullable=False),
        sa.Column('category', sa.String(50), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('default_duration_minutes', sa.Integer(), nullable=False, server_default='60'),
        sa.Column('configuration', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('is_system', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        schema='agenda'
    )

    # 9. agenda.sessions
    op.create_table(
        'sessions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('agenda_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('agenda.agendas.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('agenda_day_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('agenda.agenda_days.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('event_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('events.events.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('room_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('agenda.rooms.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('track_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('agenda.tracks.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('session_type_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('agenda.session_types.id', ondelete='SET NULL'), nullable=True),
        sa.Column('parent_session_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('agenda.sessions.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('session_code', sa.String(50), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('session_type', sa.String(50), nullable=False, server_default='Scientific Session'),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('start_time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('end_time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('status', sa.String(30), nullable=False, server_default='SCHEDULED'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('cme_credits', sa.Numeric(precision=4, scale=2), nullable=True),
        sa.Column('cme_eligible', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('operations_notes', sa.Text(), nullable=True),
        sa.Column('seating_layout', sa.String(50), nullable=False, server_default='Theater'),
        sa.Column('live_stream_url', sa.String(500), nullable=True),
        sa.Column('display_color', sa.String(30), nullable=False, server_default='#3b82f6'),
        sa.Column('is_published', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('identity.users.id', ondelete='SET NULL'), nullable=True),
        schema='agenda'
    )

    # 10. agenda.agenda_roles
    op.create_table(
        'agenda_roles',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('code', sa.String(50), nullable=False, unique=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('category', sa.String(50), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_system', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        schema='agenda'
    )

    # 11. agenda.presentation_slots
    op.create_table(
        'presentation_slots',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('session_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('agenda.sessions.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('presentation_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('bundle_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('title', sa.String(250), nullable=False),
        sa.Column('start_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('end_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('duration_minutes', sa.Integer(), nullable=False, server_default='15'),
        sa.Column('display_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('status', sa.String(30), nullable=False, server_default='PENDING'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        schema='agenda'
    )

    # 12. agenda.session_people
    op.create_table(
        'session_people',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('session_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('agenda.sessions.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('speaker_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('speakers.speakers.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('role_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('agenda.agenda_roles.id', ondelete='SET NULL'), nullable=True),
        sa.Column('role', sa.String(50), nullable=False, server_default='Speaker'),
        sa.Column('name', sa.String(150), nullable=True),
        sa.Column('presentation_slot_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('agenda.presentation_slots.id', ondelete='SET NULL'), nullable=True),
        sa.Column('display_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_primary', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_confirmed', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        schema='agenda'
    )

    # 13. agenda.session_templates
    op.create_table(
        'session_templates',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('identity.organizations.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('name', sa.String(150), nullable=False),
        sa.Column('code', sa.String(50), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('session_type_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('agenda.session_types.id', ondelete='SET NULL'), nullable=True),
        sa.Column('default_duration_minutes', sa.Integer(), nullable=False, server_default='60'),
        sa.Column('default_configuration', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('identity.users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        schema='agenda'
    )

    # 14. agenda.agenda_templates
    op.create_table(
        'agenda_templates',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('organization_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('identity.organizations.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('name', sa.String(150), nullable=False),
        sa.Column('code', sa.String(50), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('structure', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('is_system', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        schema='agenda'
    )

    # 15. agenda.agenda_conflicts
    op.create_table(
        'agenda_conflicts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('agenda_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('agenda.agendas.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('event_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('events.events.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('session_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('agenda.sessions.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('conflict_type', sa.String(50), nullable=False),
        sa.Column('severity', sa.String(20), nullable=False, server_default='warning'),
        sa.Column('related_session_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('agenda.sessions.id', ondelete='CASCADE'), nullable=True),
        sa.Column('related_person_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('related_room_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('agenda.rooms.id', ondelete='SET NULL'), nullable=True),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('status', sa.String(30), nullable=False, server_default='DETECTED'),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('resolved_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('identity.users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        schema='agenda'
    )

    # 16. agenda.agenda_versions
    op.create_table(
        'agenda_versions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('agenda_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('agenda.agendas.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('version_number', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(30), nullable=False, server_default='DRAFT'),
        sa.Column('snapshot', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('checksum', sa.String(100), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('identity.users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('published_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('identity.users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        schema='agenda'
    )

    # 17. agenda.agenda_settings
    op.create_table(
        'agenda_settings',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('agenda_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('agenda.agendas.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('settings', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        schema='agenda'
    )

    # ── SEED INITIAL SYSTEM CATALOGUES ───────────────────────────────────────
    # Roles
    op.execute("""
        INSERT INTO agenda.agenda_roles (code, name, category, is_system, sort_order)
        VALUES
            ('SPEAKER', 'Speaker', 'PRESENTER', true, 1),
            ('PRESENTER', 'Presenter', 'PRESENTER', true, 2),
            ('CHAIRPERSON', 'Chairperson', 'LEADERSHIP', true, 3),
            ('CO_CHAIRPERSON', 'Co-Chairperson', 'LEADERSHIP', true, 4),
            ('MODERATOR', 'Moderator', 'MODERATION', true, 5),
            ('PANELIST', 'Panelist', 'PANEL', true, 6),
            ('ANCHOR', 'Anchor', 'HOSTING', true, 7),
            ('EMCEE', 'Emcee', 'HOSTING', true, 8),
            ('DISCUSSANT', 'Discussant', 'PANEL', true, 9),
            ('FACILITATOR', 'Facilitator', 'WORKSHOP', true, 10),
            ('INTERVIEWER', 'Interviewer', 'MEDIA', true, 11),
            ('GUEST_SPEAKER', 'Guest Speaker', 'PRESENTER', true, 12),
            ('SESSION_COORDINATOR', 'Session Coordinator', 'OPERATIONS', true, 13),
            ('INVITED_FACULTY', 'Invited Faculty', 'FACULTY', true, 14),
            ('AWARD_RECIPIENT', 'Award Recipient', 'SPECIAL', true, 15),
            ('OTHER', 'Other Faculty', 'OTHER', true, 99)
        ON CONFLICT (code) DO NOTHING;
    """)

    # Room Types
    op.execute("""
        INSERT INTO agenda.room_types (name, code, description, is_system)
        VALUES
            ('Main Auditorium', 'MAIN_HALL', 'Large primary plenary and keynote hall', true),
            ('Auditorium', 'AUDITORIUM', 'Medium-to-large lecture auditorium', true),
            ('Conference Hall', 'CONFERENCE_HALL', 'Standard conference presentation room', true),
            ('Breakout Room', 'BREAKOUT_ROOM', 'Smaller parallel breakout discussion room', true),
            ('Workshop Room', 'WORKSHOP_ROOM', 'Hands-on interactive workshop room', true),
            ('Panel Room', 'PANEL_ROOM', 'Equipped for multi-faculty panel discussions', true),
            ('Training Room', 'TRAINING_ROOM', 'Classroom or instructional layout', true),
            ('Poster Area', 'POSTER_AREA', 'E-Poster and physical poster display zone', true),
            ('Exhibition Area', 'EXHIBITION_AREA', 'Expo hall and sponsor booths', true),
            ('VIP Boardroom', 'VIP_BOARDROOM', 'Executive board and faculty hospitality lounge', true),
            ('Special Event Area', 'SPECIAL_EVENT_AREA', 'Gala dinner, reception, or inauguration foyer', true)
        ON CONFLICT DO NOTHING;
    """)

    # Track Types
    op.execute("""
        INSERT INTO agenda.track_types (name, code, description, is_system)
        VALUES
            ('Scientific', 'SCIENTIFIC', 'Original research and scientific discovery', true),
            ('Clinical', 'CLINICAL', 'Clinical case reviews and medical practice', true),
            ('Research', 'RESEARCH', 'Academic research and methodology', true),
            ('Workshop', 'WORKSHOP', 'Interactive hands-on training sessions', true),
            ('Industry', 'INDUSTRY', 'Industry-sponsored talks and symposiums', true),
            ('Special Interest', 'SPECIAL_INTEREST', 'Sub-specialty interest groups', true),
            ('General', 'GENERAL', 'General plenary and multidisciplinary sessions', true),
            ('Custom', 'CUSTOM', 'Custom organizer track category', true)
        ON CONFLICT DO NOTHING;
    """)

    # Session Types
    op.execute("""
        INSERT INTO agenda.session_types (name, code, category, default_duration_minutes, is_system)
        VALUES
            ('Scientific Session', 'SCIENTIFIC_SESSION', 'SCIENTIFIC', 60, true),
            ('Keynote Lecture', 'KEYNOTE', 'PLENARY', 45, true),
            ('Plenary Session', 'PLENARY', 'PLENARY', 60, true),
            ('Panel Discussion', 'PANEL', 'INTERACTIVE', 60, true),
            ('Industry Symposium', 'SYMPOSIUM', 'INDUSTRY', 60, true),
            ('Hands-on Workshop', 'WORKSHOP', 'WORKSHOP', 90, true),
            ('Roundtable Discussion', 'ROUNDTABLE', 'INTERACTIVE', 45, true),
            ('Fireside Chat', 'FIRESIDE_CHAT', 'INTERACTIVE', 30, true),
            ('Case Discussion', 'CASE_DISCUSSION', 'CLINICAL', 45, true),
            ('Debate', 'DEBATE', 'INTERACTIVE', 45, true),
            ('Poster Session', 'POSTER_SESSION', 'POSTER', 60, true),
            ('Inauguration & Ceremony', 'CEREMONY', 'SPECIAL', 45, true),
            ('Coffee & Networking Break', 'BREAK', 'BREAK', 30, true),
            ('Lunch Break', 'LUNCH', 'BREAK', 60, true),
            ('Registration & Welcome', 'REGISTRATION', 'ADMIN', 60, true)
        ON CONFLICT DO NOTHING;
    """)

    # ── BACKFILL EXISTING DATA FROM events.* TO agenda.* ──────────────────────
    # 1. Create master agenda for each event
    op.execute("""
        INSERT INTO agenda.agendas (id, event_id, name, code, status, timezone, created_at, updated_at)
        SELECT 
            e.id, 
            e.id, 
            COALESCE(e.name || ' Agenda', 'Main Conference Agenda'),
            'MAIN-' || SUBSTRING(e.id::text, 1, 6),
            'PUBLISHED',
            COALESCE(e.timezone, 'UTC'),
            e.created_at,
            e.updated_at
        FROM events.events e
        ON CONFLICT DO NOTHING;
    """)

    # 2. Migrate rooms from events.rooms -> agenda.rooms
    op.execute("""
        INSERT INTO agenda.rooms (id, agenda_id, event_id, name, room_type, capacity, screen_count, room_coordinator, location_notes, is_active, created_at, updated_at)
        SELECT 
            r.id, 
            r.event_id, 
            r.event_id, 
            r.name, 
            r.room_type, 
            r.capacity, 
            r.screen_count, 
            r.room_coordinator, 
            r.location_notes, 
            r.is_active, 
            r.created_at, 
            r.created_at
        FROM events.rooms r
        ON CONFLICT (id) DO NOTHING;
    """)

    # 3. Migrate tracks from events.tracks -> agenda.tracks
    op.execute("""
        INSERT INTO agenda.tracks (id, agenda_id, event_id, name, description, display_color, sort_order, is_active, created_at, updated_at)
        SELECT 
            t.id, 
            t.event_id, 
            t.event_id, 
            t.name, 
            t.description, 
            COALESCE(t.display_color, '#3b82f6'), 
            COALESCE(t.sort_order, 0), 
            true, 
            now(), 
            now()
        FROM events.tracks t
        ON CONFLICT (id) DO NOTHING;
    """)

    # 4. Migrate sessions from events.sessions -> agenda.sessions
    op.execute("""
        INSERT INTO agenda.sessions (
            id, agenda_id, event_id, room_id, track_id, session_code, title, session_type, description, 
            start_time, end_time, status, cme_credits, cme_eligible, operations_notes, seating_layout, 
            live_stream_url, display_color, is_published, created_at, updated_at, deleted_at
        )
        SELECT 
            s.id, 
            s.event_id, 
            s.event_id, 
            s.room_id, 
            s.track_id, 
            s.session_code, 
            s.name, 
            s.session_type, 
            s.description, 
            s.start_time, 
            s.end_time, 
            s.status, 
            s.cme_credits, 
            s.cme_eligible, 
            s.operations_notes, 
            COALESCE(s.seating_layout, 'Theater'), 
            s.live_stream_url, 
            '#3b82f6', 
            COALESCE(s.is_published, false), 
            s.created_at, 
            s.updated_at, 
            s.deleted_at
        FROM events.sessions s
        ON CONFLICT (id) DO NOTHING;
    """)

    # 5. Migrate session speakers into agenda.session_people
    op.execute("""
        INSERT INTO agenda.session_people (
            id, session_id, speaker_id, role, display_order, is_primary, is_confirmed, created_at, updated_at
        )
        SELECT 
            ss.id, 
            ss.session_id, 
            ss.speaker_id, 
            COALESCE(ss.role, 'Speaker'), 
            COALESCE(ss.talk_order, 0), 
            false, 
            COALESCE(ss.is_confirmed, true), 
            now(), 
            now()
        FROM events.session_speakers ss
        ON CONFLICT (id) DO NOTHING;
    """)


def downgrade() -> None:
    op.drop_table('agenda_settings', schema='agenda')
    op.drop_table('agenda_versions', schema='agenda')
    op.drop_table('agenda_conflicts', schema='agenda')
    op.drop_table('agenda_templates', schema='agenda')
    op.drop_table('session_templates', schema='agenda')
    op.drop_table('session_people', schema='agenda')
    op.drop_table('presentation_slots', schema='agenda')
    op.drop_table('agenda_roles', schema='agenda')
    op.drop_table('sessions', schema='agenda')
    op.drop_table('session_types', schema='agenda')
    op.drop_table('tracks', schema='agenda')
    op.drop_table('track_types', schema='agenda')
    op.drop_table('rooms', schema='agenda')
    op.drop_table('room_types', schema='agenda')
    op.drop_table('agenda_days', schema='agenda')
    op.drop_table('agendas', schema='agenda')
    op.execute("DROP SCHEMA IF EXISTS agenda CASCADE;")
