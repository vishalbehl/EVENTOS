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
async def test_put_feature_overrides(client: AsyncClient, super_admin, organization: Organization, db: AsyncSession):
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
    
    # Call PUT to enable override
    payload = [
        {"feature_id": str(feature.id), "override": True}
    ]
    response = await client.put(f"/platform/organizations/{organization.id}/feature-overrides", json=payload, headers=headers)
    assert response.status_code == 200
    assert response.json()["success"] is True
    
    # Check DB override record
    stmt = select(OrganizationFeature).where(
        OrganizationFeature.organization_id == organization.id,
        OrganizationFeature.feature_id == feature.id
    )
    res = (await db.execute(stmt)).scalar_one_or_none()
    assert res is not None
    assert res.is_enabled is True
    assert res.override_by == super_admin.id
    assert res.override_at is not None
    
    # Call PUT with override: None (which removes override)
    payload_remove = [
        {"feature_id": str(feature.id), "override": None}
    ]
    response_remove = await client.put(f"/platform/organizations/{organization.id}/feature-overrides", json=payload_remove, headers=headers)
    assert response_remove.status_code == 200
    assert response_remove.json()["success"] is True
    
    # Verify override is deleted from DB
    stmt_check = select(OrganizationFeature).where(
        OrganizationFeature.organization_id == organization.id,
        OrganizationFeature.feature_id == feature.id
    )
    res_check = (await db.execute(stmt_check)).scalar_one_or_none()
    assert res_check is None

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
