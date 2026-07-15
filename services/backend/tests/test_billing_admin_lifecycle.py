import uuid
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_log import AuditLog
from app.modules.billing.models.billing_domain_tables import Invoice
from app.modules.billing.models.event_activation import EventActivation
from app.modules.billing.models.financial_audit_trail import FinancialAuditTrail
from app.modules.billing.models.licensing import BillingOperationRequest, EntitlementGrant, GrantConsumption
from app.modules.billing.models.subscription import OrganizationSubscription, SubscriptionPlan
from app.modules.billing.services.activation_service import ActivationService
from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from tests.conftest import auth_headers


SUPPORT_REASON = "Resolving approved commercial support case BILL-2048"


@pytest.mark.asyncio
async def test_activation_admin_deactivation_is_scoped_idempotent_and_audited(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organization: Organization,
    event: Event,
):
    plan = SubscriptionPlan(name=f"Deactivate Plan {uuid.uuid4().hex[:8]}", max_events=1)
    db.add(plan)
    await db.flush()
    subscription = OrganizationSubscription(organization_id=organization.id, plan_id=plan.id, status="ACTIVE")
    db.add(subscription)
    await db.flush()
    activation = await ActivationService.activate_event(
        db,
        organization_id=organization.id,
        event_id=event.id,
        subscription_id=subscription.id,
        grant_id=None,
        activation_policy="SNAPSHOT_LOCKED",
        idempotency_key=f"activate-for-deactivation-{uuid.uuid4()}",
        actor_id=super_admin.id,
    )
    await db.commit()
    key = f"deactivate-{uuid.uuid4()}"
    url = f"/superadmin/billing-admin/activations/{activation.id}/deactivate?organization_id={organization.id}"
    payload = {"reason": "Deactivating unused event after customer correction"}

    response = await client.post(url, json=payload, headers=mutation_headers(super_admin, key))
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "DEACTIVATED"
    assert response.json()["deactivation_reason"] == payload["reason"]

    replay = await client.post(url, json=payload, headers=mutation_headers(super_admin, key))
    assert replay.status_code == 200, replay.text
    assert replay.json()["id"] == str(activation.id)
    audit = await db.scalar(select(AuditLog).where(
        AuditLog.resource_id == activation.id,
        AuditLog.action_type == "BILLING_EVENT_DEACTIVATED",
    ))
    assert audit is not None
    assert audit.new_state["business_reason"] == payload["reason"]


def mutation_headers(user: User, key: str) -> dict[str, str]:
    return {
        **auth_headers(user),
        "X-Support-Reason": SUPPORT_REASON,
        "Idempotency-Key": key,
    }


