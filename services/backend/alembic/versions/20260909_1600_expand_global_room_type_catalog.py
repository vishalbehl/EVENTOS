"""Expand and activate the global room type catalogue.

Revision ID: 20260909_1600
Revises: 20260909_1500
"""

from alembic import op
from sqlalchemy import text


revision = "20260909_1600"
down_revision = "20260909_1500"
branch_labels = None
depends_on = None


ROOM_TYPES = (
    ("Main Hall / Auditorium", "MAIN_HALL", "Primary conference hall for keynotes and plenary sessions"),
    ("Auditorium", "AUDITORIUM", "Large lecture auditorium with tiered seating"),
    ("Plenary Hall", "PLENARY_HALL", "Dedicated plenary and general assembly hall"),
    ("Breakout Room", "BREAKOUT", "Medium-sized room for parallel tracks and interactive sessions"),
    ("Workshop / Hands-on Lab", "WORKSHOP", "Equipped room for training, workshops, and practical demos"),
    ("Boardroom / Meeting Room", "BOARDROOM", "Executive meeting and committee room"),
    ("Meeting Room", "MEETING_ROOM", "Flexible meeting room for committees and working groups"),
    ("Seminar Room", "SEMINAR_ROOM", "Seminar room for focused presentations and discussion"),
    ("Training Room", "TRAINING_ROOM", "Training room with configurable teaching layout"),
    ("Classroom", "CLASSROOM", "Classroom-style learning space"),
    ("Laboratory", "LABORATORY", "Specialized technical or scientific laboratory"),
    ("Poster Exhibition Area", "POSTER", "Exhibition area for scientific posters and ePosters"),
    ("Exhibition Hall", "EXHIBITION", "Exhibitor booths, demonstrations, and sponsor displays"),
    ("Networking Lounge", "NETWORKING_LOUNGE", "Informal networking and hospitality area"),
    ("Registration Desk", "REGISTRATION", "Attendee registration, help desk, and badge collection"),
    ("Dining Area", "DINING", "Meal service and dining area"),
    ("Banquet Hall", "BANQUET", "Formal dinner, reception, or awards venue"),
    ("Press Room", "PRESS_ROOM", "Media interviews, press briefings, and content work"),
    ("Green Room", "GREEN_ROOM", "Private holding area for speakers and performers"),
    ("Speaker Ready Room", "SPEAKER_READY_ROOM", "Speaker preparation and briefing space"),
    ("Presentation Room", "PRESENTATION", "General presentation and lecture room"),
    ("Open Area", "OPEN_AREA", "Open-plan activation or informal gathering space"),
    ("Virtual / Streaming Stage", "VIRTUAL", "Digital stage for virtual or hybrid live streaming"),
    ("Other / Miscellaneous", "OTHER", "General purpose space or custom setup"),
)


def upgrade() -> None:
    for name, code, description in ROOM_TYPES:
        op.get_bind().execute(
            text(
                """
            INSERT INTO agenda.room_types
              (id, organization_id, name, code, description, is_system, is_active, created_at, updated_at)
            VALUES
              (gen_random_uuid(), NULL, :name, :code, :description, true, true, now(), now())
            ON CONFLICT (code) WHERE organization_id IS NULL DO UPDATE
            SET name = EXCLUDED.name,
                description = EXCLUDED.description,
                is_system = true,
                is_active = true,
                updated_at = now()
                """
            ),
            {"name": name, "code": code, "description": description},
        )


def downgrade() -> None:
    codes = ", ".join(repr(code) for _, code, _ in ROOM_TYPES[7:])
    op.execute(
        "DELETE FROM agenda.room_types "
        f"WHERE organization_id IS NULL AND code IN ({codes})"
    )
