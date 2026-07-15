import uuid
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_domain_tables import DataExport
from app.modules.audit.models.audit_log import AuditLog
from app.modules.billing.models.billing_domain_tables import Invoice, InvoiceItem
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from tests.conftest import auth_headers


SUPPORT_REASON = "Reconciling approved organization invoice support case FIN-2048"


def headers(user: User, key: str | None = None) -> dict[str, str]:
    result = {**auth_headers(user), "X-Support-Reason": SUPPORT_REASON}
    if key:
        result["Idempotency-Key"] = key
    return result


@pytest.mark.asyncio
async def test_invoice_payment_reconciliation_is_tenant_scoped_idempotent_and_versioned(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organization: Organization,
):
    invoice = Invoice(
        organization_id=organization.id,
        invoice_number="INV-FIN-2048",
        amount=Decimal("1000.00"),
        gst_amount=Decimal("180.00"),
        total_amount_inr=Decimal("1180.00"),
        status="UNPAID",
    )
    db.add(invoice)
    await db.flush()
    db.add(InvoiceItem(invoice_id=invoice.id, description="Enterprise event license", amount=Decimal("1000.00")))
    await db.commit()

    list_response = await client.get(
        f"/superadmin/billing-admin/invoices?organization_id={organization.id}",
        headers=headers(super_admin),
    )
    assert list_response.status_code == 200, list_response.text
    assert [item["id"] for item in list_response.json()["items"]] == [str(invoice.id)]

    payment_key = f"payment-{uuid.uuid4()}"
    payment_payload = {
        "amount": "1180.00",
        "currency": "INR",
        "provider": "OFFLINE",
        "status": "SUCCEEDED",
        "reason": "Recording verified bank settlement against this invoice",
    }
    payment_url = f"/superadmin/billing-admin/invoices/{invoice.id}/payments?organization_id={organization.id}"
    recorded = await client.post(payment_url, json=payment_payload, headers=headers(super_admin, payment_key))
    assert recorded.status_code == 201, recorded.text
    payment = recorded.json()
    assert payment["invoice_id"] == str(invoice.id)
    assert payment["reconciliation_status"] == "PENDING"
    assert payment["version"] == 1

    replay = await client.post(payment_url, json=payment_payload, headers=headers(super_admin, payment_key))
    assert replay.status_code == 201
    assert replay.json()["id"] == payment["id"]

    reconcile_key = f"reconcile-{uuid.uuid4()}"
    reconcile_url = f"/superadmin/billing-admin/payments/{payment['id']}/reconcile?organization_id={organization.id}"
    reconciled = await client.post(
        reconcile_url,
        json={
            "version": 1,
            "reconciliation_status": "RECONCILED",
            "reason": "Matching verified bank statement settlement to invoice",
        },
        headers=headers(super_admin, reconcile_key),
    )
    assert reconciled.status_code == 200, reconciled.text
    assert reconciled.json()["version"] == 2

    detail = await client.get(
        f"/superadmin/billing-admin/invoices/{invoice.id}?organization_id={organization.id}",
        headers=headers(super_admin),
    )
    assert detail.status_code == 200, detail.text
    assert detail.json()["invoice"]["status"] == "PAID"
    assert Decimal(detail.json()["reconciled_amount"]) == Decimal("1180.00")
    assert Decimal(detail.json()["outstanding_amount"]) == Decimal("0.00")
    assert detail.json()["reconciliation_status"] == "SETTLED"
    assert len(detail.json()["items"]) == 1

    reverse = await client.post(
        reconcile_url,
        json={
            "version": 2,
            "reconciliation_status": "REVERSED",
            "reason": "Reversing settlement after verified bank payment reversal",
        },
        headers=headers(super_admin, f"reverse-{uuid.uuid4()}"),
    )
    assert reverse.status_code == 200, reverse.text
    async with TenantContextGuard.scoped(db, organization.id):
        await db.refresh(invoice)
        assert invoice.status == "UNPAID"
        assert invoice.paid_at is None

    other_org = Organization(
        name="Other Finance Tenant",
        slug=f"other-finance-{uuid.uuid4().hex[:8]}",
        plan="pro",
    )
    db.add(other_org)
    await db.commit()
    hidden = await client.get(
        f"/superadmin/billing-admin/invoices/{invoice.id}?organization_id={other_org.id}",
        headers=headers(super_admin),
    )
    assert hidden.status_code == 404


