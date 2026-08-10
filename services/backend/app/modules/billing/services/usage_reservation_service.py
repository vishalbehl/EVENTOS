from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.billing.services.event_entitlement_service import EventEntitlementService
from app.modules.billing.services.entitlement_resolver import EntitlementResolver
from app.modules.billing.services.usage_service import UsageService
from app.modules.billing.capability_registry import LIMIT_DEFINITIONS
from app.modules.events.models.event import Event
from app.modules.events.models.capacity_rule import CapacityRule
from app.modules.platform.models.organization import Organization
from app.modules.identity.models.user import User
from app.modules.integrations.models.integrations_domain_tables import IntegrationConnection
from app.modules.platform.models.organization_console import UsageLedgerEntry, UsageReservation
from app.modules.platform.services.metering_service import MeteringService
from app.modules.analytics.models.analytics_domain_tables import ApiUsageMetric


class UsageReservationService:
    """Concurrency-safe reserve/consume/release lifecycle for finite limits."""

    @staticmethod
    async def reserve(db: AsyncSession, *, organization_id: uuid.UUID, event_id: uuid.UUID | None, limit_key: str, quantity: int, unit: str, idempotency_key: str, ttl_seconds: int = 300, metadata: dict | None = None) -> UsageReservation:
        if quantity <= 0:
            raise HTTPException(status_code=422, detail="Reservation quantity must be positive")
        existing = await db.scalar(select(UsageReservation).where(UsageReservation.organization_id == organization_id, UsageReservation.idempotency_key == idempotency_key).with_for_update())
        if existing and (
            existing.event_id != event_id
            or existing.metric_key != limit_key
            or existing.quantity != quantity
            or existing.unit != unit
        ):
            raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT"})
        if existing and existing.status == "CONSUMED":
            # Never let a completed reservation authorize a second domain write.
            # Endpoints may later replay a stored result, but until a result
            # envelope is available the only safe behavior is an explicit,
            # stable replay response.
            raise HTTPException(status_code=409, detail={
                "code": "IDEMPOTENCY_ALREADY_CONSUMED",
                "reservation_id": str(existing.id),
                "consumed_entry_id": str(existing.consumed_entry_id) if existing.consumed_entry_id else None,
            })
        now = datetime.now(timezone.utc)
        if existing and existing.status == "RESERVED" and existing.expires_at > now:
            return existing
        definition = LIMIT_DEFINITIONS.get(limit_key, {})
        # Organization-scoped limits must serialize across every event. Event
        # limits use the event row as their stable capacity lock.
        if definition.get("scope") == "ORGANIZATION":
            await db.scalar(select(Organization).where(Organization.id == organization_id).with_for_update(of=Organization))
            event = await db.scalar(select(Event).where(Event.id == event_id, Event.organization_id == organization_id)) if event_id else None
        else:
            if event_id is None:
                raise HTTPException(status_code=422, detail={"code": "EVENT_CONTEXT_REQUIRED", "limit_key": limit_key})
            event = await db.scalar(select(Event).where(Event.id == event_id, Event.organization_id == organization_id).with_for_update(of=Event))
        if event_id is not None and not event:
            raise HTTPException(status_code=404, detail="Event not found")
        try:
            policy_organization = await db.get(Organization, organization_id)
            if policy_organization and policy_organization.has_unrestricted_capabilities:
                resolved = {
                    "limits": {
                        limit_key: {
                            "limit_value": None,
                            "enforcement_mode": "HARD",
                            "source_type": "INTERNAL_UNRESTRICTED_BASELINE",
                        }
                    },
                    "hard_ceilings": {},
                }
            else:
                resolved = (
                    await EntitlementResolver.resolve_org_entitlements(db, organization_id, explain=True)
                    if definition.get("scope") == "ORGANIZATION" and event_id is None
                    else await EventEntitlementService.resolve(db, organization_id, event_id, explain=True)
                )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "code": "RESOLUTION_UNAVAILABLE",
                    "limit_key": limit_key,
                },
            ) from exc
        limit = resolved.get("limits", {}).get(limit_key)
        if not limit or limit.get("denial_reason") == "CONTRACT_REQUIRED":
            raise HTTPException(status_code=409, detail={"code": "CONTRACT_REQUIRED", "limit_key": limit_key})
        allowance = limit.get("limit_value")
        if limit_key == "max_registrations" and event_id is not None:
            venue_capacity = await db.scalar(select(CapacityRule.capacity).where(
                CapacityRule.event_id == event_id,
                CapacityRule.session_id.is_(None),
                CapacityRule.room_id.is_(None),
            ))
            if venue_capacity is not None:
                allowance = int(venue_capacity) if allowance is None else min(int(allowance), int(venue_capacity))
        if limit_key == "max_events":
            used = int(await db.scalar(select(func.count(Event.id)).where(Event.organization_id == organization_id, Event.deleted_at.is_(None), ~func.lower(Event.status).in_(["archived", "cancelled"]))) or 0)
        elif limit_key == "max_users":
            used = int(await db.scalar(select(func.count(User.id)).where(User.organization_id == organization_id, User.is_active.is_(True))) or 0)
        elif limit_key == "max_integrations":
            used = int(await db.scalar(select(func.count(IntegrationConnection.id)).where(IntegrationConnection.organization_id == organization_id, IntegrationConnection.is_active.is_(True))) or 0)
        elif limit_key == "max_api_calls_per_month":
            period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            authoritative = int(await db.scalar(select(func.coalesce(func.sum(ApiUsageMetric.call_count), 0)).where(
                ApiUsageMetric.organization_id == organization_id,
                ApiUsageMetric.period_start == period_start,
            )) or 0)
            ledger = int(await db.scalar(select(func.coalesce(func.sum(UsageLedgerEntry.quantity), 0)).where(
                UsageLedgerEntry.organization_id == organization_id,
                UsageLedgerEntry.event_id.is_(None),
                UsageLedgerEntry.metric_key == "api_calls",
                UsageLedgerEntry.period_start <= now,
                UsageLedgerEntry.period_end > now,
            )) or 0)
            used = max(authoritative, ledger)
        elif limit_key == "storage_quota_mb":
            authoritative_mb = await UsageService.get_effective_event_metric(
                db, event_id, limit_key
            )
            ledger_bytes, _, _ = await MeteringService.current_value(
                db, organization_id, event_id, "storage_bytes"
            )
            ledger_mb = (
                max(0, int(ledger_bytes)) + 1024 * 1024 - 1
            ) // (1024 * 1024)
            # Domain records and the durable ledger overlap for managed
            # presentation assets. max() includes uploads that have no domain
            # record (branding/registration files) without double counting.
            used = max(authoritative_mb, ledger_mb)
        elif limit_key in UsageService.METRIC_STRATEGIES:
            used = await UsageService.get_effective_event_metric(db, event_id, limit_key)
        else:
            metric_key = definition.get("metric_key", limit_key)
            usage_filters = [UsageLedgerEntry.organization_id == organization_id, UsageLedgerEntry.metric_key == metric_key]
            if definition.get("scope") != "ORGANIZATION":
                usage_filters.append(UsageLedgerEntry.event_id == event_id)
            else:
                usage_filters.append(UsageLedgerEntry.event_id.is_(None))
            if definition.get("period") == "BILLING_PERIOD":
                usage_filters.extend((UsageLedgerEntry.period_start <= now, UsageLedgerEntry.period_end > now))
            used = int(await db.scalar(select(func.coalesce(func.sum(UsageLedgerEntry.quantity), 0)).where(*usage_filters)) or 0)
        reservation_filters = [UsageReservation.organization_id == organization_id, UsageReservation.metric_key == limit_key, UsageReservation.status == "RESERVED", UsageReservation.expires_at > now]
        if definition.get("scope") != "ORGANIZATION":
            reservation_filters.append(UsageReservation.event_id == event_id)
        reserved = int(await db.scalar(select(func.coalesce(func.sum(UsageReservation.quantity), 0)).where(*reservation_filters)) or 0)
        projected = used + reserved + quantity
        enforcement_mode = str(limit.get("enforcement_mode") or "HARD").upper()
        if enforcement_mode not in {"HARD", "SOFT_WARNING", "METERED_OVERAGE"}:
            # Unknown policy is a configuration failure, never an implicit
            # overage grant.
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "code": "RESOLUTION_UNAVAILABLE",
                    "limit_key": limit_key,
                    "reason": "INVALID_ENFORCEMENT_MODE",
                },
            )
        hard_ceiling = resolved.get("hard_ceilings", {}).get(limit_key)
        if hard_ceiling is not None and projected > int(hard_ceiling):
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={
                    "code": "HARD_CEILING_EXCEEDED",
                    "limit_key": limit_key,
                    "hard_ceiling": int(hard_ceiling),
                    "used": used,
                    "reserved": reserved,
                    "requested": quantity,
                    "remaining": max(int(hard_ceiling) - used - reserved, 0),
                },
            )

        reservation_metadata = dict(metadata or {})
        if allowance is not None and projected > int(allowance):
            if enforcement_mode == "HARD":
                raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail={"code": "QUOTA_EXHAUSTED", "limit_key": limit_key, "allowed": int(allowance), "used": used, "reserved": reserved, "requested": quantity, "remaining": max(int(allowance) - used - reserved, 0)})
            reservation_metadata.update({
                "quota_state": (
                    "METERED_OVERAGE"
                    if enforcement_mode == "METERED_OVERAGE"
                    else "SOFT_WARNING"
                ),
                "enforcement_mode": enforcement_mode,
                "contract_allowance": int(allowance),
                "projected_usage": projected,
                "overage_quantity": projected - int(allowance),
                "overage_policy": limit.get("overage_policy") or (
                    {"action": "BILL"}
                    if enforcement_mode == "METERED_OVERAGE"
                    else {"action": "WARN"}
                ),
            })
        if existing:
            existing.status = "RESERVED"
            existing.expires_at = now + timedelta(seconds=ttl_seconds)
            existing.released_at = None
            existing.consumed_entry_id = None
            existing.metadata_json = reservation_metadata
            await db.flush()
            return existing
        row = UsageReservation(organization_id=organization_id, event_id=event_id, metric_key=limit_key, quantity=quantity, unit=unit, idempotency_key=idempotency_key, expires_at=now + timedelta(seconds=ttl_seconds), metadata_json=reservation_metadata)
        db.add(row); await db.flush()
        return row

    @staticmethod
    async def consume(db: AsyncSession, reservation_id: uuid.UUID, *, source: str, actor_user_id: uuid.UUID | None = None) -> UsageLedgerEntry:
        row = await db.scalar(select(UsageReservation).where(UsageReservation.id == reservation_id).with_for_update())
        if not row or row.status != "RESERVED" or row.expires_at <= datetime.now(timezone.utc):
            raise HTTPException(status_code=409, detail={"code": "RESERVATION_UNAVAILABLE"})
        usage_metric_key = LIMIT_DEFINITIONS.get(row.metric_key, {}).get("metric_key", row.metric_key)
        metered_event_id = None if LIMIT_DEFINITIONS.get(row.metric_key, {}).get("scope") == "ORGANIZATION" else row.event_id
        metered_quantity = int(row.metadata_json.get("consumption_quantity", row.quantity))
        metered_unit = str(row.metadata_json.get("consumption_unit", row.unit))
        ledger, _ = await MeteringService.record(
            db,
            organization_id=row.organization_id,
            event_id=metered_event_id,
            metric_key=usage_metric_key,
            quantity=metered_quantity,
            unit=metered_unit,
            source=source,
            idempotency_key=f"reservation:{row.id}",
            actor_user_id=actor_user_id,
            metadata={**row.metadata_json, "reservation_id": str(row.id), "limit_key": row.metric_key, "source_event_id": str(row.event_id) if row.event_id else None},
        )
        row.status = "CONSUMED"; row.consumed_entry_id = ledger.id
        return ledger

    @staticmethod
    async def release(db: AsyncSession, reservation_id: uuid.UUID) -> UsageReservation:
        row = await db.scalar(select(UsageReservation).where(UsageReservation.id == reservation_id).with_for_update())
        if not row or row.status != "RESERVED":
            raise HTTPException(status_code=409, detail={"code": "RESERVATION_UNAVAILABLE"})
        row.status = "RELEASED"; row.released_at = datetime.now(timezone.utc)
        return row
