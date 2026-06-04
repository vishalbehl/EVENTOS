# tests/test_portal_enhancements.py
from __future__ import annotations

import uuid
import pytest
from datetime import datetime, timedelta, timezone
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.rbac.models.event import Event
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.registration.models.payment_transaction import PaymentTransaction
from app.modules.registration.models.portal_otp_token import PortalOtpToken
from app.modules.registration.routers.portal_auth import _issue_portal_jwt


@pytest.mark.asyncio
async def test_get_dashboard_data_unapproved(
    client: AsyncClient,
    db: AsyncSession,
    event: Event
):
    # 1. Seed unapproved registration settings with support email and program url
    event.registration_settings = {
        "support_email": "help@test.com",
        "program_url": "https://test.com/program.pdf"
    }
    db.add(event)
    await db.flush()

    from app.modules.notifications.models.announcement import Announcement
    ann1 = Announcement(
        id=uuid.uuid4(),
        event_id=event.id,
        title="ann_1",
        body="Keynote at 9 AM",
        priority="info",
        audience="participants",
        created_at=datetime.now(timezone.utc)
    )
    ann2 = Announcement(
        id=uuid.uuid4(),
        event_id=event.id,
        title="ann_2",
        body="Bring your ID card",
        priority="warning",
        audience="all",
        created_at=datetime.now(timezone.utc) - timedelta(minutes=1)
    )
    db.add_all([ann1, ann2])
    await db.flush()

    # 2. Create an unapproved participant registration (status = pending_review)
    reg_id = uuid.uuid4()
    registration = ParticipantRegistration(
        id=reg_id,
        event_id=event.id,
        registration_status="pending_review",
        registration_data={
            "name": "Jane Unapproved",
            "email": "jane@unapproved.com",
            "phone": "+919999999999",
            "company": "NoCorp",
            "designation": "Researcher",
            "country": "India",
            "role": "Delegate"
        },
        submitted_at=datetime.now(timezone.utc)
    )
    db.add(registration)
    await db.commit()

    # 3. Request dashboard using a signed portal JWT
    token = _issue_portal_jwt("jane@unapproved.com", event.id)
    headers = {"Authorization": f"Bearer {token}"}
    
    resp = await client.get("/api/v1/portal/dashboard", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    
    assert data["event"]["name"] == event.name
    assert data["event"]["support_email"] == "help@test.com"
    assert len(data["event"]["announcements"]) == 2
    assert data["event"]["announcements"][0]["message"] == "Keynote at 9 AM"
    assert data["event"]["announcements"][1]["type"] == "warning"
    assert data["event"]["program_url"] == "https://test.com/program.pdf"
    assert data["registration"]["status"] == "pending_review"
    assert data["participant"]["name"] == "Jane Unapproved"
    assert data["participant"]["email"] == "jane@unapproved.com"
    assert data["participant"]["paid_status"] == "Unpaid"


@pytest.mark.asyncio
async def test_get_dashboard_data_approved_with_payment(
    client: AsyncClient,
    db: AsyncSession,
    event: Event
):
    # 1. Create the Participant record first
    participant = Participant(
        id=uuid.uuid4(),
        event_id=event.id,
        regno="DEL-BOB",
        name="Bob Approved",
        email="bob@approved.com",
        phone="+918888888888",
        company="CorpX",
        designation="Manager",
        country="India",
        role="Delegate",
        paid_status="Paid",
        registered_at=datetime.now(timezone.utc)
    )
    db.add(participant)
    await db.flush()

    # 2. Create an approved registration linked to participant
    reg_id = uuid.uuid4()
    registration = ParticipantRegistration(
        id=reg_id,
        event_id=event.id,
        participant_id=participant.id,
        registration_status="approved",
        registration_data={
            "name": "Bob Approved",
            "email": "bob@approved.com",
            "phone": "+918888888888",
            "company": "CorpX",
            "designation": "Manager",
            "country": "India",
            "role": "Delegate"
        },
        submitted_at=datetime.now(timezone.utc)
    )
    db.add(registration)
    await db.flush()

    # 3. Create a completed PaymentTransaction (using event_id and correct columns)
    tx = PaymentTransaction(
        id=uuid.uuid4(),
        event_id=event.id,
        registration_id=registration.id,
        amount=150.00,
        currency="USD",
        status="completed",
        payment_method="simulated",
        gateway_payment_id="pay_bob_stripe",
        discount_applied=10.00,
        created_at=datetime.now(timezone.utc)
    )
    db.add(tx)
    await db.commit()

    # 4. Request dashboard
    token = _issue_portal_jwt("bob@approved.com", event.id)
    headers = {"Authorization": f"Bearer {token}"}
    
    resp = await client.get("/api/v1/portal/dashboard", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    
    assert data["registration"]["status"] == "approved"
    assert data["participant"]["regno"] == "DEL-BOB"
    assert data["participant"]["paid_status"] == "Paid"
    assert data["payment"] is not None
    assert data["payment"]["status"] == "completed"
    assert data["payment"]["amount"] == 150.00
    assert data["payment"]["discount_applied"] == 10.00


@pytest.mark.asyncio
async def test_update_attendee_details_immediate(
    client: AsyncClient,
    db: AsyncSession,
    event: Event
):
    # 1. Create participant & registration linked together
    participant = Participant(
        id=uuid.uuid4(),
        event_id=event.id,
        regno="DEL-OLD",
        name="Old Name",
        email="edit@test.com",
        phone="1234",
        company="OldCorp",
        role="Delegate",
        paid_status="Unpaid"
    )
    db.add(participant)
    await db.flush()

    reg_id = uuid.uuid4()
    registration = ParticipantRegistration(
        id=reg_id,
        event_id=event.id,
        participant_id=participant.id,
        registration_status="approved",
        registration_data={"name": "Old Name", "email": "edit@test.com", "phone": "1234"},
        submitted_at=datetime.now(timezone.utc)
    )
    db.add(registration)
    await db.commit()

    # 2. Update non-email details (should persist immediately without OTP)
    token = _issue_portal_jwt("edit@test.com", event.id)
    headers = {"Authorization": f"Bearer {token}"}
    
    resp = await client.patch(
        "/api/v1/portal/attendee/details",
        json={"name": "New Name", "company": "NewCorp", "phone": "5678"},
        headers=headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "New Name"
    assert data["company"] == "NewCorp"
    assert data["phone"] == "5678"

    # Verify database state
    db_part = (await db.execute(select(Participant).where(Participant.email == "edit@test.com"))).scalar_one()
    assert db_part.name == "New Name"
    assert db_part.company == "NewCorp"


@pytest.mark.asyncio
async def test_email_update_with_otp_flow(
    client: AsyncClient,
    db: AsyncSession,
    event: Event
):
    # Enable registration & ensure it's allowed
    event.registration_settings = {"edit_cutoff_days": 0}
    event.status = "live"
    db.add(event)
    await db.flush()

    # Create participant & registration linked together (status = not_registered so change is allowed)
    participant = Participant(
        id=uuid.uuid4(),
        event_id=event.id,
        regno="DEL-ALICE",
        name="Alice",
        email="alice@old.com",
        paid_status="Unpaid"
    )
    db.add(participant)
    await db.flush()

    reg_id = uuid.uuid4()
    registration = ParticipantRegistration(
        id=reg_id,
        event_id=event.id,
        participant_id=participant.id,
        registration_status="not_registered",
        registration_data={"name": "Alice", "email": "alice@old.com"},
        submitted_at=datetime.now(timezone.utc)
    )
    db.add(registration)
    await db.commit()

    token = _issue_portal_jwt("alice@old.com", event.id)
    headers = {"Authorization": f"Bearer {token}"}

    # Step 1: Request OTP for new email
    resp = await client.post(
        "/api/v1/portal/attendee/request-email-update",
        json={"new_email": "alice@new.com"},
        headers=headers
    )
    assert resp.status_code == 200
    assert "message" in resp.json()

    # Fetch OTP from the database
    otp_row = (await db.execute(
        select(PortalOtpToken).where(PortalOtpToken.email == "alice@new.com")
    )).scalar_one()
    
    from app.modules.registration.routers.portal_dashboard import _hash_otp
    otp_code = "654321"
    otp_row.otp_hash = _hash_otp(otp_code)
    await db.commit()

    # Step 2: PATCH with wrong OTP (should fail)
    resp = await client.patch(
        "/api/v1/portal/attendee/details",
        json={"new_email": "alice@new.com", "otp": "000000", "name": "Alice Updated"},
        headers=headers
    )
    assert resp.status_code == 401
    assert "Invalid OTP" in resp.json()["detail"]

    # Step 3: PATCH with correct OTP (should succeed, return new token, and update DB)
    resp = await client.patch(
        "/api/v1/portal/attendee/details",
        json={"new_email": "alice@new.com", "otp": otp_code, "name": "Alice Updated"},
        headers=headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Alice Updated"
    assert data["new_token"] is not None

    # Verify database updates
    # Old email row shouldn't exist anymore
    old_part = (await db.execute(select(Participant).where(Participant.email == "alice@old.com"))).scalar_one_or_none()
    assert old_part is None

    new_part = (await db.execute(select(Participant).where(Participant.email == "alice@new.com"))).scalar_one()
    assert new_part.name == "Alice Updated"
    assert new_part.regno == "DEL-ALICE"


@pytest.mark.asyncio
async def test_email_update_blocked_after_registration(
    client: AsyncClient,
    db: AsyncSession,
    event: Event
):
    # Enable registration & ensure it's allowed
    event.registration_settings = {"edit_cutoff_days": 0}
    event.status = "live"
    db.add(event)
    await db.flush()

    # Create participant & registration linked together (status = approved, which blocks email edits)
    participant = Participant(
        id=uuid.uuid4(),
        event_id=event.id,
        regno="DEL-CHARLIE",
        name="Charlie",
        email="charlie@old.com",
        paid_status="Unpaid"
    )
    db.add(participant)
    await db.flush()

    reg_id = uuid.uuid4()
    registration = ParticipantRegistration(
        id=reg_id,
        event_id=event.id,
        participant_id=participant.id,
        registration_status="approved",
        registration_data={"name": "Charlie", "email": "charlie@old.com"},
        submitted_at=datetime.now(timezone.utc)
    )
    db.add(registration)
    await db.commit()

    token = _issue_portal_jwt("charlie@old.com", event.id)
    headers = {"Authorization": f"Bearer {token}"}

    # Attempting to request email update OTP should fail with HTTP 400
    resp = await client.post(
        "/api/v1/portal/attendee/request-email-update",
        json={"new_email": "charlie@new.com"},
        headers=headers
    )
    assert resp.status_code == 400
    assert "cannot be changed after registration" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_checkout_excel_imported_participant_synthesis(
    client: AsyncClient,
    db: AsyncSession,
    event: Event
):
    from app.modules.registration.models.registration_form_config import RegistrationFormConfig

    # 1. Seed RegistrationFormConfig to ensure config.is_live is True
    config = RegistrationFormConfig(
        event_id=event.id,
        is_live=True,
        fields=[]
    )
    db.add(config)
    
    # 2. Seed manual/imported Participant (no ParticipantRegistration row)
    participant = Participant(
        id=uuid.uuid4(),
        event_id=event.id,
        regno="",
        name="Excel Import",
        email="excel@imported.com",
        phone="+917777777777",
        company="ExcelCorp",
        designation="Analyst",
        country="India",
        role="Delegate",
        paid_status="Unpaid",
        registered_at=datetime.now(timezone.utc)
    )
    db.add(participant)
    await db.commit()

    token = _issue_portal_jwt("excel@imported.com", event.id)
    headers = {"Authorization": f"Bearer {token}"}

    # 3. Call GET /portal/dashboard to trigger auto-synthesis of the ParticipantRegistration record
    resp_dash = await client.get("/api/v1/portal/dashboard", headers=headers)
    assert resp_dash.status_code == 200
    data_dash = resp_dash.json()
    assert data_dash["registration"]["status"] == "approved"
    assert data_dash["participant"]["email"] == "excel@imported.com"

    # Verify registration row was created
    stmt = select(ParticipantRegistration).where(
        ParticipantRegistration.event_id == event.id,
        ParticipantRegistration.participant_id == participant.id
    )
    reg_row = (await db.execute(stmt)).scalar_one_or_none()
    assert reg_row is not None
    assert reg_row.registration_data["name"] == "Excel Import"

    # 4. Call POST /portal/attendee/payment/checkout and ensure it succeeds
    resp_checkout = await client.post(
        "/api/v1/portal/attendee/payment/checkout",
        json={"redirect_base_url": "http://localhost:3000/callback"},
        headers=headers
    )
    assert resp_checkout.status_code == 200
    data_checkout = resp_checkout.json()
    assert data_checkout["checkout_required"] is False  # Defaults to Free checkout since payment is disabled or total_price is 0
    assert data_checkout["status"] == "Paid"


def test_dynamic_template_defaults_loading():
    from app.services.template_defaults import (
        get_default_registration_terms,
        get_default_registration_faqs,
        get_default_speaker_terms,
        get_default_speaker_faqs
    )
    reg_terms = get_default_registration_terms()
    assert "Registration Portal Terms & Conditions" in reg_terms
    assert "1. Registration" in reg_terms

    reg_faqs = get_default_registration_faqs()
    assert len(reg_faqs) > 0
    assert reg_faqs[0]["q"] == "How do I register?"
    assert "Complete the registration form" in reg_faqs[0]["a"]

    spk_terms = get_default_speaker_terms()
    assert "Speaker Portal Terms & Conditions" in spk_terms
    assert "1. Ownership" in spk_terms

    spk_faqs = get_default_speaker_faqs()
    assert len(spk_faqs) > 0
    assert spk_faqs[0]["q"] == "How do I access the Speaker Portal?"


