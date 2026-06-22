import uuid
from typing import Set, Optional
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.platform.models.feature import FeatureCatalog
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.platform_domain_tables import TenantLimit
from app.modules.billing.models.subscription import (
    OrganizationSubscription,
    SubscriptionPlan,
    PlanFeature,
    OrganizationFeature,
    OrganizationAddon,
    AddonFeature
)
from app.modules.billing.models.event_activation import EventActivation


class EntitlementResolver:
    """
    Centralized entitlement evaluation engine. No hardcoded plan logic.
    Resolves features and limits for an organization (and optionally a specific event context).
    """

    @staticmethod
    async def get_active_subscription(db: AsyncSession, org_id: uuid.UUID) -> Optional[OrganizationSubscription]:
        """Fetch the organization's currently active subscription."""
        stmt = (
            select(OrganizationSubscription)
            .options(selectinload(OrganizationSubscription.plan))
            .where(
                OrganizationSubscription.organization_id == org_id,
                OrganizationSubscription.status.in_(["ACTIVE", "TRIAL"])
            )
        )
        return await db.scalar(stmt)

    @staticmethod
    async def resolve_entitlements(db: AsyncSession, org_id: uuid.UUID, event_id: Optional[uuid.UUID] = None) -> Set[str]:
        """
        Full resolution: Plan Features + Addon Features + Feature Overrides.
        Evaluation order:
        1. Plan Features (base entitlements from subscription's plan)
        2. Addon Features (union with plan entitlements, filtering for org-level and event-specific addons)
        3. Organization Feature Overrides (OrganizationFeature can enable or disable specific features)
        """
        # Check if organization is eventxos (Supervisor)
        org_stmt = select(Organization.slug).where(Organization.id == org_id)
        org_slug = await db.scalar(org_stmt)
        if org_slug == "eventxos":
            all_keys_stmt = select(FeatureCatalog.key)
            all_keys_res = await db.execute(all_keys_stmt)
            return set(all_keys_res.scalars().all())

        entitled_keys = set()

        # 1. Get Base Plan Features
        sub = await EntitlementResolver.get_active_subscription(db, org_id)
        if sub and sub.plan_id:
            pf_stmt = select(FeatureCatalog.key).join(PlanFeature).where(
                and_(PlanFeature.plan_id == sub.plan_id, PlanFeature.enabled == True)
            )
            pf_res = await db.execute(pf_stmt)
            entitled_keys.update(pf_res.scalars().all())

        # 2. Add-On Features (Org-scoped + Event-scoped + Activation-scoped)
        addon_filters = [
            and_(
                OrganizationAddon.event_id.is_(None),
                OrganizationAddon.activation_id.is_(None)
            )
        ]
        if event_id is not None:
            addon_filters.append(OrganizationAddon.event_id == event_id)
            
            # Find active activation for this event
            act_stmt = select(EventActivation.id).where(
                EventActivation.event_id == event_id,
                EventActivation.status == "ACTIVE"
            )
            act_id = await db.scalar(act_stmt)
            if act_id:
                addon_filters.append(OrganizationAddon.activation_id == act_id)

        addon_stmt = (
            select(FeatureCatalog.key)
            .join(AddonFeature, AddonFeature.feature_id == FeatureCatalog.id)
            .join(OrganizationAddon, OrganizationAddon.addon_id == AddonFeature.addon_id)
            .where(
                and_(
                    OrganizationAddon.organization_id == org_id,
                    OrganizationAddon.status == "ACTIVE",
                    or_(*addon_filters)
                )
            )
        )
        addon_res = await db.execute(addon_stmt)
        entitled_keys.update(addon_res.scalars().all())

        # 3. Organization Overrides
        ov_stmt = (
            select(FeatureCatalog.key, OrganizationFeature.is_enabled)
            .join(OrganizationFeature, OrganizationFeature.feature_id == FeatureCatalog.id)
            .where(OrganizationFeature.organization_id == org_id)
        )
        ov_res = await db.execute(ov_stmt)
        for key, is_enabled in ov_res.all():
            if is_enabled:
                entitled_keys.add(key)
            else:
                entitled_keys.discard(key)

        return entitled_keys

    @staticmethod
    async def has_feature(db: AsyncSession, org_id: uuid.UUID, feature_key: str, event_id: Optional[uuid.UUID] = None) -> bool:
        """Check if the organization has access to a specific feature key, optionally scoped to an event."""
        entitlements = await EntitlementResolver.resolve_entitlements(db, org_id, event_id=event_id)
        return feature_key in entitlements

    @staticmethod
    async def get_limit(db: AsyncSession, org_id: uuid.UUID, limit_key: str) -> Optional[int]:
        """
        Resolve a numeric limit through the entitlement hierarchy:
        1. TenantLimit overrides (highest priority override)
        2. Plan limits (SubscriptionPlan column values or related limit features)
        """
        # Check if organization is supervisor/eventxos
        org_stmt = select(Organization.slug).where(Organization.id == org_id)
        org_slug = await db.scalar(org_stmt)
        if org_slug == "eventxos":
            if limit_key in ("max_storage_gb", "storage_quota_mb"):
                return 999999999
            return None  # Unlimited

        # 1. Check TenantLimit overrides
        actual_override_key = limit_key
        if limit_key == "storage_quota_mb":
            actual_override_key = "max_storage_gb"

        override_stmt = select(TenantLimit.limit_value).where(
            TenantLimit.organization_id == org_id,
            TenantLimit.limit_key == actual_override_key
        )
        override_val = await db.scalar(override_stmt)
        if override_val is not None:
            if limit_key == "storage_quota_mb":
                return override_val * 1024
            return override_val

        # 2. Check Plan limits
        sub = await EntitlementResolver.get_active_subscription(db, org_id)
        plan = sub.plan if sub else None
        if not plan:
            # Fallback/Default plan (Basic)
            fallback_stmt = select(SubscriptionPlan).where(SubscriptionPlan.name == "Basic")
            plan = await db.scalar(fallback_stmt)

        if not plan:
            # Code fallback if database seeding is missing
            default_limits = {
                "max_events": 1,
                "max_users": 2,
                "max_registrations": 150,
                "max_speakers": 30,
                "max_sessions": 25,
                "max_rooms": 5,
                "max_ticket_categories": 3,
                "max_badge_templates": 3,
                "max_certificate_templates": 3,
                "storage_quota_mb": 10240,
                "max_storage_gb": 10
            }
            if limit_key == "max_storage_gb":
                return 10
            return default_limits.get(limit_key)

        # Retrieve value from plan attribute
        if limit_key == "max_storage_gb":
            return plan.storage_quota_mb // 1024 if plan.storage_quota_mb else 10
        
        return getattr(plan, limit_key, None)
