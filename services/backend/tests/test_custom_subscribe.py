import pytest
import uuid
from datetime import datetime, timezone
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from tests.conftest import auth_headers

from app.modules.identity.models.user import User
from app.modules.identity.services.auth_service import hash_password
from app.modules.platform.models.organization import Organization
from app.modules.billing.models.subscription import SubscriptionPlan, Addon, SubscriptionTransaction, OrganizationSubscription
from app.modules.platform.models.platform_domain_tables import TenantLimit

@pytest.fixture(autouse=True)
async def seed_billing_data(db: AsyncSession):
    """Seed the database with default subscription plans and addons needed for testing."""
    basic_plan = SubscriptionPlan(
        name="Basic",
        tagline="Registration + Speaker Management",
        description="Perfect for small events and basic registration.",
        billing_model="PER_EVENT",
        currency="INR",
        price_per_event=15000.0,
        max_events=1,
        max_users=2,
        max_registrations=150,
        max_speakers=30,
        max_sessions=25,
        max_rooms=5,
        max_ticket_categories=3,
        max_badge_templates=3,
        max_certificate_templates=3,
        storage_quota_mb=10240, # 10 GB
        display_order=1,
        is_popular=False,
        color_hex="#64748B",
        is_active=True
    )
    db.add(basic_plan)
    
    professional_plan = SubscriptionPlan(
        name="Professional",
        tagline="Registration + Speaker + Campaigns + Venue Operations",
        description="For scaling events needing advanced workflows and badge printing.",
        billing_model="PER_EVENT",
        currency="INR",
        price_per_event=60000.0,
        max_events=1,
        max_users=10,
        max_registrations=1000,
        max_speakers=100,
        max_sessions=100,
        max_rooms=20,
        max_ticket_categories=10,
        storage_quota_mb=51200, # 50 GB
        display_order=2,
        is_popular=True,
        color_hex="#4F46E5",
        is_active=True
    )
    db.add(professional_plan)
    
    whatsapp_addon = Addon(
        name="WhatsApp Integration",
        key="ADDON_WHATSAPP",
        description="WhatsApp notifications and communication for attendees and speakers",
        price_inr=10000.0,
        billing_unit="PER_EVENT",
        available_for_plans=["PROFESSIONAL", "ENTERPRISE"],
        is_optional_for_plan="PROFESSIONAL",
        included_in_plan="ENTERPRISE",
        is_active=True
    )
    db.add(whatsapp_addon)
    await db.flush()

@pytest.fixture
async def organizer(db: AsyncSession, organization: Organization) -> User:
    """Create and persist an owner User for subscription tests."""
    user = User(
        organization_id=organization.id,
        email=f"organizer-{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("testpassword123"),
        first_name="Test",
        last_name="Owner",
        role="organiser",
        is_active=True,
    )
    db.add(user)
    await db.flush()

    # Create OrganizationMember with org_role="owner"
    from app.modules.rbac.models.organization_member import OrganizationMember
    membership = OrganizationMember(
        user_id=user.id,
        organization_id=organization.id,
        org_role="owner",
        is_active=True,
        accepted_at=datetime.now(timezone.utc)
    )
    db.add(membership)
    await db.flush()
    return user


@pytest.mark.asyncio
async def test_billing_metadata_endpoints(client: AsyncClient, organizer, db: AsyncSession):
    headers = auth_headers(organizer)
    
    # Ensure plans list returns pricing metadata
    response = await client.get("/organisations/plans", headers=headers)
    assert response.status_code == 200
    plans = response.json()
    assert len(plans) >= 1
    
    # Check that basic pricing columns are included
    basic_plan = next(p for p in plans if p["name"].lower() == "basic")
    assert "price_per_event" in basic_plan
    assert "currency" in basic_plan
    assert basic_plan["price_per_event"] == 15000.0
    
    # Check addons list endpoint
    response_addons = await client.get("/organisations/addons", headers=headers)
    assert response_addons.status_code == 200
    addons = response_addons.json()
    assert len(addons) >= 1
    
    whatsapp_addon = next(a for a in addons if a["key"] == "ADDON_WHATSAPP")
    assert whatsapp_addon["price_inr"] == 10000.0

