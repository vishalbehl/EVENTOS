import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.billing.models.subscription import PlanFeature, SubscriptionPlan
from app.modules.billing.services.plan_projection_service import PlanProjectionService
from app.modules.platform.models.feature import FeatureCatalog


@pytest.mark.asyncio
async def test_plan_projection_prefers_typed_limits_over_legacy_columns(
    db: AsyncSession,
):
    feature = await db.scalar(
        select(FeatureCatalog).where(FeatureCatalog.key == "LIMIT_EVENTS")
    )
    if feature is None:
        feature = FeatureCatalog(
            key="LIMIT_EVENTS",
            name="Events",
            value_type="LIMIT",
            scope_type="ORGANIZATION",
            unit="events",
            period="CONTRACT",
        )
        db.add(feature)
        await db.flush()
    plan = SubscriptionPlan(
        name=f"Typed projection {uuid.uuid4().hex[:8]}",
        max_events=999,
        max_users=5,
        storage_quota_mb=1024,
    )
    db.add(plan)
    await db.flush()
    db.add(
        PlanFeature(
            plan_id=plan.id,
            feature_id=feature.id,
            enabled=True,
            value_type="LIMIT",
            entitlement_value={"value": 7},
            scope_type="ORGANIZATION",
            enforcement_mode="HARD",
        )
    )
    await db.flush()

    projection = await PlanProjectionService.project(db, plan)

    assert projection["limits"]["max_events"]["allowed"] == 7
    assert projection["limits"]["max_events"]["source"] == "TYPED_PLAN_ASSIGNMENT"
    assert "max_events" not in projection["legacy_compatibility_keys"]
    assert projection["limits"]["max_users"]["source"] == "LEGACY_PLAN_COMPATIBILITY"
