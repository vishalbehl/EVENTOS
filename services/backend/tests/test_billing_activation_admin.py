import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.modules.billing.models.licensing import EventEntitlementSnapshotSet
from app.modules.billing.models.subscription import OrganizationSubscription, SubscriptionPlan
from app.modules.billing.services.activation_service import ActivationService
from app.modules.billing.services.entitlement_resolver import EntitlementResolver
from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from tests.conftest import auth_headers


SUPPORT_REASON = "Inspecting deterministic activation entitlement case BILL-4096"


def support_headers(user: User, idempotency_key: str | None = None) -> dict[str, str]:
    headers = {**auth_headers(user), "X-Support-Reason": SUPPORT_REASON}
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    return headers


@pytest.mark.asyncio
async def test_activation_inspection_is_snapshot_first_tenant_scoped_and_explainable(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organization: Organization,
    event: Event,
):
    plan = SubscriptionPlan(
        name=f"Inspection Plan {uuid.uuid4().hex[:8]}",
        max_events=2,
        max_registrations=150,
        max_speakers=30,
        max_sessions=30,
        max_rooms=5,
    )
    db.add(plan)
    await db.flush()
    subscription = OrganizationSubscription(
        organization_id=organization.id,
        plan_id=plan.id,
        status="ACTIVE",
    )
    db.add(subscription)
    await db.flush()
    activation = await ActivationService.activate_event(
        db,
        organization_id=organization.id,
        event_id=event.id,
        subscription_id=subscription.id,
        grant_id=None,
        activation_policy="SNAPSHOT_REFRESHABLE",
        idempotency_key=f"activate-{uuid.uuid4()}",
        actor_id=super_admin.id,
    )
    await db.commit()

    response = await client.get(
        f"/superadmin/billing-admin/activations/{activation.id}?organization_id={organization.id}",
        headers=support_headers(super_admin),
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["activation"]["id"] == str(activation.id)
    assert payload["activation"]["grant_consumption_id"] is not None
    assert payload["current_snapshot"]["version"] == 1
    assert payload["current_snapshot"]["is_current"] is True
    registration_limit = next(item for item in payload["limits"] if item["limit_key"] == "max_registrations")
    assert registration_limit == {
        **registration_limit,
        "limit_value": 150,
        "usage_value": 0,
        "remaining_value": 150,
        "usage_strategy": "LIVE_COUNT",
        "denial_reason": None,
    }

    other_org = Organization(
        name="Activation Inspection Other Tenant",
        slug=f"activation-inspection-{uuid.uuid4().hex[:8]}",
        plan="pro",
    )
    db.add(other_org)
    await db.commit()
    cross_tenant = await client.get(
        f"/superadmin/billing-admin/activations/{activation.id}?organization_id={other_org.id}",
        headers=support_headers(super_admin),
    )
    assert cross_tenant.status_code == 404


@pytest.mark.asyncio
async def test_snapshot_refresh_is_explicit_idempotent_and_missing_snapshot_fails_closed(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organization: Organization,
    event: Event,
):
    plan = SubscriptionPlan(name=f"Refresh Plan {uuid.uuid4().hex[:8]}", max_events=1)
    db.add(plan)
    await db.flush()
    subscription = OrganizationSubscription(
        organization_id=organization.id,
        plan_id=plan.id,
        status="ACTIVE",
    )
    db.add(subscription)
    await db.flush()
    activation = await ActivationService.activate_event(
        db,
        organization_id=organization.id,
        event_id=event.id,
        subscription_id=subscription.id,
        grant_id=None,
        activation_policy="SNAPSHOT_REFRESHABLE",
        idempotency_key=f"activate-{uuid.uuid4()}",
        actor_id=super_admin.id,
    )
    await db.commit()

    refresh_key = f"refresh-{uuid.uuid4()}"
    url = f"/superadmin/billing-admin/activations/{activation.id}/refresh-snapshot?organization_id={organization.id}"
    body = {
        "resolution_reason": "CONTRACT_AMENDMENT",
        "reason": "Applying approved contract amendment to this event snapshot",
    }
    first = await client.post(url, json=body, headers=support_headers(super_admin, refresh_key))
    assert first.status_code == 200, first.text
    assert first.json()["current_snapshot"]["version"] == 2

    replay = await client.post(url, json=body, headers=support_headers(super_admin, refresh_key))
    assert replay.status_code == 200, replay.text
    assert replay.json()["current_snapshot"]["version"] == 2
    async with TenantContextGuard.scoped(db, organization.id):
        snapshot_count = await db.scalar(
            select(func.count(EventEntitlementSnapshotSet.id)).where(
                EventEntitlementSnapshotSet.activation_id == activation.id
            )
        )
        assert snapshot_count == 2

        activation.current_snapshot_set_id = None
        await db.flush()
        resolved = await EntitlementResolver.resolve_event_entitlements(
            db, organization.id, event.id, explain=True
        )
        assert resolved["features"] == {}
        assert resolved["limits"] == {}
        assert resolved["denial_reason"] == "SNAPSHOT_REQUIRED"