@pytest.mark.asyncio
async def test_pricing_calculator(client: AsyncClient, organizer, db: AsyncSession):
    headers = auth_headers(organizer)
    
    # Calculate price for standard plan
    payload = {
        "plan_name": "Basic",
        "is_custom": False,
        "custom_limits": None,
        "addon_keys": None,
        "promo_code": None
    }
    response = await client.post("/organisations/calculate-price", json=payload, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 15000.0
    assert data["number_of_events"] == 1
    
    # Calculate price for custom plan (extra users, extra registrations, extra events, addons, promo code)
    payload_custom = {
        "plan_name": "Basic",
        "is_custom": True,
        "custom_limits": {
            "max_events": 3,
            "max_users": 5,           # 3 extra users beyond Basic default (2) -> 3 * 1500 = 4500 per event
            "max_registrations": 200, # 50 extra registrations beyond Basic default (150) -> 50 * 5 = 250 per event
            "max_storage_gb": 12      # 2 extra GB beyond Basic default (10) -> 2 * 200 = 400 per event
        },
        "addon_keys": ["ADDON_WHATSAPP"],  # WhatsApp is 10000 per event
        "promo_code": "EVENTOS50"          # 50% discount
    }
    response_custom = await client.post("/organisations/calculate-price", json=payload_custom, headers=headers)
    assert response_custom.status_code == 200
    data_custom = response_custom.json()
    
    # Price per event: base (15000) + extra users (4500) + extra reg (250) + extra storage (400) + WhatsApp addon (10000) = 30150
    # Total for 3 events: 30150 * 3 = 90450
    # Discount (50%): 45225
    # Total: 45225
    assert data_custom["price_per_event"] == 30150.0
    assert data_custom["subtotal"] == 90450.0
    assert data_custom["discount"] == 45225.0
    assert data_custom["total"] == 45225.0

@pytest.mark.asyncio
async def test_organizer_subscription_mutation_requires_command_center(
    client: AsyncClient,
    organizer,
    db: AsyncSession,
):
    payload = {
        "plan_name": "Basic",
        "is_custom": True,
        "custom_limits": {
            "max_events": 3,
            "max_users": 5,
            "max_registrations": 200,
            "max_storage_gb": 12,
        },
        "addon_keys": ["ADDON_WHATSAPP"],
        "promo_code": "EVENTOS50",
        "billing_name": "Acme Corp",
        "billing_email": "billing@acme.org",
        "billing_phone": "+919988776655",
        "gst_number": "27AAPCS1081F1Z1",
        "cardholder_name": "John Doe",
        "card_number": "4000123456789010",
        "expiry": "12/29",
        "cvv": "123",
    }

    response = await client.post(
        "/organisations/me/subscribe",
        json=payload,
        headers=auth_headers(organizer),
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "COMMAND_CENTER_APPROVAL_REQUIRED"
    assert await db.scalar(
        select(SubscriptionTransaction).where(
            SubscriptionTransaction.organization_id == organizer.organization_id
        )
    ) is None
    assert await db.scalar(
        select(OrganizationSubscription).where(
            OrganizationSubscription.organization_id == organizer.organization_id
        )
    ) is None
    assert (
        await db.scalars(
            select(TenantLimit).where(
                TenantLimit.organization_id == organizer.organization_id
            )
        )
    ).all() == []


@pytest.mark.asyncio
async def test_subscription_deletion_requires_governed_workflow(
    client: AsyncClient,
    organizer,
    super_admin,
):
    response = await client.request(
        "DELETE",
        f"/platform/organizations/{organizer.organization_id}/subscription",
        headers=auth_headers(super_admin),
        json={"reason": "Attempt an unapproved direct commercial mutation."},
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "DUAL_APPROVAL_REQUIRED"
