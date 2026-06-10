# tests/test_payments.py
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.registration.models.promo_code import PromoCode
from app.modules.registration.models.payment_transaction import PaymentTransaction
from app.modules.registration.models.ticket_type import TicketType
from app.modules.registration.models.registration_form_config import RegistrationFormConfig
from app.modules.registration.services.pricing_service import get_active_tier
from app.modules.registration.models.participant_registration import ParticipantRegistration
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_get_active_tier_cutoffs(db: AsyncSession, event: Event):
    # Setup cutoffs: Early Bird expires in 1 day, Standard expires in 2 days
    now = datetime.now(timezone.utc)
    early_bird_cutoff = (now + timedelta(days=1)).isoformat()
    standard_cutoff = (now + timedelta(days=2)).isoformat()

    event.registration_settings = {
        "tiers": ["Early Bird", "Standard"],
        "tier_cutoffs": {
            "Early Bird": early_bird_cutoff,
            "Standard": standard_cutoff
        }
    }
    db.add(event)
    await db.commit()
    await db.refresh(event)

    # active tier should be Early Bird
    assert get_active_tier(event) == "Early Bird"

    # Setup cutoffs: Early Bird expired 1 day ago, Standard expires in 1 day
    expired_early_bird = (now - timedelta(days=1)).isoformat()
    event.registration_settings = {
        "tiers": ["Early Bird", "Standard"],
        "tier_cutoffs": {
            "Early Bird": expired_early_bird,
            "Standard": standard_cutoff
        }
    }
    db.add(event)
    await db.commit()
    await db.refresh(event)

    # active tier should now be Standard
    assert get_active_tier(event) == "Standard"


@pytest.mark.asyncio
async def test_promo_code_validation(client: AsyncClient, db: AsyncSession, event: Event):
    # 1. Setup Registration Form Config (must be live to validate)
    config = RegistrationFormConfig(
        event_id=event.id,
        is_live=True,
        fields=[
            {"id": "name", "name": "name", "label": "Full Name", "type": "text", "is_default": True, "is_required": True, "is_active": True},
            {"id": "email", "name": "email", "label": "Email Address", "type": "email", "is_default": True, "is_required": True, "is_active": True},
            {"id": "role", "name": "role", "label": "Category", "type": "select", "is_default": True, "is_required": True, "is_active": True, "options": ["Delegate"]}
        ]
    )
    db.add(config)

    # 2. Seed Ticket Price
    ticket = TicketType(
        event_id=event.id,
        role_name="Delegate",
        tier_name="Standard",
        price=1000.0
    )
    db.add(ticket)

    # 3. Create active promo code
    promo = PromoCode(
        event_id=event.id,
        code="SAVE10",
        discount_type="percentage",
        discount_value=10.0,
        max_uses=5,
        used_count=0,
        is_active=True
    )
    db.add(promo)
    
    # 4. Set event registration settings
    event.registration_settings = {
        "payment_enabled": True,
        "active_gateway": "simulated",
        "tiers": ["Standard"],
        "tier_cutoffs": {}
    }
    db.add(event)
    await db.commit()

    # Validate active promo
    validate_payload = {
        "code": "save10",
        "role": "Delegate"
    }
    resp = await client.post(
        f"/portal/registration/{event.id}/promo/validate",
        json=validate_payload
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid"] is True
    assert data["discount_amount"] == 100.0
    assert data["total_price"] == 900.0

    # Inactive Promo Code
    promo.is_active = False
    await db.commit()

    resp = await client.post(
        f"/portal/registration/{event.id}/promo/validate",
        json=validate_payload
    )
    assert resp.status_code == 400
    assert "inactive" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_simulated_checkout_flow(client: AsyncClient, db: AsyncSession, event: Event):
    # 1. Setup Form config (live)
    config = RegistrationFormConfig(
        event_id=event.id,
        is_live=True,
        fields=[
            {"id": "name", "name": "name", "label": "Full Name", "type": "text", "is_default": True, "is_required": True, "is_active": True},
            {"id": "email", "name": "email", "label": "Email", "type": "email", "is_default": True, "is_required": True, "is_active": True},
            {"id": "role", "name": "role", "label": "Category", "type": "select", "is_default": True, "is_required": True, "is_active": True, "options": ["Delegate"]}
        ]
    )
    db.add(config)

    # 2. Setup price and settings
    ticket = TicketType(
        event_id=event.id,
        role_name="Delegate",
        tier_name="Standard",
        price=500.0
    )
    db.add(ticket)

    event.registration_settings = {
        "payment_enabled": True,
        "active_gateway": "simulated",
        "tiers": ["Standard"],
        "tier_cutoffs": {},
        "auto_approve_paid": True
    }
    db.add(event)
    await db.commit()

    # 3. Request Checkout
    checkout_payload = {
        "formData": {
            "name": "Alex Mercer",
            "email": "alex@example.com",
            "role": "Delegate"
        },
        "redirect_base_url": "http://localhost:3000/registration"
    }

    resp = await client.post(
        f"/portal/registration/{event.id}/payment/checkout",
        json=checkout_payload
    )
    assert resp.status_code == 200
    checkout_data = resp.json()
    assert checkout_data["checkout_required"] is True
    assert checkout_data["payment_details"]["provider"] == "simulated"
    
    session_id = checkout_data["payment_details"]["gateway_order_id"]
    assert session_id.startswith("sim_")

    # 4. Verify Simulated Payment
    verify_payload = {
        "gateway": "simulated",
        "session_id": session_id
    }

    resp_verify = await client.post(
        f"/portal/registration/{event.id}/payment/verify",
        json=verify_payload
    )
    assert resp_verify.status_code == 200
    verify_data = resp_verify.json()
    assert verify_data["status"] == "approved"
    assert verify_data["name"] == "Alex Mercer"
    assert verify_data["role"] == "Delegate"
    assert verify_data["regno"] != ""
