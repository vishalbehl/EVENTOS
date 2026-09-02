from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.modules.billing.services.entitlement_resolver import EntitlementResolver
from app.modules.billing.services.event_entitlement_service import EventEntitlementService
from app.modules.billing.services.usage_service import UsageService
from app.modules.billing.models.event_activation import EventActivation
from app.modules.events.models.event import Event
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.organization_console import EntitlementShadowComparison, EventCommercialContract
from app.modules.billing.services.capability_diagnostics_service import CapabilityDiagnosticsService
from app.modules.platform.models.platform_domain_tables import FeatureFlag
from app.modules.platform.services.metering_service import MeteringService
from app.tasks.tenant_job_scope import parse_required_organization_id, tenant_job_session
from app.core.task_policy import is_retryable, policy_for
from app.worker import celery_app


_RECONCILIATION_POLICY = policy_for("reconciliation")


def _run_rollout_task(task, operation):
    """Run rollout work with bounded retries and no retry for bad input."""
    from app.tasks.platform_tasks import _run_async

    try:
        return _run_async(operation)
    except Exception as exc:
        policy = policy_for("reconciliation")
        attempt = int(getattr(task.request, "retries", 0) or 0)
        if is_retryable(exc) and attempt < policy.max_retries:
            raise task.retry(
                exc=exc,
                countdown=min(300, policy.retry_delay(attempt, apply_jitter=True)),
                max_retries=policy.max_retries,
            )
        raise


def shadow_access_projection(resolved: dict) -> dict:
    """Project both resolvers onto decisions the legacy engine can express.

    Legacy activation snapshots only persisted feature enablement, not typed
    TIER/ENUM values. Shadow rollout therefore compares access decisions for
    features and exact numeric allowances for limits. Typed contract values
    are validated independently when contracts are created and resolved.
    """
    return {
        **{key: bool(value.get("enabled")) for key, value in resolved.get("features", {}).items()},
        **{key: value.get("limit_value") for key, value in resolved.get("limits", {}).items()},
    }


def _differences(legacy: dict, contract: dict) -> dict:
    return {key: {"legacy": legacy.get(key), "contract": contract.get(key)} for key in sorted(set(legacy) | set(contract)) if legacy.get(key) != contract.get(key)}


async def backfill_organization_console_in_session(db, organization_id: uuid.UUID, apply: bool = False) -> dict:
    report = {"organization_id": str(organization_id), "apply": apply, "contracts": 0, "usage_baselines": 0, "comparisons": 0, "events": 0}
    events = (
        await db.scalars(
            select(Event)
            .join(EventActivation, EventActivation.event_id == Event.id)
            .where(
                Event.organization_id == organization_id,
                Event.deleted_at.is_(None),
                EventActivation.organization_id == organization_id,
                EventActivation.status.in_(EntitlementResolver.LIVE_ACTIVATION_STATUSES),
            )
        )
    ).all()
    report["events"] = len(events)
    for event in events:
            legacy = await EntitlementResolver.resolve_event_entitlements(db, organization_id, event.id, explain=True)
            legacy_values = shadow_access_projection(legacy)
            contract = await db.scalar(select(EventCommercialContract).where(EventCommercialContract.organization_id == organization_id, EventCommercialContract.event_id == event.id, EventCommercialContract.status == "ACTIVE").order_by(EventCommercialContract.version.desc()).limit(1))
            if not contract:
                report["contracts"] += 1
                if apply:
                    activation = legacy.get("activation")
                    plan = getattr(getattr(activation, "subscription", None), "plan", None)
                    contract = EventCommercialContract(
                        organization_id=organization_id, event_id=event.id, version=1, status="ACTIVE",
                        plan_key=str(getattr(plan, "key", None) or getattr(plan, "name", None) or "legacy-activation"),
                        plan_version=str(getattr(plan, "version", None) or "backfill-v1"), currency=str(getattr(getattr(activation, "subscription", None), "currency", None) or "INR")[:3].upper(),
                        entitlements=legacy_values, hard_ceilings={}, addons=[],
                        source={"type": "ACTIVATION_BACKFILL", "activation_id": str(getattr(activation, "id", "")), "snapshot_set_id": str(getattr(activation, "current_snapshot_set_id", ""))},
                        effective_at=getattr(activation, "activated_at", None) or event.created_at or datetime.now(timezone.utc), created_by=event.created_by,
                    )
                    db.add(contract); await db.flush()
            for metric_key, authoritative_key in MeteringService.AUTHORITATIVE_METRICS.items():
                current, epoch, _ = await MeteringService.current_value(db, organization_id, event.id, metric_key)
                if not epoch and current == 0:
                    authoritative = await UsageService.get_event_metric(db, event.id, authoritative_key)
                    if authoritative > 0:
                        report["usage_baselines"] += 1
                        if apply:
                            await MeteringService.record(db, organization_id=organization_id, event_id=event.id, metric_key=metric_key, quantity=authoritative, unit="count" if metric_key != "storage_bytes" else "bytes", source="organizer_console.backfill", idempotency_key=f"organizer-backfill:{event.id}:{metric_key}:v1", entry_type="BASELINE", reason="Authoritative Organizer Console rollout baseline", actor_user_id=event.created_by)
            if apply and contract:
                canonical = await EventEntitlementService.resolve(db, organization_id, event.id, explain=True, ignore_rollout_flag=True)
                contract_values = shadow_access_projection(canonical)
                differences = _differences(legacy_values, contract_values)
                db.add(EntitlementShadowComparison(organization_id=organization_id, event_id=event.id, legacy_values=legacy_values, contract_values=contract_values, differences=differences, resolution_version=canonical["resolution_version"], status="DIVERGED" if differences else "MATCHED"))
                if differences:
                    CapabilityDiagnosticsService.add(
                        db,
                        event_type="SHADOW_DIVERGENCE",
                        source="organization_console_rollout.backfill",
                        organization_id=organization_id,
                        event_id=event.id,
                        severity="ERROR",
                        reason_code="SHADOW_DIVERGENCE",
                        metadata={
                            "difference_keys": sorted(differences),
                            "resolution_version": canonical["resolution_version"],
                        },
                    )
                report["comparisons"] += 1
    if apply:
        for key, enabled in (("organizer_console_entitlement_shadow", True), ("organizer_console_entitlement_enforce", False)):
            flag = await db.scalar(select(FeatureFlag).where(FeatureFlag.organization_id == organization_id, FeatureFlag.flag_key == key))
            if flag: flag.is_enabled = enabled
            else: db.add(FeatureFlag(organization_id=organization_id, flag_key=key, is_enabled=enabled))
    return report


