import hashlib
import json
import uuid
from datetime import datetime, timezone
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
from app.modules.billing.capability_registry import (
    CATALOG_LIMIT_KEYS,
    FEATURE_DEFINITIONS,
    LIMIT_DEFINITIONS,
    PLATFORM_HARD_CEILINGS,
)
from app.modules.platform.models.organization_console import EntitlementOverrideRequest


class EntitlementResolver:
    ACTIVE_SUBSCRIPTION_STATUSES = ("ACTIVE", "TRIAL")
    LIVE_ACTIVATION_STATUSES = ("PENDING", "ACTIVE", "SUSPENDED", "EXPIRED", "TRANSFER_PENDING")
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
        "max_sms_per_event",
        "max_whatsapp_per_event",
        "max_push_per_event",
        "max_exports_per_event",
        "max_devices_per_event",
    )
    # Compatibility source for plans created before typed PlanFeature limit
    # assignments existed. Activation snapshots must remain deterministic for
    # those already-published plans; typed assignments always take precedence.
    # New plan publication rejects missing typed assignments, so this path can
    # be removed after the legacy-plan migration is complete.
    LEGACY_PLAN_EVENT_LIMIT_FIELDS = (
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
        if limit_key not in LIMIT_DEFINITIONS and limit_key != "max_storage_gb":
            return None
        canonical_limit_key = "storage_quota_mb" if limit_key == "max_storage_gb" else limit_key
        actual_override_key = "max_storage_gb" if canonical_limit_key == "storage_quota_mb" else canonical_limit_key
        override_stmt = select(TenantLimit.limit_value).where(
            TenantLimit.organization_id == org_id,
            TenantLimit.limit_key == actual_override_key,
        )
        override_val = await db.scalar(override_stmt)
        if override_val is not None:
            return int(override_val) if limit_key == "max_storage_gb" else int(override_val) * 1024 if canonical_limit_key == "storage_quota_mb" else int(override_val)

        subs = await EntitlementResolver.get_active_subscriptions(db, org_id)
        plans = [sub.plan for sub in subs if sub.plan]
        if not plans:
            return None

        values: List[Optional[int]] = []
        ceilings: List[int] = []
        catalogue_keys = [key for key, canonical in CATALOG_LIMIT_KEYS.items() if canonical == canonical_limit_key]
        for plan in plans:
            typed = None
            if catalogue_keys:
                mapping = (await db.execute(
                    select(PlanFeature.entitlement_value, PlanFeature.hard_ceiling)
                    .join(FeatureCatalog, FeatureCatalog.id == PlanFeature.feature_id)
                    .where(
                        PlanFeature.plan_id == plan.id,
                        PlanFeature.enabled.is_(True),
                        FeatureCatalog.key.in_(catalogue_keys),
                    )
                    .limit(1)
                )).first()
                if mapping:
                    raw, ceiling = mapping
                    typed = raw.get("value") if isinstance(raw, dict) else raw
                    ceiling_value = ceiling.get("value") if isinstance(ceiling, dict) else ceiling
                    if isinstance(ceiling_value, (int, float)) and not isinstance(ceiling_value, bool):
                        ceilings.append(int(ceiling_value))
            if isinstance(typed, (int, float)) and not isinstance(typed, bool):
                values.append(int(typed))
            else:
                # Active commercial enforcement must use a typed assignment.
                # Legacy plan columns remain stored only for shadow comparison.
                values.append(None)
        if not values:
            return None
        if any(value is None for value in values):
            base_value: Optional[int] = None
        elif canonical_limit_key == "max_events":
            base_value = sum(int(value) for value in values if value is not None)
        else:
            base_value = max(int(value) for value in values if value is not None)

        if catalogue_keys:
            now = datetime.now(timezone.utc)
            addon_rows = (await db.execute(
                select(
                    AddonFeature.entitlement_value,
                    AddonFeature.operation,
                    AddonFeature.stackable,
                    AddonFeature.max_quantity,
                    OrganizationAddon.quantity,
                )
                .join(FeatureCatalog, FeatureCatalog.id == AddonFeature.feature_id)
                .join(OrganizationAddon, OrganizationAddon.addon_id == AddonFeature.addon_id)
                .where(
                    OrganizationAddon.organization_id == org_id,
                    OrganizationAddon.status == "ACTIVE",
                    OrganizationAddon.event_id.is_(None),
                    OrganizationAddon.activation_id.is_(None),
                    or_(OrganizationAddon.expires_at.is_(None), OrganizationAddon.expires_at > now),
                    FeatureCatalog.key.in_(catalogue_keys),
                )
            )).all()
            for raw, operation, stackable, max_quantity, purchased_quantity in addon_rows:
                requested = raw.get("value") if isinstance(raw, dict) else raw
                if not isinstance(requested, (int, float)) or isinstance(requested, bool):
                    continue
                quantity = max(1, int(purchased_quantity or 1)) if stackable else 1
                if max_quantity is not None:
                    quantity = min(quantity, int(max_quantity))
                requested = int(requested) * quantity
                operation = (operation or "INCREMENT").upper()
                if operation == "REPLACE":
                    base_value = requested
                elif operation == "DECREMENT":
                    base_value = max(0, int(base_value or 0) - requested)
                else:
                    base_value = int(base_value or 0) + requested
        platform_ceiling = PLATFORM_HARD_CEILINGS.get(canonical_limit_key)
        if platform_ceiling is not None:
            ceilings.append(platform_ceiling)
        if base_value is not None and ceilings:
            base_value = min(base_value, min(ceilings))
        if base_value is not None and limit_key == "max_storage_gb":
            return base_value // 1024
        return base_value

    @staticmethod
    async def get_org_limit_policy(
        db: AsyncSession,
        org_id: uuid.UUID,
        limit_key: str,
    ) -> dict[str, Any]:
        catalogue_keys = [
            key
            for key, canonical in CATALOG_LIMIT_KEYS.items()
            if canonical == limit_key
        ]
        if not catalogue_keys:
            return {
                "enforcement_mode": "HARD",
                "overage_policy": {"action": "DENY"},
            }
        subscriptions = await EntitlementResolver.get_active_subscriptions(db, org_id)
        plan_ids = [row.plan_id for row in subscriptions if row.plan_id]
        if not plan_ids:
            return {
                "enforcement_mode": "HARD",
                "overage_policy": {"action": "DENY"},
            }
        modes = (
            await db.scalars(
                select(PlanFeature.enforcement_mode)
                .join(FeatureCatalog, FeatureCatalog.id == PlanFeature.feature_id)
                .where(
                    PlanFeature.plan_id.in_(plan_ids),
                    PlanFeature.enabled.is_(True),
                    FeatureCatalog.key.in_(catalogue_keys),
                )
            )
        ).all()
        # Multiple active commercial sources use the most restrictive policy.
        rank = {"HARD": 0, "SOFT_WARNING": 1, "METERED_OVERAGE": 2}
        mode = min(
            (str(item or "HARD").upper() for item in modes),
            key=lambda item: rank.get(item, -1),
            default="HARD",
        )
        if mode not in rank:
            mode = "HARD"
        return {
            "enforcement_mode": mode,
            "overage_policy": (
                {"action": "BILL"}
                if mode == "METERED_OVERAGE"
                else {"action": "WARN"}
                if mode == "SOFT_WARNING"
                else {"action": "DENY"}
            ),
        }

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
                select(FeatureCatalog.key, FeatureCatalog.scope_type, PlanFeature.value_type, PlanFeature.entitlement_value)
                .join(PlanFeature, PlanFeature.feature_id == FeatureCatalog.id)
                .where(PlanFeature.plan_id == sub.plan_id, PlanFeature.enabled.is_(True))
            )
            for key, scope_type, value_type, raw_value in (await db.execute(stmt)).all():
                if key in CATALOG_LIMIT_KEYS:
                    continue
                value = raw_value.get("value") if isinstance(raw_value, dict) else True
                features[key] = {
                    "enabled": bool(value) if value_type == "BOOLEAN" else value not in {None, "", "DISABLED", "NONE"},
                    "value": value,
                    "value_type": value_type or "BOOLEAN",
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

        now = datetime.now(timezone.utc)
        addon_stmt = (
            select(FeatureCatalog.key, FeatureCatalog.scope_type, OrganizationAddon.id, OrganizationAddon.addon_id, AddonFeature.value_type, AddonFeature.entitlement_value, AddonFeature.operation)
            .join(AddonFeature, AddonFeature.feature_id == FeatureCatalog.id)
            .join(OrganizationAddon, OrganizationAddon.addon_id == AddonFeature.addon_id)
            .where(
                OrganizationAddon.organization_id == org_id,
                OrganizationAddon.status == "ACTIVE",
                OrganizationAddon.event_id.is_(None),
                OrganizationAddon.activation_id.is_(None),
                or_(OrganizationAddon.expires_at.is_(None), OrganizationAddon.expires_at > now),
            )
        )
        for key, scope_type, addon_row_id, addon_id, value_type, raw_value, operation in (await db.execute(addon_stmt)).all():
            if key in CATALOG_LIMIT_KEYS:
                continue
            requested = raw_value.get("value") if isinstance(raw_value, dict) else True
            current = features.get(key, {}).get("value", features.get(key, {}).get("enabled", False))
            operation = (operation or "UNLOCK").upper()
            value = True if operation == "UNLOCK" else requested if operation == "REPLACE" else requested
            features[key] = {
                "enabled": bool(value) if value_type == "BOOLEAN" else value not in {None, "", "DISABLED", "NONE"},
                "value": value,
                "value_type": value_type or "BOOLEAN",
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

        limits = {}
        for key in LIMIT_DEFINITIONS:
            policy = await EntitlementResolver.get_org_limit_policy(db, org_id, key)
            limits[key] = {
                "limit_value": await EntitlementResolver.get_org_limit(db, org_id, key),
                "scope_type": "ORG_SCOPED" if key in ("max_events", "max_users") else "EVENT_SCOPED",
                "source_type": "AGGREGATE_SUBSCRIPTIONS" if subs else "CONTRACT_REQUIRED",
                "source_ref": str(org_id),
                "subscription_id": None,
                "plan_id": None,
                "activation_id": None,
                "grant_id": None,
                "override_source": None,
                "denial_reason": None if subs else "CONTRACT_REQUIRED",
                **policy,
            }

        approved_overrides = (await db.scalars(select(EntitlementOverrideRequest).where(
            EntitlementOverrideRequest.organization_id == org_id,
            EntitlementOverrideRequest.event_id.is_(None),
            EntitlementOverrideRequest.status == "APPROVED",
            EntitlementOverrideRequest.effective_at <= now,
            or_(EntitlementOverrideRequest.expires_at.is_(None), EntitlementOverrideRequest.expires_at > now),
        ).order_by(EntitlementOverrideRequest.effective_at, EntitlementOverrideRequest.created_at))).all()
        for override in approved_overrides:
            key = override.entitlement_key
            if key.startswith("usage.") or key == "event.contract":
                continue
            if key in limits:
                current = limits[key]["limit_value"]
                requested = override.requested_value.get("value", override.requested_value.get("quantity")) if isinstance(override.requested_value, dict) else override.requested_value
                if override.operation == "INCREMENT":
                    value = int(current or 0) + int(requested or 0)
                elif override.operation == "DECREMENT":
                    value = max(0, int(current or 0) - int(requested or 0))
                elif override.operation == "RESET":
                    value = await EntitlementResolver.get_org_limit(db, org_id, key)
                else:
                    value = requested
                limits[key].update(limit_value=value, source_type="ORGANIZATION_OVERRIDE", source_ref=str(override.id))
            else:
                current = features.get(key, {}).get("value", features.get(key, {}).get("enabled", False))
                if override.operation == "UNLOCK":
                    value = True
                elif override.operation == "RESTRICT":
                    value = False
                else:
                    value = override.requested_value
                features[key] = {
                    **features.get(key, {}),
                    "enabled": bool(value) if not isinstance(value, str) else value not in {"", "DISABLED", "NONE"},
                    "value": value,
                    "source_type": "ORGANIZATION_OVERRIDE",
                    "source_ref": str(override.id),
                    "override_source": str(override.id),
                    "denial_reason": "Restricted by approved administrative control" if not value else None,
                }

        # Safety policy is evaluated after every commercial source, including
        # approved grants. An administrative override can never raise it.
        for key, item in limits.items():
            ceiling = PLATFORM_HARD_CEILINGS.get(key)
            value = item.get("limit_value")
            if (
                isinstance(ceiling, (int, float))
                and isinstance(value, (int, float))
                and not isinstance(value, bool)
                and value > ceiling
            ):
                item.update(
                    limit_value=ceiling,
                    ceiling_applied=True,
                    hard_ceiling=ceiling,
                    ceiling_source="HARD_PLATFORM_CEILING",
                )

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
                select(
                    FeatureCatalog.key,
                    FeatureCatalog.scope_type,
                    PlanFeature.value_type,
                    PlanFeature.entitlement_value,
                )
                .join(PlanFeature, PlanFeature.feature_id == FeatureCatalog.id)
                .where(PlanFeature.plan_id == plan.id, PlanFeature.enabled.is_(True))
            )
            for key, scope_type, value_type, raw_value in (await db.execute(plan_feature_stmt)).all():
                value = raw_value.get("value") if isinstance(raw_value, dict) else raw_value
                canonical_limit = CATALOG_LIMIT_KEYS.get(key)
                if canonical_limit:
                    if not isinstance(value, (int, float)) or isinstance(value, bool):
                        continue
                    limits[canonical_limit] = {
                        "limit_key": canonical_limit,
                        "limit_value": int(value),
                        "scope_type": scope_type,
                        "source_type": "PLAN",
                        "source_ref": str(plan.id),
                        "override_source": None,
                    }
                    # Some catalogue entries are deliberately dual-purpose:
                    # the positive allocation both enables the feature and
                    # supplies its quantitative allowance. Preserve both
                    # snapshot rows so operation gates and limit enforcement
                    # resolve from the same immutable contract.
                    if key in FEATURE_DEFINITIONS:
                        enabled = value > 0
                        features[key] = {
                            "feature_key": key,
                            "enabled": enabled,
                            "scope_type": scope_type,
                            "source_type": "PLAN",
                            "source_ref": str(plan.id),
                            "override_source": None,
                            "denial_reason": None if enabled else "NOT_ENTITLED",
                        }
                    continue
                enabled = (
                    bool(value)
                    if value_type == "BOOLEAN"
                    else value not in {None, "", "DISABLED", "NONE"}
                )
                features[key] = {
                    "feature_key": key,
                    "enabled": enabled,
                    "scope_type": scope_type,
                    "source_type": "PLAN",
                    "source_ref": str(plan.id),
                    "override_source": None,
                    "denial_reason": None if enabled else "NOT_ENTITLED",
                }

            for limit_key in EntitlementResolver.LEGACY_PLAN_EVENT_LIMIT_FIELDS:
                if limit_key in limits:
                    continue
                value = getattr(plan, limit_key, None)
                if not isinstance(value, (int, float)) or isinstance(value, bool):
                    continue
                limits[limit_key] = {
                    "limit_key": limit_key,
                    "limit_value": int(value),
                    "scope_type": "EVENT_SCOPED",
                    "source_type": "PLAN_LEGACY_COMPATIBILITY",
                    "source_ref": str(plan.id),
                    "override_source": f"subscription_plans.{limit_key}",
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