@pytest.mark.asyncio
async def test_subscription_status_is_versioned_idempotent_and_preserves_activation_continuity(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organization: Organization,
    event: Event,
):
    plan = SubscriptionPlan(name=f"Continuity Plan {uuid.uuid4().hex[:8]}", max_events=1)
    db.add(plan)
    await db.flush()
    subscription = OrganizationSubscription(
        organization_id=organization.id,
        plan_id=plan.id,
        status="ACTIVE",
    )
    db.add(subscription)
    await db.flush()
    activation = await ActivationService.activate_event(
        db,
        organization_id=organization.id,
        event_id=event.id,
        subscription_id=subscription.id,
        grant_id=None,
        activation_policy="SNAPSHOT_LOCKED",
        idempotency_key=f"activate-{uuid.uuid4()}",
        actor_id=super_admin.id,
    )
    await db.commit()
    key = f"suspend-{uuid.uuid4()}"
    payload = {
        "version": 1,
        "status": "SUSPENDED",
        "reason": "Suspending commercial growth while preserving live continuity",
    }
    url = f"/superadmin/billing-admin/subscriptions/{subscription.id}/status?organization_id={organization.id}"

    response = await client.post(url, json=payload, headers=mutation_headers(super_admin, key))
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "SUSPENDED"
    assert response.json()["version"] == 2

    replay = await client.post(url, json=payload, headers=mutation_headers(super_admin, key))
    assert replay.status_code == 200
    assert replay.json()["id"] == str(subscription.id)

    conflict = await client.post(
        url,
        json={**payload, "status": "CANCELLED"},
        headers=mutation_headers(super_admin, key),
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "IDEMPOTENCY_CONFLICT"

    async with TenantContextGuard.scoped(db, organization.id):
        await db.refresh(activation)
        grant = await db.get(EntitlementGrant, activation.grant_id)
        assert activation.status == "SUSPENDED"
        assert activation.current_snapshot_set_id is not None
        assert grant is not None and grant.status == "SUSPENDED"
        financial = await db.scalar(select(FinancialAuditTrail).where(
            FinancialAuditTrail.organization_id == organization.id,
            FinancialAuditTrail.entity_id == subscription.id,
            FinancialAuditTrail.activity_type == "SUBSCRIPTION_STATUS_CHANGED",
        ))
        assert financial is not None
        assert financial.details["reason"] == payload["reason"]

    grant_activate = await client.post(
        f"/superadmin/billing-admin/entitlements/{activation.grant_id}/status?organization_id={organization.id}",
        json={
            "version": 2,
            "status": "ACTIVE",
            "reason": "Testing parent subscription state enforcement",
        },
        headers=mutation_headers(super_admin, f"grant-reactivate-{uuid.uuid4()}"),
    )
    assert grant_activate.status_code == 409
    assert grant_activate.json()["detail"]["code"] == "SUBSCRIPTION_NOT_ACTIVE"

    resumed = await client.post(
        url,
        json={
            "version": 2,
            "status": "ACTIVE",
            "reason": "Restoring approved commercial subscription access",
        },
        headers=mutation_headers(super_admin, f"subscription-resume-{uuid.uuid4()}"),
    )
    assert resumed.status_code == 200, resumed.text
    async with TenantContextGuard.scoped(db, organization.id):
        await db.refresh(activation)
        assert activation.status == "ACTIVE"


@pytest.mark.asyncio
async def test_grant_issue_and_capacity_use_tenant_and_ledger_truth(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organization: Organization,
):
    plan = SubscriptionPlan(name=f"Pack Plan {uuid.uuid4().hex[:8]}", max_events=5)
    db.add(plan)
    await db.flush()
    subscription = OrganizationSubscription(
        organization_id=organization.id,
        plan_id=plan.id,
        status="ACTIVE",
    )
    db.add(subscription)
    await db.commit()

    issue_key = f"issue-pack-{uuid.uuid4()}"
    issue_payload = {
        "subscription_id": str(subscription.id),
        "grant_type": "EVENT_PACK",
        "scope_type": "EVENT",
        "consumption_model": "QUANTITY",
        "unit_type": "EVENT",
        "source_type": "PLAN",
        "source_ref": str(plan.id),
        "quantity_total": 5,
        "metadata_json": {"contract": "PACK-5"},
        "reason": "Issuing approved five event commercial pack",
    }
    issue_url = f"/superadmin/billing-admin/entitlements?organization_id={organization.id}"
    issued = await client.post(issue_url, json=issue_payload, headers=mutation_headers(super_admin, issue_key))
    assert issued.status_code == 201, issued.text
    grant = issued.json()
    assert grant["quantity_total"] == 5
    assert grant["version"] == 1

    replay = await client.post(issue_url, json=issue_payload, headers=mutation_headers(super_admin, issue_key))
    assert replay.status_code == 201
    assert replay.json()["id"] == grant["id"]

    consumption = GrantConsumption(
        grant_id=uuid.UUID(grant["id"]),
        organization_id=organization.id,
        quantity=3,
        unit_type="EVENT",
        status="CONSUMED",
    )
    db.add(consumption)
    await db.commit()

    capacity_url = f"/superadmin/billing-admin/entitlements/{grant['id']}/capacity?organization_id={organization.id}"
    below_usage = await client.patch(
        capacity_url,
        json={"version": 1, "quantity_total": 2, "reason": "Testing authoritative ledger capacity protection"},
        headers=mutation_headers(super_admin, f"capacity-low-{uuid.uuid4()}"),
    )
    assert below_usage.status_code == 409
    assert below_usage.json()["detail"]["code"] == "GRANT_CAPACITY_BELOW_USAGE"

    expanded = await client.patch(
        capacity_url,
        json={"version": 1, "quantity_total": 8, "reason": "Expanding approved event pack capacity safely"},
        headers=mutation_headers(super_admin, f"capacity-expand-{uuid.uuid4()}"),
    )
    assert expanded.status_code == 200, expanded.text
    assert expanded.json()["quantity_total"] == 8
    assert expanded.json()["version"] == 2

    other_org = Organization(name="Other Billing Tenant", slug=f"billing-other-{uuid.uuid4().hex[:8]}", plan="pro")
    db.add(other_org)
    await db.flush()
    other_subscription = OrganizationSubscription(organization_id=other_org.id, plan_id=plan.id, status="ACTIVE")
    db.add(other_subscription)
    await db.commit()
    cross_tenant = await client.post(
        issue_url,
        json={**issue_payload, "subscription_id": str(other_subscription.id)},
        headers=mutation_headers(super_admin, f"cross-tenant-grant-{uuid.uuid4()}"),
    )
    assert cross_tenant.status_code == 404


@pytest.mark.asyncio
async def test_credit_note_issue_approval_and_application_are_reconciled_and_audited(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organization: Organization,
):
    source_invoice = Invoice(
        organization_id=organization.id,
        amount=Decimal("1000.00"),
        total_amount_inr=Decimal("1180.00"),
        gst_amount=Decimal("180.00"),
        status="PAID",
    )
    target_invoice = Invoice(
        organization_id=organization.id,
        amount=Decimal("2000.00"),
        total_amount_inr=Decimal("2360.00"),
        gst_amount=Decimal("360.00"),
        status="UNPAID",
    )
    db.add_all([source_invoice, target_invoice])
    await db.commit()

    issue_payload = {
        "invoice_id": str(source_invoice.id),
        "amount_inr": "500.00",
        "gst_amount": "90.00",
        "reason": "Creating customer credit after approved reconciliation",
    }
    issue_url = f"/superadmin/billing-admin/credit-notes?organization_id={organization.id}"
    issued = await client.post(
        issue_url,
        json=issue_payload,
        headers=mutation_headers(super_admin, f"credit-create-{uuid.uuid4()}"),
    )
    assert issued.status_code == 201, issued.text
    note = issued.json()
    assert note["status"] == "PENDING"
    assert note["version"] == 1

    status_url = f"/superadmin/billing-admin/credit-notes/{note['id']}/status?organization_id={organization.id}"
    approved = await client.post(
        status_url,
        json={"version": 1, "status": "ISSUED", "reason": "Approving reconciled customer credit note"},
        headers=mutation_headers(super_admin, f"credit-issue-{uuid.uuid4()}"),
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "ISSUED"

    applied = await client.post(
        status_url,
        json={
            "version": 2,
            "status": "APPLIED",
            "applied_to_invoice_id": str(target_invoice.id),
            "reason": "Applying approved credit to verified target invoice",
        },
        headers=mutation_headers(super_admin, f"credit-apply-{uuid.uuid4()}"),
    )
    assert applied.status_code == 200, applied.text
    assert applied.json()["status"] == "APPLIED"
    assert applied.json()["applied_to_invoice_id"] == str(target_invoice.id)
    assert applied.json()["version"] == 3

    async with TenantContextGuard.scoped(db, organization.id):
        actions = set((await db.execute(select(FinancialAuditTrail.activity_type).where(
            FinancialAuditTrail.organization_id == organization.id,
            FinancialAuditTrail.entity_id == uuid.UUID(note["id"]),
        ))).scalars().all())
        assert {"CREDIT_NOTE_CREATED", "CREDIT_NOTE_ISSUED", "CREDIT_NOTE_APPLIED"}.issubset(actions)
        operations = (await db.execute(select(BillingOperationRequest).where(
            BillingOperationRequest.organization_id == organization.id,
            BillingOperationRequest.result_ref_id == uuid.UUID(note["id"]),
        ))).scalars().all()
        assert {operation.operation_type for operation in operations} == {
            "ISSUE_CREDIT_NOTE", "UPDATE_CREDIT_NOTE_STATUS"
        }
