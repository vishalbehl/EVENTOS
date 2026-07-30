from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.billing.capability_registry import CATALOG_LIMIT_KEYS
from app.modules.billing.models.subscription import PlanFeature, SubscriptionPlan
from app.modules.platform.models.feature import FeatureCatalog


class PlanProjectionService:
    """Build the customer-facing plan catalogue from typed assignments.

    Legacy scalar columns are read only when a published pre-migration plan has
    no typed assignment for that limit. The response marks those values so they
    cannot be mistaken for canonical configuration.
    """

    LEGACY_LIMIT_FIELDS: dict[str, str] = {
        "max_events": "max_events",
        "max_users": "max_users",
        "max_event_team_members": "max_event_team_members",
        "max_registrations": "max_registrations",
        "max_speakers": "max_speakers",
        "max_sessions": "max_sessions",
        "max_rooms": "max_rooms",
        "max_ticket_categories": "max_ticket_categories",
        "max_badge_templates": "max_badge_templates",
        "max_certificate_templates": "max_certificate_templates",
        "max_emails_per_event": "max_emails_per_event",
        "storage_quota_mb": "storage_quota_mb",
    }

    @staticmethod
    def _typed_value(mapping: PlanFeature, feature: FeatureCatalog) -> Any:
        if isinstance(mapping.entitlement_value, dict) and "value" in mapping.entitlement_value:
            return mapping.entitlement_value["value"]
        value_type = feature.value_type or mapping.value_type or "BOOLEAN"
        return bool(mapping.enabled) if value_type == "BOOLEAN" else None

    @classmethod
    async def project(
        cls,
        db: AsyncSession,
        plan: SubscriptionPlan,
        *,
        include_legacy_compatibility: bool = True,
    ) -> dict[str, Any]:
        rows = (
            await db.execute(
                select(PlanFeature, FeatureCatalog)
                .join(FeatureCatalog, FeatureCatalog.id == PlanFeature.feature_id)
                .where(PlanFeature.plan_id == plan.id)
                .order_by(FeatureCatalog.category_order, FeatureCatalog.feature_order)
            )
        ).all()

        assignments: list[dict[str, Any]] = []
        limits: dict[str, dict[str, Any]] = {}
        features: dict[str, dict[str, Any]] = {}

        for mapping, feature in rows:
            value_type = feature.value_type or mapping.value_type or "BOOLEAN"
            value = cls._typed_value(mapping, feature)
            assignment = {
                "feature_key": feature.key,
                "name": feature.name,
                "value_type": value_type,
                "value": value,
                "enabled": bool(mapping.enabled),
                "scope_type": mapping.scope_type or feature.scope_type,
                "enforcement_mode": mapping.enforcement_mode or feature.enforcement_mode,
                "hard_ceiling": (
                    mapping.hard_ceiling.get("value")
                    if isinstance(mapping.hard_ceiling, dict)
                    else mapping.hard_ceiling
                ),
                "unit": feature.unit,
                "period": feature.period,
                "source": "TYPED_PLAN_ASSIGNMENT",
            }
            assignments.append(assignment)

            limit_key = CATALOG_LIMIT_KEYS.get(feature.key)
            if limit_key:
                limits[limit_key] = {
                    "key": limit_key,
                    "allowed": value,
                    "hard_ceiling": assignment["hard_ceiling"],
                    "enforcement_mode": assignment["enforcement_mode"],
                    "overage_policy": (
                        {"action": "BILL"}
                        if assignment["enforcement_mode"] == "METERED_OVERAGE"
                        else {"action": "WARN"}
                        if assignment["enforcement_mode"] == "SOFT_WARNING"
                        else {"action": "DENY"}
                    ),
                    "unit": feature.unit,
                    "period": feature.period,
                    "source": "TYPED_PLAN_ASSIGNMENT",
                    "feature_key": feature.key,
                }
            else:
                features[feature.key] = assignment

        legacy_keys: list[str] = []
        if include_legacy_compatibility:
            for limit_key, attribute in cls.LEGACY_LIMIT_FIELDS.items():
                if limit_key in limits:
                    continue
                value = getattr(plan, attribute, None)
                if value is None:
                    continue
                legacy_keys.append(limit_key)
                limits[limit_key] = {
                    "key": limit_key,
                    "allowed": int(value),
                    "hard_ceiling": None,
                    "enforcement_mode": "HARD",
                    "overage_policy": {"action": "DENY"},
                    "unit": None,
                    "period": None,
                    "source": "LEGACY_PLAN_COMPATIBILITY",
                    "feature_key": None,
                }

        return {
            "assignments": assignments,
            "features": features,
            "limits": limits,
            "availability": "PARTIAL" if legacy_keys else "AVAILABLE",
            "source": (
                "TYPED_PLAN_ASSIGNMENTS_WITH_LEGACY_COMPATIBILITY"
                if legacy_keys
                else "TYPED_PLAN_ASSIGNMENTS"
            ),
            "legacy_compatibility_keys": legacy_keys,
        }
