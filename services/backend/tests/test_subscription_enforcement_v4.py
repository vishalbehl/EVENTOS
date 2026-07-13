import uuid

import pytest
from sqlalchemy import select

from app.modules.billing.models.event_activation import EventActivation
from app.modules.billing.models.licensing import EntitlementGrant, EventEntitlementSnapshotSet, GrantConsumption
from app.modules.billing.models.subscription import OrganizationSubscription, SubscriptionPlan
from app.modules.identity.models.user import User
from app.modules.rbac.models.user_assignment import UserEventAssignment
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_activation_creates_grant_consumption_and_snapshot(client, db, organization, event, organizer):
    plan = SubscriptionPlan(name="Snapshot Plan", max_events=3, max_event_team_members=2, max_registrations=150)
    db.add(plan)
    await db.flush()
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
        headers=auth_headers(organizer),
    )
    assert res.status_code == 402, res.text
    assert res.json()["detail"]["limit_key"] == "max_event_team_members"


@pytest.mark.asyncio
async def test_billing_plan_supports_multiple_active_subscriptions(client, db, organization, organizer):
    basic = SubscriptionPlan(name="Billing Basic", max_events=1, max_users=2, max_registrations=150)
    pro = SubscriptionPlan(name="Billing Pro", max_events=1, max_users=10, max_registrations=500)
    db.add_all([basic, pro])
    await db.flush()

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
