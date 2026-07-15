import hashlib
import json
import uuid
from typing import Any, Dict, List, Optional, Sequence, Set

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.billing.models.event_activation import EventActivation
from app.modules.billing.models.licensing import (
    EntitlementGrant,
    EventEntitlementSnapshotItem,
    EventEntitlementSnapshotSet,
    EventLimitSnapshotItem,
)
from app.modules.billing.models.subscription import (
    AddonFeature,
    OrganizationAddon,
    OrganizationFeature,
    OrganizationSubscription,
    PlanFeature,
    SubscriptionPlan,
)
from app.modules.platform.models.feature import FeatureCatalog
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.platform_domain_tables import TenantLimit


class EntitlementResolver:
    ACTIVE_SUBSCRIPTION_STATUSES = ("ACTIVE", "TRIAL")
    LIVE_ACTIVATION_STATUSES = ("PENDING", "ACTIVE", "SUSPENDED", "EXPIRED", "TRANSFER_PENDING")
    DEFAULT_LIMITS = {
        "max_event_team_members": 2,
        "max_events": 1,
        "max_users": 2,
        "max_registrations": 150,
        "max_speakers": 30,
        "max_sessions": 25,
        "max_rooms": 5,
        "max_ticket_categories": 3,
        "max_badge_templates": 3,
        "max_certificate_templates": 3,
        "max_emails_per_event": 450,
        "storage_quota_mb": 10240,
        "max_storage_gb": 10,
    }
    EVENT_LIMIT_KEYS = (
        "max_event_team_members",
        "max_registrations",
        "max_speakers",
        "max_sessions",
        "max_rooms",
        "max_ticket_categories",
        "max_badge_templates",
        "max_certificate_templates",
        "max_emails_per_event",
        "storage_quota_mb",
    )

    @staticmethod
    async def get_active_subscriptions(db: AsyncSession, org_id: uuid.UUID) -> Sequence[OrganizationSubscription]:
        stmt = (
            select(OrganizationSubscription)
            .options(selectinload(OrganizationSubscription.plan))
            .where(
                OrganizationSubscription.organization_id == org_id,
                OrganizationSubscription.status.in_(EntitlementResolver.ACTIVE_SUBSCRIPTION_STATUSES),
            )
            .order_by(OrganizationSubscription.created_at.desc())
        )
        return (await db.execute(stmt)).scalars().all()

    @staticmethod
    async def get_active_subscription(db: AsyncSession, org_id: uuid.UUID) -> Optional[OrganizationSubscription]:
        subs = await EntitlementResolver.get_active_subscriptions(db, org_id)
        return subs[0] if subs else None

    @staticmethod
    async def get_event_activation(
        db: AsyncSession, org_id: uuid.UUID, event_id: uuid.UUID
    ) -> Optional[EventActivation]:
        stmt = (
            select(EventActivation)
            .options(
                selectinload(EventActivation.current_snapshot_set)
                .selectinload(EventEntitlementSnapshotSet.feature_items),
                selectinload(EventActivation.current_snapshot_set)
                .selectinload(EventEntitlementSnapshotSet.limit_items),
            )
            .where(
                EventActivation.organization_id == org_id,
                EventActivation.event_id == event_id,
                EventActivation.status.in_(EntitlementResolver.LIVE_ACTIVATION_STATUSES),
            )
            .order_by(EventActivation.created_at.desc())
            .limit(1)
            .execution_options(populate_existing=True)
        )
        return await db.scalar(stmt)

    @staticmethod
    async def get_activation(
        db: AsyncSession, activation_id: uuid.UUID
    ) -> Optional[EventActivation]:
        stmt = (
            select(EventActivation)
            .options(
                selectinload(EventActivation.current_snapshot_set)
                .selectinload(EventEntitlementSnapshotSet.feature_items),
                selectinload(EventActivation.current_snapshot_set)
                .selectinload(EventEntitlementSnapshotSet.limit_items),
                selectinload(EventActivation.subscription).selectinload(OrganizationSubscription.plan),
                selectinload(EventActivation.grant),
                selectinload(EventActivation.grant_consumption),
            )
            .where(EventActivation.id == activation_id)
            .execution_options(populate_existing=True)
        )
        return await db.scalar(stmt)

    @staticmethod
    async def resolve_entitlements(
        db: AsyncSession, org_id: uuid.UUID, event_id: Optional[uuid.UUID] = None
    ) -> Set[str]:
        if event_id is None:
            explained = await EntitlementResolver.resolve_org_entitlements(db, org_id, explain=False)
        else:
            explained = await EntitlementResolver.resolve_event_entitlements(db, org_id, event_id, explain=False)
        return set(explained["features"].keys())

    @staticmethod
    async def has_feature(
        db: AsyncSession, org_id: uuid.UUID, feature_key: str, event_id: Optional[uuid.UUID] = None
    ) -> bool:
        if event_id is None:
            resolved = await EntitlementResolver.resolve_org_entitlements(db, org_id, explain=True)
        else:
            resolved = await EntitlementResolver.resolve_event_entitlements(db, org_id, event_id, explain=True)
        feature = resolved["features"].get(feature_key)
        return bool(feature and feature["enabled"])

    @staticmethod
    async def get_limit(
        db: AsyncSession,
        org_id: uuid.UUID,
        limit_key: str,
        *,
        event_id: Optional[uuid.UUID] = None,
        activation_id: Optional[uuid.UUID] = None,
    ) -> Optional[int]:
        if activation_id:
            resolved = await EntitlementResolver.resolve_activation_entitlements(db, activation_id, explain=True)
            limit = resolved["limits"].get(limit_key)
            return None if limit is None else limit["limit_value"]
        if event_id:
            resolved = await EntitlementResolver.resolve_event_entitlements(db, org_id, event_id, explain=True)
            limit = resolved["limits"].get(limit_key)
            return None if limit is None else limit["limit_value"]
        return await EntitlementResolver.get_org_limit(db, org_id, limit_key)

    @staticmethod
    async def get_org_limit(db: AsyncSession, org_id: uuid.UUID, limit_key: str) -> Optional[int]:
        org_stmt = select(Organization.slug).where(Organization.id == org_id)
        org_slug = await db.scalar(org_stmt)
        if org_slug == "eventxos":
            return None if limit_key != "storage_quota_mb" else 999999999

        actual_override_key = "max_storage_gb" if limit_key == "storage_quota_mb" else limit_key
        override_stmt = select(TenantLimit.limit_value).where(
            TenantLimit.organization_id == org_id,
            TenantLimit.limit_key == actual_override_key,
        )
        override_val = await db.scalar(override_stmt)
        if override_val is not None:
            return override_val * 1024 if limit_key == "storage_quota_mb" else int(override_val)

        subs = await EntitlementResolver.get_active_subscriptions(db, org_id)
        plans = [sub.plan for sub in subs if sub.plan]
        if not plans:
            if limit_key == "max_events":
                return 1
            if limit_key == "max_users":
                return 2
            return 0

        values: List[Optional[int]] = []
        for plan in plans:
            if limit_key == "max_storage_gb":
                values.append((plan.storage_quota_mb or 10240) // 1024)
            else:
                values.append(getattr(plan, limit_key, None))
        if not values:
            return None
        if any(value is None for value in values):
            return None
        if limit_key == "max_events":
            return sum(int(value) for value in values if value is not None)
        return max(int(value) for value in values if value is not None)

    @staticmethod
    async def resolve_org_entitlements(
        db: AsyncSession, org_id: uuid.UUID, explain: bool = False
    ) -> Dict[str, Any]:
        features: Dict[str, Dict[str, Any]] = {}
        subs = await EntitlementResolver.get_active_subscriptions(db, org_id)
        for sub in subs:
            if not sub.plan_id:
                continue
            stmt = (
                select(FeatureCatalog.key, FeatureCatalog.scope_type)
                .join(PlanFeature, PlanFeature.feature_id == FeatureCatalog.id)
                .where(PlanFeature.plan_id == sub.plan_id, PlanFeature.enabled.is_(True))
            )
            for key, scope_type in (await db.execute(stmt)).all():
                features[key] = {
                    "enabled": True,
                    "scope_type": scope_type,
                    "source_type": "PLAN",
                    "source_ref": str(sub.plan_id),
                    "subscription_id": str(sub.id),
                    "plan_id": str(sub.plan_id),
                    "override_source": None,
                    "activation_id": None,
                    "grant_id": None,
                    "denial_reason": None,
                }

        addon_stmt = (
            select(FeatureCatalog.key, FeatureCatalog.scope_type, OrganizationAddon.id, OrganizationAddon.addon_id)
            .join(AddonFeature, AddonFeature.feature_id == FeatureCatalog.id)
            .join(OrganizationAddon, OrganizationAddon.addon_id == AddonFeature.addon_id)
            .where(
                OrganizationAddon.organization_id == org_id,
                OrganizationAddon.status == "ACTIVE",
                OrganizationAddon.event_id.is_(None),
                OrganizationAddon.activation_id.is_(None),
            )
        )
        for key, scope_type, addon_row_id, addon_id in (await db.execute(addon_stmt)).all():
            features[key] = {
                "enabled": True,
                "scope_type": scope_type,
                "source_type": "ADDON",
                "source_ref": str(addon_id),
                "subscription_id": None,
                "plan_id": None,
                "override_source": f"org_addon:{addon_row_id}",
                "activation_id": None,
                "grant_id": None,
                "denial_reason": None,
            }

        override_stmt = (
            select(FeatureCatalog.key, FeatureCatalog.scope_type, OrganizationFeature.is_enabled)
            .join(OrganizationFeature, OrganizationFeature.feature_id == FeatureCatalog.id)
            .where(OrganizationFeature.organization_id == org_id)
        )
        for key, scope_type, enabled in (await db.execute(override_stmt)).all():
            features[key] = {
                "enabled": bool(enabled),
                "scope_type": scope_type,
                "source_type": "ORG_OVERRIDE",
                "source_ref": str(org_id),
                "subscription_id": None,
                "plan_id": None,
                "override_source": "organization_feature_overrides",
                "activation_id": None,
                "grant_id": None,
                "denial_reason": None if enabled else "Disabled by organization override",
            }

        limits = {
            key: {
                "limit_value": await EntitlementResolver.get_org_limit(db, org_id, key),
                "scope_type": "ORG_SCOPED" if key in ("max_events", "max_users") else "EVENT_SCOPED",
                "source_type": "AGGREGATE_SUBSCRIPTIONS",
                "source_ref": str(org_id),
                "subscription_id": None,
                "plan_id": None,
                "activation_id": None,
                "grant_id": None,
                "override_source": None,
                "denial_reason": None,
            }
            for key in ("max_events", "max_users", *EntitlementResolver.EVENT_LIMIT_KEYS)
        }

        if not explain:
            return {"features": {k: v for k, v in features.items() if v["enabled"]}, "limits": limits}
        return {"features": features, "limits": limits}

    @staticmethod
    async def resolve_event_entitlements(
        db: AsyncSession, org_id: uuid.UUID, event_id: uuid.UUID, explain: bool = False
    ) -> Dict[str, Any]:
        activation = await EntitlementResolver.get_event_activation(db, org_id, event_id)
        if not activation:
            return {"features": {}, "limits": {}}
        if not activation.current_snapshot_set:
            return {
                "features": {},
                "limits": {},
                "activation": activation,
                "denial_reason": "SNAPSHOT_REQUIRED",
            }
        return await EntitlementResolver.resolve_activation_entitlements(db, activation.id, explain=explain)

    @staticmethod
    async def resolve_activation_entitlements(
        db: AsyncSession, activation_id: uuid.UUID, explain: bool = False
    ) -> Dict[str, Any]:
        activation = await EntitlementResolver.get_activation(db, activation_id)
        if not activation or not activation.current_snapshot_set:
            return {"features": {}, "limits": {}}

        feature_rows = activation.current_snapshot_set.feature_items
        limit_rows = activation.current_snapshot_set.limit_items

        features = {
            row.feature_key: {
                "enabled": row.is_enabled,
                "scope_type": row.scope_type,
                "source_type": row.source_type,
                "source_ref": row.source_ref,
                "activation_id": str(activation.id),
                "grant_id": str(activation.grant_id) if activation.grant_id else None,
                "subscription_id": str(activation.subscription_id),
                "plan_id": str(activation.subscription.plan_id) if activation.subscription else None,
                "override_source": row.override_source,
                "denial_reason": row.denial_reason_default,
            }
            for row in feature_rows
            if explain or row.is_enabled
        }

        limits = {
            row.limit_key: {
                "limit_value": row.limit_value,
                "scope_type": row.scope_type,
                "source_type": row.source_type,
                "source_ref": row.source_ref,
                "activation_id": str(activation.id),
                "grant_id": str(activation.grant_id) if activation.grant_id else None,
                "subscription_id": str(activation.subscription_id),
                "plan_id": str(activation.subscription.plan_id) if activation.subscription else None,
                "override_source": row.override_source,
                "denial_reason": None,
            }
            for row in limit_rows
        }
        return {"features": features, "limits": limits, "activation": activation}

    @staticmethod
    async def build_live_entitlement_package(
        db: AsyncSession,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        subscription_id: uuid.UUID,
        grant_id: Optional[uuid.UUID],
        activation_id: Optional[uuid.UUID],
        policy_type: str,
        resolution_reason: str,
    ) -> Dict[str, Any]:
        subscription = await db.get(OrganizationSubscription, subscription_id)
        plan = await db.get(SubscriptionPlan, subscription.plan_id) if subscription else None
        features: Dict[str, Dict[str, Any]] = {}
        limits: Dict[str, Dict[str, Any]] = {}

        if plan:
            plan_feature_stmt = (
                select(FeatureCatalog.key, FeatureCatalog.scope_type)
                .join(PlanFeature, PlanFeature.feature_id == FeatureCatalog.id)
                .where(PlanFeature.plan_id == plan.id, PlanFeature.enabled.is_(True))
            )
            for key, scope_type in (await db.execute(plan_feature_stmt)).all():
                features[key] = {
                    "feature_key": key,
                    "enabled": True,
                    "scope_type": scope_type,
                    "source_type": "PLAN",
                    "source_ref": str(plan.id),
                    "override_source": None,
                    "denial_reason": None,
                }

            for limit_key in EntitlementResolver.EVENT_LIMIT_KEYS:
                if limit_key == "storage_quota_mb":
                    limit_value = plan.storage_quota_mb
                else:
                    limit_value = getattr(plan, limit_key, None)
                if limit_value is None:
                    limit_value = EntitlementResolver.DEFAULT_LIMITS.get(limit_key)
                limits[limit_key] = {
                    "limit_key": limit_key,
                    "limit_value": limit_value,
                    "scope_type": "EVENT_SCOPED",
                    "source_type": "PLAN",
                    "source_ref": str(plan.id),
                    "override_source": None,
                }

        addon_filters = [
            and_(OrganizationAddon.event_id.is_(None), OrganizationAddon.activation_id.is_(None)),
            OrganizationAddon.event_id == event_id,
        ]
        if activation_id:
            addon_filters.append(OrganizationAddon.activation_id == activation_id)
        addon_stmt = (
            select(FeatureCatalog.key, FeatureCatalog.scope_type, OrganizationAddon.id, OrganizationAddon.addon_id)
            .join(AddonFeature, AddonFeature.feature_id == FeatureCatalog.id)
            .join(OrganizationAddon, OrganizationAddon.addon_id == AddonFeature.addon_id)
            .where(
                OrganizationAddon.organization_id == organization_id,
                OrganizationAddon.status == "ACTIVE",
                or_(*addon_filters),
            )
        )
        for key, scope_type, org_addon_id, addon_id in (await db.execute(addon_stmt)).all():
            features[key] = {
                "feature_key": key,
                "enabled": True,
                "scope_type": scope_type,
                "source_type": "ADDON",
                "source_ref": str(addon_id),
                "override_source": f"organization_addons:{org_addon_id}",
                "denial_reason": None,
            }

        override_stmt = (
            select(FeatureCatalog.key, FeatureCatalog.scope_type, OrganizationFeature.is_enabled)
            .join(OrganizationFeature, OrganizationFeature.feature_id == FeatureCatalog.id)
            .where(OrganizationFeature.organization_id == organization_id)
        )
        for key, scope_type, enabled in (await db.execute(override_stmt)).all():
            features[key] = {
                "feature_key": key,
                "enabled": bool(enabled),
                "scope_type": scope_type,
                "source_type": "ORG_OVERRIDE",
                "source_ref": str(organization_id),
                "override_source": "organization_feature_overrides",
                "denial_reason": None if enabled else "Disabled by organization override",
            }

        tenant_limit_stmt = select(TenantLimit.limit_key, TenantLimit.limit_value).where(
            TenantLimit.organization_id == organization_id,
            TenantLimit.limit_key.in_(
                list(EntitlementResolver.EVENT_LIMIT_KEYS) + ["max_storage_gb"]
            ),
        )
        for key, value in (await db.execute(tenant_limit_stmt)).all():
            actual_key = "storage_quota_mb" if key == "max_storage_gb" else key
            actual_value = int(value) * 1024 if key == "max_storage_gb" else int(value)
            limits[actual_key] = {
                "limit_key": actual_key,
                "limit_value": actual_value,
                "scope_type": "EVENT_SCOPED",
                "source_type": "ORG_OVERRIDE",
                "source_ref": str(organization_id),
                "override_source": "tenant_limits",
            }

        return {
            "organization_id": str(organization_id),
            "event_id": str(event_id),
            "subscription_id": str(subscription_id),
            "grant_id": str(grant_id) if grant_id else None,
            "activation_id": str(activation_id) if activation_id else None,
            "plan_id": str(plan.id) if plan else None,
            "policy_type": policy_type,
            "resolution_reason": resolution_reason,
            "resolver_version": "v4",
            "features": features,
            "limits": limits,
        }

    @staticmethod
    def build_snapshot_checksum(package: Dict[str, Any], version: int) -> str:
        feature_items = []
        for key in sorted(package["features"].keys()):
            item = package["features"][key]
            feature_items.append(
                {
                    "feature_key": key,
                    "scope_type": item["scope_type"],
                    "is_enabled": item["enabled"],
                    "source_type": item["source_type"],
                    "source_ref": item["source_ref"],
                    "override_source": item.get("override_source"),
                    "denial_reason": item.get("denial_reason"),
                }
            )
        limit_items = []
        for key in sorted(package["limits"].keys()):
            item = package["limits"][key]
            limit_items.append(
                {
                    "limit_key": key,
                    "scope_type": item["scope_type"],
                    "limit_value": item["limit_value"],
                    "source_type": item["source_type"],
                    "source_ref": item["source_ref"],
                    "override_source": item.get("override_source"),
                }
            )
        canonical_payload = {
            "activation_id": package.get("activation_id"),
            "snapshot_version": version,
            "resolver_version": package["resolver_version"],
            "policy_type": package["policy_type"],
            "resolution_reason": package["resolution_reason"],
            "features": feature_items,
            "limits": limit_items,
        }
        return hashlib.sha256(json.dumps(canonical_payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
