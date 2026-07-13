import hashlib
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.billing.models.event_activation import EventActivation
from app.modules.billing.models.licensing import (
    ActivationTransferPolicy,
    BillingOperationRequest,
    EntitlementGrant,
    EventEntitlementSnapshotItem,
    EventEntitlementSnapshotSet,
    EventLimitSnapshotItem,
    GrantConsumption,
)
from app.modules.billing.models.subscription import OrganizationSubscription
from app.modules.billing.services.entitlement_resolver import EntitlementResolver
from app.modules.billing.services.usage_service import UsageService
from app.modules.events.models.event import Event


class ActivationService:
    LIVE_STATUSES = ("PENDING", "ACTIVE", "SUSPENDED", "EXPIRED", "TRANSFER_PENDING")

    @staticmethod
    def _hash_request(payload: Dict[str, Any]) -> str:
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
        return hashlib.sha256(encoded).hexdigest()

    @staticmethod
    async def ensure_operation_request(
        db: AsyncSession,
        *,
        organization_id: uuid.UUID,
        operation_type: str,
        idempotency_key: str,
        payload: Dict[str, Any],
    ) -> BillingOperationRequest:
        request_hash = ActivationService._hash_request(payload)
        stmt = select(BillingOperationRequest).where(
            BillingOperationRequest.organization_id == organization_id,
            BillingOperationRequest.operation_type == operation_type,
            BillingOperationRequest.idempotency_key == idempotency_key,
        )
        op = await db.scalar(stmt)
        if op:
            if op.request_hash != request_hash:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Idempotency key already used with a different request payload.",
                )
            return op
        op = BillingOperationRequest(
            organization_id=organization_id,
            operation_type=operation_type,
            idempotency_key=idempotency_key,
            request_hash=request_hash,
            status="PENDING",
        )
        db.add(op)
        await db.flush()
        return op

    @staticmethod
    async def ensure_subscription_grant(
        db: AsyncSession, subscription: OrganizationSubscription
    ) -> EntitlementGrant:
        stmt = select(EntitlementGrant).where(
            EntitlementGrant.subscription_id == subscription.id,
            EntitlementGrant.organization_id == subscription.organization_id,
            EntitlementGrant.grant_type == "EVENT_UNIT",
            EntitlementGrant.unit_type == "EVENT",
        )
        grant = await db.scalar(stmt)
        if grant:
            return grant
        status_map = {
            "ACTIVE": "ACTIVE",
            "TRIAL": "ACTIVE",
            "SUSPENDED": "SUSPENDED",
            "EXPIRED": "EXPIRED",
            "CANCELLED": "CANCELLED",
        }
        grant = EntitlementGrant(
            organization_id=subscription.organization_id,
            subscription_id=subscription.id,
            grant_type="EVENT_UNIT",
            scope_type="EVENT",
            consumption_model="SINGLE_USE",
            unit_type="EVENT",
            status=status_map.get(subscription.status, "PENDING"),
            source_type="PLAN",
            source_ref=str(subscription.plan_id),
            quantity_total=1,
            quantity_consumed=0,
            quantity_reserved=0,
            valid_from=subscription.created_at,
            valid_until=subscription.current_period_end,
        )
        db.add(grant)
        await db.flush()
        return grant

    @staticmethod
    async def lock_grant_capacity(
        db: AsyncSession, organization_id: uuid.UUID, grant_id: uuid.UUID
    ) -> EntitlementGrant:
        stmt = (
            select(EntitlementGrant)
            .where(
                EntitlementGrant.id == grant_id,
                EntitlementGrant.organization_id == organization_id,
            )
            .with_for_update()
        )
        grant = await db.scalar(stmt)
        if not grant:
            raise HTTPException(status_code=404, detail="Grant not found.")
        if grant.status != "ACTIVE":
            raise HTTPException(status_code=400, detail=f"Grant is not active: {grant.status}")
        consumed = await db.scalar(
            select(func.coalesce(func.sum(GrantConsumption.quantity), 0)).where(
                GrantConsumption.grant_id == grant.id,
                GrantConsumption.status.in_(["CONSUMED", "TRANSFERRED"]),
            )
        )
        reserved = await db.scalar(
            select(func.coalesce(func.sum(GrantConsumption.quantity), 0)).where(
                GrantConsumption.grant_id == grant.id,
                GrantConsumption.status == "RESERVED",
            )
        )
        available = None if grant.quantity_total is None else int(grant.quantity_total) - int(consumed or 0) - int(reserved or 0)
        if available is not None and available < 1:
            raise HTTPException(status_code=402, detail="No grant capacity remaining for activation.")
        grant.quantity_consumed = int(consumed or 0)
        grant.quantity_reserved = int(reserved or 0)
        return grant

    @staticmethod
    async def _create_snapshot(
        db: AsyncSession,
        *,
        activation: EventActivation,
        resolution_reason: str,
        created_by: Optional[uuid.UUID],
    ) -> EventEntitlementSnapshotSet:
        latest_version = await db.scalar(
            select(func.max(EventEntitlementSnapshotSet.version)).where(
                EventEntitlementSnapshotSet.activation_id == activation.id
            )
        )
        version = int(latest_version or 0) + 1
        package = await EntitlementResolver.build_live_entitlement_package(
            db,
            organization_id=activation.organization_id,
            event_id=activation.event_id,
            subscription_id=activation.subscription_id,
            grant_id=activation.grant_id,
            activation_id=activation.id,
            policy_type=activation.activation_policy,
            resolution_reason=resolution_reason,
        )
        package["activation_id"] = str(activation.id)
        checksum = EntitlementResolver.build_snapshot_checksum(package, version)
        previous_snapshot_id = activation.current_snapshot_set_id
        snapshot = EventEntitlementSnapshotSet(
            activation_id=activation.id,
            organization_id=activation.organization_id,
            event_id=activation.event_id,
            version=version,
            resolution_reason=resolution_reason,
            resolver_version=package["resolver_version"],
            policy_type=activation.activation_policy,
            created_by=created_by,
            previous_snapshot_set_id=previous_snapshot_id,
            checksum=checksum,
        )
        db.add(snapshot)
        await db.flush()

        for item in package["features"].values():
            db.add(
                EventEntitlementSnapshotItem(
                    snapshot_set_id=snapshot.id,
                    feature_key=item["feature_key"],
                    scope_type=item["scope_type"],
                    is_enabled=item["enabled"],
                    source_type=item["source_type"],
                    source_ref=item["source_ref"],
                    override_source=item.get("override_source"),
                    denial_reason_default=item.get("denial_reason"),
                )
            )
        for item in package["limits"].values():
            db.add(
                EventLimitSnapshotItem(
                    snapshot_set_id=snapshot.id,
                    limit_key=item["limit_key"],
                    scope_type=item["scope_type"],
                    limit_value=item["limit_value"],
                    source_type=item["source_type"],
                    source_ref=item["source_ref"],
                    override_source=item.get("override_source"),
                )
            )
        await db.flush()
        activation.current_snapshot_set_id = snapshot.id
        return snapshot

    @staticmethod
    async def activate_event(
        db: AsyncSession,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        subscription_id: Optional[uuid.UUID],
        grant_id: Optional[uuid.UUID],
        activation_policy: str,
        idempotency_key: str,
        actor_id: Optional[uuid.UUID],
    ) -> EventActivation:
        op = await ActivationService.ensure_operation_request(
            db,
            organization_id=organization_id,
            operation_type="ACTIVATE_EVENT",
            idempotency_key=idempotency_key,
            payload={
                "event_id": str(event_id),
                "subscription_id": str(subscription_id) if subscription_id else None,
                "grant_id": str(grant_id) if grant_id else None,
                "activation_policy": activation_policy,
            },
        )
        if op.status == "SUCCEEDED" and op.result_ref_id:
            existing = await EntitlementResolver.get_activation(db, op.result_ref_id)
            if existing:
                return existing

        event = await db.scalar(
            select(Event).where(
                Event.id == event_id,
                Event.organization_id == organization_id,
                Event.deleted_at.is_(None),
            )
        )
        if not event:
            raise HTTPException(status_code=404, detail="Event not found.")

        existing_activation = await db.scalar(
            select(EventActivation).where(
                EventActivation.event_id == event_id,
                EventActivation.organization_id == organization_id,
                EventActivation.status.in_(ActivationService.LIVE_STATUSES),
            )
        )
        if existing_activation:
            if op.status == "SUCCEEDED":
                return existing_activation
            raise HTTPException(status_code=400, detail="This event already has a live activation.")

        subscription: Optional[OrganizationSubscription] = None
        if subscription_id:
            subscription = await db.scalar(
                select(OrganizationSubscription)
                .options(selectinload(OrganizationSubscription.plan))
                .where(
                    OrganizationSubscription.id == subscription_id,
                    OrganizationSubscription.organization_id == organization_id,
                    OrganizationSubscription.status.in_(["ACTIVE", "TRIAL"]),
                )
            )
            if not subscription:
                raise HTTPException(status_code=404, detail="Active or trial subscription not found.")
            if grant_id is None:
                grant = await ActivationService.ensure_subscription_grant(db, subscription)
                grant_id = grant.id
        if grant_id is None:
            raise HTTPException(status_code=400, detail="Either subscription_id or grant_id is required.")

        grant = await ActivationService.lock_grant_capacity(db, organization_id, grant_id)
        if not subscription and grant.subscription_id:
            subscription = await db.get(OrganizationSubscription, grant.subscription_id)
            subscription_id = subscription.id if subscription else None
        if not subscription_id:
            raise HTTPException(status_code=400, detail="Grant is not linked to a subscription-backed event entitlement.")

        reservation = GrantConsumption(
            grant_id=grant.id,
            organization_id=organization_id,
            event_id=event_id,
            quantity=1,
            unit_type=grant.unit_type,
            status="RESERVED",
            reserved_at=datetime.now(timezone.utc),
            reservation_expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
        )
        db.add(reservation)
        await db.flush()
        grant.quantity_reserved = int(grant.quantity_reserved or 0) + 1

        activation = EventActivation(
            organization_id=organization_id,
            event_id=event_id,
            subscription_id=subscription_id,
            grant_id=grant.id,
            grant_consumption_id=reservation.id,
            status="PENDING",
            activation_policy=activation_policy or "SNAPSHOT_LOCKED",
            activated_at=datetime.now(timezone.utc),
        )
        db.add(activation)
        await db.flush()

        await ActivationService._create_snapshot(
            db,
            activation=activation,
            resolution_reason="INITIAL_ACTIVATION",
            created_by=actor_id,
        )

        reservation.status = "CONSUMED"
        reservation.consumed_at = datetime.now(timezone.utc)
        activation.status = "ACTIVE"
        grant.quantity_consumed = int(grant.quantity_consumed or 0) + 1
        grant.quantity_reserved = max(int(grant.quantity_reserved or 0) - 1, 0)
        op.status = "SUCCEEDED"
        op.result_ref_type = "activation"
        op.result_ref_id = activation.id
        await db.flush()
        return activation

    @staticmethod
    async def deactivate_event(
        db: AsyncSession,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        idempotency_key: str,
        actor_id: Optional[uuid.UUID],
    ) -> EventActivation:
        op = await ActivationService.ensure_operation_request(
            db,
            organization_id=organization_id,
            operation_type="DEACTIVATE_EVENT",
            idempotency_key=idempotency_key,
            payload={"event_id": str(event_id)},
        )
        if op.status == "SUCCEEDED" and op.result_ref_id:
            existing = await EntitlementResolver.get_activation(db, op.result_ref_id)
            if existing:
                return existing

        activation = await db.scalar(
            select(EventActivation).where(
                EventActivation.organization_id == organization_id,
                EventActivation.event_id == event_id,
                EventActivation.status.in_(ActivationService.LIVE_STATUSES),
            )
        )
        if not activation:
            raise HTTPException(status_code=404, detail="No live activation found for this event.")

        meaningful_usage = await UsageService.has_meaningful_usage(db, event_id)
        consumption = await db.get(GrantConsumption, activation.grant_consumption_id) if activation.grant_consumption_id else None
        grant = await db.get(EntitlementGrant, activation.grant_id) if activation.grant_id else None

        activation.status = "DEACTIVATED"
        activation.deactivation_reason = "Manual deactivation"
        activation.updated_at = datetime.now(timezone.utc)
        if meaningful_usage:
            activation.usage_locked_at = datetime.now(timezone.utc)
            activation.transfer_locked_at = datetime.now(timezone.utc)
        if consumption and not meaningful_usage and grant and grant.consumption_model in ("SINGLE_USE", "QUANTITY"):
            consumption.status = "RELEASED"
            consumption.released_at = datetime.now(timezone.utc)
            if grant.quantity_consumed:
                grant.quantity_consumed = max(int(grant.quantity_consumed) - 1, 0)
            grant.quantity_reserved = max(int(grant.quantity_reserved or 0) - 1, 0)
        op.status = "SUCCEEDED"
        op.result_ref_type = "activation"
        op.result_ref_id = activation.id
        await db.flush()
        return activation

    @staticmethod
    async def get_transfer_policies(
        db: AsyncSession, plan_id: Optional[uuid.UUID], grant_type: Optional[str]
    ) -> List[Dict[str, Any]]:
        stmt = select(ActivationTransferPolicy)
        if plan_id is not None:
            stmt = stmt.where(
                and_(
                    (ActivationTransferPolicy.plan_id == plan_id) | (ActivationTransferPolicy.plan_id.is_(None)),
                    (ActivationTransferPolicy.grant_type == grant_type) | (ActivationTransferPolicy.grant_type.is_(None)),
                )
            )
        rows = (await db.execute(stmt)).scalars().all()
        if rows:
            return [
                {
                    "metric_key": row.metric_key,
                    "operator": row.operator,
                    "threshold_value": row.threshold_value,
                    "action": row.action,
                }
                for row in rows
            ]
        return [
            {"metric_key": "registration_count", "operator": ">=", "threshold_value": 1, "action": "LOCK_TRANSFER"},
            {"metric_key": "email_sent_count", "operator": ">=", "threshold_value": 1, "action": "LOCK_TRANSFER"},
            {"metric_key": "event_started", "operator": ">=", "threshold_value": 1, "action": "LOCK_TRANSFER"},
            {"metric_key": "certificate_issued_count", "operator": ">=", "threshold_value": 1, "action": "LOCK_TRANSFER"},
            {"metric_key": "session_count", "operator": ">=", "threshold_value": 1, "action": "REVIEW_REQUIRED"},
            {"metric_key": "room_count", "operator": ">=", "threshold_value": 1, "action": "REVIEW_REQUIRED"},
            {"metric_key": "speaker_count", "operator": ">=", "threshold_value": 1, "action": "REVIEW_REQUIRED"},
            {"metric_key": "storage_mb", "operator": ">=", "threshold_value": 100, "action": "REVIEW_REQUIRED"},
        ]

    @staticmethod
    async def transfer_activation(
        db: AsyncSession,
        *,
        organization_id: uuid.UUID,
        source_event_id: uuid.UUID,
        target_event_id: uuid.UUID,
        idempotency_key: str,
        actor_id: Optional[uuid.UUID],
    ) -> Dict[str, Any]:
        op = await ActivationService.ensure_operation_request(
            db,
            organization_id=organization_id,
            operation_type="TRANSFER_ACTIVATION",
            idempotency_key=idempotency_key,
            payload={"source_event_id": str(source_event_id), "target_event_id": str(target_event_id)},
        )
        source = await db.scalar(
            select(EventActivation)
            .options(selectinload(EventActivation.subscription), selectinload(EventActivation.grant))
            .where(
                EventActivation.organization_id == organization_id,
                EventActivation.event_id == source_event_id,
                EventActivation.status == "ACTIVE",
            )
        )
        if not source:
            raise HTTPException(status_code=404, detail="Source activation not found.")

        policies = await ActivationService.get_transfer_policies(
            db,
            source.subscription.plan_id if source.subscription else None,
            source.grant.grant_type if source.grant else None,
        )
        eligibility = await UsageService.get_transfer_eligibility(db, source_event_id, policies)
        if eligibility["action"] == "LOCK_TRANSFER":
            source.status = "TRANSFER_PENDING"
            source.transfer_locked_at = datetime.now(timezone.utc)
            raise HTTPException(status_code=409, detail={"code": "TRANSFER_LOCKED", **eligibility})
        if eligibility["action"] == "REVIEW_REQUIRED":
            source.status = "TRANSFER_PENDING"
            await db.flush()
            return {"status": "REVIEW_REQUIRED", "eligibility": eligibility}

        source_consumption = await db.get(GrantConsumption, source.grant_consumption_id) if source.grant_consumption_id else None
        source_grant = await db.get(EntitlementGrant, source.grant_id) if source.grant_id else None
        if source_consumption and source_grant and source_grant.consumption_model in ("SINGLE_USE", "QUANTITY"):
            source_consumption.status = "RELEASED"
            source_consumption.released_at = datetime.now(timezone.utc)
            source_grant.quantity_consumed = max(int(source_grant.quantity_consumed or 0) - 1, 0)

        new_activation = await ActivationService.activate_event(
            db,
            organization_id=organization_id,
            event_id=target_event_id,
            subscription_id=source.subscription_id,
            grant_id=source.grant_id,
            activation_policy=source.activation_policy,
            idempotency_key=f"{idempotency_key}:activate",
            actor_id=actor_id,
        )
        source.status = "DEACTIVATED"
        source.transferred_to_event_id = target_event_id
        source.transfer_locked_at = datetime.now(timezone.utc)
        op.status = "SUCCEEDED"
        op.result_ref_type = "activation"
        op.result_ref_id = new_activation.id
        await db.flush()
        return {"status": "COMPLETED", "eligibility": eligibility, "activation": new_activation}

    @staticmethod
    async def refresh_snapshot(
        db: AsyncSession,
        *,
        activation_id: uuid.UUID,
        organization_id: uuid.UUID,
        idempotency_key: str,
        actor_id: Optional[uuid.UUID],
        resolution_reason: str = "SNAPSHOT_REFRESH",
    ) -> EventActivation:
        op = await ActivationService.ensure_operation_request(
            db,
            organization_id=organization_id,
            operation_type="REFRESH_SNAPSHOT",
            idempotency_key=idempotency_key,
            payload={"activation_id": str(activation_id), "resolution_reason": resolution_reason},
        )
        activation = await EntitlementResolver.get_activation(db, activation_id)
        if not activation or activation.organization_id != organization_id:
            raise HTTPException(status_code=404, detail="Activation not found.")
        if activation.activation_policy != "SNAPSHOT_REFRESHABLE":
            raise HTTPException(status_code=400, detail="Activation is not refreshable.")
        await ActivationService._create_snapshot(
            db,
            activation=activation,
            resolution_reason=resolution_reason,
            created_by=actor_id,
        )
        op.status = "SUCCEEDED"
        op.result_ref_type = "activation"
        op.result_ref_id = activation.id
        await db.flush()
        return activation
