# tests/test_excel_import.py
from __future__ import annotations

import io
import pytest
import uuid
from openpyxl import Workbook
from sqlalchemy.ext.asyncio import AsyncSession
from httpx import AsyncClient

from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_role import ParticipantRole
from tests.conftest import auth_headers


def create_excel_bytes(headers: list[str], rows: list[list[any]]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Participants"
    ws.append(headers)
    for row in rows:
        ws.append(row)
    output = io.BytesIO()
    wb.save(output)
    return output.getvalue()


@pytest.mark.asyncio
async def test_excel_import_success_and_validations(
    db: AsyncSession,
    client: AsyncClient,
    event: Event,
    organizer: User,
):
    # 1. Seed ParticipantRoles for the event
    role_del = ParticipantRole(
        event_id=event.id,
        category="General Attendees",
        name="Delegate",
        role_code="DEL",
        is_active=True,
        is_default=True
    )
    role_vip = ParticipantRole(
        event_id=event.id,
        category="Special Access",
        name="VIP Guest",
        role_code="VIP",
        is_active=True,
        is_default=False
    )
    role_inactive = ParticipantRole(
        event_id=event.id,
        category="Presentation Related",
        name="Keynote Speaker",
        role_code="KEY",
        is_active=False,
        is_default=False
    )
    db.add_all([role_del, role_vip, role_inactive])
    await db.commit()

    # Define headers
    headers = [
        "First Name *",
        "Last Name *",
        "Email Address *",
        "Phone Number",
        "Company/Affiliation",
        "Job Title/Designation",
        "Country",
        "Registration Category *",
        "Paid Status",
        "Source"
    ]

    # Define rows to import:
    # Row 1: Valid Delegate
    # Row 2: Valid VIP Guest
    # Row 3: Missing Name (Skipped)
    # Row 4: Missing Email (Skipped)
    # Row 5: Invalid Email Format (Skipped)
    # Row 6: Inactive Role (Keynote Speaker) (Skipped)
    # Row 7: Valid Delegate duplicate of Row 1 in sheet (Skipped)
    rows = [
        ["Asha", "Mehta", "asha@example.com", "+919876543210", "ACME Corp", "VP", "India", "Delegate (DEL)", "Paid", "excel_import"],
        ["Vip", "User", "vip@example.com", "+1234567890", "VIP Org", "Director", "USA", "VIP Guest", "Unpaid", "excel_import"],
        ["", "Mehta", "noname@example.com", "", "", "", "", "Delegate", "Paid", "excel_import"],
        ["No", "Email", "", "", "", "", "", "Delegate", "Paid", "excel_import"],
        ["Bad", "Email", "bad_email_format", "", "", "", "", "Delegate", "Paid", "excel_import"],
        ["Keynote", "Speaker", "keynote@example.com", "", "", "", "", "Keynote Speaker", "Paid", "excel_import"],
        ["Asha", "Mehta", "asha@example.com", "+919876543210", "ACME Corp", "VP", "India", "Delegate", "Paid", "excel_import"],
    ]

    excel_data = create_excel_bytes(headers, rows)

    # Post file
    files = {"file": ("participants.xlsx", excel_data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    headers_dict = auth_headers(organizer)

    response = await client.post(
        f"/events/{event.id}/participants/import-excel",
        files=files,
        headers=headers_dict
    )

    assert response.status_code == 200
    res_json = response.json()

    assert res_json["inserted"] == 2
    assert res_json["waitlisted"] == 0
    assert res_json["merged"] == 0
    assert res_json["skipped"] == 5

    # Check reasons
    skipped_details = res_json["skipped_details"]
    assert len(skipped_details) == 5

    # Row 3 is index 4 in Excel row-indexing because index 1 is headers, Row 1 is idx 2, Row 2 is idx 3, etc.
    # Actually:
    # rows[0] is Row 2 in Excel: Asha Mehta (idx 2)
    # rows[1] is Row 3 in Excel: Vip User (idx 3)
    # rows[2] is Row 4 in Excel: Missing Name (idx 4)
    # rows[3] is Row 5 in Excel: Missing Email (idx 5)
    # rows[4] is Row 6 in Excel: Invalid Email Format (idx 6)
    # rows[5] is Row 7 in Excel: Inactive Role (idx 7)
    # rows[6] is Row 8 in Excel: Duplicate in Sheet (idx 8)

    assert skipped_details[0]["row"] == 4
    assert "required" in skipped_details[0]["reason"].lower()

    assert skipped_details[1]["row"] == 5
    assert "email" in skipped_details[1]["reason"].lower()

    assert skipped_details[2]["row"] == 6
    assert "format" in skipped_details[2]["reason"].lower()

    assert skipped_details[3]["row"] == 7
    assert "disabled" in skipped_details[3]["reason"].lower() or "not allowed" in skipped_details[3]["reason"].lower()

    assert skipped_details[4]["row"] == 8
    assert "duplicate" in skipped_details[4]["reason"].lower()


@pytest.mark.asyncio
async def test_excel_import_disabled_category(
    db: AsyncSession,
    client: AsyncClient,
    event: Event,
    organizer: User,
):
    # Set general category as disabled in event registration settings
    from app.modules.events.models.event import Event as DBEvent
    db_event = await db.get(DBEvent, event.id)
    db_event.registration_settings = {
        "disabled_categories": ["General Attendees"]
    }
    await db.commit()

    # Seed roles
    role_del = ParticipantRole(
        event_id=event.id,
        category="General Attendees",
        name="Delegate",
        role_code="DEL",
        is_active=True,
        is_default=True
    )
    role_vip = ParticipantRole(
        event_id=event.id,
        category="Special Access",
        name="VIP Guest",
        role_code="VIP",
        is_active=True,
        is_default=False
    )
    db.add_all([role_del, role_vip])
    await db.commit()

    headers = [
        "First Name *",
        "Last Name *",
        "Email Address *",
        "Registration Category *"
    ]
    rows = [
        ["Asha", "Mehta", "asha@example.com", "Delegate"],      # Disabled category
        ["Vip", "User", "vip@example.com", "VIP Guest"]        # Allowed category
    ]

    excel_data = create_excel_bytes(headers, rows)
    files = {"file": ("participants.xlsx", excel_data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    headers_dict = auth_headers(organizer)

    response = await client.post(
        f"/events/{event.id}/participants/import-excel",
        files=files,
        headers=headers_dict
    )

    assert response.status_code == 200
    res_json = response.json()

    assert res_json["inserted"] == 1
    assert res_json["skipped"] == 1
    assert res_json["skipped_details"][0]["row"] == 2
    assert "disabled" in res_json["skipped_details"][0]["reason"].lower() or "not allowed" in res_json["skipped_details"][0]["reason"].lower()
