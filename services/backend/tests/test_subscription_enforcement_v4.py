import uuid

import pytest
from sqlalchemy import select

from app.modules.billing.models.event_activation import EventActivation
from app.modules.billing.models.licensing import EntitlementGrant, EventEntitlementSnapshotSet, GrantConsumption
from app.modules.billing.models.subscription import OrganizationSubscription, SubscriptionPlan
from app.modules.identity.models.user import User
from app.modules.rbac.models.user_assignment import UserEventAssignment
from app.config import settings
from tests.conftest import assign_typed_plan_limits, auth_headers


@pytest.mark.asyncio
async def test_activation_creates_grant_consumption_and_snapshot(client, db, organization, event, organizer):
    plan = SubscriptionPlan(name="Snapshot Plan", max_events=3, max_event_team_members=2, max_registrations=150)
    db.add(plan)
    await db.flush()
    await assign_typed_plan_limits(
        db,
        plan,
        max_events=3,
        max_event_team_members=2,
        max_registrations=150,
    )
    sub = OrganizationSubscription(organization_id=organization.id, plan_id=plan.id, status="ACTIVE")
    db.add(sub)
    await db.flush()

    res = await client.post(
        f"/billing/events/{event.id}/activate",
        json={"subscription_id": str(sub.id)},
        headers={**auth_headers(organizer), "Idempotency-Key": "activation-v4-1"},
    )
    assert res.status_code == 200, res.text
    payload = res.json()
    assert payload["grant_id"]
    assert payload["grant_consumption_id"]
    assert payload["snapshot_summary"]["version"] == 1

    grant = await db.scalar(select(EntitlementGrant).where(EntitlementGrant.id == uuid.UUID(payload["grant_id"])))
    consumption = await db.scalar(select(GrantConsumption).where(GrantConsumption.id == uuid.UUID(payload["grant_consumption_id"])))
    snapshot = await db.scalar(select(EventEntitlementSnapshotSet).where(EventEntitlementSnapshotSet.id == uuid.UUID(payload["snapshot_summary"]["id"])))
    assert grant is not None
    assert consumption is not None
    assert consumption.status == "CONSUMED"
    assert snapshot is not None
    assert snapshot.checksum


@pytest.mark.asyncio
async def test_activation_is_idempotent(client, db, organization, event, organizer):
    plan = SubscriptionPlan(name="Idempotent Plan", max_events=1)
    db.add(plan)
    await db.flush()
    await assign_typed_plan_limits(db, plan, max_events=1)
    sub = OrganizationSubscription(organization_id=organization.id, plan_id=plan.id, status="ACTIVE")
    db.add(sub)
    await db.flush()

    headers = {**auth_headers(organizer), "Idempotency-Key": "same-request"}
    first = await client.post(f"/billing/events/{event.id}/activate", json={"subscription_id": str(sub.id)}, headers=headers)
    second = await client.post(f"/billing/events/{event.id}/activate", json={"subscription_id": str(sub.id)}, headers=headers)

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert first.json()["id"] == second.json()["id"]


@pytest.mark.asyncio
async def test_event_team_members_limit_enforced(client, db, organization, event, organizer):
    plan = SubscriptionPlan(name="Seat Plan", max_events=1, max_event_team_members=1)
    db.add(plan)
    await db.flush()
    await assign_typed_plan_limits(
        db,
        plan,
        max_events=1,
        max_event_team_members=1,
    )
    sub = OrganizationSubscription(organization_id=organization.id, plan_id=plan.id, status="ACTIVE")
    db.add(sub)
    await db.flush()

    activate = await client.post(
        f"/billing/events/{event.id}/activate",
        json={"subscription_id": str(sub.id)},
        headers={**auth_headers(organizer), "Idempotency-Key": "seat-activate"},
    )
    assert activate.status_code == 200, activate.text

    extra_user = User(
        organization_id=organization.id,
        email=f"member-{uuid.uuid4().hex[:6]}@test.com",
        password_hash="hash",
        first_name="Extra",
        last_name="Member",
        role="technician",
        is_active=True,
    )
    db.add(extra_user)
    await db.flush()

    res = await client.post(
        "/users/assignments",
        json={"user_id": str(extra_user.id), "event_id": str(event.id), "permissions": {}},
        headers={**auth_headers(organizer), "Idempotency-Key": "assign-extra-seat"},
    )
    assert res.status_code == 402, res.text
    assert res.json()["detail"]["limit_key"] == "max_event_team_members"


