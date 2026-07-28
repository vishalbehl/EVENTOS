"""Idempotent usage metering, reset epochs, and reconciliation."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.billing.services.usage_service import UsageService
from app.modules.platform.models.organization_console import (
    UsageCounterEpoch,
    UsageLedgerEntry,
    UsageReconciliationRun,
)
from app.modules.billing.capability_registry import LIMIT_DEFINITIONS


class MeteringService:
    AUTHORITATIVE_METRICS = {
        "registrations": "max_registrations",
        "speakers": "max_speakers",
        "sessions": "max_sessions",
        "rooms": "max_rooms",
        "emails_sent": "max_emails_per_event",
        "storage_bytes": "storage_bytes",
        "event_team_members": "max_event_team_members",
        "ticket_categories": "max_ticket_categories",
        "badge_templates": "max_badge_templates",
        "certificate_templates": "max_certificate_templates",
    }
    ENTITLEMENT_METRICS = {**AUTHORITATIVE_METRICS, "storage_bytes": "storage_quota_mb", "registration_submissions": "max_registrations"}

    @staticmethod
    def _period(occurred_at: datetime) -> tuple[datetime, datetime, datetime]:
        value = occurred_at.astimezone(timezone.utc)
        start = value.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if start.month == 12:
            end = start.replace(year=start.year + 1, month=1)
        else:
            end = start.replace(month=start.month + 1)
        bucket = value.replace(minute=0, second=0, microsecond=0)
        return start, end, bucket

    @staticmethod
    async def _active_epoch(
        db: AsyncSession,
        organization_id: uuid.UUID,
        event_id: uuid.UUID | None,
        metric_key: str,
        *,
        create: bool,
        actor_user_id: uuid.UUID | None = None,
    ) -> UsageCounterEpoch | None:
        query = select(UsageCounterEpoch).where(
            UsageCounterEpoch.organization_id == organization_id,
            UsageCounterEpoch.metric_key == metric_key,
            UsageCounterEpoch.closed_at.is_(None),
        )
        query = query.where(UsageCounterEpoch.event_id == event_id) if event_id else query.where(UsageCounterEpoch.event_id.is_(None))
        epoch = await db.scalar(query.order_by(UsageCounterEpoch.sequence.desc()).limit(1).with_for_update())
        if epoch or not create:
            return epoch
        epoch = UsageCounterEpoch(
            organization_id=organization_id,
            event_id=event_id,
            metric_key=metric_key,
            sequence=1,
            baseline_value=0,
            created_by=actor_user_id,
        )
        db.add(epoch)
        await db.flush()
        return epoch

    @staticmethod
    async def record(
        db: AsyncSession,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID | None,
        metric_key: str,
        quantity: int,
        unit: str,
        source: str,
        idempotency_key: str,
        entry_type: str = "USAGE",
        reason: str | None = None,
        actor_user_id: uuid.UUID | None = None,
        occurred_at: datetime | None = None,
        parent_entry_id: uuid.UUID | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> tuple[UsageLedgerEntry, bool]:
        existing = await db.scalar(
            select(UsageLedgerEntry).where(
                UsageLedgerEntry.organization_id == organization_id,
                UsageLedgerEntry.idempotency_key == idempotency_key,
            )
        )
        if existing:
            return existing, False
        timestamp = occurred_at or datetime.now(timezone.utc)
        period_start, period_end, bucket_start = MeteringService._period(timestamp)
        epoch = await MeteringService._active_epoch(
            db, organization_id, event_id, metric_key, create=True, actor_user_id=actor_user_id
        )
        row = UsageLedgerEntry(
            organization_id=organization_id,
            event_id=event_id,
            metric_key=metric_key,
            quantity=quantity,
            unit=unit,
            entry_type=entry_type,
            source=source,
            reason=reason,
            idempotency_key=idempotency_key,
            actor_user_id=actor_user_id,
            occurred_at=timestamp,
            period_start=period_start,
            period_end=period_end,
            bucket_start=bucket_start,
            epoch_id=epoch.id if epoch else None,
            parent_entry_id=parent_entry_id,
            metadata_json=metadata or {},
        )
        db.add(row)
        await db.flush()
        return row, True

    @staticmethod
    async def current_value(
        db: AsyncSession, organization_id: uuid.UUID, event_id: uuid.UUID | None, metric_key: str
    ) -> tuple[int, UsageCounterEpoch | None, datetime | None]:
        epoch = await MeteringService._active_epoch(db, organization_id, event_id, metric_key, create=False)
        filters = [
            UsageLedgerEntry.organization_id == organization_id,
            UsageLedgerEntry.metric_key == metric_key,
        ]
        filters.append(UsageLedgerEntry.event_id == event_id if event_id else UsageLedgerEntry.event_id.is_(None))
        definition = next((item for item in LIMIT_DEFINITIONS.values() if item.get("metric_key") == metric_key), None)
        now = datetime.now(timezone.utc)
        if definition and definition.get("period") == "BILLING_PERIOD":
            filters.extend((UsageLedgerEntry.period_start <= now, UsageLedgerEntry.period_end > now))
        if epoch:
            filters.append(UsageLedgerEntry.epoch_id == epoch.id)
        else:
            filters.append(UsageLedgerEntry.epoch_id.is_(None))
        quantity, freshness = (
            await db.execute(
                select(func.coalesce(func.sum(UsageLedgerEntry.quantity), 0), func.max(UsageLedgerEntry.occurred_at)).where(*filters)
            )
        ).one()
        return int(quantity or 0), epoch, freshness

    @staticmethod
    async def reset(
        db: AsyncSession,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID | None,
        metric_key: str,
        unit: str,
        reason: str,
        idempotency_key: str,
        actor_user_id: uuid.UUID,
    ) -> UsageCounterEpoch:
        previous_reset = await db.scalar(
            select(UsageLedgerEntry).where(
                UsageLedgerEntry.organization_id == organization_id,
                UsageLedgerEntry.idempotency_key == idempotency_key,
                UsageLedgerEntry.entry_type == "RESET",
            )
        )
        if previous_reset and previous_reset.epoch_id:
            epoch = await db.get(UsageCounterEpoch, previous_reset.epoch_id)
            if epoch:
                return epoch
        current, epoch, _ = await MeteringService.current_value(db, organization_id, event_id, metric_key)
        authoritative = 0
        mapped = MeteringService.AUTHORITATIVE_METRICS.get(metric_key)
        if event_id and mapped:
            authoritative = await UsageService.get_event_metric(db, event_id, mapped)
        now = datetime.now(timezone.utc)
        if epoch:
            epoch.closed_at = now
            next_sequence = epoch.sequence + 1
        else:
            next_sequence = 1
        new_epoch = UsageCounterEpoch(
            organization_id=organization_id,
            event_id=event_id,
            metric_key=metric_key,
            sequence=next_sequence,
            baseline_value=authoritative,
            reason=reason,
            created_by=actor_user_id,
        )
        db.add(new_epoch)
        await db.flush()
        reset_entry, _ = await MeteringService.record(
            db,
            organization_id=organization_id,
            event_id=event_id,
            metric_key=metric_key,
            quantity=0,
            unit=unit,
            source="organization_console.usage_reset",
            idempotency_key=idempotency_key,
            entry_type="RESET",
            reason=reason,
            actor_user_id=actor_user_id,
            metadata={"closed_value": current, "authoritative_baseline": authoritative},
        )
        new_epoch.reset_entry_id = reset_entry.id
        return new_epoch

    @staticmethod
    async def reconcile_event(
        db: AsyncSession, organization_id: uuid.UUID, event_id: uuid.UUID
    ) -> list[UsageReconciliationRun]:
        results: list[UsageReconciliationRun] = []
        for metric_key, authoritative_key in MeteringService.AUTHORITATIVE_METRICS.items():
            ledger_value, epoch, freshness = await MeteringService.current_value(
                db, organization_id, event_id, metric_key
            )
            absolute = await UsageService.get_event_metric(db, event_id, authoritative_key)
            authoritative_value = max(0, absolute - (epoch.baseline_value if epoch else 0))
            drift = ledger_value - authoritative_value
            row = UsageReconciliationRun(
                organization_id=organization_id,
                event_id=event_id,
                metric_key=metric_key,
                ledger_value=ledger_value,
                authoritative_value=authoritative_value,
                drift=drift,
                status="MATCHED" if drift == 0 else "DRIFTED",
                source=f"billing.usage_service:{authoritative_key}",
                details={"ledger_freshness_at": freshness.isoformat() if freshness else None, "epoch_id": str(epoch.id) if epoch else None},
            )
            db.add(row)
            if drift != 0:
                from app.modules.billing.services.capability_diagnostics_service import CapabilityDiagnosticsService
                CapabilityDiagnosticsService.add(
                    db,
                    event_type="METERING_DRIFT",
                    source="metering_service.reconcile_event",
                    organization_id=organization_id,
                    event_id=event_id,
                    severity="WARNING",
                    reason_code="METERING_DRIFT",
                    limit_key=MeteringService.ENTITLEMENT_METRICS.get(metric_key),
                    metadata={
                        "metric_key": metric_key,
                        "ledger_value": ledger_value,
                        "authoritative_value": authoritative_value,
                        "drift": drift,
                    },
                )
            results.append(row)
        await db.flush()
        return results
