# tests/test_free_registration_auto_pay.py
import pytest
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_role import ParticipantRole
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.registration.models.ticket_type import TicketType
from app.modules.registration.routers.participants import (
    create_participant,
    update_participant,
    insert_participants,
    fetch_participants_from_speakers
)
from app.modules.registration.routers.registrations import helper_approve_registration
from app.modules.registration.schemas.participant import ParticipantCreate, ParticipantUpdate
from app.modules.events.models.speaker import Speaker
from tests.conftest import activate_event_for_test

@pytest.mark.asyncio
async def test_free_pricing_auto_paid_status(db: AsyncSession, event: Event, organizer: User):
    await activate_event_for_test(db, event)
    # 1. Seed ParticipantRoles
    role_del = ParticipantRole(
        event_id=event.id,
        category="General",
        name="Delegate",
        role_code="DEL",
        is_active=True,
        is_default=True
    )
    role_speaker = ParticipantRole(
        event_id=event.id,
        category="Presenter",
        name="Speaker",
        role_code="SPK",
        is_active=True,
        is_default=False
    )
    role_vip = ParticipantRole(
        event_id=event.id,
        category="VIP",
        name="VIP",
        role_code="VIP",
        is_active=True,
        is_default=False
    )
    db.add_all([role_del, role_speaker, role_vip])
    await db.commit()

    # Enable payments for the event
    event.registration_settings = {
        "payment_enabled": True,
        "tiers": ["Early Bird", "Standard"]
    }
    db.add(event)
    await db.commit()

    # Seed TicketType for VIP (100.0) under active tier 'Early Bird'
    vip_price = TicketType(
        event_id=event.id,
        role_name="VIP",
        tier_name="Early Bird",
        price=100.0
    )
    db.add(vip_price)
    await db.commit()

    # --- Test Case A: create_participant ---
    # Create a Delegate (no price set -> free). Should auto-assign 'Paid' and generate regno.
    del_create = ParticipantCreate(
        name="Delegate Free",
        email="free_del@example.com",
        role="Delegate",
        paid_status="Unpaid"
    )
    p_del = await create_participant(payload=del_create, event=event, idempotency_key=f"test-{uuid.uuid4()}", current_user=organizer, db=db)
    assert p_del.paid_status == "Paid"
    assert p_del.regno is not None

    # Create a VIP (has price 100.0 -> paid). Should NOT override explicitly passed paid_status="Unpaid".
    vip_create = ParticipantCreate(
        name="VIP Paid",
        email="paid_vip@example.com",
        role="VIP",
        paid_status="Unpaid"
    )
    p_vip = await create_participant(payload=vip_create, event=event, idempotency_key=f"test-{uuid.uuid4()}", current_user=organizer, db=db)
    assert p_vip.paid_status == "Unpaid"
    assert p_vip.regno is None

    # --- Test Case B: update_participant ---
    # Update VIP participant's role to Delegate (which is free). Should auto-assign 'Paid' status and generate regno.
    vip_update = ParticipantUpdate(role="Delegate")
    p_vip_updated = await update_participant(participant_id=p_vip.id, payload=vip_update, event=event, current_user=organizer, db=db)
    assert p_vip_updated.role == "Delegate"
    assert p_vip_updated.paid_status == "Paid"
    assert p_vip_updated.regno is not None

    # --- Test Case C: insert_participants (bulk import) ---
    bulk_payload = [
        ParticipantCreate(
            name="Bulk Free",
            email="bulk_free@example.com",
            role="Delegate",
            paid_status="Unpaid"
        ),
        ParticipantCreate(
            name="Bulk VIP",
            email="bulk_vip@example.com",
            role="VIP",
            paid_status="Unpaid"
        )
    ]
    inserted, waitlisted, merged = await insert_participants(db=db, event_id=event.id, payload=bulk_payload, default_source="bulk", idempotency_key=f"test-{uuid.uuid4()}", actor_user_id=organizer.id)
    assert inserted == 2 # both fit in capacity
    
    # Retrieve VIP
    q_vip = select(Participant).where(Participant.email == "bulk_vip@example.com")
    p_bulk_vip = (await db.execute(q_vip)).scalar_one()
    assert p_bulk_vip.paid_status == "Unpaid"
    assert p_bulk_vip.regno is None

    # Retrieve Delegate
    q_del = select(Participant).where(Participant.email == "bulk_free@example.com")
    p_bulk_del = (await db.execute(q_del)).scalar_one()
    assert p_bulk_del.paid_status == "Paid"
    assert p_bulk_del.regno is not None

    # --- Test Case D: fetch_participants_from_speakers ---
    # Create a Speaker in the Speaker model
    speaker_model = Speaker(
        event_id=event.id,
        first_name="Speaker",
        last_name="One",
        email="speaker1@example.com",
        affiliation="Meta",
        designation="Developer",
        country="India",
        upload_token="test_upload_token_speaker1",
        speaker_code="spk1_code"
    )
    db.add(speaker_model)
    await db.commit()

    res = await fetch_participants_from_speakers(
        event=event,
        idempotency_key=f"test-speaker-import-{uuid.uuid4()}",
        current_user=organizer,
        db=db,
    )
    # Check that speaker participant created has Paid status since Speaker role price is unset
    q_spk = select(Participant).where(Participant.email == "speaker1@example.com")
    p_spk = (await db.execute(q_spk)).scalar_one()
    assert p_spk.paid_status == "Paid"
    assert p_spk.regno is not None