@pytest.mark.asyncio
async def test_billing_plan_supports_multiple_active_subscriptions(client, db, organization, organizer):
    basic = SubscriptionPlan(name="Billing Basic", max_events=1, max_users=2, max_registrations=150)
    pro = SubscriptionPlan(name="Billing Pro", max_events=1, max_users=10, max_registrations=500)
    db.add_all([basic, pro])
    await db.flush()
    await assign_typed_plan_limits(
        db,
        basic,
        max_events=1,
        max_users=2,
        max_registrations=150,
    )
    await assign_typed_plan_limits(
        db,
        pro,
        max_events=1,
        max_users=10,
        max_registrations=500,
    )

    older = OrganizationSubscription(organization_id=organization.id, plan_id=basic.id, status="ACTIVE")
    newer = OrganizationSubscription(organization_id=organization.id, plan_id=pro.id, status="ACTIVE")
    db.add_all([older, newer])
    await db.commit()

    res = await client.get("/billing/plan", headers=auth_headers(organizer))
    assert res.status_code == 200, res.text
    payload = res.json()
    assert len(payload["subscriptions"]) == 2
    assert {item["plan_id"] for item in payload["subscriptions"]} == {str(basic.id), str(pro.id)}
    assert payload["usage"]["events"]["max"] == 2


@pytest.mark.asyncio
async def test_public_signup_issues_demo_subscription_and_grant(client, db):
    demo_plan = SubscriptionPlan(
        name=settings.PUBLIC_DEMO_PLAN_NAME,
        max_events=1,
        max_users=2,
        max_event_team_members=2,
        max_registrations=50,
        max_speakers=10,
        max_sessions=10,
        max_rooms=3,
        max_ticket_categories=2,
        max_badge_templates=1,
        max_certificate_templates=1,
        max_emails_per_event=20,
        storage_quota_mb=100,
        is_active=True,
    )
    db.add(demo_plan)
    await db.flush()
    await assign_typed_plan_limits(
        db,
        demo_plan,
        max_events=1,
        max_users=2,
        max_event_team_members=2,
        max_registrations=50,
        max_speakers=10,
        max_sessions=10,
        max_rooms=3,
        max_ticket_categories=2,
        max_badge_templates=1,
        max_certificate_templates=1,
        max_emails_per_event=20,
        storage_quota_mb=100,
    )
    await db.commit()

    suffix = uuid.uuid4().hex[:10]
    response = await client.post(
        "/auth/signup",
        json={
            "org_name": f"Demo {suffix}",
            "slug": f"demo-{suffix}",
            "first_name": "Demo",
            "last_name": "Owner",
            "email": f"demo-{suffix}@example.com",
            "password": "SafeDemoPassword123!",
            "country": "IN",
            "timezone": "Asia/Kolkata",
        },
    )
    assert response.status_code == 201, response.text
    organization_id = uuid.UUID(response.json()["organization"]["id"])

    subscription = await db.scalar(
        select(OrganizationSubscription).where(
            OrganizationSubscription.organization_id == organization_id,
            OrganizationSubscription.plan_id == demo_plan.id,
        )
    )
    assert subscription is not None
    assert subscription.status == "TRIAL"

    grant = await db.scalar(
        select(EntitlementGrant).where(
            EntitlementGrant.organization_id == organization_id,
            EntitlementGrant.subscription_id == subscription.id,
        )
    )
    assert grant is not None
    assert grant.quantity_total == 1
    assert grant.status == "ACTIVE"
