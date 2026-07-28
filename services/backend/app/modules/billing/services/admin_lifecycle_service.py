from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, TypeVar

from fastapi import HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_log import AuditLog
from app.modules.billing.models.billing_domain_tables import Invoice
from app.modules.billing.models.credit_notes import CreditNote
from app.modules.billing.models.event_activation import EventActivation
from app.modules.billing.models.financial_audit_trail import FinancialAuditTrail
from app.modules.billing.models.licensing import BillingOperationRequest, EntitlementGrant, GrantConsumption
from app.modules.billing.models.subscription import OrganizationSubscription
from app.modules.billing.schemas.billing_admin import (
    CreditNoteIssueRequest,
    CreditNoteStatusUpdate,
    GrantCapacityUpdate,
    GrantIssueRequest,
    GrantStatusUpdate,
    SubscriptionStatusUpdate,
)
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.organization_console import EntitlementOverrideRequest
from app.modules.platform.support_access import PlatformSupportScope


RecordT = TypeVar("RecordT", OrganizationSubscription, EntitlementGrant, CreditNote)


def _json_value(value: Any) -> Any:
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value


def _snapshot(record: Any, fields: tuple[str, ...]) -> dict[str, Any]:
    return {
        field: _json_value(getattr(record, field))
        for field in fields
        if getattr(record, field, None) is not None
    }


