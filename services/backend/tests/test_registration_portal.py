# tests/test_registration_portal.py
from __future__ import annotations

import pytest
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, Response

from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.registration.schemas.registration_form_config import RegistrationFormConfigUpdate, FormFieldConfig
from app.modules.registration.routers.registration_portal import (
    get_registration_form_config,
    update_registration_form_config,
    get_public_registration_form,
    public_register_participant
)
from tests.conftest import activate_event_for_test


@pytest.mark.asyncio
async def test_get_form_config_default(
    db: AsyncSession,
    event: Event
):
    # Retrieve configuration (should initialize defaults if none exist)
    config = await get_registration_form_config(event=event, response=Response(), db=db)
    
    # Endpoints now return a dict with merged terms_and_conditions
    assert config["event_id"] == event.id
    assert config["is_live"] is False
    assert len(config["fields"]) > 0
    # Check First Name is a default field
    first_name_field = next(f for f in config["fields"] if f["id"] == "first_name")
    assert first_name_field["is_default"] is True
    assert first_name_field["is_required"] is True


@pytest.mark.asyncio
async def test_update_form_config(
    db: AsyncSession,
    event: Event
):
    # Form fields payload
    fields_payload = [
        FormFieldConfig(
            id="name",
            name="name",
            label="Custom Full Name Label",
            type="text",
            is_default=True,
            is_required=True,
            is_active=True
        ),
        FormFieldConfig(
            id="email",
            name="email",
            label="Email Address",
            type="text",
            is_default=True,
            is_required=True,
            is_active=True
        ),
        FormFieldConfig(
            id="custom_diet",
            name="custom_diet",
            label="Dietary Requirements",
            type="text",
            is_default=False,
            is_required=False,
            is_active=True,
            placeholder="Vegan, etc."
        )
    ]
    
    payload = RegistrationFormConfigUpdate(
        is_live=True,
        fields=fields_payload
    )
    
    config = await update_registration_form_config(payload=payload, event=event, db=db)
    
    # Endpoints now return a dict with merged terms_and_conditions
    assert config["is_live"] is True
    assert len(config["fields"]) == 3
    assert config["fields"][0]["label"] == "Custom Full Name Label"
    assert config["fields"][2]["id"] == "custom_diet"


@pytest.mark.asyncio
async def test_get_public_form_closed(
    db: AsyncSession,
    event: Event
):
    await activate_event_for_test(db, event)
    # By default, form config is closed
    form_data = await get_public_registration_form(event_id=event.id, response=Response(), db=db)
    
    assert form_data["event_name"] == event.name
    assert form_data["is_live"] is False
    assert len(form_data["fields"]) > 0


@pytest.mark.asyncio
async def test_public_registration_closed_rejected(
    db: AsyncSession,
    event: Event
):
    # Attempting to register when not live should raise HTTPException (400)
    with pytest.raises(HTTPException) as exc_info:
        await public_register_participant(
            event_id=event.id,
            payload={"name": "John Doe", "email": "johndoe@example.com"},
            db=db
        )
    assert exc_info.value.status_code == 400
    assert "closed" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_public_registration_flow(
    db: AsyncSession,
    event: Event
):
    await activate_event_for_test(db, event)
    # 1. Update form config to live
    fields_payload = [
        FormFieldConfig(
            id="name",
            name="name",
            label="Full Name",
            type="text",
            is_default=True,
            is_required=True,
            is_active=True
        ),
        FormFieldConfig(
            id="email",
            name="email",
            label="Email Address",
            type="text",
            is_default=True,
            is_required=True,
            is_active=True
        ),
        FormFieldConfig(
            id="custom_diet",
            name="custom_diet",
            label="Dietary Requirements",
            type="text",
            is_default=False,
            is_required=False,
            is_active=True
        )
    ]
    
    setup_payload = RegistrationFormConfigUpdate(
        is_live=True,
        fields=fields_payload
    )
    await update_registration_form_config(payload=setup_payload, event=event, db=db)
    
    # 2. Public submission of registration form
    reg_payload = {
        "name": "Jane Miller",
        "email": "janemiller@example.com",
        "role": "Delegate",
        "custom_diet": "Gluten-Free"
    }
    
    res = await public_register_participant(
        event_id=event.id,
        payload=reg_payload,
        db=db
    )
    
    assert res["status"] == "submitted"
    assert res["name"] == "Jane Miller"
    assert "regno" in res
    assert res["regno"] == ""
    
    # Approve the registration to generate Participant record
    from sqlalchemy import select
    from app.modules.registration.models.participant_registration import ParticipantRegistration
    from app.modules.registration.routers.registrations import helper_approve_registration

    stmt = select(ParticipantRegistration).where(
        ParticipantRegistration.event_id == event.id
    )
    reg_obj = (await db.execute(stmt)).scalars().first()
    assert reg_obj is not None

    await helper_approve_registration(db=db, reg=reg_obj, reviewer_id=event.created_by or uuid.uuid4())

    # 3. Try to register with same email again - should fail (400)
    with pytest.raises(HTTPException) as exc_info:
        await public_register_participant(
            event_id=event.id,
            payload=reg_payload,
            db=db
        )
    assert exc_info.value.status_code == 400
    assert "already registered" in exc_info.value.detail.lower()
