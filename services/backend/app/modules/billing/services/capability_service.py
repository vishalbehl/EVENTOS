from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.billing.capability_registry import CATALOG_LIMIT_KEYS, FEATURE_DEFINITIONS, LIMIT_DEFINITIONS, OPERATION_PERMISSIONS
from app.modules.billing.services.capability_cache_service import CapabilityCacheService
from app.modules.billing.services.entitlement_resolver import EntitlementResolver
from app.modules.billing.services.event_entitlement_service import EventEntitlementService
from app.modules.billing.services.platform_flag_service import PlatformFlagService
from app.modules.billing.services.usage_service import UsageService
from app.modules.events.models.event import Event
from app.modules.platform.models.feature import FeatureCatalog
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.organization_console import (
    CapabilityRestriction,
    OrganizationNotificationChannelConfig,
    UsageLedgerEntry,
    UsageReservation,
)
from app.modules.identity.models.user import User
from app.modules.integrations.models.integrations_domain_tables import IntegrationConnection
from app.modules.analytics.models.analytics_domain_tables import ApiUsageMetric


class CapabilityService:
    @staticmethod
    def _enabled(value: Any) -> bool:
        if isinstance(value, dict):
            value = value.get("value", value.get("enabled"))
        if isinstance(value, str):
            return value.upper() not in {"", "NONE", "DISABLED", "FALSE", "NOT_INCLUDED"}
        return bool(value)

    @staticmethod
    async def sync_catalogue(db: AsyncSession) -> dict[str, Any]:
        rows = {row.key: row for row in (await db.scalars(select(FeatureCatalog))).all()}
        created: list[str] = []
        updated: list[str] = []
        for order, (key, definition) in enumerate(FEATURE_DEFINITIONS.items(), 1):
            row = rows.get(key)
            if row is None:
                row = FeatureCatalog(key=key, name=key.removeprefix("FEAT_").replace("_", " ").title(), category="CANONICAL", feature_order=order)
                db.add(row)
                rows[key] = row
                created.append(key)
            desired = {
                "scope_type": definition["scope"],
                "value_type": definition["value_type"],
                "allowed_values": definition["allowed_values"],
                "portal_routes": definition["portal_routes"],
                "backend_operations": definition["operations"],
                "required_permissions": definition.get("required_permissions", []),
                "metric_key": definition["metric_key"],
                "owner_console": definition["owner_console"],
                "dependencies": definition.get("dependencies", []),
                "conflicts": definition.get("conflicts", []),
                "risk_level": definition.get("risk_level", "MEDIUM"),
            }
            changed = False
            for field, value in desired.items():
                if getattr(row, field, None) != value:
                    setattr(row, field, value)
                    changed = True
            row.enforcement_mode = row.enforcement_mode or "HARD"
            if changed and key not in created:
                row.version = (row.version or 0) + 1
                updated.append(key)
        for offset, (catalogue_key, limit_key) in enumerate(CATALOG_LIMIT_KEYS.items(), len(FEATURE_DEFINITIONS) + 1):
            definition = LIMIT_DEFINITIONS[limit_key]
            row = rows.get(catalogue_key)
            if row is None:
                row = FeatureCatalog(
                    key=catalogue_key,
                    name=limit_key.replace("_", " ").title(),
                    category="LIMITS",
                    feature_order=offset,
                    value_type="LIMIT",
                    default_value={"value": 0},
                )
                db.add(row)
                rows[catalogue_key] = row
                created.append(catalogue_key)
            desired = {
                "scope_type": definition["scope"],
                "value_type": "LIMIT",
                "metric_key": definition["metric_key"],
                "unit": definition["unit"],
                "period": definition["period"],
            }
            # Some commercial limits are also customer-facing features. Their
            # code-owned routes and operation gates were already synchronized
            # above and must not be cleared by the limit metadata pass.
            if catalogue_key not in FEATURE_DEFINITIONS:
                desired.update({
                    "allowed_values": [],
                    "portal_routes": [],
                    "backend_operations": [],
                    "required_permissions": [],
                    "owner_console": "BUSINESS",
                    "dependencies": [],
                    "conflicts": [],
                    "risk_level": "MEDIUM",
                })
            changed = False
            for field, value in desired.items():
                if getattr(row, field, None) != value:
                    setattr(row, field, value)
                    changed = True
            if changed and catalogue_key not in created:
                row.version = (row.version or 0) + 1
                updated.append(catalogue_key)
        await db.flush()
        unknown_active = sorted(
            key for key, row in rows.items()
            if row.is_active and key not in FEATURE_DEFINITIONS and not key.startswith("LIMIT_")
        )
        return {
            "created": created,
            "updated": updated,
            "registered": len(FEATURE_DEFINITIONS),
            "unknown_active": unknown_active,
        }

    @staticmethod
    async def resolve_event(
        db: AsyncSession,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        *,
        user_id: uuid.UUID | None = None,
        environment: str = "ALL",
    ) -> dict[str, Any]:
        cache_revision, cached = await CapabilityCacheService.get(
            db, organization_id, event_id, environment, user_id
        )
        if cached is not None:
            return cached
        now = datetime.now(timezone.utc)
        organization = await db.get(Organization, organization_id)
        event = await db.scalar(select(Event).where(Event.id == event_id, Event.organization_id == organization_id))
        if not organization or not event:
            raise LookupError("Event does not belong to the selected organization")
        resolved = await EventEntitlementService.resolve(db, organization_id, event_id, explain=True)
        catalogue = {row.key: row for row in (await db.scalars(select(FeatureCatalog).where(FeatureCatalog.is_active.is_(True)))).all()}
        flags = await PlatformFlagService.evaluate(db, organization_id=organization_id, event_id=event_id, user_id=user_id, environment=environment)
        restrictions = (await db.scalars(select(CapabilityRestriction).where(
            CapabilityRestriction.status == "APPROVED",
            or_(CapabilityRestriction.organization_id.is_(None), CapabilityRestriction.organization_id == organization_id),
            or_(CapabilityRestriction.event_id.is_(None), CapabilityRestriction.event_id == event_id),
            CapabilityRestriction.effective_at <= now,
            or_(CapabilityRestriction.expires_at.is_(None), CapabilityRestriction.expires_at > now),
        ))).all()
        restriction_by_key = {row.capability_key: row for row in restrictions if row.capability_key}
        broad_restriction = next((row for row in restrictions if row.capability_key is None), None)
        provider_channels = set(
            (
                await db.scalars(
                    select(OrganizationNotificationChannelConfig.channel).where(
                        OrganizationNotificationChannelConfig.organization_id
                        == organization_id,
                        OrganizationNotificationChannelConfig.channel.in_(
                            ["SMS", "WHATSAPP", "PUSH"]
                        ),
                        OrganizationNotificationChannelConfig.state == "ACTIVE",
                        OrganizationNotificationChannelConfig.last_verified_at.is_not(
                            None
                        ),
                        OrganizationNotificationChannelConfig.deleted_at.is_(
                            None
                        ),
                    )
                )
            ).all()
        )
        provider_feature_channels = {
            "FEAT_SMS": "SMS",
            "FEAT_WHATSAPP": "WHATSAPP",
            "FEAT_PUSH_NOTIFICATIONS": "PUSH",
        }
        features: dict[str, dict[str, Any]] = {}
        all_feature_keys = set(FEATURE_DEFINITIONS) | set(resolved.get("features", {}))
        for key in sorted(all_feature_keys):
            definition = FEATURE_DEFINITIONS.get(key, {})
            resolved_features = resolved.get("features", {})
            source = resolved_features.get(key, {})
            source_lineage = resolved.get("sources", {}).get(key, [])
            legacy_parent = definition.get("legacy_parent")
            if (
                not source
                and resolved.get("rollout_mode") in {"LEGACY", "SHADOW"}
                and legacy_parent
                and resolved_features.get(legacy_parent)
            ):
                parent_source = resolved_features[legacy_parent]
                parent_value = parent_source.get(
                    "value",
                    parent_source.get("enabled", False),
                )
                source = {
                    "value": parent_value,
                    "enabled": CapabilityService._enabled(parent_value),
                    "value_type": definition.get("value_type", "BOOLEAN"),
                    "source_type": "LEGACY_PARENT_COMPATIBILITY",
                    "source_ref": legacy_parent,
                }
                source_lineage = [
                    {
                        "source": "LEGACY_PARENT_COMPATIBILITY",
                        "source_ref": legacy_parent,
                        "value": parent_value,
                    }
                ]
            raw_value = source.get("value", source.get("enabled", False))
            enabled = CapabilityService._enabled(raw_value)
            reason_code = None if enabled else "NOT_ENTITLED"
            restriction = restriction_by_key.get(key) or broad_restriction
            if not resolved["availability"]["available"]:
                enabled, reason_code = False, "CONTRACT_REQUIRED"
            elif not organization.is_active or organization.suspended_at:
                enabled, reason_code = False, "SUSPENDED"
            elif str(getattr(event, "status", "")).lower() in {"suspended", "archived", "cancelled"}:
                enabled, reason_code = False, "SUSPENDED"
            elif restriction:
                enabled, reason_code = False, restriction.reason_code or "SECURITY_RESTRICTED"
            relevant_flags = {flag_key: flag for flag_key, flag in flags.items() if key in (flag.get("target_capabilities") or [])}
            kill = next((flag for flag in relevant_flags.values() if flag["flag_type"] == "KILL_SWITCH" and flag["value"] is True), None)
            rollout_disabled = next((flag for flag in relevant_flags.values() if flag["flag_type"] in {"RELEASE", "OPERATIONAL"} and flag["value"] is False), None)
            if kill:
                enabled, reason_code = False, "SECURITY_RESTRICTED"
            elif rollout_disabled:
                enabled, reason_code = False, "ROLLOUT_DISABLED"
            elif (
                enabled
                and key in provider_feature_channels
                and provider_feature_channels[key] not in provider_channels
            ):
                enabled, reason_code = False, "PROVIDER_UNAVAILABLE"
            backend_mode = definition.get("backend_mode", "NOT_IMPLEMENTED")
            if enabled and backend_mode == "PROVIDER_REQUIRED":
                enabled, reason_code = False, "PROVIDER_UNAVAILABLE"
            elif enabled and backend_mode == "NOT_IMPLEMENTED":
                enabled, reason_code = False, "ROLLOUT_DISABLED"
            meta = catalogue.get(key)
            features[key] = {
                "key": key,
                "name": meta.name if meta else key,
                "value_type": meta.value_type if meta else FEATURE_DEFINITIONS.get(key, {}).get("value_type", "BOOLEAN"),
                "allowed_values": (meta.allowed_values if meta else None) or FEATURE_DEFINITIONS.get(key, {}).get("allowed_values", []),
                "value": raw_value,
                "enabled": enabled,
                "reason_code": reason_code,
                "source": source.get("source_type"),
                "sources": source_lineage,
                "flags": relevant_flags,
                "upgrade_url": "/subscriptions",
                "owner_console": meta.owner_console if meta else definition.get("owner_console", "BUSINESS"),
                "portal_routes": definition.get("portal_routes", []),
                "page_gate": definition.get("page_gate", False),
                "operations": definition.get("operations", []),
                "backend_mode": backend_mode,
                "availability_note": definition.get("availability_note"),
                "operation_permissions": {
                    operation: OPERATION_PERMISSIONS[operation]
                    for operation in definition.get("operations", [])
                },
            }
        limits: dict[str, dict[str, Any]] = {}
        all_limit_keys = set(LIMIT_DEFINITIONS) | set(resolved.get("limits", {}))
        for key in sorted(all_limit_keys):
            definition = LIMIT_DEFINITIONS.get(key, {})
            limit_row = resolved.get("limits", {}).get(key, {})
            allowed = limit_row.get("limit_value")
            metric = definition.get("metric_key", key)
            if key in UsageService.METRIC_STRATEGIES:
                used = await UsageService.get_effective_event_metric(db, event_id, key)
            else:
                usage_filters = [UsageLedgerEntry.organization_id == organization_id, UsageLedgerEntry.metric_key == metric]
                if definition.get("scope") != "ORGANIZATION":
                    usage_filters.append(UsageLedgerEntry.event_id == event_id)
                else:
                    usage_filters.append(UsageLedgerEntry.event_id.is_(None))
                if definition.get("period") == "BILLING_PERIOD":
                    usage_filters.extend((UsageLedgerEntry.period_start <= now, UsageLedgerEntry.period_end > now))
                used = int(await db.scalar(select(func.coalesce(func.sum(UsageLedgerEntry.quantity), 0)).where(*usage_filters)) or 0)
            reservation_filters = [
                UsageReservation.organization_id == organization_id,
                UsageReservation.metric_key == key,
                UsageReservation.status == "RESERVED",
                UsageReservation.expires_at > now,
            ]
            if definition.get("scope") != "ORGANIZATION":
                reservation_filters.append(UsageReservation.event_id == event_id)
            reserved = int(await db.scalar(select(func.coalesce(func.sum(UsageReservation.quantity), 0)).where(*reservation_filters)) or 0)
            remaining = None if allowed is None else max(int(allowed) - used - reserved, 0)
            limits[key] = {"key": key, "allowed": allowed, "used": used, "reserved": reserved, "remaining": remaining, "unit": definition.get("unit"), "period": definition.get("period"), "hard_ceiling": resolved.get("hard_ceilings", {}).get(key), "reason_code": "QUOTA_EXHAUSTED" if remaining == 0 and allowed is not None else None, "sources": resolved.get("sources", {}).get(key, [])}
        result = {
            "organization_id": str(organization_id), "event_id": str(event_id),
            "contract_version": resolved.get("contract_version"), "resolution_version": resolved["resolution_version"],
            "rollout_mode": resolved["rollout_mode"], "features": features, "limits": limits,
            "restrictions": [{"id": str(row.id), "capability_key": row.capability_key, "reason_code": row.reason_code, "reason": row.reason, "expires_at": row.expires_at} for row in restrictions],
            "flags": flags,
            "availability": {
                "available": resolved["availability"]["available"],
                "reason": None if resolved["availability"]["available"] else "CONTRACT_REQUIRED",
                "diagnostic_reason": resolved["availability"].get("reason"),
                "legacy_activation_available": resolved["availability"].get("legacy_activation_available", False),
            },
            "freshness_at": now,
        }
        if not CapabilityCacheService.has_pending_changes(db):
            await CapabilityCacheService.put(
                organization_id, event_id, cache_revision, environment, user_id, result
            )
        return result

    @staticmethod
    async def resolve_organization(db: AsyncSession, organization_id: uuid.UUID, *, user_id: uuid.UUID | None = None, environment: str = "ALL") -> dict[str, Any]:
        cache_revision, cached = await CapabilityCacheService.get(
            db, organization_id, None, environment, user_id
        )
        if cached is not None:
            return cached
        organization = await db.get(Organization, organization_id)
        if not organization:
            raise LookupError("Organization not found")
        base = await EntitlementResolver.resolve_org_entitlements(db, organization_id, explain=True)
        now = datetime.now(timezone.utc)
        flags = await PlatformFlagService.evaluate(db, organization_id=organization_id, event_id=None, user_id=user_id, environment=environment)
        restrictions = (await db.scalars(select(CapabilityRestriction).where(CapabilityRestriction.status == "APPROVED", or_(CapabilityRestriction.organization_id.is_(None), CapabilityRestriction.organization_id == organization_id), CapabilityRestriction.event_id.is_(None), CapabilityRestriction.effective_at <= now, or_(CapabilityRestriction.expires_at.is_(None), CapabilityRestriction.expires_at > now)))).all()
        source_features = base.get("features", {})
        features: dict[str, Any] = {}
        for key in sorted(set(FEATURE_DEFINITIONS) | set(source_features)):
            source = source_features.get(key, {})
            value = source.get("value", source.get("enabled", False))
            enabled = CapabilityService._enabled(value)
            reason = None if enabled else "NOT_ENTITLED"
            restriction = next((item for item in restrictions if item.capability_key in {None, key}), None)
            relevant_flags = {flag_key: flag for flag_key, flag in flags.items() if key in (flag.get("target_capabilities") or [])}
            if not organization.is_active or organization.suspended_at:
                enabled, reason = False, "SUSPENDED"
            elif restriction:
                enabled, reason = False, restriction.reason_code
            elif any(flag["flag_type"] == "KILL_SWITCH" and flag["value"] is True for flag in relevant_flags.values()):
                enabled, reason = False, "SECURITY_RESTRICTED"
            elif any(flag["flag_type"] in {"RELEASE", "OPERATIONAL"} and flag["value"] is False for flag in relevant_flags.values()):
                enabled, reason = False, "ROLLOUT_DISABLED"
            definition = FEATURE_DEFINITIONS.get(key, {})
            backend_mode = definition.get("backend_mode", "NOT_IMPLEMENTED")
            if enabled and backend_mode == "PROVIDER_REQUIRED":
                enabled, reason = False, "PROVIDER_UNAVAILABLE"
            elif enabled and backend_mode == "NOT_IMPLEMENTED":
                enabled, reason = False, "ROLLOUT_DISABLED"
            features[key] = {
                "key": key,
                "name": key,
                "value_type": definition.get("value_type", "BOOLEAN"),
                "allowed_values": definition.get("allowed_values", []),
                "value": value,
                "enabled": enabled,
                "reason_code": reason,
                "source": source.get("source_type"),
                "sources": base.get("sources", {}).get(key, []),
                "flags": relevant_flags,
                "upgrade_url": "/subscriptions",
                "owner_console": definition.get("owner_console", "BUSINESS"),
                "portal_routes": definition.get("portal_routes", []),
                "page_gate": definition.get("page_gate", False),
                "operations": definition.get("operations", []),
                "backend_mode": backend_mode,
                "availability_note": definition.get("availability_note"),
                "operation_permissions": {
                    operation: OPERATION_PERMISSIONS[operation]
                    for operation in definition.get("operations", [])
                },
            }
        source_limits = base.get("limits", {})
        limits: dict[str, Any] = {}
        for key, definition in LIMIT_DEFINITIONS.items():
            if definition.get("scope") != "ORGANIZATION":
                continue
            item = source_limits.get(key, {})
            allowed = item.get("limit_value")
            if key == "max_events":
                used = int(await db.scalar(select(func.count(Event.id)).where(Event.organization_id == organization_id, Event.deleted_at.is_(None), ~func.lower(Event.status).in_(["archived", "cancelled"]))) or 0)
            elif key == "max_users":
                used = int(await db.scalar(select(func.count(User.id)).where(User.organization_id == organization_id, User.is_active.is_(True))) or 0)
            elif key == "max_integrations":
                used = int(await db.scalar(select(func.count(IntegrationConnection.id)).where(IntegrationConnection.organization_id == organization_id, IntegrationConnection.is_active.is_(True))) or 0)
            elif key == "max_api_calls_per_month":
                period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                authoritative = int(await db.scalar(select(func.coalesce(func.sum(ApiUsageMetric.call_count), 0)).where(
                    ApiUsageMetric.organization_id == organization_id,
                    ApiUsageMetric.period_start == period_start,
                )) or 0)
                ledger = int(await db.scalar(select(func.coalesce(func.sum(UsageLedgerEntry.quantity), 0)).where(
                    UsageLedgerEntry.organization_id == organization_id,
                    UsageLedgerEntry.event_id.is_(None),
                    UsageLedgerEntry.metric_key == definition.get("metric_key", key),
                    UsageLedgerEntry.period_start <= now,
                    UsageLedgerEntry.period_end > now,
                )) or 0)
                used = max(authoritative, ledger)
            else:
                usage_filters = [UsageLedgerEntry.organization_id == organization_id, UsageLedgerEntry.event_id.is_(None), UsageLedgerEntry.metric_key == definition.get("metric_key", key)]
                if definition.get("period") == "BILLING_PERIOD":
                    usage_filters.extend((UsageLedgerEntry.period_start <= now, UsageLedgerEntry.period_end > now))
                used = int(await db.scalar(select(func.coalesce(func.sum(UsageLedgerEntry.quantity), 0)).where(*usage_filters)) or 0)
            reservation_filters = [UsageReservation.organization_id == organization_id, UsageReservation.metric_key == key, UsageReservation.status == "RESERVED", UsageReservation.expires_at > now]
            reserved = int(await db.scalar(select(func.coalesce(func.sum(UsageReservation.quantity), 0)).where(*reservation_filters)) or 0)
            remaining = None if allowed is None else max(int(allowed) - used - reserved, 0)
            limits[key] = {"key": key, "allowed": allowed, "used": used, "reserved": reserved, "remaining": remaining, "unit": definition.get("unit"), "period": definition.get("period"), "source": item.get("source_type"), "reason_code": "QUOTA_EXHAUSTED" if remaining == 0 and allowed is not None else None}
        version = hashlib.sha256(json.dumps({"organization_id": str(organization_id), "features": features, "limits": limits}, sort_keys=True, default=str).encode()).hexdigest()
        result = {"organization_id": str(organization_id), "resolution_version": version, "rollout_mode": "ENFORCED", "features": features, "limits": limits, "restrictions": [{"id": str(row.id), "capability_key": row.capability_key, "reason_code": row.reason_code, "expires_at": row.expires_at} for row in restrictions], "availability": {"available": True}, "freshness_at": now}
        if not CapabilityCacheService.has_pending_changes(db):
            await CapabilityCacheService.put(
                organization_id, None, cache_revision, environment, user_id, result
            )
        return result
