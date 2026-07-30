from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.billing.capability_registry import registry_coverage
from app.modules.billing.models.event_activation import EventActivation
from app.modules.billing.services.entitlement_resolver import EntitlementResolver
from app.modules.billing.services.event_entitlement_service import (
    EventEntitlementService,
)
from app.modules.platform.models.feature import FeatureCatalog
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.organization_console import (
    CapabilityDiagnosticEvent,
    EntitlementShadowComparison,
    EventCommercialContract,
    OrganizationNotificationChannelConfig,
    UsageReconciliationRun,
)
from app.modules.platform.models.platform_domain_tables import FeatureFlag
from app.modules.platform.services.metering_service import MeteringService


class CapabilityRolloutPreflightService:
    """Canonical, read-only promotion evidence for one organization."""

    SHADOW_FRESHNESS_HOURS = 26
    PROVIDER_VERIFICATION_DAYS = 30
    DIAGNOSTIC_WINDOW_HOURS = 24
    ROLLOUT_FLAG_KEYS = (
        "organizer_console_entitlement_shadow",
        "organizer_console_entitlement_enforce",
    )
    PROVIDER_FEATURE_CHANNELS = {
        "FEAT_SMS": "SMS",
        "FEAT_WHATSAPP": "WHATSAPP",
        "FEAT_PUSH_NOTIFICATIONS": "PUSH",
    }

    @staticmethod
    def _issue(
        code: str,
        message: str,
        *,
        event_id: uuid.UUID | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return {
            "code": code,
            "message": message,
            "event_id": event_id,
            "metadata": metadata or {},
        }

    @staticmethod
    async def evaluate(
        db: AsyncSession,
        organization_id: uuid.UUID,
        *,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        now = now or datetime.now(timezone.utc)
        freshness_cutoff = now - timedelta(
            hours=CapabilityRolloutPreflightService.SHADOW_FRESHNESS_HOURS
        )
        provider_cutoff = now - timedelta(
            days=CapabilityRolloutPreflightService.PROVIDER_VERIFICATION_DAYS
        )
        diagnostic_cutoff = now - timedelta(
            hours=CapabilityRolloutPreflightService.DIAGNOSTIC_WINDOW_HOURS
        )
        blockers: list[dict[str, Any]] = []
        warnings: list[dict[str, Any]] = []

        organization = await db.get(Organization, organization_id)
        if not organization:
            return {
                "organization_id": organization_id,
                "generated_at": now,
                "ready_for_enforcement": False,
                "blockers": [
                    CapabilityRolloutPreflightService._issue(
                        "ORGANIZATION_NOT_FOUND",
                        "The selected organization does not exist.",
                    )
                ],
                "warnings": [],
                "rollout": {
                    "shadow_enabled": False,
                    "enforcement_enabled": False,
                },
                "events": {
                    "activated": 0,
                    "contracted": 0,
                    "compared": 0,
                    "matched": 0,
                    "diverged": 0,
                    "stale": 0,
                },
                "coverage": {},
                "providers": [],
                "diagnostics": {},
                "reconciliation": {},
                "items": [],
            }
        if not organization.is_active:
            blockers.append(
                CapabilityRolloutPreflightService._issue(
                    "ORGANIZATION_SUSPENDED",
                    "Canonical enforcement cannot be promoted for an inactive organization.",
                )
            )

        flags = (
            await db.scalars(
                select(FeatureFlag).where(
                    FeatureFlag.organization_id == organization_id,
                    FeatureFlag.flag_key.in_(
                        CapabilityRolloutPreflightService.ROLLOUT_FLAG_KEYS
                    ),
                )
            )
        ).all()
        flag_values = {row.flag_key: row.is_enabled for row in flags}

        activated_event_ids = list(
            dict.fromkeys(
                (
                    await db.scalars(
                        select(EventActivation.event_id).where(
                            EventActivation.organization_id == organization_id,
                            EventActivation.status.in_(
                                EntitlementResolver.LIVE_ACTIVATION_STATUSES
                            ),
                        )
                    )
                ).all()
            )
        )
        contracted_event_ids = set(
            (
                await db.scalars(
                    select(EventCommercialContract.event_id).where(
                        EventCommercialContract.organization_id == organization_id,
                        EventCommercialContract.event_id.in_(activated_event_ids),
                        EventCommercialContract.status == "ACTIVE",
                    )
                )
            ).all()
        )
        missing_contract_ids = sorted(
            set(activated_event_ids) - contracted_event_ids,
            key=str,
        )
        if missing_contract_ids:
            blockers.append(
                CapabilityRolloutPreflightService._issue(
                    "EVENT_CONTRACTS_REQUIRED",
                    "Every activated event requires an active canonical contract.",
                    metadata={
                        "missing_contracts": len(missing_contract_ids),
                        "event_ids": [str(value) for value in missing_contract_ids],
                    },
                )
            )

        latest_rows: list[EntitlementShadowComparison] = []
        if activated_event_ids:
            latest_by_event = (
                select(
                    EntitlementShadowComparison.event_id,
                    func.max(EntitlementShadowComparison.compared_at).label("latest"),
                )
                .where(
                    EntitlementShadowComparison.organization_id == organization_id,
                    EntitlementShadowComparison.event_id.in_(activated_event_ids),
                )
                .group_by(EntitlementShadowComparison.event_id)
                .subquery()
            )
            latest_rows = (
                await db.scalars(
                    select(EntitlementShadowComparison)
                    .join(
                        latest_by_event,
                        and_(
                            EntitlementShadowComparison.event_id
                            == latest_by_event.c.event_id,
                            EntitlementShadowComparison.compared_at
                            == latest_by_event.c.latest,
                        ),
                    )
                    .where(
                        EntitlementShadowComparison.organization_id
                        == organization_id
                    )
                    .order_by(EntitlementShadowComparison.compared_at.desc())
                )
            ).all()
        latest_by_id = {row.event_id: row for row in latest_rows}
        missing_comparisons = [
            event_id
            for event_id in activated_event_ids
            if event_id not in latest_by_id
        ]
        stale_rows = [
            row for row in latest_rows if row.compared_at < freshness_cutoff
        ]
        diverged_rows = [
            row for row in latest_rows if row.status != "MATCHED"
        ]
        if missing_comparisons:
            blockers.append(
                CapabilityRolloutPreflightService._issue(
                    "SHADOW_COMPARISON_REQUIRED",
                    "Every activated event requires a shadow comparison.",
                    metadata={
                        "event_ids": [str(value) for value in missing_comparisons]
                    },
                )
            )
        if stale_rows:
            blockers.append(
                CapabilityRolloutPreflightService._issue(
                    "SHADOW_COMPARISON_STALE",
                    "Every shadow comparison must be within the freshness window.",
                    metadata={
                        "event_ids": [str(row.event_id) for row in stale_rows],
                        "freshness_cutoff": freshness_cutoff.isoformat(),
                    },
                )
            )
        if diverged_rows:
            blockers.append(
                CapabilityRolloutPreflightService._issue(
                    "SHADOW_DIVERGENCE",
                    "Legacy and canonical decisions must match before promotion.",
                    metadata={
                        "events": [
                            {
                                "event_id": str(row.event_id),
                                "difference_keys": sorted(row.differences),
                            }
                            for row in diverged_rows
                        ]
                    },
                )
            )

        registry = registry_coverage()
        catalogue_keys = set(
            (
                await db.scalars(
                    select(FeatureCatalog.key).where(
                        FeatureCatalog.is_active.is_(True)
                    )
                )
            ).all()
        )
        registered_keys = set(registry["features"]) | set(
            registry["catalog_limit_keys"]
        )
        missing_catalogue_keys = sorted(registered_keys - catalogue_keys)
        unknown_catalogue_keys = sorted(catalogue_keys - registered_keys)
        ungated_operations = sorted(
            operation
            for operation, sites in registry["operation_enforcement_sites"].items()
            if not sites
        )
        unenforced_limits = sorted(
            key
            for key, mapping in registry["limit_enforcement_sites"].items()
            if mapping.get("status") == "ENFORCED" and not mapping.get("sites")
        )
        if (
            missing_catalogue_keys
            or unknown_catalogue_keys
            or ungated_operations
            or unenforced_limits
        ):
            blockers.append(
                CapabilityRolloutPreflightService._issue(
                    "CAPABILITY_COVERAGE_INCOMPLETE",
                    "Catalogue and enforcement coverage must be complete.",
                    metadata={
                        "missing_catalogue_keys": missing_catalogue_keys,
                        "unknown_catalogue_keys": unknown_catalogue_keys,
                        "ungated_operations": ungated_operations,
                        "unenforced_limits": unenforced_limits,
                    },
                )
            )

        required_channels: dict[str, set[uuid.UUID]] = {}
        resolver_failures: list[dict[str, Any]] = []
        for event_id in activated_event_ids:
            if event_id not in contracted_event_ids:
                continue
            try:
                resolved = await EventEntitlementService.resolve(
                    db,
                    organization_id,
                    event_id,
                    explain=True,
                    ignore_rollout_flag=True,
                )
            except Exception as exc:
                resolver_failures.append(
                    {
                        "event_id": str(event_id),
                        "exception_type": type(exc).__name__,
                    }
                )
                continue
            for (
                feature_key,
                channel,
            ) in CapabilityRolloutPreflightService.PROVIDER_FEATURE_CHANNELS.items():
                if resolved.get("features", {}).get(feature_key, {}).get("enabled"):
                    required_channels.setdefault(channel, set()).add(event_id)
        if resolver_failures:
            blockers.append(
                CapabilityRolloutPreflightService._issue(
                    "CAPABILITY_RESOLUTION_FAILED",
                    "Every activated event must resolve successfully before promotion.",
                    metadata={"events": resolver_failures},
                )
            )

        channel_rows = (
            await db.scalars(
                select(OrganizationNotificationChannelConfig).where(
                    OrganizationNotificationChannelConfig.organization_id
                    == organization_id,
                    OrganizationNotificationChannelConfig.deleted_at.is_(None),
                )
            )
        ).all()
        channels_by_key = {row.channel.upper(): row for row in channel_rows}
        provider_items = []
        for channel, event_ids in sorted(required_channels.items()):
            config = channels_by_key.get(channel)
            ready = bool(
                config
                and config.state == "ACTIVE"
                and config.last_verified_at
                and config.last_verified_at >= provider_cutoff
            )
            reason = (
                None
                if ready
                else "MISSING"
                if not config
                else "NOT_ACTIVE"
                if config.state != "ACTIVE"
                else "NEVER_VERIFIED"
                if not config.last_verified_at
                else "VERIFICATION_STALE"
            )
            provider_items.append(
                {
                    "channel": channel,
                    "required_by_event_ids": sorted(event_ids, key=str),
                    "configured": bool(config),
                    "provider": config.provider if config else None,
                    "state": config.state if config else None,
                    "last_verified_at": config.last_verified_at if config else None,
                    "ready": ready,
                    "reason": reason,
                }
            )
            if not ready:
                # Provider availability is intentionally distinct from
                # commercial resolution. It is surfaced as an operational
                # warning; the runtime still fails the channel closed.
                warnings.append(
                    CapabilityRolloutPreflightService._issue(
                        "PROVIDER_NOT_READY",
                        f"{channel} is entitled but its provider is not currently verified.",
                        metadata={
                            "channel": channel,
                            "reason": reason,
                            "event_ids": [
                                str(value) for value in sorted(event_ids, key=str)
                            ],
                        },
                    )
                )

        recent_diagnostic_counts = dict(
            (
                await db.execute(
                    select(
                        CapabilityDiagnosticEvent.event_type,
                        func.count(CapabilityDiagnosticEvent.id),
                    )
                    .where(
                        CapabilityDiagnosticEvent.organization_id
                        == organization_id,
                        CapabilityDiagnosticEvent.occurred_at >= diagnostic_cutoff,
                    )
                    .group_by(CapabilityDiagnosticEvent.event_type)
                )
            ).all()
        )
        if int(recent_diagnostic_counts.get("RESOLUTION_FAILURE", 0)):
            warnings.append(
                CapabilityRolloutPreflightService._issue(
                    "RECENT_RESOLUTION_FAILURES",
                    "Recent resolver failures exist even though the current preflight resolved.",
                    metadata={
                        "count": int(
                            recent_diagnostic_counts["RESOLUTION_FAILURE"]
                        ),
                        "since": diagnostic_cutoff.isoformat(),
                    },
                )
            )
        if int(recent_diagnostic_counts.get("SHADOW_DIVERGENCE", 0)):
            warnings.append(
                CapabilityRolloutPreflightService._issue(
                    "RECENT_SHADOW_DIVERGENCE",
                    "Recent divergence diagnostics exist; the latest event comparisons currently match.",
                    metadata={
                        "count": int(
                            recent_diagnostic_counts["SHADOW_DIVERGENCE"]
                        ),
                        "since": diagnostic_cutoff.isoformat(),
                    },
                )
            )

        latest_reconciliation_rows: list[UsageReconciliationRun] = []
        if activated_event_ids:
            latest_reconciliation = (
                select(
                    UsageReconciliationRun.event_id,
                    UsageReconciliationRun.metric_key,
                    func.max(UsageReconciliationRun.reconciled_at).label("latest"),
                )
                .where(
                    UsageReconciliationRun.organization_id == organization_id,
                    UsageReconciliationRun.event_id.in_(activated_event_ids),
                )
                .group_by(
                    UsageReconciliationRun.event_id,
                    UsageReconciliationRun.metric_key,
                )
                .subquery()
            )
            latest_reconciliation_rows = (
                await db.scalars(
                    select(UsageReconciliationRun)
                    .join(
                        latest_reconciliation,
                        and_(
                            UsageReconciliationRun.event_id
                            == latest_reconciliation.c.event_id,
                            UsageReconciliationRun.metric_key
                            == latest_reconciliation.c.metric_key,
                            UsageReconciliationRun.reconciled_at
                            == latest_reconciliation.c.latest,
                        ),
                    )
                    .where(
                        UsageReconciliationRun.organization_id == organization_id
                    )
                )
            ).all()
        drifted = [
            row for row in latest_reconciliation_rows if row.status == "DRIFTED"
        ]
        if drifted:
            blockers.append(
                CapabilityRolloutPreflightService._issue(
                    "METERING_DRIFT",
                    "Latest usage reconciliation contains unresolved drift.",
                    metadata={
                        "items": [
                            {
                                "event_id": str(row.event_id),
                                "metric_key": row.metric_key,
                                "drift": row.drift,
                            }
                            for row in drifted
                        ]
                    },
                )
            )
        reconciliation_by_pair = {
            (row.event_id, row.metric_key): row
            for row in latest_reconciliation_rows
        }
        required_reconciliation_pairs = {
            (event_id, metric_key)
            for event_id in activated_event_ids
            for metric_key in sorted(MeteringService.AUTHORITATIVE_METRICS)
        }
        missing_reconciliation_pairs = sorted(
            required_reconciliation_pairs - set(reconciliation_by_pair),
            key=lambda item: (str(item[0]), item[1]),
        )
        if missing_reconciliation_pairs:
            blockers.append(
                CapabilityRolloutPreflightService._issue(
                    (
                        "USAGE_RECONCILIATION_NOT_RUN"
                        if not latest_reconciliation_rows
                        else "USAGE_RECONCILIATION_INCOMPLETE"
                    ),
                    "Canonical enforcement requires reconciliation evidence for every authoritative event metric.",
                    metadata={
                        "missing": [
                            {"event_id": str(event_id), "metric_key": metric_key}
                            for event_id, metric_key in missing_reconciliation_pairs
                        ]
                    },
                )
            )
        stale_reconciliation = [
            row
            for row in latest_reconciliation_rows
            if row.reconciled_at < freshness_cutoff
        ]
        if stale_reconciliation:
            blockers.append(
                CapabilityRolloutPreflightService._issue(
                    "USAGE_RECONCILIATION_STALE",
                    "Usage reconciliation evidence is older than the rollout freshness window.",
                    metadata={
                        "items": [
                            {
                                "event_id": str(row.event_id),
                                "metric_key": row.metric_key,
                                "reconciled_at": row.reconciled_at.isoformat(),
                            }
                            for row in stale_reconciliation
                        ]
                    },
                )
            )

        return {
            "organization_id": organization_id,
            "generated_at": now,
            "freshness_cutoff": freshness_cutoff,
            "ready_for_enforcement": not blockers,
            "blockers": blockers,
            "warnings": warnings,
            "rollout": {
                "shadow_enabled": flag_values.get(
                    "organizer_console_entitlement_shadow", False
                ),
                "enforcement_enabled": flag_values.get(
                    "organizer_console_entitlement_enforce", False
                ),
            },
            "events": {
                "activated": len(activated_event_ids),
                "contracted": len(contracted_event_ids),
                "compared": len(latest_rows),
                "matched": sum(row.status == "MATCHED" for row in latest_rows),
                "diverged": len(diverged_rows),
                "stale": len(stale_rows),
            },
            "coverage": {
                "feature_count": registry["feature_count"],
                "limit_count": registry["limit_count"],
                "missing_catalogue_keys": missing_catalogue_keys,
                "unknown_catalogue_keys": unknown_catalogue_keys,
                "ungated_operations": ungated_operations,
                "unenforced_limits": unenforced_limits,
            },
            "providers": provider_items,
            "diagnostics": {
                "since": diagnostic_cutoff,
                "by_type": {
                    str(key): int(value)
                    for key, value in recent_diagnostic_counts.items()
                },
            },
            "reconciliation": {
                "latest_count": len(latest_reconciliation_rows),
                "drifted_count": len(drifted),
                "required_count": len(required_reconciliation_pairs),
                "missing_count": len(missing_reconciliation_pairs),
                "stale_count": len(stale_reconciliation),
            },
            "items": [
                {
                    "id": row.id,
                    "event_id": row.event_id,
                    "status": row.status,
                    "differences": row.differences,
                    "resolution_version": row.resolution_version,
                    "compared_at": row.compared_at,
                    "fresh": row.compared_at >= freshness_cutoff,
                }
                for row in latest_rows
            ],
        }
