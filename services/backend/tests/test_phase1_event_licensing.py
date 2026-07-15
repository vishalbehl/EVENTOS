import uuid
from datetime import datetime, timezone
from unittest.mock import patch
import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.modules.billing.models.event_activation import EventActivation
from app.modules.billing.models.subscription import (
    SubscriptionPlan,
    OrganizationSubscription,
    OrganizationAddon,
    Addon,
    PlanFeature,
    AddonFeature,
    OrganizationFeature
)
from app.modules.platform.models.feature import FeatureCatalog
from app.modules.platform.models.platform_domain_tables import TenantLimit
from app.modules.billing.services.entitlement_resolver import EntitlementResolver
from app.modules.billing.services.activation_service import ActivationService
from app.modules.billing.services.limit_guard import LimitGuard
from app.modules.events.models.event import Event
from scripts.backfill_event_activations import backfill
from tests.conftest import auth_headers


# ── 1. EventActivation Model & Uniqueness ───────────────────────

@pytest.mark.asyncio
async def test_event_activation_model_and_uniqueness(db, organization, event):
    # Setup a test plan and subscription
    plan = SubscriptionPlan(name="Test Pro Plan", max_events=5)
    db.add(plan)
    await db.flush()

    sub = OrganizationSubscription(
        organization_id=organization.id,
        plan_id=plan.id,
        status="ACTIVE"
    )
    db.add(sub)
    await db.flush()

    # Create first active activation
    act1 = EventActivation(
        organization_id=organization.id,
        event_id=event.id,
        subscription_id=sub.id,
        status="ACTIVE"
    )
    db.add(act1)
    await db.flush()

    # Try to create a second ACTIVE activation for the same event (should fail on partial unique index)
    # Using nested transaction (savepoint) to catch constraint error without corrupting session
    async with db.begin_nested():
        act2 = EventActivation(
            organization_id=organization.id,
            event_id=event.id,
            subscription_id=sub.id,
            status="ACTIVE"
        )
        db.add(act2)
        with pytest.raises(IntegrityError):
            await db.flush()

    # Deactivating the first activation
    act1.status = "DEACTIVATED"
    await db.flush()

    # Now we should be able to create a new ACTIVE activation for the same event
    act3 = EventActivation(
        organization_id=organization.id,
        event_id=event.id,
        subscription_id=sub.id,
        status="ACTIVE"
    )
    db.add(act3)
    await db.flush()

    # Check database
    stmt = select(EventActivation).where(EventActivation.event_id == event.id)
    res = await db.execute(stmt)
    activations = res.scalars().all()
    assert len(activations) == 2


# ── 2. Addon Mutual Exclusion Scope Validation ─────────────────

@pytest.mark.asyncio
async def test_organization_addon_scope_validation(db, organization, event):
    addon = Addon(name="SMS Addon", key="ADDON_SMS")
    db.add(addon)
    await db.flush()

    # Setup subscription
    plan = SubscriptionPlan(name="SMS Plan")
    db.add(plan)
    await db.flush()
    sub = OrganizationSubscription(organization_id=organization.id, plan_id=plan.id, status="ACTIVE")
    db.add(sub)
    await db.flush()

    activation = EventActivation(
        organization_id=organization.id,
        event_id=event.id,
        subscription_id=sub.id,
        status="ACTIVE"
    )
    db.add(activation)
    await db.flush()

    # Setting both event_id and activation_id must raise ValueError
    with pytest.raises(ValueError, match="An addon cannot be scoped to both an event and an activation simultaneously"):
        org_addon = OrganizationAddon(
            organization_id=organization.id,
            addon_id=addon.id,
            event_id=event.id,
            activation_id=activation.id
        )


# ── 3. Entitlement Resolver base plan features ──────────────────

@pytest.mark.asyncio
async def test_entitlement_resolver_base_plan_features(db, organization):
    plan = SubscriptionPlan(name="Plan Alpha")
    db.add(plan)
    await db.flush()

    feature = FeatureCatalog(key="FEAT_ALPHA", name="Alpha Feature", category="test")
    db.add(feature)
    await db.flush()

    plan_feat = PlanFeature(plan_id=plan.id, feature_id=feature.id, enabled=True)
    db.add(plan_feat)

    sub = OrganizationSubscription(organization_id=organization.id, plan_id=plan.id, status="ACTIVE")
    db.add(sub)
    await db.flush()

    has_alpha = await EntitlementResolver.has_feature(db, organization.id, "FEAT_ALPHA")
    assert has_alpha is True

    has_beta = await EntitlementResolver.has_feature(db, organization.id, "FEAT_BETA")
    assert has_beta is False


# ── 4. Entitlement Resolver addon features scoping ──────────────

