import pytest
import uuid
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from tests.conftest import auth_headers

from app.modules.platform.models.organization import Organization
from app.modules.platform.models.feature import FeatureCatalog
from app.modules.billing.models.subscription import (
    SubscriptionPlan, OrganizationSubscription, PlanFeature, OrganizationFeature
)

@pytest.mark.asyncio
async def test_get_feature_overrides(client: AsyncClient, super_admin, organization: Organization, db: AsyncSession):
    headers = auth_headers(super_admin)
    
    # 1. Create a dummy FeatureCatalog item
    feature = FeatureCatalog(
        id=uuid.uuid4(),
        key="test_feature",
        name="Test Feature",
        category="general",
        description="A test feature"
    )
    db.add(feature)
    
    # 2. Create a dummy SubscriptionPlan and OrganizationSubscription
    plan = SubscriptionPlan(
        id=uuid.uuid4(),
        name="Enterprise Plan",
        max_events=10,
        max_users=100,
        max_registrations=1000,
        max_rooms=5,
        storage_quota_mb=1000,
        is_active=True
    )
    db.add(plan)
    await db.flush()
    
    sub = OrganizationSubscription(
        organization_id=organization.id,
        plan_id=plan.id,
        status="ACTIVE"
    )
    db.add(sub)
    
    # 3. Add default feature enabled for this plan
    plan_feature = PlanFeature(
        plan_id=plan.id,
        feature_id=feature.id,
        enabled=True
    )
    db.add(plan_feature)
    
    # 4. Add a feature override force-disabled for this organization
    override = OrganizationFeature(
        organization_id=organization.id,
        feature_id=feature.id,
        is_enabled=False
    )
    db.add(override)
    await db.commit()
    
    # Call GET endpoint
    response = await client.get(f"/platform/organizations/{organization.id}/feature-overrides", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    
    item = next(x for x in data if x["feature_id"] == str(feature.id))
    assert item["feature_name"] == "Test Feature"
    assert item["plan_default"] is True
    assert item["override"] is False
    assert item["effective_value"] is False

@pytest.mark.asyncio
async def test_legacy_feature_override_mutation_fails_closed(client: AsyncClient, super_admin, organization: Organization, db: AsyncSession):
    headers = auth_headers(super_admin)
    
    # 1. Create a dummy FeatureCatalog item
    feature = FeatureCatalog(
        id=uuid.uuid4(),
        key="test_feature_2",
        name="Test Feature 2",
        category="general",
        description="Another test feature"
    )
    db.add(feature)
    await db.commit()
    
    # Legacy direct grants must fail closed. Commercial access changes now use
    # the Organizer Console request + independent approval workflow.
    payload = {
        "overrides": [{"feature_id": str(feature.id), "override": True}],
        "reason": "Attempt a direct commercial feature grant.",
    }
    response = await client.put(f"/platform/organizations/{organization.id}/feature-overrides", json=payload, headers=headers)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "DUAL_APPROVAL_REQUIRED"

    # No legacy override record may be created.
    stmt = select(OrganizationFeature).where(
        OrganizationFeature.organization_id == organization.id,
        OrganizationFeature.feature_id == feature.id
    )
    res = (await db.execute(stmt)).scalar_one_or_none()
    assert res is None

@pytest.mark.asyncio
async def test_feature_overrides_require_admin(client: AsyncClient, organizer, organization: Organization):
    headers = auth_headers(organizer)
    
    res1 = await client.get(f"/platform/organizations/{organization.id}/feature-overrides", headers=headers)
    assert res1.status_code == 403
    
    payload = [
        {"feature_id": str(uuid.uuid4()), "override": True}
    ]
    res2 = await client.put(f"/platform/organizations/{organization.id}/feature-overrides", json=payload, headers=headers)
    assert res2.status_code == 403


@pytest.mark.asyncio
async def test_platform_org_list_deduplicates_multiple_subscriptions(
    client: AsyncClient,
    super_admin,
    organization: Organization,
    db: AsyncSession,
):
    headers = auth_headers(super_admin)

    basic = SubscriptionPlan(
        id=uuid.uuid4(),
        name="List Basic",
        max_events=1,
        max_users=2,
        max_registrations=150,
        max_rooms=5,
        storage_quota_mb=1000,
        is_active=True,
    )
    pro = SubscriptionPlan(
        id=uuid.uuid4(),
        name="List Pro",
        max_events=1,
        max_users=10,
        max_registrations=500,
        max_rooms=10,
        storage_quota_mb=5000,
        is_active=True,
    )
    db.add_all([basic, pro])
    await db.flush()

    db.add_all(
        [
            OrganizationSubscription(organization_id=organization.id, plan_id=basic.id, status="ACTIVE"),
            OrganizationSubscription(organization_id=organization.id, plan_id=pro.id, status="ACTIVE"),
        ]
    )
    await db.commit()

    response = await client.get("/platform/organizations", headers=headers)
    assert response.status_code == 200, response.text
    items = [item for item in response.json() if item["id"] == str(organization.id)]
    assert len(items) == 1