async def backfill_organization_console(organization_id_str: str, apply: bool = False) -> dict:
    organization_id = parse_required_organization_id(organization_id_str)
    async with tenant_job_session(organization_id) as db:
        report = await backfill_organization_console_in_session(db, organization_id, apply)
        if apply: await db.commit()
        else: await db.rollback()
        return report


async def shadow_compare_organization(organization_id_str: str) -> dict:
    organization_id = parse_required_organization_id(organization_id_str)
    matched = diverged = 0
    async with tenant_job_session(organization_id) as db:
        events = (
            await db.scalars(
                select(Event)
                .join(EventActivation, EventActivation.event_id == Event.id)
                .where(
                    Event.organization_id == organization_id,
                    Event.deleted_at.is_(None),
                    EventActivation.organization_id == organization_id,
                    EventActivation.status.in_(EntitlementResolver.LIVE_ACTIVATION_STATUSES),
                )
            )
        ).all()
        for event in events:
            legacy = shadow_access_projection(
                await EntitlementResolver.resolve_event_entitlements(
                    db, organization_id, event.id, explain=True
                )
            )
            canonical = await EventEntitlementService.resolve(db, organization_id, event.id, explain=True, ignore_rollout_flag=True)
            canonical_access = shadow_access_projection(canonical)
            differences = _differences(legacy, canonical_access)
            db.add(EntitlementShadowComparison(organization_id=organization_id, event_id=event.id, legacy_values=legacy, contract_values=canonical_access, differences=differences, resolution_version=canonical["resolution_version"], status="DIVERGED" if differences else "MATCHED"))
            if differences:
                CapabilityDiagnosticsService.add(
                    db,
                    event_type="SHADOW_DIVERGENCE",
                    source="organization_console_rollout.shadow_compare",
                    organization_id=organization_id,
                    event_id=event.id,
                    severity="ERROR",
                    reason_code="SHADOW_DIVERGENCE",
                    metadata={
                        "difference_keys": sorted(differences),
                        "resolution_version": canonical["resolution_version"],
                    },
                )
            diverged += int(bool(differences)); matched += int(not differences)
        await db.commit()
    return {"organization_id": str(organization_id), "matched": matched, "diverged": diverged}


@celery_app.task(
    name="app.tasks.organization_console_rollout_tasks.backfill_organization_console",
    bind=True,
    max_retries=_RECONCILIATION_POLICY.max_retries,
    soft_time_limit=_RECONCILIATION_POLICY.soft_timeout_seconds,
    time_limit=_RECONCILIATION_POLICY.hard_timeout_seconds,
    acks_late=True,
    queue=_RECONCILIATION_POLICY.queue,
)
def backfill_organization_console_task(self, organization_id_str: str, apply: bool = False) -> dict:
    return _run_rollout_task(self, backfill_organization_console(organization_id_str, apply))


@celery_app.task(
    name="app.tasks.organization_console_rollout_tasks.shadow_compare_organization",
    bind=True,
    max_retries=_RECONCILIATION_POLICY.max_retries,
    soft_time_limit=_RECONCILIATION_POLICY.soft_timeout_seconds,
    time_limit=_RECONCILIATION_POLICY.hard_timeout_seconds,
    acks_late=True,
    queue=_RECONCILIATION_POLICY.queue,
)
def shadow_compare_organization_task(self, organization_id_str: str) -> dict:
    return _run_rollout_task(self, shadow_compare_organization(organization_id_str))


async def fanout_shadow_comparisons() -> int:
    async with AsyncSessionLocal() as db:
        organization_ids = (
            await db.scalars(
                select(Organization.id)
                .join(FeatureFlag, FeatureFlag.organization_id == Organization.id)
                .where(
                    Organization.is_active.is_(True),
                    FeatureFlag.flag_key == "organizer_console_entitlement_shadow",
                    FeatureFlag.is_enabled.is_(True),
                )
                .distinct()
            )
        ).all()
    for organization_id in organization_ids: shadow_compare_organization_task.delay(str(organization_id))
    return len(organization_ids)


@celery_app.task(
    name="app.tasks.organization_console_rollout_tasks.fanout_shadow_comparisons",
    bind=True,
    max_retries=_RECONCILIATION_POLICY.max_retries,
    soft_time_limit=_RECONCILIATION_POLICY.soft_timeout_seconds,
    time_limit=_RECONCILIATION_POLICY.hard_timeout_seconds,
    acks_late=True,
    queue=_RECONCILIATION_POLICY.queue,
)
def fanout_shadow_comparisons_task(self) -> int:
    return _run_rollout_task(self, fanout_shadow_comparisons())
