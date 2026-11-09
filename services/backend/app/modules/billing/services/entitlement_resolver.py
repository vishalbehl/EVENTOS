"""Resolve capabilities from the versioned commercial contract model.

This module deliberately contains no plan, subscription, or cloud add-on
table access.  Operational callers may still use the historical method names
while they migrate to contract terminology; every result is resolved from
commercial contracts, offer versions, entitlements, and tenant overrides.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Set

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.billing.models.cloud_commercial import (
    CommercialAccount,
    CommercialContract,
    CommercialContractItem,
    CommercialOffer,
    CommercialOfferEntitlement,
    CommercialOfferVersion,
)
from app.modules.billing.models.event_activation import EventActivation
from app.modules.billing.models.licensing import (
    EventEntitlementSnapshotItem,
    EventEntitlementSnapshotSet,
    EventLimitSnapshotItem,
    EntitlementGrant,
    GrantConsumption,
)
from app.modules.billing.models.commercial_support import OrganizationFeature
from app.modules.billing.capability_registry import (
    CATALOG_LIMIT_KEYS,
    FEATURE_DEFINITIONS,
    LIMIT_DEFINITIONS,
    PLATFORM_HARD_CEILINGS,
)
from app.modules.platform.models.feature import FeatureCatalog
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.platform_domain_tables import TenantLimit
from app.modules.platform.models.organization_console import EntitlementOverrideRequest


@dataclass(frozen=True)
class CommercialOfferView:
    id: uuid.UUID
    name: str
    product_family: str
    display_order: int = 0
    color_hex: Optional[str] = None


@dataclass(frozen=True)
class CommercialContractView:
    id: uuid.UUID
    offer_id: uuid.UUID
    status: str
    ends_at: Optional[datetime]
    cancel_at_period_end: bool
    billing_interval: Optional[str]
    offer: CommercialOfferView


class EntitlementResolver:
    """Compatibility-shaped capability resolver backed by commercial data."""

    # A checkout creates a pending contract and invoice, but it must not grant
    # access until the invoice is settled and activate_paid_contract() has
    # materialized allocations.
    ACTIVE_CONTRACT_STATUSES = ("ACTIVE",)
    LIVE_ACTIVATION_STATUSES = ("PENDING", "ACTIVE", "SUSPENDED", "EXPIRED", "TRANSFER_PENDING")
    EVENT_LIMIT_KEYS = (
        "max_event_team_members", "max_registrations", "max_speakers", "max_sessions",
        "max_rooms", "max_ticket_categories", "max_badge_templates",
        "max_certificate_templates", "max_emails_per_event", "storage_quota_mb",
        "max_sms_per_event", "max_whatsapp_per_event", "max_push_per_event",
        "max_exports_per_event", "max_devices_per_event",
    )

    @staticmethod
    async def _contract_rows(
        db: AsyncSession,
        organization_id: uuid.UUID,
        event_id: Optional[uuid.UUID] = None,
        entitlement_keys: Set[str] | None = None,
    ) -> list[tuple[CommercialContract, CommercialContractItem, CommercialOffer, CommercialOfferVersion, CommercialOfferEntitlement]]:
        stmt = (
            select(CommercialContract, CommercialContractItem, CommercialOffer, CommercialOfferVersion, CommercialOfferEntitlement)
            .join(CommercialAccount, CommercialAccount.id == CommercialContract.commercial_account_id)
            .join(CommercialContractItem, CommercialContractItem.contract_id == CommercialContract.id)
            .join(CommercialOffer, CommercialOffer.id == CommercialContractItem.offer_id)
            .join(CommercialOfferVersion, CommercialOfferVersion.id == CommercialContractItem.offer_version_id)
            .join(CommercialOfferEntitlement, CommercialOfferEntitlement.offer_version_id == CommercialOfferVersion.id)
            .where(
                CommercialAccount.owner_organization_id == organization_id,
                CommercialContract.status.in_(EntitlementResolver.ACTIVE_CONTRACT_STATUSES),
                CommercialContract.starts_at <= datetime.now(timezone.utc),
                or_(CommercialContract.ends_at.is_(None), CommercialContract.ends_at > datetime.now(timezone.utc)),
            )
        )
        if event_id is not None:
            stmt = stmt.where(or_(CommercialContractItem.event_id == event_id, CommercialContractItem.event_id.is_(None)))
        if entitlement_keys is not None:
            if not entitlement_keys:
                return []
            stmt = stmt.where(
                CommercialOfferEntitlement.entitlement_key.in_(entitlement_keys)
            )
        return list((await db.execute(stmt)).all())

    @staticmethod
    async def get_active_contracts(db: AsyncSession, org_id: uuid.UUID) -> Sequence[CommercialContractView]:
        """Return active canonical commercial contract views."""
        rows = await EntitlementResolver._contract_rows(db, org_id)
        by_contract: dict[uuid.UUID, CommercialContractView] = {}
        for contract, item, offer, _version, _entitlement in rows:
            by_contract.setdefault(
                contract.id,
                CommercialContractView(
                    id=contract.id,
                    offer_id=offer.id,
                    status=contract.status,
                    ends_at=contract.ends_at,
                    cancel_at_period_end=contract.cancel_at_period_end,
                    billing_interval=contract.billing_interval,
                    offer=CommercialOfferView(
                        id=offer.id,
                        name=offer.name,
                        product_family=offer.product_family,
                        display_order=offer.display_order,
                    ),
                ),
            )
        return list(by_contract.values())

    @staticmethod
    async def get_active_contract(db: AsyncSession, org_id: uuid.UUID) -> Optional[CommercialContractView]:
        """Return the organisation-level plan, never an arbitrary add-on.

        A tenant can have many simultaneous active contracts.  The organiser
        header and billing summary describe the workspace plan, while event,
        venue and capacity contracts remain visible in their own sections.
        EMC is the bounded fallback for an EMC tenant that has no workspace
        contract; all other families are compatibility fallbacks only.
        """
        contracts = await EntitlementResolver.get_active_contracts(db, org_id)
        if not contracts:
            return None
        family_priority = {
            "WORKSPACE": 0,
            "EMC": 1,
            "EVENT": 2,
            "VENUE": 3,
            "CAPACITY_ADDON": 4,
            "VENUE_ADDON": 5,
        }
        return min(
            contracts,
            key=lambda contract: (
                family_priority.get(contract.offer.product_family, 99),
                contract.offer.display_order,
                str(contract.id),
            ),
        )

    @staticmethod
    async def get_event_activation(db: AsyncSession, org_id: uuid.UUID, event_id: uuid.UUID) -> Optional[EventActivation]:
        stmt = (
            select(EventActivation)
            .options(
                selectinload(EventActivation.current_snapshot_set).selectinload(EventEntitlementSnapshotSet.feature_items),
                selectinload(EventActivation.current_snapshot_set).selectinload(EventEntitlementSnapshotSet.limit_items),
            )
            .where(
                EventActivation.organization_id == org_id,
                EventActivation.event_id == event_id,
                EventActivation.status.in_(EntitlementResolver.LIVE_ACTIVATION_STATUSES),
            )
            .order_by(EventActivation.created_at.desc())
            .limit(1)
        )
        return await db.scalar(stmt)

    @staticmethod
    async def get_activation(db: AsyncSession, activation_id: uuid.UUID) -> Optional[EventActivation]:
        stmt = (
            select(EventActivation)
            .options(
                selectinload(EventActivation.current_snapshot_set).selectinload(EventEntitlementSnapshotSet.feature_items),
                selectinload(EventActivation.current_snapshot_set).selectinload(EventEntitlementSnapshotSet.limit_items),
                selectinload(EventActivation.grant),
                selectinload(EventActivation.grant_consumption),
            )
            .where(EventActivation.id == activation_id)
        )
        return await db.scalar(stmt)

    @staticmethod
    async def resolve_entitlements(db: AsyncSession, org_id: uuid.UUID, event_id: Optional[uuid.UUID] = None) -> Set[str]:
        result = await (
            EntitlementResolver.resolve_org_entitlements(db, org_id, explain=False)
            if event_id is None
            else EntitlementResolver.resolve_event_entitlements(db, org_id, event_id, explain=False)
        )
        return set(result["features"].keys())

    @staticmethod
    async def has_feature(db: AsyncSession, org_id: uuid.UUID, feature_key: str, event_id: Optional[uuid.UUID] = None) -> bool:
        result = await (
            EntitlementResolver.resolve_org_entitlements(db, org_id, explain=True)
            if event_id is None
            else EntitlementResolver.resolve_event_entitlements(db, org_id, event_id, explain=True)
        )
        item = result["features"].get(feature_key)
        return bool(item and item.get("enabled"))

    @staticmethod
    def _value(raw: Any) -> Any:
        if isinstance(raw, dict):
            return raw.get("value", raw.get("quantity"))
        return raw

    @staticmethod
    def _limit_key(entitlement_key: str) -> Optional[str]:
        return CATALOG_LIMIT_KEYS.get(entitlement_key, entitlement_key if entitlement_key in LIMIT_DEFINITIONS else None)

    @staticmethod
    async def _resolved_sources(
        db: AsyncSession,
        org_id: uuid.UUID,
        event_id: Optional[uuid.UUID] = None,
        entitlement_keys: Set[str] | None = None,
    ) -> dict[str, dict[str, Any]]:
        sources: dict[str, dict[str, Any]] = {}
        for contract, item, offer, version, entitlement in await EntitlementResolver._contract_rows(
            db, org_id, event_id, entitlement_keys
        ):
            key = entitlement.entitlement_key
            value = entitlement.quantity if entitlement.quantity is not None else EntitlementResolver._value(entitlement.metadata_json)
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                value = value * int(item.quantity or 1)
            if key == "storage_gb" and isinstance(value, (int, float)) and not isinstance(value, bool):
                value = int(value) * 1024
            if entitlement.value_type == "BOOLEAN" and value is None:
                value = True
            limit_key = EntitlementResolver._limit_key(key)
            entry = {
                "value": value,
                "scope_type": entitlement.scope_type,
                "source_type": "COMMERCIAL_CONTRACT",
                "source_ref": str(version.id),
                "contract_id": str(contract.id),
                "offer_id": str(offer.id),
                "offer_version_id": str(version.id),
                "hard_ceiling": entitlement.hard_ceiling,
            }
            if limit_key:
                previous = sources.get(limit_key)
                additive = item.event_id is not None or limit_key == "max_events"
                if previous is None or additive:
                    if previous is not None and additive:
                        entry["value"] = int(previous.get("value") or 0) + int(value or 0)
                    sources[limit_key] = entry
            else:
                sources[key] = entry
        return sources

    @staticmethod
    async def get_org_limit(db: AsyncSession, org_id: uuid.UUID, limit_key: str, *, event_id: Optional[uuid.UUID] = None) -> Optional[int]:
        canonical = "storage_quota_mb" if limit_key == "max_storage_gb" else limit_key
        override_key = "max_storage_gb" if canonical == "storage_quota_mb" else canonical
        override = await db.scalar(select(TenantLimit.limit_value).where(TenantLimit.organization_id == org_id, TenantLimit.limit_key == override_key))
        if override is not None:
            value = int(override) * 1024 if canonical == "storage_quota_mb" and limit_key != "max_storage_gb" else int(override)
        else:
            source = (await EntitlementResolver._resolved_sources(db, org_id, event_id)).get(canonical)
            raw = source.get("value") if source else None
            value = int(raw) if isinstance(raw, (int, float)) and not isinstance(raw, bool) else None
        ceiling = PLATFORM_HARD_CEILINGS.get(canonical)
        if value is not None and ceiling is not None:
            value = min(value, int(ceiling))
        if value is not None and limit_key == "max_storage_gb":
            return value // 1024
        return value

    @staticmethod
    async def get_limit(db: AsyncSession, org_id: uuid.UUID, limit_key: str, *, event_id: Optional[uuid.UUID] = None, activation_id: Optional[uuid.UUID] = None) -> Optional[int]:
        if activation_id:
            result = await EntitlementResolver.resolve_activation_entitlements(db, activation_id, explain=True)
            item = result.get("limits", {}).get(limit_key)
            return item.get("limit_value") if item else None
        return await EntitlementResolver.get_org_limit(db, org_id, limit_key, event_id=event_id)

    @staticmethod
    async def get_org_limits(
        db: AsyncSession,
        org_id: uuid.UUID,
        limit_keys: Sequence[str],
        *,
        event_id: Optional[uuid.UUID] = None,
    ) -> dict[str, Optional[int]]:
        """Resolve a bounded set of tenant limits without per-limit queries."""
        requested = tuple(dict.fromkeys(str(key) for key in limit_keys if key))
        canonical_by_requested = {
            key: "storage_quota_mb" if key == "max_storage_gb" else key
            for key in requested
        }
        canonical_keys = set(canonical_by_requested.values())
        entitlement_keys = set(canonical_keys)
        entitlement_keys.update(
            entitlement_key for entitlement_key, canonical in CATALOG_LIMIT_KEYS.items()
            if canonical in canonical_keys
        )
        override_keys = {
            "max_storage_gb" if canonical == "storage_quota_mb" else canonical
            for canonical in canonical_keys
        }
        override_rows = (await db.execute(select(
            TenantLimit.limit_key, TenantLimit.limit_value,
        ).where(
            TenantLimit.organization_id == org_id,
            TenantLimit.limit_key.in_(override_keys),
        ))).all() if override_keys else []
        overrides = {str(key): int(value) for key, value in override_rows}
        sources = await EntitlementResolver._resolved_sources(
            db, org_id, event_id, entitlement_keys,
        ) if canonical_keys else {}

        resolved: dict[str, Optional[int]] = {}
        for requested_key, canonical in canonical_by_requested.items():
            override_key = "max_storage_gb" if canonical == "storage_quota_mb" else canonical
            if override_key in overrides:
                value: Optional[int] = overrides[override_key]
                if canonical == "storage_quota_mb" and requested_key != "max_storage_gb":
                    value *= 1024
            else:
                raw = (sources.get(canonical) or {}).get("value")
                value = int(raw) if isinstance(raw, (int, float)) and not isinstance(raw, bool) else None
            ceiling = PLATFORM_HARD_CEILINGS.get(canonical)
            if value is not None and ceiling is not None:
                value = min(value, int(ceiling))
            if value is not None and requested_key == "max_storage_gb":
                value //= 1024
            resolved[requested_key] = value
        return resolved

    @staticmethod
    async def get_org_limit_policy(db: AsyncSession, org_id: uuid.UUID, limit_key: str) -> dict[str, Any]:
        return {"enforcement_mode": "HARD", "overage_policy": {"action": "DENY"}}

    @staticmethod
    async def _resolve(
        db: AsyncSession,
        org_id: uuid.UUID,
        event_id: Optional[uuid.UUID],
        explain: bool,
        *,
        feature_keys: Set[str] | None = None,
        include_limits: bool = True,
    ) -> Dict[str, Any]:
        requested_keys = None if feature_keys is None and include_limits else set(feature_keys or ())
        sources = await EntitlementResolver._resolved_sources(
            db, org_id, event_id, requested_keys
        )
        features: dict[str, dict[str, Any]] = {}
        limits: dict[str, dict[str, Any]] = {}
        for key, source in sources.items():
            value = source.get("value")
            limit_key = EntitlementResolver._limit_key(key)
            if limit_key and include_limits:
                numeric = int(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None
                limits[limit_key] = {
                    "limit_value": numeric,
                    "scope_type": source["scope_type"],
                    "source_type": source["source_type"],
                    "source_ref": source["source_ref"],
                    "contract_id": source["contract_id"],
                    "offer_id": source["offer_id"],
                    "offer_version_id": source["offer_version_id"],
                    "activation_id": None,
                    "grant_id": None,
                    "override_source": None,
                    "denial_reason": None if numeric is not None else "NOT_ENTITLED",
                    **(await EntitlementResolver.get_org_limit_policy(db, org_id, limit_key)),
                }
            elif not limit_key and (feature_keys is None or key in feature_keys):
                enabled = bool(value) if isinstance(value, bool) else value not in (None, "", "DISABLED", "NONE", 0)
                features[key] = {
                    "enabled": enabled,
                    "value": value,
                    "value_type": "BOOLEAN" if isinstance(value, bool) else "QUANTITY",
                    "scope_type": source["scope_type"],
                    "source_type": source["source_type"],
                    "source_ref": source["source_ref"],
                    "contract_id": source["contract_id"],
                    "offer_id": source["offer_id"],
                    "offer_version_id": source["offer_version_id"],
                    "activation_id": None,
                    "grant_id": None,
                    "override_source": None,
                    "denial_reason": None if enabled else "NOT_ENTITLED",
                }

        now = datetime.now(timezone.utc)
        override_statement = (
            select(OrganizationFeature, FeatureCatalog)
            .join(FeatureCatalog, FeatureCatalog.id == OrganizationFeature.feature_id)
            .where(OrganizationFeature.organization_id == org_id)
        )
        if feature_keys is not None:
            override_statement = override_statement.where(
                FeatureCatalog.key.in_(feature_keys)
            )
        overrides = (await db.execute(override_statement)).all()
        for override, feature in overrides:
            features[feature.key] = {
                **features.get(feature.key, {}),
                "enabled": bool(override.is_enabled),
                "value": bool(override.is_enabled),
                "source_type": "ORG_OVERRIDE",
                "source_ref": str(override.organization_id),
                "override_source": "organization_feature_overrides",
                "denial_reason": None if override.is_enabled else "Disabled by organization override",
            }

        approved_statement = select(EntitlementOverrideRequest).where(
            EntitlementOverrideRequest.organization_id == org_id,
            EntitlementOverrideRequest.status == "APPROVED",
            EntitlementOverrideRequest.effective_at <= now,
            or_(EntitlementOverrideRequest.expires_at.is_(None), EntitlementOverrideRequest.expires_at > now),
        )
        if feature_keys is not None or not include_limits:
            approved_statement = approved_statement.where(
                EntitlementOverrideRequest.entitlement_key.in_(feature_keys or set())
            )
        approved_overrides = (await db.scalars(approved_statement)).all()
        for override in approved_overrides:
            key = override.entitlement_key
            requested = EntitlementResolver._value(override.requested_value)
            if key in limits and include_limits:
                current = limits[key].get("limit_value") or 0
                value = int(current) + int(requested or 0) if override.operation == "INCREMENT" else int(requested or 0)
                limits[key].update(limit_value=value, source_type="ORGANIZATION_OVERRIDE", source_ref=str(override.id))
            elif (
                override.operation in {"UNLOCK", "RESTRICT"}
                and (feature_keys is None or key in feature_keys)
            ):
                features[key] = {**features.get(key, {}), "enabled": override.operation == "UNLOCK", "source_type": "ORGANIZATION_OVERRIDE", "source_ref": str(override.id)}

        return {"features": features if explain else {k: v for k, v in features.items() if v.get("enabled")}, "limits": limits}

    @staticmethod
    async def resolve_org_entitlements(db: AsyncSession, org_id: uuid.UUID, explain: bool = False) -> Dict[str, Any]:
        result = await EntitlementResolver._resolve(db, org_id, None, explain)
        for key, item in result["limits"].items():
            item["limit_value"] = await EntitlementResolver.get_org_limit(db, org_id, key)
        return result

    @staticmethod
    async def resolve_event_entitlements(
        db: AsyncSession,
        org_id: uuid.UUID,
        event_id: uuid.UUID,
        explain: bool = False,
        *,
        feature_keys: Set[str] | None = None,
        include_limits: bool = True,
    ) -> Dict[str, Any]:
        result = await EntitlementResolver._resolve(
            db,
            org_id,
            event_id,
            explain,
            feature_keys=feature_keys,
            include_limits=include_limits,
        )
        for key, item in result["limits"].items():
            item["limit_value"] = await EntitlementResolver.get_org_limit(db, org_id, key, event_id=event_id)
        activation = await EntitlementResolver.get_event_activation(db, org_id, event_id)
        if activation:
            result["activation"] = activation
        return result

    @staticmethod
    async def resolve_activation_entitlements(db: AsyncSession, activation_id: uuid.UUID, explain: bool = False) -> Dict[str, Any]:
        activation = await EntitlementResolver.get_activation(db, activation_id)
        if not activation or not activation.current_snapshot_set:
            return {"features": {}, "limits": {}}
        feature_rows = activation.current_snapshot_set.feature_items
        limit_rows = activation.current_snapshot_set.limit_items
        features = {
            row.feature_key: {
                "enabled": row.is_enabled, "scope_type": row.scope_type, "source_type": row.source_type,
                "source_ref": row.source_ref, "activation_id": str(activation.id),
                "grant_id": str(activation.grant_id) if activation.grant_id else None,
                "contract_id": None, "offer_id": None, "offer_version_id": None, "override_source": row.override_source,
                "denial_reason": row.denial_reason_default,
            }
            for row in feature_rows if explain or row.is_enabled
        }
        limits = {
            row.limit_key: {
                "limit_value": row.limit_value, "scope_type": row.scope_type, "source_type": row.source_type,
                "source_ref": row.source_ref, "activation_id": str(activation.id),
                "grant_id": str(activation.grant_id) if activation.grant_id else None,
                "contract_id": None, "offer_id": None, "offer_version_id": None, "override_source": row.override_source,
                "denial_reason": None,
            }
            for row in limit_rows
        }
        return {"features": features, "limits": limits, "activation": activation}

    @staticmethod
    async def build_live_entitlement_package(
        db: AsyncSession, *, organization_id: uuid.UUID, event_id: uuid.UUID,
        contract_id: Optional[uuid.UUID], grant_id: Optional[uuid.UUID],
        activation_id: Optional[uuid.UUID], policy_type: str, resolution_reason: str,
    ) -> Dict[str, Any]:
        resolved = await EntitlementResolver.resolve_event_entitlements(db, organization_id, event_id, explain=True)
        return {
            "organization_id": str(organization_id), "event_id": str(event_id),
            "contract_id": str(contract_id) if contract_id else None,
            "grant_id": str(grant_id) if grant_id else None, "activation_id": str(activation_id) if activation_id else None,
            "plan_id": None, "policy_type": policy_type, "resolution_reason": resolution_reason,
            "resolver_version": "commercial-v1", "features": resolved.get("features", {}), "limits": resolved.get("limits", {}),
        }

    @staticmethod
    def build_snapshot_checksum(package: Dict[str, Any], version: int) -> str:
        canonical = {
            "activation_id": package.get("activation_id"), "snapshot_version": version,
            "resolver_version": package["resolver_version"], "policy_type": package["policy_type"],
            "resolution_reason": package["resolution_reason"],
            "features": [{"feature_key": key, **{field: package["features"][key].get(field) for field in ("scope_type", "enabled", "source_type", "source_ref", "override_source", "denial_reason")}} for key in sorted(package["features"])],
            "limits": [{"limit_key": key, **{field: package["limits"][key].get(field) for field in ("scope_type", "limit_value", "source_type", "source_ref", "override_source")}} for key in sorted(package["limits"])],
        }
        return hashlib.sha256(json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
