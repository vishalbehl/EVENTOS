"""Canonical event entitlement resolution for enforcement and administration.

The immutable billing activation snapshot is the commercial baseline. Approved
Organizer Console overrides are layered in a deterministic order and platform
ceilings are applied last. Consumers must use this service instead of resolving
console contracts independently.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from loguru import logger
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.billing.capability_registry import PLATFORM_HARD_CEILINGS
from app.modules.billing.services.capability_diagnostics_service import (
    CapabilityDiagnosticsService,
)
from app.modules.billing.services.entitlement_resolver import EntitlementResolver
from app.modules.platform.models.organization_console import (
    EntitlementOverrideRequest,
    EventCommercialContract,
)
from app.modules.platform.models.platform_domain_tables import FeatureFlag


class EventEntitlementService:
    @staticmethod
    def _typed_value(raw: Any) -> tuple[str, Any]:
        if isinstance(raw, dict) and "value" in raw:
            value_type = str(raw.get("type") or raw.get("value_type") or "BOOLEAN").upper()
            return value_type, raw.get("value")
        if isinstance(raw, bool):
            return "BOOLEAN", raw
        if isinstance(raw, str):
            return "TIER", raw
        return "LIMIT", raw

    @staticmethod
    def _feature_enabled(value: Any) -> bool:
        if isinstance(value, str):
            return value.upper() not in {"", "NONE", "DISABLED", "FALSE", "NOT_INCLUDED"}
        return bool(value)

    @staticmethod
    def _apply(current: Any, operation: str, requested: Any, baseline: Any) -> Any:
        if operation == "INCREMENT":
            return (current or 0) + requested
        if operation == "DECREMENT":
            return max(0, (current or 0) - requested)
        if operation == "UNLOCK":
            return True
        if operation == "RESTRICT":
            return False
        if operation == "RESET":
            return baseline
        return requested

    @staticmethod
    async def resolve(
        db: AsyncSession,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        *,
        explain: bool = True,
        at: datetime | None = None,
        ignore_rollout_flag: bool = False,
    ) -> dict[str, Any]:
        now = at or datetime.now(timezone.utc)
        base = await EntitlementResolver.resolve_event_entitlements(
            db, organization_id, event_id, explain=True
        )
        activation = base.get("activation")
        features = {key: dict(value) for key, value in base.get("features", {}).items()}
        limits = {key: dict(value) for key, value in base.get("limits", {}).items()}
        legacy_features = {key: dict(value) for key, value in features.items()}
        legacy_limits = {key: dict(value) for key, value in limits.items()}
        baseline_features = {key: bool(value.get("enabled")) for key, value in features.items()}
        baseline_limits = {key: value.get("limit_value") for key, value in limits.items()}

        contract = await db.scalar(
            select(EventCommercialContract)
            .where(
                EventCommercialContract.organization_id == organization_id,
                EventCommercialContract.event_id == event_id,
                EventCommercialContract.status == "ACTIVE",
                EventCommercialContract.effective_at <= now,
                or_(EventCommercialContract.ends_at.is_(None), EventCommercialContract.ends_at > now),
            )
            .order_by(EventCommercialContract.version.desc())
            .limit(1)
        )
        hard_ceilings = dict(PLATFORM_HARD_CEILINGS)
        if contract:
            for key, contract_ceiling in (contract.hard_ceilings or {}).items():
                platform_ceiling = PLATFORM_HARD_CEILINGS.get(key)
                hard_ceilings[key] = (
                    min(contract_ceiling, platform_ceiling)
                    if isinstance(contract_ceiling, (int, float))
                    and isinstance(platform_ceiling, (int, float))
                    else contract_ceiling
                )
        ceiling_sources = (
            dict((contract.source or {}).get("ceiling_sources", {})) if contract else {}
        )
        contract_lineage: dict[str, list[dict[str, Any]]] = {}

        # A versioned event contract replaces the mutable plan snapshot as the
        # commercial baseline. Legacy activation data is retained only for
        # shadow comparison and pre-backfill availability diagnostics.
        if contract:
            for key, raw in (contract.entitlements or {}).items():
                value_type, value = EventEntitlementService._typed_value(raw)
                if value_type in {"BOOLEAN", "TIER", "ENUM"}:
                    features[key] = {"enabled": EventEntitlementService._feature_enabled(value), "value": value, "value_type": value_type, "scope_type": "EVENT_SCOPED", "source_type": "CONTRACT_SNAPSHOT", "source_ref": str(contract.id)}
                else:
                    limits[key] = {"limit_value": value, "value_type": "LIMIT", "scope_type": "EVENT_SCOPED", "source_type": "CONTRACT_SNAPSHOT", "source_ref": str(contract.id)}
                contract_lineage.setdefault(key, []).append({"source": "CONTRACT_SNAPSHOT", "source_ref": str(contract.id), "contract_version": contract.version, "value": value})
            baseline_features = {key: value.get("value", bool(value.get("enabled"))) for key, value in features.items()}
            baseline_limits = {key: value.get("limit_value") for key, value in limits.items()}

            for addon in contract.addons or []:
                addon_values = addon.get("entitlements") if isinstance(addon, dict) else None
                if not isinstance(addon_values, dict) and isinstance(addon, dict) and addon.get("key"):
                    addon_values = {addon["key"]: addon.get("value", True)}
                for key, raw_requested in (addon_values or {}).items():
                    value_type, requested = EventEntitlementService._typed_value(raw_requested)
                    operation = str(addon.get("operation", "INCREMENT" if isinstance(requested, (int, float)) and not isinstance(requested, bool) else "REPLACE")).upper()
                    quantity = max(1, int(addon.get("quantity") or 1))
                    if (
                        quantity > 1
                        and operation in {"INCREMENT", "DECREMENT"}
                        and isinstance(requested, (int, float))
                        and not isinstance(requested, bool)
                    ):
                        requested *= quantity
                    if value_type in {"BOOLEAN", "TIER", "ENUM"}:
                        current = features.get(key, {}).get("value", features.get(key, {}).get("enabled", False))
                        value = EventEntitlementService._apply(current, operation, requested, baseline_features.get(key, False))
                        features[key] = {"enabled": EventEntitlementService._feature_enabled(value), "value": value, "value_type": value_type, "scope_type": "EVENT_SCOPED", "source_type": "PURCHASED_ADDON", "source_ref": str(addon.get("id") or addon.get("key") or contract.id)}
                    else:
                        current = limits.get(key, {}).get("limit_value")
                        value = EventEntitlementService._apply(current, operation, requested, baseline_limits.get(key))
                        limits[key] = {"limit_value": value, "scope_type": "EVENT_SCOPED", "source_type": "PURCHASED_ADDON", "source_ref": str(addon.get("id") or addon.get("key") or contract.id)}
                    contract_lineage.setdefault(key, []).append({"source": "PURCHASED_ADDON", "source_ref": str(addon.get("id") or addon.get("key") or contract.id), "operation": operation, "quantity": quantity, "value": value})

        override_rows = (
            await db.scalars(
                select(EntitlementOverrideRequest).where(
                    EntitlementOverrideRequest.organization_id == organization_id,
                    EntitlementOverrideRequest.status == "APPROVED",
                    EntitlementOverrideRequest.effective_at <= now,
                    or_(
                        EntitlementOverrideRequest.expires_at.is_(None),
                        EntitlementOverrideRequest.expires_at > now,
                    ),
                    or_(
                        EntitlementOverrideRequest.event_id.is_(None),
                        EntitlementOverrideRequest.event_id == event_id,
                    ),
                )
            )
        ).all()
        # Organization grants precede event grants. Restrictions are always last.
        override_rows = sorted(
            (row for row in override_rows if not row.entitlement_key.startswith("usage.")),
            key=lambda row: (
                row.operation == "RESTRICT",
                row.event_id is not None,
                row.effective_at,
                row.created_at,
                str(row.id),
            ),
        )

        source_breakdown: dict[str, list[dict[str, Any]]] = {}
        for key, value in features.items():
            source_breakdown[key] = contract_lineage.get(key) or [{
                "source": value.get("source_type", "ACTIVATION_SNAPSHOT"),
                "source_ref": value.get("source_ref"),
                "value": value.get("value", bool(value.get("enabled"))),
            }]
        for key, value in limits.items():
            source_breakdown[key] = contract_lineage.get(key) or [{
                "source": value.get("source_type", "ACTIVATION_SNAPSHOT"),
                "source_ref": value.get("source_ref"),
                "value": value.get("limit_value"),
            }]

        for row in override_rows:
            key = row.entitlement_key
            ceiling_applied = False
            ceiling = hard_ceilings.get(key)
            if key in limits or key in baseline_limits:
                existing = limits.setdefault(key, {
                    "limit_value": baseline_limits.get(key),
                    "scope_type": "EVENT_SCOPED",
                    "source_type": "OVERRIDE",
                    "source_ref": str(row.id),
                })
                value = EventEntitlementService._apply(
                    existing.get("limit_value"), row.operation, row.requested_value, baseline_limits.get(key)
                )
                if isinstance(value, (int, float)) and isinstance(ceiling, (int, float)):
                    ceiling_applied = value > ceiling
                    value = min(value, ceiling)
                existing.update(limit_value=value, source_type="OVERRIDE", source_ref=str(row.id))
            else:
                existing = features.setdefault(key, {
                    "enabled": baseline_features.get(key, False),
                    "scope_type": "EVENT_SCOPED",
                    "source_type": "OVERRIDE",
                    "source_ref": str(row.id),
                })
                current = existing.get("value", bool(existing.get("enabled")))
                value = EventEntitlementService._apply(current, row.operation, row.requested_value, baseline_features.get(key, False))
                existing.update(
                    enabled=EventEntitlementService._feature_enabled(value),
                    value=value,
                    source_type="OVERRIDE",
                    source_ref=str(row.id),
                    denial_reason="Restricted by approved administrative control" if not value else None,
                )
            source_breakdown.setdefault(key, []).append({
                "source": "EVENT_OVERRIDE" if row.event_id else "ORGANIZATION_OVERRIDE",
                "request_id": str(row.id),
                "operation": row.operation,
                "value": value,
                "effective_at": row.effective_at.isoformat(),
                "expires_at": row.expires_at.isoformat() if row.expires_at else None,
            })
            if key in limits and ceiling_applied:
                source_breakdown[key].append({
                    "source": ceiling_sources.get(key, "HARD_PLATFORM_CEILING"),
                    "value": ceiling,
                })

        # Ceilings apply even when no override touched the limit.
        for key, ceiling in hard_ceilings.items():
            if key not in limits or not isinstance(ceiling, (int, float)):
                continue
            current = limits[key].get("limit_value")
            if isinstance(current, (int, float)) and current > ceiling:
                limits[key]["limit_value"] = ceiling
                source_breakdown.setdefault(key, []).append({
                    "source": ceiling_sources.get(key, "HARD_PLATFORM_CEILING"),
                    "value": ceiling,
                })

        values = {
            **{key: value.get("value", bool(value.get("enabled"))) for key, value in features.items()},
            **{key: value.get("limit_value") for key, value in limits.items()},
        }
        canonical_projection = dict(values)
        rollout_flags = (await db.scalars(select(FeatureFlag).where(
            FeatureFlag.organization_id == organization_id,
            FeatureFlag.flag_key.in_([
                "organizer_console_entitlement_shadow",
                "organizer_console_entitlement_enforce",
            ]),
        ))).all()
        rollout_values = {row.flag_key: row.is_enabled for row in rollout_flags}
        enforcement_enabled = bool(rollout_values.get("organizer_console_entitlement_enforce", True))
        shadow_enabled = bool(rollout_values.get("organizer_console_entitlement_shadow", False))
        compatibility_mode = not enforcement_enabled and not ignore_rollout_flag
        if compatibility_mode:
            logger.bind(
                diagnostic_type="LEGACY_RESOLVER_CALL",
                organization_id=str(organization_id),
                event_id=str(event_id),
                contract_id=str(contract.id) if contract else None,
                shadow_enabled=shadow_enabled,
            ).warning("Legacy entitlement resolver selected by rollout policy")
            if settings.environment.lower() != "testing":
                await CapabilityDiagnosticsService.record_isolated(
                    event_type="LEGACY_RESOLVER_CALL",
                    source="event_entitlement_service.resolve",
                    organization_id=organization_id,
                    event_id=event_id,
                    severity="WARNING",
                    reason_code="LEGACY_ROLLOUT_MODE",
                    metadata={
                        "contract_id": str(contract.id) if contract else None,
                        "shadow_enabled": shadow_enabled,
                    },
                )
            features, limits = legacy_features, legacy_limits
            values = {
                **{key: value.get("value", bool(value.get("enabled"))) for key, value in features.items()},
                **{key: value.get("limit_value") for key, value in limits.items()},
            }
            source_breakdown = {key: [{"source": value.get("source_type", "ACTIVATION_SNAPSHOT"), "source_ref": value.get("source_ref"), "value": value.get("value", bool(value.get("enabled")))}] for key, value in features.items()}
            source_breakdown.update({key: [{"source": value.get("source_type", "ACTIVATION_SNAPSHOT"), "source_ref": value.get("source_ref"), "value": value.get("limit_value")}] for key, value in limits.items()})
        version_material = {
            "snapshot": str(getattr(activation, "current_snapshot_set_id", "")),
            "contract": str(contract.id) if contract else None,
            "overrides": [str(row.id) for row in override_rows],
            "values": values,
        }
        resolution_version = hashlib.sha256(
            json.dumps(version_material, sort_keys=True, default=str, separators=(",", ":")).encode()
        ).hexdigest()
        result = {
            "event_id": str(event_id),
            "activation_id": str(activation.id) if activation else None,
            "contract_id": str(contract.id) if contract else None,
            "contract_version": contract.version if contract else None,
            "resolved_at": now,
            "resolution_version": resolution_version,
            "values": values,
            "features": features,
            "limits": limits,
            "sources": source_breakdown,
            "hard_ceilings": hard_ceilings,
            "rollout_mode": "SHADOW" if compatibility_mode and shadow_enabled else "LEGACY" if compatibility_mode else "ENFORCED",
            "canonical_projection": canonical_projection if compatibility_mode and shadow_enabled else None,
            "availability": {
                "available": bool(contract),
                "reason": None if contract else "EVENT_CONTRACT_BACKFILL_REQUIRED",
                "legacy_activation_available": bool(activation and getattr(activation, "current_snapshot_set_id", None)),
            },
        }
        if activation:
            result["activation"] = activation
        if not explain:
            result.pop("sources", None)
        return result

    @staticmethod
    async def get_limit(
        db: AsyncSession, organization_id: uuid.UUID, event_id: uuid.UUID, limit_key: str
    ) -> int | None:
        result = await EventEntitlementService.resolve(db, organization_id, event_id, explain=False)
        limit = result["limits"].get(limit_key)
        return None if limit is None else limit.get("limit_value")

    @staticmethod
    async def has_feature(
        db: AsyncSession, organization_id: uuid.UUID, event_id: uuid.UUID, feature_key: str
    ) -> bool:
        result = await EventEntitlementService.resolve(db, organization_id, event_id, explain=False)
        feature = result["features"].get(feature_key)
        return bool(feature and EventEntitlementService._feature_enabled(feature.get("value", feature.get("enabled"))))