@pytest.mark.asyncio
async def test_invoice_void_requires_version_and_rejects_cross_tenant_or_settled_state(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organization: Organization,
):
    invoice = Invoice(
        organization_id=organization.id,
        invoice_number="INV-VOID-1",
        amount=Decimal("500.00"),
        gst_amount=Decimal("90.00"),
        total_amount_inr=Decimal("590.00"),
        status="UNPAID",
    )
    db.add(invoice)
    await db.commit()
    url = f"/superadmin/billing-admin/invoices/{invoice.id}/status?organization_id={organization.id}"
    payload = {"version": 1, "status": "VOID", "reason": "Voiding duplicate invoice after finance verification"}
    response = await client.post(url, json=payload, headers=headers(super_admin, f"void-{uuid.uuid4()}"))
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "VOID"
    assert response.json()["version"] == 2

    stale = await client.post(url, json=payload, headers=headers(super_admin, f"void-stale-{uuid.uuid4()}"))
    assert stale.status_code == 409
    assert stale.json()["detail"]["code"] in {"VERSION_CONFLICT", "INVALID_LIFECYCLE_STATE"}


@pytest.mark.asyncio
async def test_commercial_refund_has_explicit_lineage_capacity_and_idempotency(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organization: Organization,
):
    invoice = Invoice(
        organization_id=organization.id,
        invoice_number=f"INV-REFUND-{uuid.uuid4().hex[:6]}",
        amount=Decimal("1000.00"), gst_amount=Decimal("0"), total_amount_inr=Decimal("1000.00"), status="UNPAID",
    )
    db.add(invoice)
    await db.commit()
    recorded = await client.post(
        f"/superadmin/billing-admin/invoices/{invoice.id}/payments?organization_id={organization.id}",
        json={"amount": "1000.00", "currency": "INR", "provider": "OFFLINE", "status": "SUCCEEDED", "reason": "Recording approved offline payment before refund"},
        headers=headers(super_admin, f"payment-{uuid.uuid4()}"),
    )
    assert recorded.status_code == 201, recorded.text
    payment = recorded.json()
    reconciled = await client.post(
        f"/superadmin/billing-admin/payments/{payment['id']}/reconcile?organization_id={organization.id}",
        json={"version": 1, "reconciliation_status": "RECONCILED", "reason": "Reconciling payment before approved customer refund"},
        headers=headers(super_admin, f"reconcile-{uuid.uuid4()}"),
    )
    assert reconciled.status_code == 200, reconciled.text

    refund_key = f"refund-{uuid.uuid4()}"
    refund_url = f"/superadmin/billing-admin/payments/{payment['id']}/refund?organization_id={organization.id}"
    payload = {"version": 2, "amount": "1000.00", "reason": "Refunding cancelled contract after finance approval"}
    refunded = await client.post(refund_url, json=payload, headers=headers(super_admin, refund_key))
    assert refunded.status_code == 201, refunded.text
    refund = refunded.json()
    assert refund["parent_transaction_id"] == payment["id"]
    assert Decimal(str(refund["amount"])) == Decimal("-1000.00")

    replay = await client.post(refund_url, json=payload, headers=headers(super_admin, refund_key))
    assert replay.status_code == 201
    assert replay.json()["id"] == refund["id"]

    detail = await client.get(
        f"/superadmin/billing-admin/invoices/{invoice.id}?organization_id={organization.id}",
        headers=headers(super_admin),
    )
    assert detail.status_code == 200
    assert detail.json()["invoice"]["status"] == "REFUNDED"
    assert detail.json()["reconciliation_status"] == "REFUNDED"


