import uuid
from typing import List, Set, Dict, Any, Optional
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.platform.models.feature import FeatureCatalog
from app.modules.billing.models.subscription import (
    PlanFeature,
    OrganizationFeature,
    OrganizationSubscription,
    SubscriptionPlan,
    OrganizationAddon,
    AddonFeature
)

class EntitlementService:
    @staticmethod
    async def resolve_entitlements(db: AsyncSession, organization_id: uuid.UUID) -> Set[str]:
        """
        Resolve the complete set of feature keys the organization is entitled to.
        Includes:
        1. Features from the base subscription plan.
        2. Features from active Add-Ons.
        3. Manual overrides (OrganizationFeatures).
        """
        entitled_keys = set()
        
        # 1. Get Base Plan Features
        sub_stmt = select(OrganizationSubscription).options(
            selectinload(OrganizationSubscription.plan)
        ).where(OrganizationSubscription.organization_id == organization_id)
        sub_res = await db.execute(sub_stmt)
        sub = sub_res.scalar_one_or_none()
        
        if sub and sub.status not in ["SUSPENDED", "EXPIRED", "CANCELLED", "ARCHIVED"]:
            if sub.plan_id:
                pf_stmt = select(FeatureCatalog.key).join(PlanFeature).where(
                    and_(PlanFeature.plan_id == sub.plan_id, PlanFeature.enabled == True)
                )
                pf_res = await db.execute(pf_stmt)
                entitled_keys.update(pf_res.scalars().all())
                
        # 2. Add-On Features
        addon_stmt = select(FeatureCatalog.key).join(AddonFeature).join(OrganizationAddon).where(
            and_(
                OrganizationAddon.organization_id == organization_id,
                OrganizationAddon.status == "ACTIVE"
            )
        )
        addon_res = await db.execute(addon_stmt)
        entitled_keys.update(addon_res.scalars().all())

        # 3. Organization Overrides
        ov_stmt = select(FeatureCatalog.key, OrganizationFeature.is_enabled).join(OrganizationFeature).where(
            OrganizationFeature.organization_id == organization_id
        )
        ov_res = await db.execute(ov_stmt)
        for key, is_enabled in ov_res.all():
            if is_enabled:
                entitled_keys.add(key)
            else:
                entitled_keys.discard(key)
                
        return entitled_keys

    @staticmethod
    async def has_feature(db: AsyncSession, organization_id: uuid.UUID, feature_key: str) -> bool:
        """Check if an organization has a specific feature."""
        entitlements = await EntitlementService.resolve_entitlements(db, organization_id)
        return feature_key in entitlements

    @staticmethod
    async def has_addon(db: AsyncSession, organization_id: uuid.UUID, addon_name: str) -> bool:
        """Check if an organization has a specific add-on active."""
        from app.modules.billing.models.subscription import Addon
        stmt = select(OrganizationAddon.id).join(Addon).where(
            and_(
                OrganizationAddon.organization_id == organization_id,
                OrganizationAddon.status == "ACTIVE",
                Addon.name == addon_name
            )
        )
        res = await db.execute(stmt)
        return res.scalar_one_or_none() is not None

    @staticmethod
    async def can_access(db: AsyncSession, organization_id: uuid.UUID, feature_keys: List[str]) -> bool:
        """Check if organization has ANY of the requested features."""
        entitlements = await EntitlementService.resolve_entitlements(db, organization_id)
        return any(key in entitlements for key in feature_keys)
