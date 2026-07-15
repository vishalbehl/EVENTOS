from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_log import AuditLog
from app.modules.billing.models.billing_domain_tables import Invoice, InvoiceItem
from app.modules.billing.models.subscription import OrganizationSubscription, SubscriptionTransaction
from app.modules.billing.schemas.billing_admin import (
    CommercialPaymentReconcileRequest,
    CommercialPaymentRecordRequest,
    CommercialPaymentRefundRequest,
    InvoiceStatusUpdate,
)
from app.modules.billing.services.admin_lifecycle_service import BillingAdminLifecycleService, _snapshot
from app.modules.platform.models.organization import Organization
from app.modules.platform.support_access import PlatformSupportScope


class FinancialAdminService:
    @staticmethod
    def _invoice_total(invoice: Invoice) -> Decimal:
        total = Decimal(str(invoice.total_amount_inr or 0))
        if total <= 0:
            total = Decimal(str(invoice.amount or 0)) + Decimal(str(invoice.gst_amount or 0))
        return total.quantize(Decimal("0.01"))

    @staticmethod
    async def _load_invoice(
        db: AsyncSession,
        organization_id: uuid.UUID,
        invoice_id: uuid.UUID,
        *,
        lock: bool = False,
    ) -> Invoice:
        statement = select(Invoice).where(
            Invoice.id == invoice_id,
            Invoice.organization_id == organization_id,
        )
        if lock:
            statement = statement.with_for_update()
        invoice = await db.scalar(statement)
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found.")
        return invoice

    @staticmethod
    async def _load_payment(
        db: AsyncSession,
        organization_id: uuid.UUID,
        payment_id: uuid.UUID,
        *,
        lock: bool = False,
    ) -> SubscriptionTransaction:
        statement = select(SubscriptionTransaction).where(
            SubscriptionTransaction.id == payment_id,
            SubscriptionTransaction.organization_id == organization_id,
        )
        if lock:
            statement = statement.with_for_update()
        payment = await db.scalar(statement)
        if not payment:
            raise HTTPException(status_code=404, detail="Commercial payment not found.")
        return payment

    @staticmethod
    async def inspect_invoice(
        db: AsyncSession,
        scope: PlatformSupportScope,
        invoice_id: uuid.UUID,
    ) -> dict[str, Any]:
        async with TenantContextGuard.scoped(db, scope.organization_id):
            invoice = await FinancialAdminService._load_invoice(db, scope.organization_id, invoice_id)
            items = (await db.execute(
                select(InvoiceItem).where(InvoiceItem.invoice_id == invoice.id).order_by(InvoiceItem.id)
            )).scalars().all()
            payments = (await db.execute(
                select(SubscriptionTransaction).where(
                    SubscriptionTransaction.organization_id == scope.organization_id,
                    SubscriptionTransaction.invoice_id == invoice.id,
                ).order_by(SubscriptionTransaction.created_at.desc())
            )).scalars().all()
            reconciled_amount = sum(
                (Decimal(str(payment.amount)) for payment in payments
                if payment.status in {"SUCCESS", "SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"} and payment.reconciliation_status == "RECONCILED"),
                Decimal("0"),
            )
            total = FinancialAdminService._invoice_total(invoice)
            outstanding = max(total - reconciled_amount, Decimal("0"))
            if invoice.status == "REFUNDED":
                reconciliation_status = "REFUNDED"
            elif invoice.status == "VOID":
                reconciliation_status = "VOID"
            elif reconciled_amount > total and total > 0:
                reconciliation_status = "OVERPAID"
            elif outstanding == 0 and total > 0:
                reconciliation_status = "SETTLED"
            elif reconciled_amount > 0:
                reconciliation_status = "PARTIALLY_RECONCILED"
            elif any(payment.reconciliation_status == "MISMATCH" for payment in payments):
                reconciliation_status = "MISMATCH"
            else:
                reconciliation_status = "UNRECONCILED"

            db.add(AuditLog(
                request_id=scope.request_id,
                correlation_id=scope.correlation_id,
                organization_id=scope.organization_id,
                actor_user_id=scope.actor.id,
                resource_type="billing_invoice",
                resource_id=invoice.id,
                action_type="PLATFORM_SUPPORT_DATA_READ",
                actor_role=scope.actor.platform_role or scope.actor.role,
                new_state={
                    "reason": scope.reason,
                    "access_mode": "READ_ONLY",
                    "payment_count": len(payments),
                    "reconciliation_status": reconciliation_status,
                },
                actor_ip=scope.actor_ip,
                actor_user_agent=scope.actor_user_agent,
                is_sensitive=True,
            ))
            await db.commit()
            return {
                "invoice": invoice,
                "items": items,
                "payments": payments,
                "reconciled_amount": reconciled_amount,
                "outstanding_amount": outstanding,
                "reconciliation_status": reconciliation_status,
            }

    @staticmethod
    async def record_payment(
        db: AsyncSession,
        scope: PlatformSupportScope,
        invoice_id: uuid.UUID,
        payload: CommercialPaymentRecordRequest,
        idempotency_key: str,
    ) -> SubscriptionTransaction:
        operation_payload = {"invoice_id": invoice_id, **payload.model_dump(mode="json")}
        async with TenantContextGuard.scoped(db, scope.organization_id):
            operation, replay = await BillingAdminLifecycleService._begin_operation(
                db, scope.organization_id, "RECORD_INVOICE_PAYMENT", idempotency_key, operation_payload
            )
            if replay:
                return await FinancialAdminService._load_payment(db, scope.organization_id, operation.result_ref_id)
            invoice = await FinancialAdminService._load_invoice(db, scope.organization_id, invoice_id, lock=True)
            if invoice.status in {"VOID", "REFUNDED"}:
                raise HTTPException(
                    status_code=409,
                    detail={"code": "INVALID_LIFECYCLE_STATE", "message": "Payments cannot be recorded against a void or refunded invoice."},
                )
            subscription = None
            plan_name = "Invoice settlement"
            if payload.subscription_id:
                subscription = await db.scalar(select(OrganizationSubscription).where(
                    OrganizationSubscription.id == payload.subscription_id,
                    OrganizationSubscription.organization_id == scope.organization_id,
                ))
                if not subscription:
                    raise HTTPException(status_code=404, detail="Subscription not found.")
                await db.refresh(subscription, attribute_names=["plan"])
                plan_name = subscription.plan.name if subscription.plan else plan_name
            if payload.provider_transaction_id:
                duplicate = await db.scalar(select(SubscriptionTransaction.id).where(
                    SubscriptionTransaction.provider == payload.provider,
                    SubscriptionTransaction.provider_transaction_id == payload.provider_transaction_id,
                ))
                if duplicate:
                    raise HTTPException(
                        status_code=409,
                        detail={"code": "PROVIDER_REFERENCE_CONFLICT", "message": "Provider transaction reference already exists."},
                    )
            organization = await db.get(Organization, scope.organization_id)
            payment = SubscriptionTransaction(
                organization_id=scope.organization_id,
                invoice_id=invoice.id,
                subscription_id=subscription.id if subscription else None,
                plan_name=plan_name,
                amount=payload.amount,
                currency=payload.currency.upper(),
                provider=payload.provider,
                provider_transaction_id=payload.provider_transaction_id,
                provider_event_id=payload.provider_event_id,
                status=payload.status,
                reconciliation_status="PENDING",
                billing_name=organization.name if organization else "Unknown organization",
                billing_email=scope.actor.email,
                billing_phone=getattr(scope.actor, "phone", None) or "Not provided",
            )
            db.add(payment)
            try:
                await db.flush()
            except IntegrityError as exc:
                await db.rollback()
                raise HTTPException(
                    status_code=409,
                    detail={"code": "PROVIDER_REFERENCE_CONFLICT", "message": "Provider transaction reference is unavailable."},
                ) from exc
            await BillingAdminLifecycleService._audit(
                db,
                scope,
                payment,
                action="INVOICE_PAYMENT_RECORDED",
                entity_type="COMMERCIAL_PAYMENT",
                reason=payload.reason,
                old_state=None,
                new_state=_snapshot(payment, (
                    "id", "invoice_id", "amount", "currency", "provider", "provider_transaction_id",
                    "status", "reconciliation_status", "version",
                )),
                amount=payload.amount,
            )
            operation.status = "SUCCEEDED"
            operation.result_ref_type = "commercial_payment"
            operation.result_ref_id = payment.id
            await db.commit()
            return payment

    @staticmethod
    async def reconcile_payment(
        db: AsyncSession,
        scope: PlatformSupportScope,
        payment_id: uuid.UUID,
        payload: CommercialPaymentReconcileRequest,
        idempotency_key: str,
    ) -> SubscriptionTransaction:
        operation_payload = {"payment_id": payment_id, **payload.model_dump(mode="json")}
        async with TenantContextGuard.scoped(db, scope.organization_id):
            operation, replay = await BillingAdminLifecycleService._begin_operation(
                db, scope.organization_id, "RECONCILE_INVOICE_PAYMENT", idempotency_key, operation_payload
            )
            if replay:
                return await FinancialAdminService._load_payment(db, scope.organization_id, operation.result_ref_id)
            payment = await FinancialAdminService._load_payment(db, scope.organization_id, payment_id, lock=True)
            BillingAdminLifecycleService._assert_version(payment, payload.version)
            if not payment.invoice_id:
                raise HTTPException(status_code=409, detail={"code": "PAYMENT_NOT_LINKED", "message": "Payment is not linked to an invoice."})
            if payload.reconciliation_status == "RECONCILED" and payment.status not in {"SUCCESS", "SUCCEEDED"}:
                raise HTTPException(status_code=409, detail={"code": "PAYMENT_NOT_SUCCESSFUL", "message": "Only successful payments can settle an invoice."})
            invoice = await FinancialAdminService._load_invoice(db, scope.organization_id, payment.invoice_id, lock=True)
            if invoice.status == "VOID":
                raise HTTPException(status_code=409, detail={"code": "INVALID_LIFECYCLE_STATE", "message": "A void invoice cannot be reconciled."})
            old_state = _snapshot(payment, ("id", "status", "reconciliation_status", "version"))
            now = datetime.now(timezone.utc)
            payment.reconciliation_status = payload.reconciliation_status
            payment.reconciliation_reason = payload.reason
            payment.reconciled_at = now
            payment.reconciled_by = scope.actor.id
            payment.version += 1
            payment.updated_at = now

            reconciled_amount = await db.scalar(select(func.coalesce(func.sum(SubscriptionTransaction.amount), 0)).where(
                SubscriptionTransaction.organization_id == scope.organization_id,
                SubscriptionTransaction.invoice_id == invoice.id,
                SubscriptionTransaction.status.in_(["SUCCESS", "SUCCEEDED"]),
                SubscriptionTransaction.reconciliation_status == "RECONCILED",
            ))
            invoice_total = FinancialAdminService._invoice_total(invoice)
            settled = Decimal(str(reconciled_amount or 0)) >= invoice_total and invoice_total > 0
            target_status = "PAID" if settled else ("UNPAID" if invoice.status == "PAID" else invoice.status)
            if invoice.status != target_status:
                invoice.status = target_status
                invoice.paid_at = now if settled else None
                invoice.status_reason = payload.reason
                invoice.status_changed_at = now
                invoice.status_changed_by = scope.actor.id
                invoice.version += 1
                invoice.updated_at = now

            await BillingAdminLifecycleService._audit(
                db,
                scope,
                payment,
                action=f"INVOICE_PAYMENT_{payload.reconciliation_status}",
                entity_type="COMMERCIAL_PAYMENT",
                reason=payload.reason,
                old_state=old_state,
                new_state={
                    **_snapshot(payment, ("id", "invoice_id", "reconciliation_status", "reconciled_at", "version")),
                    "invoice_status": invoice.status,
                    "reconciled_total": str(reconciled_amount or 0),
                    "invoice_total": str(invoice_total),
                },
                amount=Decimal(str(payment.amount)),
            )
            operation.status = "SUCCEEDED"
            operation.result_ref_type = "commercial_payment"
            operation.result_ref_id = payment.id
            await db.commit()
            return payment

    @staticmethod
    async def update_invoice_status(
        db: AsyncSession,
        scope: PlatformSupportScope,
        invoice_id: uuid.UUID,
        payload: InvoiceStatusUpdate,
        idempotency_key: str,
    ) -> Invoice:
        operation_payload = {"invoice_id": invoice_id, **payload.model_dump(mode="json")}
        async with TenantContextGuard.scoped(db, scope.organization_id):
            operation, replay = await BillingAdminLifecycleService._begin_operation(
                db, scope.organization_id, "UPDATE_INVOICE_STATUS", idempotency_key, operation_payload
            )
            if replay:
                return await FinancialAdminService._load_invoice(db, scope.organization_id, operation.result_ref_id)
            invoice = await FinancialAdminService._load_invoice(db, scope.organization_id, invoice_id, lock=True)
            BillingAdminLifecycleService._assert_version(invoice, payload.version)
            if invoice.status in {"PAID", "VOID", "REFUNDED"}:
                raise HTTPException(
                    status_code=409,
                    detail={"code": "INVALID_LIFECYCLE_STATE", "message": f"Invoice in {invoice.status} state cannot be voided."},
                )
            reconciled = await db.scalar(select(func.coalesce(func.sum(SubscriptionTransaction.amount), 0)).where(
                SubscriptionTransaction.organization_id == scope.organization_id,
                SubscriptionTransaction.invoice_id == invoice.id,
                SubscriptionTransaction.reconciliation_status == "RECONCILED",
            ))
            if Decimal(str(reconciled or 0)) > 0:
                raise HTTPException(
                    status_code=409,
                    detail={"code": "INVOICE_HAS_RECONCILED_PAYMENTS", "message": "Reverse reconciled payments before voiding the invoice."},
                )
            old_state = _snapshot(invoice, ("id", "status", "version"))
            now = datetime.now(timezone.utc)
            invoice.status = "VOID"
            invoice.status_reason = payload.reason
            invoice.status_changed_at = now
            invoice.status_changed_by = scope.actor.id
            invoice.version += 1
            invoice.updated_at = now
            await BillingAdminLifecycleService._audit(
                db,
                scope,
                invoice,
                action="INVOICE_VOIDED",
                entity_type="INVOICE",
                reason=payload.reason,
                old_state=old_state,
                new_state=_snapshot(invoice, ("id", "status", "status_reason", "version")),
                amount=FinancialAdminService._invoice_total(invoice),
            )
            operation.status = "SUCCEEDED"
            operation.result_ref_type = "invoice"
            operation.result_ref_id = invoice.id
            await db.commit()
            return invoice

    @staticmethod
    async def refund_payment(
        db: AsyncSession,
        scope: PlatformSupportScope,
        payment_id: uuid.UUID,
        payload: CommercialPaymentRefundRequest,
        idempotency_key: str,
    ) -> SubscriptionTransaction:
        operation_payload = {"payment_id": payment_id, **payload.model_dump(mode="json")}
        async with TenantContextGuard.scoped(db, scope.organization_id):
            operation, replay = await BillingAdminLifecycleService._begin_operation(
                db, scope.organization_id, "REFUND_INVOICE_PAYMENT", idempotency_key, operation_payload
            )
            if replay:
                return await FinancialAdminService._load_payment(db, scope.organization_id, operation.result_ref_id)
            payment = await FinancialAdminService._load_payment(db, scope.organization_id, payment_id, lock=True)
            BillingAdminLifecycleService._assert_version(payment, payload.version)
            if payment.parent_transaction_id or payment.status not in {"SUCCESS", "SUCCEEDED", "PARTIALLY_REFUNDED"}:
                raise HTTPException(status_code=409, detail={"code": "PAYMENT_NOT_REFUNDABLE"})
            if payment.reconciliation_status != "RECONCILED" or not payment.invoice_id:
                raise HTTPException(status_code=409, detail={"code": "PAYMENT_NOT_RECONCILED"})
            amount = Decimal(str(payload.amount)).quantize(Decimal("0.01"))
            available = Decimal(str(payment.amount)) - Decimal(str(payment.refunded_amount or 0))
            if amount > available:
                raise HTTPException(status_code=409, detail={"code": "REFUND_EXCEEDS_AVAILABLE", "available": str(available)})
            if payment.provider != "OFFLINE" and not payload.provider_refund_id:
                raise HTTPException(status_code=422, detail={"code": "PROVIDER_REFUND_REFERENCE_REQUIRED"})
            invoice = await FinancialAdminService._load_invoice(db, scope.organization_id, payment.invoice_id, lock=True)
            now = datetime.now(timezone.utc)
            refund = SubscriptionTransaction(
                organization_id=scope.organization_id,
                invoice_id=payment.invoice_id,
                subscription_id=payment.subscription_id,
                parent_transaction_id=payment.id,
                plan_name=f"Refund: {payment.plan_name}"[:100],
                amount=-amount,
                currency=payment.currency,
                provider=payment.provider,
                provider_transaction_id=payload.provider_refund_id,
                status="REFUNDED",
                reconciliation_status="RECONCILED",
                reconciled_at=now,
                reconciled_by=scope.actor.id,
                reconciliation_reason=payload.reason,
                billing_name=payment.billing_name,
                billing_email=payment.billing_email,
                billing_phone=payment.billing_phone,
            )
            db.add(refund)
            await db.flush()
            payment.refunded_amount = Decimal(str(payment.refunded_amount or 0)) + amount
            payment.status = "REFUNDED" if Decimal(str(payment.refunded_amount)) >= Decimal(str(payment.amount)) else "PARTIALLY_REFUNDED"
            payment.version += 1
            payment.updated_at = now
            total_refunded = await db.scalar(select(func.coalesce(func.sum(-SubscriptionTransaction.amount), 0)).where(
                SubscriptionTransaction.organization_id == scope.organization_id,
                SubscriptionTransaction.invoice_id == invoice.id,
                SubscriptionTransaction.parent_transaction_id.is_not(None),
                SubscriptionTransaction.status == "REFUNDED",
            ))
            if Decimal(str(total_refunded or 0)) >= FinancialAdminService._invoice_total(invoice):
                invoice.status = "REFUNDED"
                invoice.status_reason = payload.reason
                invoice.status_changed_at = now
                invoice.status_changed_by = scope.actor.id
                invoice.version += 1
                invoice.updated_at = now
            await BillingAdminLifecycleService._audit(
                db, scope, refund, action="INVOICE_PAYMENT_REFUNDED", entity_type="COMMERCIAL_REFUND",
                reason=payload.reason, old_state=None,
                new_state={"payment_id": str(payment.id), "refund_id": str(refund.id), "amount": str(amount), "invoice_status": invoice.status},
                amount=-amount,
            )
            operation.status = "SUCCEEDED"
            operation.result_ref_type = "commercial_refund"
            operation.result_ref_id = refund.id
            await db.commit()
            await db.refresh(refund)
            return refund
