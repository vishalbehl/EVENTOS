"""Typed, tenant-scoped billing intelligence endpoints for platform support."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import List

import uuid

from fastapi import APIRouter, Header, HTTPException, Query, status
from sqlalchemy import select

from app.config import settings
from app.core.tenant_context import TenantContextGuard
from app.dependencies import DB, StepUpAuth
from app.modules.audit.models.audit_domain_tables import DataExport
from app.modules.audit.models.audit_log import AuditLog
from app.modules.audit.services.audit_service import AuditContext, AuditService
from app.modules.billing.models.credit_notes import CreditNote
from app.modules.billing.models.billing_domain_tables import Invoice, InvoiceItem
from app.modules.billing.models.financial_audit_trail import FinancialAuditTrail
from app.modules.billing.models.event_activation import EventActivation
from app.modules.billing.models.licensing import EntitlementGrant, GrantConsumption
from app.modules.billing.models.provider_webhook_event import ProviderWebhookEvent
from app.modules.billing.models.subscription import (
    OrganizationSubscription,
    RevenueMetric,
    SubscriptionTransaction,
    SubscriptionPlan,
)
from app.modules.billing.schemas.billing_admin import (
    CreditNoteAdminResponse,
    EntitlementGrantAdminResponse,
    FinancialAuditAdminResponse,
    OrganizationSubscriptionAdminResponse,
    RevenueMetricAdminResponse,
    SubscriptionPlanAdminResponse,
    CreditNoteIssueRequest,
    CreditNoteStatusUpdate,
    ActivationInspectionAdminResponse,
    EventActivationAdminResponse,
    GrantConsumptionAdminResponse,
    GrantCapacityUpdate,
    GrantIssueRequest,
    GrantStatusUpdate,
    SubscriptionStatusUpdate,
    SnapshotRefreshRequest,
    ActivationDeactivateRequest,
    ActivationTransferRequest,
    CommercialPaymentAdminResponse,
    CommercialPaymentRecordRequest,
    CommercialPaymentReconcileRequest,
    CommercialPaymentRefundRequest,
    InvoiceAdminResponse,
    InvoiceArtifactDownload,
    InvoiceArtifactRequest,
    InvoiceArtifactResponse,
    InvoiceDetailAdminResponse,
    InvoiceStatusUpdate,
    ProviderWebhookAdminResponse,
)
from app.modules.billing.services.activation_admin_service import BillingActivationAdminService
from app.modules.billing.services.admin_lifecycle_service import BillingAdminLifecycleService
from app.modules.billing.services.financial_admin_service import FinancialAdminService
from app.modules.commercial.quote_service import request_fingerprint
from app.modules.platform.models.organization import Organization
from app.modules.platform.support_access import (
    PlatformSupportScopeDependency,
    execute_platform_support_cursor_read,
)
from app.schemas.cursor_pagination import CursorPage
from app.modules.presentations.services.upload_service import create_presigned_download
from app.worker import celery_app


router = APIRouter(prefix="/billing-admin", tags=["billing-superadmin"])
IdempotencyKey = Header(..., alias="Idempotency-Key", min_length=8, max_length=128)


@router.get("/provider-webhooks", response_model=CursorPage[ProviderWebhookAdminResponse])
async def list_provider_webhooks(
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    cursor: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    receipt_status: str | None = Query(None, alias="status"),
    provider: str | None = Query(None),
):
    statement = select(ProviderWebhookEvent).where(
        ProviderWebhookEvent.organization_id == support_scope.organization_id
    )
    if receipt_status:
        statement = statement.where(ProviderWebhookEvent.status == receipt_status.upper())
    if provider:
        statement = statement.where(ProviderWebhookEvent.provider == provider.upper())
    return await execute_platform_support_cursor_read(
        db,
        support_scope,
        statement,
        timestamp_column=ProviderWebhookEvent.received_at,
        id_column=ProviderWebhookEvent.id,
        cursor=cursor,
        limit=limit,
        resource_type="billing_provider_webhooks",
    )


def _invoice_artifact_out(export: DataExport) -> InvoiceArtifactResponse:
    return InvoiceArtifactResponse(
        export_id=export.id,
        invoice_id=export.source_id,
        invoice_version=export.source_version,
        status=export.status,
        created_at=export.created_at,
        completed_at=export.completed_at,
        expires_at=export.expires_at,
        failure_reason=export.failure_reason,
    )


@router.get("/plans", response_model=List[SubscriptionPlanAdminResponse])
async def list_subscription_plans(db: DB):
    """Return the global subscription-plan catalogue."""
    return (await db.execute(select(SubscriptionPlan))).scalars().all()


@router.get(
    "/subscriptions",
    response_model=CursorPage[OrganizationSubscriptionAdminResponse],
)
async def list_org_subscriptions(
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    status: str | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    statement = select(OrganizationSubscription).where(
        OrganizationSubscription.organization_id == support_scope.organization_id
    )
    if status:
        statement = statement.where(OrganizationSubscription.status == status.upper())
    return await execute_platform_support_cursor_read(
        db,
        support_scope,
        statement,
        timestamp_column=OrganizationSubscription.created_at,
        id_column=OrganizationSubscription.id,
        cursor=cursor,
        limit=limit,
        resource_type="billing_subscriptions",
    )


@router.get(
    "/entitlements",
)
async def list_entitlement_grants(
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    status: str | None = Query(None),
    grant_type: str | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    statement = select(EntitlementGrant).where(
        EntitlementGrant.organization_id == support_scope.organization_id
    )
    if status:
        statement = statement.where(EntitlementGrant.status == status.upper())
    if grant_type:
        statement = statement.where(EntitlementGrant.grant_type == grant_type.upper())
    page = await execute_platform_support_cursor_read(
        db,
        support_scope,
        statement,
        timestamp_column=EntitlementGrant.created_at,
        id_column=EntitlementGrant.id,
        cursor=cursor,
        limit=limit,
        resource_type="billing_entitlement_grants",
    )
    # This compatibility route predates the shared ``has_more`` envelope.
    # Keep its established ``has_next`` shape until its consumers migrate.
    return {
        "items": [EntitlementGrantAdminResponse.model_validate(item) for item in page.items],
        "next_cursor": page.next_cursor,
        "has_next": page.has_next,
    }


@router.get(
    "/activations",
    response_model=CursorPage[EventActivationAdminResponse],
)
async def list_event_activations(
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    status: str | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    statement = select(EventActivation).where(
        EventActivation.organization_id == support_scope.organization_id
    )
    if status:
        statement = statement.where(EventActivation.status == status.upper())
    return await execute_platform_support_cursor_read(
        db,
        support_scope,
        statement,
        timestamp_column=EventActivation.created_at,
        id_column=EventActivation.id,
        cursor=cursor,
        limit=limit,
        resource_type="billing_event_activations",
    )


@router.get(
    "/activations/{activation_id}",
    response_model=ActivationInspectionAdminResponse,
)
async def inspect_event_activation(
    activation_id: uuid.UUID,
    db: DB,
    support_scope: PlatformSupportScopeDependency,
):
    return await BillingActivationAdminService.inspect(db, support_scope, activation_id)


@router.get(
    "/entitlements/{grant_id}/consumptions",
    response_model=CursorPage[GrantConsumptionAdminResponse],
)
async def list_entitlement_grant_consumptions(
    grant_id: uuid.UUID,
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    status: str | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    statement = select(GrantConsumption).where(
        GrantConsumption.grant_id == grant_id,
        GrantConsumption.organization_id == support_scope.organization_id,
    )
    if status:
        statement = statement.where(GrantConsumption.status == status.upper())
    return await execute_platform_support_cursor_read(
        db,
        support_scope,
        statement,
        timestamp_column=GrantConsumption.created_at,
        id_column=GrantConsumption.id,
        cursor=cursor,
        limit=limit,
        resource_type="billing_grant_consumptions",
    )


@router.get("/credit-notes", response_model=CursorPage[CreditNoteAdminResponse])
async def list_credit_notes(
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    status: str | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    statement = select(CreditNote).where(
        CreditNote.organization_id == support_scope.organization_id
    )
    if status:
        statement = statement.where(CreditNote.status == status.upper())
    return await execute_platform_support_cursor_read(
        db,
        support_scope,
        statement,
        timestamp_column=CreditNote.created_at,
        id_column=CreditNote.id,
        cursor=cursor,
        limit=limit,
        resource_type="billing_credit_notes",
    )


@router.get("/invoices", response_model=CursorPage[InvoiceAdminResponse])
async def list_invoices(
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    status: str | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    statement = select(Invoice).where(Invoice.organization_id == support_scope.organization_id)
    if status:
        statement = statement.where(Invoice.status == status.upper())
    return await execute_platform_support_cursor_read(
        db,
        support_scope,
        statement,
        timestamp_column=Invoice.created_at,
        id_column=Invoice.id,
        cursor=cursor,
        limit=limit,
        resource_type="billing_invoices",
    )


@router.get("/invoices/{invoice_id}", response_model=InvoiceDetailAdminResponse)
async def inspect_invoice(
    invoice_id: uuid.UUID,
    db: DB,
    support_scope: PlatformSupportScopeDependency,
):
    return await FinancialAdminService.inspect_invoice(db, support_scope, invoice_id)


@router.post(
    "/invoices/{invoice_id}/artifacts",
    response_model=InvoiceArtifactResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def create_invoice_artifact(
    invoice_id: uuid.UUID,
    payload: InvoiceArtifactRequest,
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    step_up: StepUpAuth,
    idempotency_key: str = IdempotencyKey,
) -> InvoiceArtifactResponse:
    del step_up
    fingerprint = request_fingerprint({
        "invoice_id": str(invoice_id),
        **payload.model_dump(mode="json"),
    })
    async with TenantContextGuard.scoped(db, support_scope.organization_id):
        invoice = await db.scalar(select(Invoice).where(
            Invoice.id == invoice_id,
            Invoice.organization_id == support_scope.organization_id,
        ).with_for_update())
        if invoice is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found.")
        if invoice.version != payload.version:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "VERSION_CONFLICT", "current_version": invoice.version},
            )

        existing = await db.scalar(select(DataExport).where(
            DataExport.organization_id == support_scope.organization_id,
            DataExport.export_type == "invoice_pdf",
            DataExport.idempotency_key == idempotency_key,
        ))
        if existing:
            if existing.request_hash != fingerprint:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "IDEMPOTENCY_CONFLICT"})
            return _invoice_artifact_out(existing)

        organization = await db.scalar(select(Organization).where(Organization.id == support_scope.organization_id))
        items = list((await db.scalars(
            select(InvoiceItem).where(InvoiceItem.invoice_id == invoice.id).order_by(InvoiceItem.id)
        )).all())
        snapshot = {
            "organization_name": organization.name if organization else "Organization",
            "invoice_number": invoice.invoice_number or f"INV-{str(invoice.id)[:8].upper()}",
            "currency": invoice.currency,
            "status": invoice.status,
            "issued_at": invoice.issued_at.isoformat() if invoice.issued_at else None,
            "due_date": invoice.due_date.isoformat() if invoice.due_date else None,
            "amount": str(invoice.amount),
            "gst_amount": str(invoice.gst_amount),
            "total_amount": str(invoice.total_amount_inr or (invoice.amount + invoice.gst_amount)),
            "items": [
                {"description": item.description, "quantity": item.quantity, "amount": str(item.amount)}
                for item in items
            ],
        }
        export = DataExport(
            organization_id=support_scope.organization_id,
            event_id=invoice.event_id,
            requested_by=support_scope.actor.id,
            status="QUEUED",
            export_type="invoice_pdf",
            file_format="pdf",
            source_type="invoice_pdf",
            source_id=invoice.id,
            source_version=invoice.version,
            idempotency_key=idempotency_key,
            request_hash=fingerprint,
            request_metadata={"reason": payload.reason, "snapshot": snapshot},
        )
        db.add(export)
        await db.flush()
        db.add(AuditLog(
            organization_id=support_scope.organization_id,
            actor_user_id=support_scope.actor.id,
            resource_type="invoice_artifact",
            resource_id=export.id,
            action_type="INVOICE_ARTIFACT_REQUESTED",
            actor_role=support_scope.actor.platform_role or support_scope.actor.role,
            new_state={"invoice_id": str(invoice.id), "invoice_version": invoice.version, "status": "QUEUED"},
            change_diff={"reason": payload.reason},
            is_sensitive=True,
        ))
        await db.commit()

        try:
            celery_app.send_task(
                "workers.tasks.report_tasks.generate_invoice_pdf",
                kwargs={
                    "organization_id": str(support_scope.organization_id),
                    "invoice_id": str(invoice.id),
                    "requested_by_user_id": str(support_scope.actor.id),
                    "export_id": str(export.id),
                },
            )
        except Exception as exc:
            export.status = "FAILED"
            export.failure_reason = "Invoice artifact worker dispatch failed."
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"code": "ARTIFACT_DISPATCH_FAILED", "export_id": str(export.id)},
            ) from exc
        return _invoice_artifact_out(export)


@router.get("/invoices/{invoice_id}/artifacts/{export_id}", response_model=InvoiceArtifactResponse)
async def get_invoice_artifact(
    invoice_id: uuid.UUID,
    export_id: uuid.UUID,
    db: DB,
    support_scope: PlatformSupportScopeDependency,
) -> InvoiceArtifactResponse:
    async with TenantContextGuard.scoped(db, support_scope.organization_id):
        export = await db.scalar(select(DataExport).where(
            DataExport.id == export_id,
            DataExport.organization_id == support_scope.organization_id,
            DataExport.source_type == "invoice_pdf",
            DataExport.source_id == invoice_id,
        ))
        if export is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice artifact not found.")
        return _invoice_artifact_out(export)


@router.get("/invoices/{invoice_id}/artifacts/{export_id}/download", response_model=InvoiceArtifactDownload)
async def download_invoice_artifact(
    invoice_id: uuid.UUID,
    export_id: uuid.UUID,
    db: DB,
    support_scope: PlatformSupportScopeDependency,
) -> InvoiceArtifactDownload:
    async with TenantContextGuard.scoped(db, support_scope.organization_id):
        export = await db.scalar(select(DataExport).where(
            DataExport.id == export_id,
            DataExport.organization_id == support_scope.organization_id,
            DataExport.source_type == "invoice_pdf",
            DataExport.source_id == invoice_id,
        ))
        if export is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice artifact not found.")
        if export.status != "COMPLETED" or not export.storage_key:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "ARTIFACT_NOT_READY", "status": export.status})
        now = datetime.now(timezone.utc)
        if export.expires_at and export.expires_at <= now:
            raise HTTPException(status_code=status.HTTP_410_GONE, detail={"code": "ARTIFACT_EXPIRED"})
        filename = f"invoice-{invoice_id}.pdf"
        expires_in = min(settings.S3_PRESIGNED_EXPIRY_SECONDS, 300)
        download_url = await asyncio.to_thread(create_presigned_download,
            bucket=settings.S3_BUCKET_EXPORTS,
            storage_path=export.storage_key,
            filename=filename,
            expiry_seconds=expires_in,
        )
        await AuditService.write_log(AuditContext(
            organization_id=support_scope.organization_id,
            actor_user_id=support_scope.actor.id,
            resource_type="invoice_artifact",
            resource_id=export.id,
            action_type="INVOICE_ARTIFACT_DOWNLOADED",
            actor_role=support_scope.actor.platform_role or support_scope.actor.role,
            new_state={"invoice_id": str(invoice_id), "downloaded_at": now.isoformat()},
            is_sensitive=True,
        ))
        return InvoiceArtifactDownload(download_url=download_url, filename=filename, expires_in=expires_in)


@router.get("/payments", response_model=CursorPage[CommercialPaymentAdminResponse])
async def list_commercial_payments(
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    status: str | None = Query(None),
    reconciliation_status: str | None = Query(None),
    provider: str | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    statement = select(SubscriptionTransaction).where(
        SubscriptionTransaction.organization_id == support_scope.organization_id
    )
    if status:
        statement = statement.where(SubscriptionTransaction.status == status.upper())
    if reconciliation_status:
        statement = statement.where(
            SubscriptionTransaction.reconciliation_status == reconciliation_status.upper()
        )
    if provider:
        statement = statement.where(SubscriptionTransaction.provider == provider.upper())
    return await execute_platform_support_cursor_read(
        db,
        support_scope,
        statement,
        timestamp_column=SubscriptionTransaction.created_at,
        id_column=SubscriptionTransaction.id,
        cursor=cursor,
        limit=limit,
        resource_type="billing_commercial_payments",
    )


@router.get(
    "/financial-audit-trail",
    response_model=CursorPage[FinancialAuditAdminResponse],
)
async def list_financial_audit_trail(
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    activity_type: str | None = Query(None),
    entity_type: str | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    statement = select(FinancialAuditTrail).where(
        FinancialAuditTrail.organization_id == support_scope.organization_id
    )
    if activity_type:
        statement = statement.where(FinancialAuditTrail.activity_type == activity_type.upper())
    if entity_type:
        statement = statement.where(FinancialAuditTrail.entity_type == entity_type.upper())
    return await execute_platform_support_cursor_read(
        db,
        support_scope,
        statement,
        timestamp_column=FinancialAuditTrail.occurred_at,
        id_column=FinancialAuditTrail.id,
        cursor=cursor,
        limit=limit,
        resource_type="billing_financial_audit",
    )


@router.get("/revenue-metrics", response_model=CursorPage[RevenueMetricAdminResponse])
async def list_revenue_metrics(
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    cursor: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    statement = select(RevenueMetric).where(
        RevenueMetric.organization_id == support_scope.organization_id
    )
    return await execute_platform_support_cursor_read(
        db,
        support_scope,
        statement,
        timestamp_column=RevenueMetric.created_at,
        id_column=RevenueMetric.id,
        cursor=cursor,
        limit=limit,
        resource_type="billing_revenue_metrics",
    )


@router.post("/subscriptions/{subscription_id}/status", response_model=OrganizationSubscriptionAdminResponse)
async def update_subscription_status(
    subscription_id: uuid.UUID,
    payload: SubscriptionStatusUpdate,
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    step_up: StepUpAuth,
    idempotency_key: str = IdempotencyKey,
):
    del step_up
    return await BillingAdminLifecycleService.update_subscription_status(
        db, support_scope, subscription_id, payload, idempotency_key
    )


@router.post("/entitlements", response_model=EntitlementGrantAdminResponse, status_code=201)
async def issue_entitlement_grant(
    payload: GrantIssueRequest,
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    step_up: StepUpAuth,
    idempotency_key: str = IdempotencyKey,
):
    del step_up
    return await BillingAdminLifecycleService.issue_grant(
        db, support_scope, payload, idempotency_key
    )


@router.patch("/entitlements/{grant_id}/capacity", response_model=EntitlementGrantAdminResponse)
async def update_entitlement_grant_capacity(
    grant_id: uuid.UUID,
    payload: GrantCapacityUpdate,
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    step_up: StepUpAuth,
    idempotency_key: str = IdempotencyKey,
):
    del step_up
    return await BillingAdminLifecycleService.update_grant_capacity(
        db, support_scope, grant_id, payload, idempotency_key
    )


@router.post("/entitlements/{grant_id}/status", response_model=EntitlementGrantAdminResponse)
async def update_entitlement_grant_status(
    grant_id: uuid.UUID,
    payload: GrantStatusUpdate,
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    step_up: StepUpAuth,
    idempotency_key: str = IdempotencyKey,
):
    del step_up
    return await BillingAdminLifecycleService.update_grant_status(
        db, support_scope, grant_id, payload, idempotency_key
    )


@router.post("/credit-notes", response_model=CreditNoteAdminResponse, status_code=201)
async def issue_credit_note(
    payload: CreditNoteIssueRequest,
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    step_up: StepUpAuth,
    idempotency_key: str = IdempotencyKey,
):
    del step_up
    return await BillingAdminLifecycleService.issue_credit_note(
        db, support_scope, payload, idempotency_key
    )


@router.post("/credit-notes/{credit_note_id}/status", response_model=CreditNoteAdminResponse)
async def update_credit_note_status(
    credit_note_id: uuid.UUID,
    payload: CreditNoteStatusUpdate,
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    step_up: StepUpAuth,
    idempotency_key: str = IdempotencyKey,
):
    del step_up
    return await BillingAdminLifecycleService.update_credit_note_status(
        db, support_scope, credit_note_id, payload, idempotency_key
    )


@router.post(
    "/invoices/{invoice_id}/payments",
    response_model=CommercialPaymentAdminResponse,
    status_code=201,
)
async def record_invoice_payment(
    invoice_id: uuid.UUID,
    payload: CommercialPaymentRecordRequest,
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    step_up: StepUpAuth,
    idempotency_key: str = IdempotencyKey,
):
    del step_up
    return await FinancialAdminService.record_payment(
        db, support_scope, invoice_id, payload, idempotency_key
    )


@router.post(
    "/payments/{payment_id}/reconcile",
    response_model=CommercialPaymentAdminResponse,
)
async def reconcile_invoice_payment(
    payment_id: uuid.UUID,
    payload: CommercialPaymentReconcileRequest,
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    step_up: StepUpAuth,
    idempotency_key: str = IdempotencyKey,
):
    del step_up
    return await FinancialAdminService.reconcile_payment(
        db, support_scope, payment_id, payload, idempotency_key
    )


@router.post("/payments/{payment_id}/refund", response_model=CommercialPaymentAdminResponse, status_code=201)
async def refund_invoice_payment(
    payment_id: uuid.UUID,
    payload: CommercialPaymentRefundRequest,
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    step_up: StepUpAuth,
    idempotency_key: str = IdempotencyKey,
):
    del step_up
    return await FinancialAdminService.refund_payment(db, support_scope, payment_id, payload, idempotency_key)


@router.post("/invoices/{invoice_id}/status", response_model=InvoiceAdminResponse)
async def update_invoice_status(
    invoice_id: uuid.UUID,
    payload: InvoiceStatusUpdate,
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    step_up: StepUpAuth,
    idempotency_key: str = IdempotencyKey,
):
    del step_up
    return await FinancialAdminService.update_invoice_status(
        db, support_scope, invoice_id, payload, idempotency_key
    )


@router.post(
    "/activations/{activation_id}/refresh-snapshot",
    response_model=ActivationInspectionAdminResponse,
)
async def refresh_event_activation_snapshot(
    activation_id: uuid.UUID,
    payload: SnapshotRefreshRequest,
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    step_up: StepUpAuth,
    idempotency_key: str = IdempotencyKey,
):
    del step_up
    return await BillingActivationAdminService.refresh(
        db,
        support_scope,
        activation_id,
        idempotency_key=idempotency_key,
        resolution_reason=payload.resolution_reason,
        reason=payload.reason,
    )


@router.post(
    "/activations/{activation_id}/deactivate",
    response_model=EventActivationAdminResponse,
)
async def deactivate_event_activation(
    activation_id: uuid.UUID,
    payload: ActivationDeactivateRequest,
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    step_up: StepUpAuth,
    idempotency_key: str = IdempotencyKey,
):
    del step_up
    return await BillingActivationAdminService.deactivate(
        db,
        support_scope,
        activation_id,
        idempotency_key=idempotency_key,
        reason=payload.reason,
    )


@router.post("/activations/{activation_id}/transfer")
async def transfer_event_activation(
    activation_id: uuid.UUID,
    payload: ActivationTransferRequest,
    db: DB,
    support_scope: PlatformSupportScopeDependency,
    step_up: StepUpAuth,
    idempotency_key: str = IdempotencyKey,
):
    del step_up
    return await BillingActivationAdminService.transfer(
        db,
        support_scope,
        activation_id,
        target_event_id=payload.target_event_id,
        idempotency_key=idempotency_key,
        reason=payload.reason,
    )