@pytest.mark.asyncio
async def test_entitlement_resolver_addon_features_scoping(db, organization, event):
    # Setup base plan & subscription
    plan = SubscriptionPlan(name="Plan Gamma")
    db.add(plan)
    await db.flush()
    sub = OrganizationSubscription(organization_id=organization.id, plan_id=plan.id, status="ACTIVE")
    db.add(sub)
    await db.flush()

    # Features
    feat_org = FeatureCatalog(key="FEAT_ORG_WIDE", name="Org Feature", category="test")
    feat_evt = FeatureCatalog(key="FEAT_EVT_SCOPED", name="Evt Feature", category="test")
    feat_act = FeatureCatalog(key="FEAT_ACT_SCOPED", name="Act Feature", category="test")
    db.add_all([feat_org, feat_evt, feat_act])
    await db.flush()

    # Addons
    addon_org = Addon(name="Org Addon", key="ADDON_ORG")
    addon_evt = Addon(name="Evt Addon", key="ADDON_EVT")
    addon_act = Addon(name="Act Addon", key="ADDON_ACT")
    db.add_all([addon_org, addon_evt, addon_act])
    await db.flush()

    # Link features to addons
    db.add_all([
        AddonFeature(addon_id=addon_org.id, feature_id=feat_org.id),
        AddonFeature(addon_id=addon_evt.id, feature_id=feat_evt.id),
        AddonFeature(addon_id=addon_act.id, feature_id=feat_act.id),
    ])
    await db.flush()

    # 1. Org-scoped addon
    db.add(OrganizationAddon(organization_id=organization.id, addon_id=addon_org.id, status="ACTIVE"))
    # 2. Event-scoped addon (linked to event)
    db.add(OrganizationAddon(organization_id=organization.id, addon_id=addon_evt.id, event_id=event.id, status="ACTIVE"))
    await db.flush()

    # Activation creates the immutable v1 snapshot containing current event inputs.
    activation = await ActivationService.activate_event(
        db,
        organization_id=organization.id,
        event_id=event.id,
        subscription_id=sub.id,
        grant_id=None,
        activation_policy="SNAPSHOT_REFRESHABLE",
        idempotency_key=f"addon-activation-{uuid.uuid4()}",
        actor_id=None,
    )

    # Activation-scoped changes become effective only through an explicit snapshot refresh.
    await db.flush()
    db.add(OrganizationAddon(organization_id=organization.id, addon_id=addon_act.id, activation_id=activation.id, status="ACTIVE"))
    await db.flush()
    await ActivationService.refresh_snapshot(
        db,
        activation_id=activation.id,
        organization_id=organization.id,
        idempotency_key=f"addon-refresh-{uuid.uuid4()}",
        actor_id=None,
    )

    # Verify Org-scoped is active generally
    assert await EntitlementResolver.has_feature(db, organization.id, "FEAT_ORG_WIDE") is True

    # Verify Event-scoped and Activation-scoped are NOT active without event context
    assert await EntitlementResolver.has_feature(db, organization.id, "FEAT_EVT_SCOPED") is False
    assert await EntitlementResolver.has_feature(db, organization.id, "FEAT_ACT_SCOPED") is False

    # Verify Event-scoped and Activation-scoped ARE active with event context
    assert await EntitlementResolver.has_feature(db, organization.id, "FEAT_EVT_SCOPED", event_id=event.id) is True
    assert await EntitlementResolver.has_feature(db, organization.id, "FEAT_ACT_SCOPED", event_id=event.id) is True


# ── 5. Entitlement Resolver Feature Overrides ───────────────────

@pytest.mark.asyncio
async def test_entitlement_resolver_feature_overrides(db, organization):
    plan = SubscriptionPlan(name="Plan Delta")
    db.add(plan)
    await db.flush()

    feat = FeatureCatalog(key="FEAT_OVERRIDE", name="Override Feature", category="test")
    db.add(feat)
    await db.flush()

    # Enable in plan
    db.add(PlanFeature(plan_id=plan.id, feature_id=feat.id, enabled=True))
    db.add(OrganizationSubscription(organization_id=organization.id, plan_id=plan.id, status="ACTIVE"))
    await db.flush()

    # Check initially enabled
    assert await EntitlementResolver.has_feature(db, organization.id, "FEAT_OVERRIDE") is True

    # Disable via override
    db.add(OrganizationFeature(organization_id=organization.id, feature_id=feat.id, is_enabled=False))
    await db.flush()

    # Check now disabled
    assert await EntitlementResolver.has_feature(db, organization.id, "FEAT_OVERRIDE") is False


# ── 6. Entitlement Resolver Limits & Priority ──────────────────

@pytest.mark.asyncio
async def test_entitlement_resolver_limits_and_priority(db, organization):
    plan = SubscriptionPlan(name="Plan Epsilon", max_events=2, storage_quota_mb=10240)
    db.add(plan)
    await db.flush()
    db.add(OrganizationSubscription(organization_id=organization.id, plan_id=plan.id, status="ACTIVE"))
    await db.flush()

    # Default plan limits
    assert await EntitlementResolver.get_limit(db, organization.id, "max_events") == 2
    assert await EntitlementResolver.get_limit(db, organization.id, "storage_quota_mb") == 10240
    assert await EntitlementResolver.get_limit(db, organization.id, "max_storage_gb") == 10

    # Override limit
    db.add(TenantLimit(organization_id=organization.id, limit_key="max_events", limit_value=15))
    db.add(TenantLimit(organization_id=organization.id, limit_key="max_storage_gb", limit_value=50))
    await db.flush()

    # Verify overrides take priority
    assert await EntitlementResolver.get_limit(db, organization.id, "max_events") == 15
    assert await EntitlementResolver.get_limit(db, organization.id, "storage_quota_mb") == 51200
    assert await EntitlementResolver.get_limit(db, organization.id, "max_storage_gb") == 50