class BillingAdminLifecycleService:
    APPROVAL_KEYS = {
        "subscription_status": "billing.subscription.status",
        "grant_issue": "billing.entitlement_grant.issue",
        "grant_capacity": "billing.entitlement_grant.capacity",
        "grant_status": "billing.entitlement_grant.status",
    }
    SUBSCRIPTION_TRANSITIONS = {
        "TRIAL": {"ACTIVE", "SUSPENDED", "CANCELLED", "EXPIRED"},
        "ACTIVE": {"SUSPENDED", "GRACE_PERIOD", "CANCELLED", "EXPIRED"},
        "SUSPENDED": {"ACTIVE", "CANCELLED", "EXPIRED"},
        "PENDING_PAYMENT": {"ACTIVE", "CANCELLED", "EXPIRED"},
        "GRACE_PERIOD": {"ACTIVE", "SUSPENDED", "CANCELLED", "EXPIRED"},
        "EXPIRED": {"ACTIVE", "ARCHIVED"},
        "CANCELLED": {"ARCHIVED"},
        "ARCHIVED": set(),
    }
    GRANT_TRANSITIONS = {
        "PENDING": {"ACTIVE", "CANCELLED"},
        "ACTIVE": {"SUSPENDED", "EXPIRED", "CANCELLED"},
        "SUSPENDED": {"ACTIVE", "EXPIRED", "CANCELLED"},
        "EXPIRED": set(),
        "CANCELLED": set(),
    }
    CREDIT_TRANSITIONS = {
        "PENDING": {"ISSUED", "CANCELLED"},
        "ISSUED": {"APPLIED", "CANCELLED"},
        "APPLIED": set(),
        "CANCELLED": set(),
    }

    @staticmethod
    def _fingerprint(payload: dict[str, Any]) -> str:
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    @staticmethod
    async def _begin_operation(
        db: AsyncSession,
        organization_id: uuid.UUID,
        operation_type: str,
        idempotency_key: str,
        payload: dict[str, Any],
    ) -> tuple[BillingOperationRequest, bool]:
        request_hash = BillingAdminLifecycleService._fingerprint(payload)
        operation = await db.scalar(
            select(BillingOperationRequest).where(
                BillingOperationRequest.organization_id == organization_id,
                BillingOperationRequest.operation_type == operation_type,
                BillingOperationRequest.idempotency_key == idempotency_key,
            ).with_for_update()
        )
        if operation:
            if operation.request_hash != request_hash:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={"code": "IDEMPOTENCY_CONFLICT", "message": "The idempotency key was used with a different request."},
                )
            if operation.status == "SUCCEEDED" and operation.result_ref_id:
                return operation, True
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "OPERATION_IN_PROGRESS", "message": "The billing operation is not replayable yet."},
            )
        operation = BillingOperationRequest(
            organization_id=organization_id,
            operation_type=operation_type,
            idempotency_key=idempotency_key,
            request_hash=request_hash,
            status="PENDING",
        )
        db.add(operation)
        await db.flush()
        return operation, False

    @staticmethod
    async def _consume_approved_change(
        db: AsyncSession,
        *,
        organization_id: uuid.UUID,
        approved_request_id: uuid.UUID,
        entitlement_key: str,
        requested_value: dict[str, Any],
    ) -> EntitlementOverrideRequest:
        """Consume one independently approved, payload-specific change request.

        Idempotent replays return before this helper is called. Any request
        made with a different idempotency key sees the APPLIED status and
        cannot execute the same commercial authority twice.
        """
        approval = await db.scalar(
            select(EntitlementOverrideRequest)
            .where(
                EntitlementOverrideRequest.id == approved_request_id,
                EntitlementOverrideRequest.organization_id == organization_id,
            )
            .with_for_update()
        )
        if approval is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "APPROVED_CHANGE_REQUEST_REQUIRED",
                    "message": "A tenant-scoped independently approved change request is required.",
                },
            )
        if (
            approval.status != "APPROVED"
            or approval.operation != "REPLACE"
            or approval.entitlement_key != entitlement_key
            or approval.requested_by == approval.approved_by
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "APPROVED_CHANGE_REQUEST_REQUIRED",
                    "message": "The supplied request is not an active independently approved change.",
                },
            )
        if BillingAdminLifecycleService._fingerprint(approval.requested_value) != BillingAdminLifecycleService._fingerprint(requested_value):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "APPROVED_CHANGE_MISMATCH",
                    "message": "The approved resource and values do not match this mutation.",
                },
            )
        approval.status = "APPLIED"
        approval.version += 1
        return approval

    @staticmethod
    async def _ensure_organization(db: AsyncSession, organization_id: uuid.UUID) -> None:
        if await db.scalar(select(Organization.id).where(Organization.id == organization_id)) is None:
            raise HTTPException(status_code=404, detail="Organization not found.")

    @staticmethod
    async def _load(
        db: AsyncSession,
        model: type[RecordT],
        organization_id: uuid.UUID,
        record_id: uuid.UUID,
        *,
        lock: bool = False,
    ) -> RecordT:
        statement = select(model).where(model.id == record_id, model.organization_id == organization_id)
        if lock:
            statement = statement.with_for_update()
        record = await db.scalar(statement)
        if record is None:
            raise HTTPException(status_code=404, detail="Billing resource not found.")
        return record

    @staticmethod
    def _assert_version(record: Any, version: int) -> None:
        if record.version != version:
            raise HTTPException(
                status_code=409,
                detail={"code": "VERSION_CONFLICT", "message": "The billing resource changed after it was loaded.", "current_version": record.version},
            )

    @staticmethod
    def _assert_transition(current: str, target: str, transitions: dict[str, set[str]]) -> None:
        if target not in transitions.get(current, set()):
            raise HTTPException(
                status_code=409,
                detail={"code": "INVALID_LIFECYCLE_STATE", "message": f"Transition from {current} to {target} is not allowed."},
            )

    @staticmethod
    async def _audit(
        db: AsyncSession,
        scope: PlatformSupportScope,
        record: Any,
        *,
        action: str,
        entity_type: str,
        reason: str,
        old_state: dict[str, Any] | None,
        new_state: dict[str, Any],
        amount: Decimal | None = None,
    ) -> None:
        audit_state = {**new_state, "reason": reason, "support_reason": scope.reason}
        db.add(AuditLog(
            request_id=scope.request_id,
            correlation_id=scope.correlation_id,
            organization_id=scope.organization_id,
            actor_user_id=scope.actor.id,
            resource_type=f"billing_{entity_type.lower()}",
            resource_id=record.id,
            action_type=action,
            actor_role=scope.actor.platform_role or scope.actor.role,
            old_state=old_state,
            new_state=audit_state,
            actor_ip=scope.actor_ip,
            actor_user_agent=scope.actor_user_agent,
            is_sensitive=True,
        ))
        db.add(FinancialAuditTrail(
            activity_type=action,
            entity_type=entity_type,
            entity_id=record.id,
            entity_name=getattr(record, "credit_note_number", None),
            organization_id=scope.organization_id,
            performed_by=scope.actor.id,
            amount_inr=amount,
            ip_address=scope.actor_ip,
            details=audit_state,
        ))

    @staticmethod
    async def update_subscription_status(
        db: AsyncSession,
        scope: PlatformSupportScope,
        subscription_id: uuid.UUID,
        payload: SubscriptionStatusUpdate,
        idempotency_key: str,
    ) -> OrganizationSubscription:
        operation_type = "UPDATE_SUBSCRIPTION_STATUS"
        operation_payload = {"subscription_id": subscription_id, **payload.model_dump(mode="json")}
        async with TenantContextGuard.scoped(db, scope.organization_id):
            await BillingAdminLifecycleService._ensure_organization(db, scope.organization_id)
            operation, replay = await BillingAdminLifecycleService._begin_operation(db, scope.organization_id, operation_type, idempotency_key, operation_payload)
            if replay:
                return await BillingAdminLifecycleService._load(db, OrganizationSubscription, scope.organization_id, operation.result_ref_id)
            subscription = await BillingAdminLifecycleService._load(db, OrganizationSubscription, scope.organization_id, subscription_id, lock=True)
            BillingAdminLifecycleService._assert_version(subscription, payload.version)
            BillingAdminLifecycleService._assert_transition(subscription.status, payload.status, BillingAdminLifecycleService.SUBSCRIPTION_TRANSITIONS)
            approval = await BillingAdminLifecycleService._consume_approved_change(
                db,
                organization_id=scope.organization_id,
                approved_request_id=payload.approved_request_id,
                entitlement_key=BillingAdminLifecycleService.APPROVAL_KEYS["subscription_status"],
                requested_value={
                    "resource_id": str(subscription.id),
                    "version": payload.version,
                    "status": payload.status,
                },
            )
            old_state = _snapshot(subscription, ("id", "status", "version", "cancel_at_period_end"))
            now = datetime.now(timezone.utc)
            subscription.status = payload.status
            subscription.status_reason = payload.reason
            subscription.status_changed_at = now
            subscription.status_changed_by = scope.actor.id
            subscription.cancel_at_period_end = False if payload.status == "ACTIVE" else subscription.cancel_at_period_end
            subscription.version += 1
            subscription.updated_at = now

            grant_status = {
                "ACTIVE": "ACTIVE", "TRIAL": "ACTIVE", "SUSPENDED": "SUSPENDED",
                "GRACE_PERIOD": "SUSPENDED", "PENDING_PAYMENT": "PENDING",
                "EXPIRED": "EXPIRED", "CANCELLED": "CANCELLED", "ARCHIVED": "CANCELLED",
            }[payload.status]
            grants = (await db.execute(select(EntitlementGrant).where(
                EntitlementGrant.organization_id == scope.organization_id,
                EntitlementGrant.subscription_id == subscription.id,
            ).with_for_update())).scalars().all()
            for grant in grants:
                if grant.status in {"EXPIRED", "CANCELLED"} and grant_status == "ACTIVE":
                    continue
                grant.status = grant_status
                grant.status_reason = payload.reason
                grant.status_changed_at = now
                grant.status_changed_by = scope.actor.id
                grant.version += 1
                grant.updated_at = now
            active_grant_ids = {grant.id for grant in grants if grant.status == "ACTIVE"}

            activations = (await db.execute(select(EventActivation).where(
                EventActivation.organization_id == scope.organization_id,
                EventActivation.subscription_id == subscription.id,
                EventActivation.status.in_(["ACTIVE", "SUSPENDED", "EXPIRED"]),
            ).with_for_update())).scalars().all()
            for activation in activations:
                if payload.status in {"ACTIVE", "TRIAL"} and activation.grant_id in active_grant_ids:
                    activation.status = "ACTIVE"
                    activation.suspension_reason = None
                elif payload.status in {"ACTIVE", "TRIAL"}:
                    activation.status = "SUSPENDED"
                    activation.suspension_reason = "The activation grant remains terminal or restricted."
                elif payload.status == "EXPIRED":
                    activation.status = "EXPIRED"
                    activation.suspension_reason = payload.reason
                else:
                    activation.status = "SUSPENDED"
                    activation.suspension_reason = payload.reason
                activation.updated_at = now

            operation.status = "SUCCEEDED"
            operation.result_ref_type = "subscription"
            operation.result_ref_id = subscription.id
            await BillingAdminLifecycleService._audit(
                db, scope, subscription, action="SUBSCRIPTION_STATUS_CHANGED", entity_type="SUBSCRIPTION",
                reason=payload.reason, old_state=old_state,
                new_state={
                    **_snapshot(subscription, ("id", "status", "version", "status_changed_at")),
                    "approved_request_id": str(approval.id),
                },
            )
            await db.commit()
            await db.refresh(subscription)
            return subscription

    @staticmethod
    async def issue_grant(
        db: AsyncSession,
        scope: PlatformSupportScope,
        payload: GrantIssueRequest,
        idempotency_key: str,
    ) -> EntitlementGrant:
        operation_type = "ISSUE_GRANT"
        async with TenantContextGuard.scoped(db, scope.organization_id):
            await BillingAdminLifecycleService._ensure_organization(db, scope.organization_id)
            operation, replay = await BillingAdminLifecycleService._begin_operation(db, scope.organization_id, operation_type, idempotency_key, payload.model_dump(mode="json"))
            if replay:
                return await BillingAdminLifecycleService._load(db, EntitlementGrant, scope.organization_id, operation.result_ref_id)
            subscription = None
            if payload.subscription_id:
                subscription = await BillingAdminLifecycleService._load(db, OrganizationSubscription, scope.organization_id, payload.subscription_id)
            if payload.source_type == "PLAN" and subscription is None:
                raise HTTPException(status_code=422, detail={"code": "SUBSCRIPTION_REQUIRED", "message": "PLAN grants require a tenant-owned subscription."})
            approved_values = payload.model_dump(
                mode="json",
                exclude={"reason", "approved_request_id"},
                exclude_none=True,
            )
            approval = await BillingAdminLifecycleService._consume_approved_change(
                db,
                organization_id=scope.organization_id,
                approved_request_id=payload.approved_request_id,
                entitlement_key=BillingAdminLifecycleService.APPROVAL_KEYS["grant_issue"],
                requested_value=approved_values,
            )
            now = datetime.now(timezone.utc)
            grant_status = "PENDING" if payload.valid_from and payload.valid_from > now else "ACTIVE"
            if subscription and subscription.status not in {"ACTIVE", "TRIAL"}:
                grant_status = "PENDING"
            values = payload.model_dump(exclude={"reason", "approved_request_id"})
            grant = EntitlementGrant(
                organization_id=scope.organization_id,
                status=grant_status,
                quantity_consumed=0 if payload.quantity_total is not None else None,
                quantity_reserved=0 if payload.quantity_total is not None else None,
                status_reason=payload.reason,
                status_changed_at=now,
                status_changed_by=scope.actor.id,
                **values,
            )
            db.add(grant)
            await db.flush()
            operation.status = "SUCCEEDED"
            operation.result_ref_type = "grant"
            operation.result_ref_id = grant.id
            await BillingAdminLifecycleService._audit(
                db, scope, grant, action="ENTITLEMENT_GRANT_ISSUED", entity_type="ENTITLEMENT_GRANT",
                reason=payload.reason, old_state=None,
                new_state={
                    **_snapshot(grant, ("id", "subscription_id", "grant_type", "scope_type", "consumption_model", "unit_type", "status", "quantity_total", "version")),
                    "approved_request_id": str(approval.id),
                },
            )
            await db.commit()
            await db.refresh(grant)
            return grant

    @staticmethod
    async def update_grant_capacity(
        db: AsyncSession,
        scope: PlatformSupportScope,
        grant_id: uuid.UUID,
        payload: GrantCapacityUpdate,
        idempotency_key: str,
    ) -> EntitlementGrant:
        operation_payload = {"grant_id": grant_id, **payload.model_dump(mode="json")}
        async with TenantContextGuard.scoped(db, scope.organization_id):
            operation, replay = await BillingAdminLifecycleService._begin_operation(db, scope.organization_id, "UPDATE_GRANT_CAPACITY", idempotency_key, operation_payload)
            if replay:
                return await BillingAdminLifecycleService._load(db, EntitlementGrant, scope.organization_id, operation.result_ref_id)
            grant = await BillingAdminLifecycleService._load(db, EntitlementGrant, scope.organization_id, grant_id, lock=True)
            BillingAdminLifecycleService._assert_version(grant, payload.version)
            if grant.consumption_model in {"NON_CONSUMABLE", "MANUAL_FULFILLMENT"}:
                raise HTTPException(status_code=409, detail={"code": "GRANT_NOT_QUANTITY_BASED", "message": "This grant does not use quantity capacity."})
            allocated = int(await db.scalar(select(func.coalesce(func.sum(GrantConsumption.quantity), 0)).where(
                GrantConsumption.grant_id == grant.id,
                GrantConsumption.organization_id == scope.organization_id,
                GrantConsumption.status.in_(["RESERVED", "CONSUMED", "TRANSFERRED"]),
            )) or 0)
            if payload.quantity_total < allocated:
                raise HTTPException(status_code=409, detail={"code": "GRANT_CAPACITY_BELOW_USAGE", "message": "Capacity cannot be lower than authoritative allocated usage.", "allocated": allocated})
            if grant.consumption_model == "SINGLE_USE" and payload.quantity_total != 1:
                raise HTTPException(status_code=409, detail={"code": "INVALID_GRANT_CAPACITY", "message": "SINGLE_USE grant capacity must remain 1."})
            approval = await BillingAdminLifecycleService._consume_approved_change(
                db,
                organization_id=scope.organization_id,
                approved_request_id=payload.approved_request_id,
                entitlement_key=BillingAdminLifecycleService.APPROVAL_KEYS["grant_capacity"],
                requested_value={
                    "resource_id": str(grant.id),
                    "version": payload.version,
                    "quantity_total": payload.quantity_total,
                },
            )
            old_state = _snapshot(grant, ("id", "quantity_total", "version"))
            grant.quantity_total = payload.quantity_total
            grant.version += 1
            grant.updated_at = datetime.now(timezone.utc)
            operation.status = "SUCCEEDED"
            operation.result_ref_type = "grant"
            operation.result_ref_id = grant.id
            await BillingAdminLifecycleService._audit(
                db, scope, grant, action="ENTITLEMENT_GRANT_CAPACITY_CHANGED", entity_type="ENTITLEMENT_GRANT",
                reason=payload.reason, old_state=old_state,
                new_state={
                    **_snapshot(grant, ("id", "quantity_total", "version")),
                    "approved_request_id": str(approval.id),
                },
            )
            await db.commit()
            await db.refresh(grant)
            return grant

    @staticmethod
    async def update_grant_status(
        db: AsyncSession,
        scope: PlatformSupportScope,
        grant_id: uuid.UUID,
        payload: GrantStatusUpdate,
        idempotency_key: str,
    ) -> EntitlementGrant:
        operation_payload = {"grant_id": grant_id, **payload.model_dump(mode="json")}
        async with TenantContextGuard.scoped(db, scope.organization_id):
            operation, replay = await BillingAdminLifecycleService._begin_operation(db, scope.organization_id, "UPDATE_GRANT_STATUS", idempotency_key, operation_payload)
            if replay:
                return await BillingAdminLifecycleService._load(db, EntitlementGrant, scope.organization_id, operation.result_ref_id)
            grant = await BillingAdminLifecycleService._load(db, EntitlementGrant, scope.organization_id, grant_id, lock=True)
            BillingAdminLifecycleService._assert_version(grant, payload.version)
            BillingAdminLifecycleService._assert_transition(grant.status, payload.status, BillingAdminLifecycleService.GRANT_TRANSITIONS)
            if payload.status == "ACTIVE" and grant.subscription_id:
                subscription = await BillingAdminLifecycleService._load(
                    db, OrganizationSubscription, scope.organization_id, grant.subscription_id, lock=True
                )
                if subscription.status not in {"ACTIVE", "TRIAL"}:
                    raise HTTPException(
                        status_code=409,
                        detail={"code": "SUBSCRIPTION_NOT_ACTIVE", "message": "Activate the parent subscription before activating this grant."},
                    )
            approval = await BillingAdminLifecycleService._consume_approved_change(
                db,
                organization_id=scope.organization_id,
                approved_request_id=payload.approved_request_id,
                entitlement_key=BillingAdminLifecycleService.APPROVAL_KEYS["grant_status"],
                requested_value={
                    "resource_id": str(grant.id),
                    "version": payload.version,
                    "status": payload.status,
                },
            )
            old_state = _snapshot(grant, ("id", "status", "version"))
            now = datetime.now(timezone.utc)
            grant.status = payload.status
            grant.status_reason = payload.reason
            grant.status_changed_at = now
            grant.status_changed_by = scope.actor.id
            grant.version += 1
            grant.updated_at = now
            activations = (await db.execute(select(EventActivation).where(
                EventActivation.organization_id == scope.organization_id,
                EventActivation.grant_id == grant.id,
                EventActivation.status.in_(["ACTIVE", "SUSPENDED", "EXPIRED"]),
            ).with_for_update())).scalars().all()
            for activation in activations:
                if payload.status == "ACTIVE":
                    activation.status = "ACTIVE"
                    activation.suspension_reason = None
                elif payload.status == "EXPIRED":
                    activation.status = "EXPIRED"
                    activation.suspension_reason = payload.reason
                else:
                    activation.status = "SUSPENDED"
                    activation.suspension_reason = payload.reason
                activation.updated_at = now
            operation.status = "SUCCEEDED"
            operation.result_ref_type = "grant"
            operation.result_ref_id = grant.id
            await BillingAdminLifecycleService._audit(
                db, scope, grant, action="ENTITLEMENT_GRANT_STATUS_CHANGED", entity_type="ENTITLEMENT_GRANT",
                reason=payload.reason, old_state=old_state,
                new_state={
                    **_snapshot(grant, ("id", "status", "version", "status_changed_at")),
                    "approved_request_id": str(approval.id),
                },
            )
            await db.commit()
            await db.refresh(grant)
            return grant

    @staticmethod
    async def issue_credit_note(
        db: AsyncSession,
        scope: PlatformSupportScope,
        payload: CreditNoteIssueRequest,
        idempotency_key: str,
    ) -> CreditNote:
        async with TenantContextGuard.scoped(db, scope.organization_id):
            operation, replay = await BillingAdminLifecycleService._begin_operation(db, scope.organization_id, "ISSUE_CREDIT_NOTE", idempotency_key, payload.model_dump(mode="json"))
            if replay:
                return await BillingAdminLifecycleService._load(db, CreditNote, scope.organization_id, operation.result_ref_id)
            invoice = await db.scalar(select(Invoice).where(
                Invoice.id == payload.invoice_id,
                Invoice.organization_id == scope.organization_id,
            ).with_for_update())
            if invoice is None:
                raise HTTPException(status_code=404, detail="Invoice not found.")
            invoice_total = Decimal(str(invoice.total_amount_inr or invoice.amount or 0))
            existing_total = Decimal(str(await db.scalar(select(func.coalesce(func.sum(CreditNote.amount_inr + CreditNote.gst_amount), 0)).where(
                CreditNote.organization_id == scope.organization_id,
                CreditNote.invoice_id == invoice.id,
                CreditNote.status != "CANCELLED",
            )) or 0))
            requested_total = payload.amount_inr + payload.gst_amount
            if requested_total > invoice_total - existing_total:
                raise HTTPException(status_code=409, detail={"code": "CREDIT_NOTE_EXCEEDS_INVOICE", "message": "Credit exceeds the remaining invoice value."})
            now = datetime.now(timezone.utc)
            note = CreditNote(
                credit_note_number=f"CN-{now.year}-{uuid.uuid4().hex[:10].upper()}",
                invoice_id=invoice.id,
                organization_id=scope.organization_id,
                amount_inr=payload.amount_inr,
                gst_amount=payload.gst_amount,
                reason=payload.reason,
                status="PENDING",
                status_reason=payload.reason,
                status_changed_by=scope.actor.id,
                updated_at=now,
            )
            db.add(note)
            await db.flush()
            operation.status = "SUCCEEDED"
            operation.result_ref_type = "credit_note"
            operation.result_ref_id = note.id
            await BillingAdminLifecycleService._audit(
                db, scope, note, action="CREDIT_NOTE_CREATED", entity_type="CREDIT_NOTE",
                reason=payload.reason, old_state=None,
                new_state=_snapshot(note, ("id", "credit_note_number", "invoice_id", "amount_inr", "gst_amount", "status", "version")),
                amount=requested_total,
            )
            await db.commit()
            await db.refresh(note)
            return note

    @staticmethod
    async def update_credit_note_status(
        db: AsyncSession,
        scope: PlatformSupportScope,
        credit_note_id: uuid.UUID,
        payload: CreditNoteStatusUpdate,
        idempotency_key: str,
    ) -> CreditNote:
        operation_payload = {"credit_note_id": credit_note_id, **payload.model_dump(mode="json")}
        async with TenantContextGuard.scoped(db, scope.organization_id):
            operation, replay = await BillingAdminLifecycleService._begin_operation(db, scope.organization_id, "UPDATE_CREDIT_NOTE_STATUS", idempotency_key, operation_payload)
            if replay:
                return await BillingAdminLifecycleService._load(db, CreditNote, scope.organization_id, operation.result_ref_id)
            note = await BillingAdminLifecycleService._load(db, CreditNote, scope.organization_id, credit_note_id, lock=True)
            BillingAdminLifecycleService._assert_version(note, payload.version)
            BillingAdminLifecycleService._assert_transition(note.status, payload.status, BillingAdminLifecycleService.CREDIT_TRANSITIONS)
            if payload.status == "APPLIED":
                target_invoice = await db.scalar(select(Invoice).where(
                    Invoice.id == payload.applied_to_invoice_id,
                    Invoice.organization_id == scope.organization_id,
                ).with_for_update())
                if target_invoice is None:
                    raise HTTPException(status_code=404, detail="Target invoice not found.")
                if target_invoice.id == note.invoice_id:
                    raise HTTPException(status_code=409, detail={"code": "INVALID_CREDIT_TARGET", "message": "A credit note cannot be applied to its source invoice."})
                applied_total = Decimal(str(await db.scalar(select(func.coalesce(func.sum(CreditNote.amount_inr + CreditNote.gst_amount), 0)).where(
                    CreditNote.organization_id == scope.organization_id,
                    CreditNote.applied_to_invoice_id == target_invoice.id,
                    CreditNote.status == "APPLIED",
                    CreditNote.id != note.id,
                )) or 0))
                target_total = Decimal(str(target_invoice.total_amount_inr or target_invoice.amount or 0))
                if Decimal(str(note.amount_inr)) + Decimal(str(note.gst_amount)) > target_total - applied_total:
                    raise HTTPException(status_code=409, detail={"code": "CREDIT_TARGET_CAPACITY_EXCEEDED", "message": "The target invoice does not have enough remaining value."})
            old_state = _snapshot(note, ("id", "status", "version", "applied_to_invoice_id"))
            now = datetime.now(timezone.utc)
            note.status = payload.status
            note.status_reason = payload.reason
            note.status_changed_by = scope.actor.id
            note.version += 1
            note.updated_at = now
            if payload.status == "ISSUED":
                note.issued_by = scope.actor.id
                note.issued_at = now
            elif payload.status == "APPLIED":
                note.applied_to_invoice_id = payload.applied_to_invoice_id
                note.applied_at = now
            elif payload.status == "CANCELLED":
                note.cancelled_at = now
            operation.status = "SUCCEEDED"
            operation.result_ref_type = "credit_note"
            operation.result_ref_id = note.id
            action = {"ISSUED": "CREDIT_NOTE_ISSUED", "APPLIED": "CREDIT_NOTE_APPLIED", "CANCELLED": "CREDIT_NOTE_CANCELLED"}[payload.status]
            await BillingAdminLifecycleService._audit(
                db, scope, note, action=action, entity_type="CREDIT_NOTE",
                reason=payload.reason, old_state=old_state,
                new_state=_snapshot(note, ("id", "status", "version", "issued_at", "applied_to_invoice_id", "applied_at", "cancelled_at")),
                amount=Decimal(str(note.amount_inr)) + Decimal(str(note.gst_amount)),
            )
            await db.commit()
            await db.refresh(note)
            return note