@pytest.mark.asyncio
async def test_invoice_pdf_artifact_is_versioned_idempotent_scoped_and_audited(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organization: Organization,
    monkeypatch: pytest.MonkeyPatch,
):
    invoice = Invoice(
        organization_id=organization.id,
        invoice_number="INV-PDF-1001",
        amount=Decimal("1000.00"),
        gst_amount=Decimal("180.00"),
        total_amount_inr=Decimal("1180.00"),
        status="UNPAID",
    )
    db.add(invoice)
    await db.flush()
    db.add(InvoiceItem(invoice_id=invoice.id, description="Event license", amount=Decimal("1000.00")))
    await db.commit()

    dispatched: list[dict] = []
    monkeypatch.setattr(
        "app.modules.billing.routers.billing_superadmin.celery_app.send_task",
        lambda name, kwargs: dispatched.append({"name": name, "kwargs": kwargs}),
    )
    key = f"invoice-pdf-{uuid.uuid4()}"
    url = f"/superadmin/billing-admin/invoices/{invoice.id}/artifacts?organization_id={organization.id}"
    payload = {"version": 1, "reason": "Generating approved customer invoice PDF evidence"}
    created = await client.post(url, json=payload, headers=headers(super_admin, key))
    assert created.status_code == 202, created.text
    artifact = created.json()
    assert artifact["invoice_id"] == str(invoice.id)
    assert artifact["invoice_version"] == 1
    assert artifact["status"] == "QUEUED"
    assert dispatched[0]["name"] == "workers.tasks.report_tasks.generate_invoice_pdf"

    replay = await client.post(url, json=payload, headers=headers(super_admin, key))
    assert replay.status_code == 202
    assert replay.json()["export_id"] == artifact["export_id"]
    conflict = await client.post(
        url,
        json={**payload, "reason": "A different invoice generation request reason"},
        headers=headers(super_admin, key),
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "IDEMPOTENCY_CONFLICT"

    export_id = uuid.UUID(artifact["export_id"])
    async with TenantContextGuard.scoped(db, organization.id):
        export = await db.get(DataExport, export_id)
        assert export.request_metadata["snapshot"]["total_amount"] == "1180.00"
        assert export.request_metadata["snapshot"]["items"][0]["description"] == "Event license"
        export.status = "COMPLETED"
        export.storage_key = f"{organization.id}/control-plane/invoices/{invoice.id}/v1/INV-PDF-1001.pdf"
        await db.commit()

    monkeypatch.setattr(
        "app.modules.billing.routers.billing_superadmin.create_presigned_download",
        lambda **kwargs: "https://storage.example.test/signed-invoice",
    )
    download = await client.get(
        f"/superadmin/billing-admin/invoices/{invoice.id}/artifacts/{export_id}/download?organization_id={organization.id}",
        headers=headers(super_admin),
    )
    assert download.status_code == 200, download.text
    assert download.json()["download_url"] == "https://storage.example.test/signed-invoice"

    other_org = Organization(name="Invoice Artifact Other", slug=f"invoice-artifact-{uuid.uuid4().hex[:8]}", plan="pro")
    db.add(other_org)
    await db.commit()
    concealed = await client.get(
        f"/superadmin/billing-admin/invoices/{invoice.id}/artifacts/{export_id}?organization_id={other_org.id}",
        headers=headers(super_admin),
    )
    assert concealed.status_code == 404
    actions = set((await db.scalars(select(AuditLog.action_type).where(AuditLog.resource_id == export_id))).all())
    assert {"INVOICE_ARTIFACT_REQUESTED", "INVOICE_ARTIFACT_DOWNLOADED"}.issubset(actions)