# ── 7. LimitGuard Delegation ───────────────────────────────────

@pytest.mark.asyncio
async def test_limit_guard_delegation(db, organization):
    plan = SubscriptionPlan(name="Plan Zeta", max_events=1)
    db.add(plan)
    await db.flush()
    db.add(OrganizationSubscription(organization_id=organization.id, plan_id=plan.id, status="ACTIVE"))
    await db.flush()

    # First event
    ev1 = Event(
        organization_id=organization.id,
        name="Event 1",
        short_code="EV1",
        start_date=datetime.now().date(),
        end_date=datetime.now().date(),
        status="active"
    )
    db.add(ev1)
    await db.flush()

    # Second event - checking limit via LimitGuard
    with pytest.raises(HTTPException) as exc_info:
        await LimitGuard.check_events(db, organization.id)
    assert exc_info.value.status_code == 402
    assert "exceeded" in exc_info.value.detail["detail"]


# ── 8. Backfill Script ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_backfill_script(db, organization):
    # Setup subscription
    plan = SubscriptionPlan(name="Plan Theta")
    db.add(plan)
    await db.flush()
    sub = OrganizationSubscription(organization_id=organization.id, plan_id=plan.id, status="ACTIVE")
    db.add(sub)
    await db.flush()

    # Create active, completed, and draft events
    ev_active = Event(organization_id=organization.id, name="Active Event", short_code="ACTE", start_date=datetime.now().date(), end_date=datetime.now().date(), status="active")
    ev_completed = Event(organization_id=organization.id, name="Completed Event", short_code="COMT", start_date=datetime.now().date(), end_date=datetime.now().date(), status="completed")
    ev_draft = Event(organization_id=organization.id, name="Draft Event", short_code="DRFT", start_date=datetime.now().date(), end_date=datetime.now().date(), status="draft")
    db.add_all([ev_active, ev_completed, ev_draft])
    await db.flush()

    # Run backfill
    # To run the script's backfill, we patch AsyncSessionLocal to return the current transaction DB
    from app.database import AsyncSessionLocal
    class MockSessionLocal:
        def __init__(self, session):
            self.session = session
        async def __aenter__(self):
            return self.session
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    with patch("scripts.backfill_event_activations.AsyncSessionLocal", lambda: MockSessionLocal(db)):
        await backfill()

    # Verify activations
    res_active = await db.scalar(select(EventActivation).where(EventActivation.event_id == ev_active.id))
    assert res_active is not None
    assert res_active.status == "ACTIVE"

    res_completed = await db.scalar(select(EventActivation).where(EventActivation.event_id == ev_completed.id))
    assert res_completed is not None
    assert res_completed.status == "ACTIVE"

    res_draft = await db.scalar(select(EventActivation).where(EventActivation.event_id == ev_draft.id))
    assert res_draft is None


# ── 9. Activations API Endpoints ───────────────────────────────

@pytest.mark.asyncio
async def test_activations_api_endpoints(client, db, organization, event, organizer):
    # Setup subscription
    plan = SubscriptionPlan(name="Plan Iota")
    db.add(plan)
    await db.flush()
    sub = OrganizationSubscription(organization_id=organization.id, plan_id=plan.id, status="ACTIVE")
    db.add(sub)
    await db.flush()

    headers = auth_headers(organizer)

    # 1. Activate
    payload = {"subscription_id": str(sub.id)}
    res = await client.post(
        f"/billing/events/{event.id}/activate",
        json=payload,
        headers={**headers, "Idempotency-Key": "activate-1"},
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["status"] == "ACTIVE"
    assert data["activation_status"] == "ACTIVE"
    assert data["event_id"] == str(event.id)
    assert data["grant_id"] is not None
    assert data["grant_consumption_id"] is not None
    assert data["snapshot_summary"]["version"] == 1
    activation_id = data["id"]

    # 2. Get status
    res = await client.get(f"/billing/events/{event.id}/activation", headers=headers)
    assert res.status_code == 200
    assert res.json()["status"] == "ACTIVE"

    # 3. List activations
    res = await client.get(f"/billing/organizations/{organization.id}/activations", headers=headers)
    assert res.status_code == 200
    assert len(res.json()) == 1

    # 4. Deactivate
    res = await client.post(
        f"/billing/events/{event.id}/deactivate",
        headers={**headers, "Idempotency-Key": "deactivate-1"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "DEACTIVATED"

    # 5. Get status again (should return DEACTIVATED as the most recent)
    res = await client.get(f"/billing/events/{event.id}/activation", headers=headers)
    assert res.status_code == 200
    assert res.json()["status"] == "DEACTIVATED"
