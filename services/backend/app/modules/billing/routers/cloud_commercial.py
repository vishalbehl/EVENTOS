from __future__ import annotations

import uuid
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import func, select

from app.core.tenant_context import TenantContextGuard
from app.dependencies import ActiveUser, DB
from app.modules.billing.schemas.cloud_commercial import (
    AllocationTransferRequest,
    AdminCommercialRequestCreateRequest,
    CloudPricingPreviewRequest,
    CloudPricingPreviewResponse,
    CloudCheckoutRequest,
    CloudCartCheckoutRequest,
    MockCommercialPaymentRequest,
    CommercialOfferCreateRequest,
    CommercialOfferResponse,
    CommercialPricingConfigurationCreateRequest,
    CommercialRequestCreateRequest,
    EmcWorkspaceCreateRequest,
    EmcAllocationCreateRequest,
    CommercialRequestDecisionRequest,
    ContractAmendmentRequest,
    ContractCancellationRequest,
    OfferVersionCreateRequest,
    UsageMutationRequest,
)
from app.modules.billing.services.cloud_commercial_service import CloudCommercialService
from app.modules.billing.services.commercial_usage_service import CommercialUsageService
from app.modules.billing.services.commercial_contract_service import CommercialContractService
from app.modules.billing.services.commercial_lifecycle_service import CommercialLifecycleService
from app.modules.billing.models.billing_domain_tables import Invoice, InvoiceItem
from app.modules.billing.models.cloud_commercial import (
    CommercialAccount,
    CommercialContract,
    CommercialContractItem,
    CommercialOffer,
)
from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.models.idempotency import IdempotencyRecord
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.config import settings


from app.modules.billing.services.commercial_access import (
    current_customer_commercial_organization,
    customer_commercial_access,
)
from app.modules.rbac.services.platform_permissions import require_platform_permission

router = APIRouter(prefix="/commercial", tags=["cloud-commercial"], dependencies=[Depends(customer_commercial_access)])
admin_router = APIRouter(prefix="/platform/commercial", tags=["cloud-commercial-admin"],
    dependencies=[Depends(require_platform_permission("platform:billing:manage"))])


async def _recover_local_mock_checkout_invoices(
    db: DB,
    *,
    organization_id: uuid.UUID,
    actor_id: uuid.UUID,
    missing_invoice_ids: set[uuid.UUID],
) -> set[uuid.UUID]:
    """Repair a local mock checkout from its durable server receipt.

    This path is deliberately unavailable outside development/test. It exists
    to recover local checkouts whose invoice rows were removed while their
    immutable checkout receipt and pending contracts remain intact.
    """

    if (
        not missing_invoice_ids
        or settings.environment.lower() not in {"development", "test", "testing"}
    ):
        return set()
    receipts = list(
        (
            await db.scalars(
                select(IdempotencyRecord)
                .where(
                    IdempotencyRecord.organization_id == organization_id,
                    IdempotencyRecord.actor_id == actor_id,
                    IdempotencyRecord.operation == "commercial.cart.checkout",
                    IdempotencyRecord.status == "COMPLETED",
                    IdempotencyRecord.expires_at > datetime.now(timezone.utc),
                )
                .order_by(IdempotencyRecord.created_at.desc())
                .limit(25)
            )
        ).all()
    )
    receipt_items: dict[uuid.UUID, dict] = {}
    for receipt in receipts:
        body = receipt.response_body if isinstance(receipt.response_body, dict) else {}
        items = body.get("items") if isinstance(body.get("items"), list) else []
        for item in items:
            if not isinstance(item, dict):
                continue
            try:
                invoice_id = uuid.UUID(str(item["invoice_id"]))
                uuid.UUID(str(item["contract_id"]))
            except (KeyError, TypeError, ValueError):
                continue
            if invoice_id in missing_invoice_ids:
                receipt_items.setdefault(invoice_id, item)
    if set(receipt_items) != missing_invoice_ids:
        return set()

    contract_ids = {
        uuid.UUID(str(item["contract_id"])) for item in receipt_items.values()
    }
    contract_rows = list(
        (
            await db.scalars(
                select(CommercialContract)
                .join(
                    CommercialAccount,
                    CommercialAccount.id == CommercialContract.commercial_account_id,
                )
                .where(
                    CommercialContract.id.in_(contract_ids),
                    CommercialAccount.owner_organization_id == organization_id,
                )
                .with_for_update()
            )
        ).all()
    )
    contract_by_id = {contract.id: contract for contract in contract_rows}
    if set(contract_by_id) != contract_ids or any(
        contract.status != "PENDING_PAYMENT" for contract in contract_rows
    ):
        return set()

    item_rows = list(
        (
            await db.execute(
                select(CommercialContractItem, CommercialOffer)
                .join(
                    CommercialOffer,
                    CommercialOffer.id == CommercialContractItem.offer_id,
                )
                .where(CommercialContractItem.contract_id.in_(contract_ids))
                .order_by(CommercialContractItem.contract_id, CommercialContractItem.id)
            )
        ).all()
    )
    items_by_contract: dict[uuid.UUID, list[tuple[CommercialContractItem, CommercialOffer]]] = {}
    for contract_item, offer in item_rows:
        items_by_contract.setdefault(contract_item.contract_id, []).append(
            (contract_item, offer)
        )
    if any(not items_by_contract.get(contract_id) for contract_id in contract_ids):
        return set()

    prepared: list[
        tuple[
            uuid.UUID,
            CommercialContract,
            list[tuple[CommercialContractItem, CommercialOffer]],
            Decimal,
            Decimal,
            Decimal,
        ]
    ] = []
    for invoice_id, receipt_item in receipt_items.items():
        contract_id = uuid.UUID(str(receipt_item["contract_id"]))
        contract = contract_by_id[contract_id]
        contract_items = items_by_contract[contract_id]
        subtotal = Decimal(str(receipt_item.get("subtotal", "0")))
        gst = Decimal(str(receipt_item.get("gst", "0")))
        total = Decimal(str(receipt_item.get("total", "0")))
        line_total = sum(
            (Decimal(str(item.line_total or 0)) for item, _ in contract_items),
            Decimal("0"),
        )
        if subtotal <= 0 or abs(line_total - subtotal) > Decimal("0.01"):
            return set()
        prepared.append(
            (invoice_id, contract, contract_items, subtotal, gst, total)
        )

    repaired: set[uuid.UUID] = set()
    for invoice_id, contract, contract_items, subtotal, gst, total in prepared:
        invoice = Invoice(
            id=invoice_id,
            organization_id=organization_id,
            amount=subtotal,
            currency="INR",
            status="UNPAID",
            due_date=datetime.now(timezone.utc) + timedelta(days=7),
            invoice_number=f"CLOUD-{invoice_id.hex[:16].upper()}",
            gst_amount=gst,
            total_amount_inr=total,
            commercial_contract_id=contract.id,
            status_reason="Recovered from durable local checkout receipt",
        )
        db.add(invoice)
        await db.flush()
        contract.invoice_id = invoice.id
        for contract_item, offer in contract_items:
            tax_rate = Decimal(str(contract_item.tax_rate or 0))
            amount = Decimal(str(contract_item.line_total or 0))
            db.add(
                InvoiceItem(
                    invoice_id=invoice.id,
                    description=offer.display_name,
                    amount=amount,
                    quantity=contract_item.quantity,
                    commercial_offer_code=offer.code,
                    commercial_offer_version_id=contract_item.offer_version_id,
                    commercial_contract_item_id=contract_item.id,
                    tax_rate=tax_rate,
                    tax_amount=(amount * tax_rate / Decimal("100")),
                )
            )
        db.add(
            AuditLog(
                organization_id=organization_id,
                actor_user_id=actor_id,
                actor_role="ORGANIZER",
                resource_type="invoice",
                resource_id=invoice.id,
                action_type="COMMERCIAL_LOCAL_INVOICE_RECOVERED",
                new_state={
                    "status": invoice.status,
                    "contract_id": str(contract.id),
                    "checkout_receipt_recovery": True,
                },
                is_sensitive=True,
            )
        )
        repaired.add(invoice.id)
    await db.flush()
    return repaired


async def _platform_commercial_account(db: DB, account_id: uuid.UUID):
    """Load a commercial account for a permitted platform operation.

    Platform commercial administrators work across tenant boundaries.  The
    account lookup is intentionally performed with the tenant filter skipped,
    then every tenant-owned mutation is re-scoped to the account owner below.
    """
    from app.modules.billing.models.cloud_commercial import CommercialAccount

    account = await db.scalar(
        select(CommercialAccount)
        .where(CommercialAccount.id == account_id)
        .execution_options(skip_tenant_filter=True)
    )
    if not account:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Commercial account not found")
    return account


async def _platform_contract_owner_organization(db: DB, contract_id: uuid.UUID) -> uuid.UUID:
    from app.modules.billing.models.cloud_commercial import CommercialAccount, CommercialContract

    organization_id = await db.scalar(
        select(CommercialAccount.owner_organization_id)
        .join(CommercialContract, CommercialContract.commercial_account_id == CommercialAccount.id)
        .where(CommercialContract.id == contract_id)
        .execution_options(skip_tenant_filter=True)
    )
    if not organization_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Commercial contract not found")
    return organization_id


async def _platform_request_organization(db: DB, request_id: uuid.UUID) -> uuid.UUID:
    from app.modules.billing.models.cloud_commercial import CommercialRequest

    organization_id = await db.scalar(
        select(CommercialRequest.organization_id)
        .where(CommercialRequest.id == request_id)
        .execution_options(skip_tenant_filter=True)
    )
    if not organization_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Commercial request not found")
    return organization_id


async def _platform_organization_id(db: DB, organization_id: uuid.UUID) -> uuid.UUID:
    """Resolve a tenant selected by a permitted platform administrator.

    This is deliberately a narrow global lookup.  The caller must subsequently
    enter ``TenantContextGuard.scoped`` before it can create tenant-owned
    commercial records.
    """
    from app.modules.platform.models.organization import Organization

    resolved = await db.scalar(
        select(Organization.id)
        .where(Organization.id == organization_id)
        .execution_options(skip_tenant_filter=True)
    )
    if not resolved:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Organization not found")
    return resolved


@router.get("/catalog", response_model=list[CommercialOfferResponse])
async def get_cloud_catalog(
    user: ActiveUser,
    db: DB,
    family: Optional[str] = Query(default=None),
):
    return await CloudCommercialService(db).catalog(family=family)


@router.get("/catalog/compare", response_model=list[CommercialOfferResponse])
async def compare_cloud_catalog(user: ActiveUser, db: DB, family: Optional[str] = Query(default=None)):
    return await CloudCommercialService(db).catalog(family=family)


@router.get("/catalog/{offer_code}", response_model=CommercialOfferResponse)
async def get_cloud_catalog_offer(offer_code: str, user: ActiveUser, db: DB):
    offers = await CloudCommercialService(db).catalog()
    for offer in offers:
        if offer["code"] == offer_code:
            return offer
    from fastapi import HTTPException
    raise HTTPException(status_code=404, detail="Commercial offer not found")


@router.post("/pricing/preview", response_model=CloudPricingPreviewResponse)
async def preview_cloud_pricing(payload: CloudPricingPreviewRequest, user: ActiveUser, db: DB):
    return await CloudCommercialService(db).pricing_preview(payload)


@router.get("/account")
async def get_commercial_account(user: ActiveUser, db: DB):
    return await CloudCommercialService(db).account_snapshot(current_customer_commercial_organization())


@router.get("/overview")
async def get_commercial_overview(user: ActiveUser, db: DB):
    """Bounded normal-organiser projection; EMC administration is excluded."""
    organization_id = current_customer_commercial_organization()
    service = CloudCommercialService(db)
    account = await service.account_snapshot(organization_id)
    contracts = await service.contracts(organization_id)
    usage = await service.usage(organization_id)
    request_service = CommercialContractService(db)
    request_rows = await request_service.requests(organization_id, limit=10)
    requests = await request_service.request_states(request_rows)
    purchases = await service.capacity_purchases(organization_id)
    six_months_ago = datetime.now(timezone.utc) - timedelta(days=190)
    trend_rows = (await db.execute(select(
        func.date_trunc("month", Invoice.issued_at).label("month"),
        func.coalesce(func.sum(Invoice.total_amount_inr), 0).label("amount"),
    ).where(
        Invoice.organization_id == organization_id,
        Invoice.issued_at >= six_months_ago,
        func.lower(Invoice.status).not_in(["void", "cancelled"]),
    ).group_by("month").order_by("month"))).all()
    recent_invoices = list((await db.scalars(select(Invoice).where(
        Invoice.organization_id == organization_id,
    ).order_by(Invoice.issued_at.desc()).limit(8))).all())
    active_contracts = [item for item in contracts if str(item.get("status", "")).upper() == "ACTIVE"]
    workspace_contract = next(
        (
            (contract, item)
            for contract in active_contracts
            for item in contract.get("items", [])
            if item.get("product_family") == "WORKSPACE"
        ),
        None,
    )
    next_payment = None
    if workspace_contract and workspace_contract[0].get("auto_renew") and workspace_contract[0].get("ends_at"):
        workspace_items = [
            item
            for item in workspace_contract[0].get("items", [])
            if item.get("product_family") == "WORKSPACE"
        ]
        renewal_total = sum(
            Decimal(str(item.get("line_total") or 0))
            * (Decimal("1") + (Decimal(str(item.get("tax_rate") or 0)) / Decimal("100")))
            for item in workspace_items
        )
        next_payment = {
            "amount": float(renewal_total.quantize(Decimal("0.01"))),
            "currency": workspace_contract[0].get("currency") or account.get("currency") or "INR",
            "due_at": workspace_contract[0].get("ends_at"),
        }
    open_requests = [item for item in requests if str(item.get("status", "")).upper() not in {"REJECTED", "CANCELLED", "COMPLETED"}]
    return {
        "account": account,
        "plan": ({
            "name": workspace_contract[1].get("display_name") or workspace_contract[1].get("offer_code"),
            "code": workspace_contract[1].get("offer_code"),
            "status": workspace_contract[0].get("status"),
            "billing_cycle": workspace_contract[0].get("billing_interval"),
            "renews_at": workspace_contract[0].get("ends_at"),
            "unrestricted": False,
        } if workspace_contract else None),
        "active_contracts": len(active_contracts),
        "next_payment": next_payment,
        "contracts": active_contracts[:100],
        "contracts_truncated": len(active_contracts) > 100,
        "usage": usage,
        "open_orders": len(open_requests),
        "recent_orders": open_requests[:10],
        "purchased_addons": len(purchases),
        "recent_purchases": purchases[:10],
        "commitment_trend": [{"month": row.month.isoformat(), "amount": float(row.amount or 0)} for row in trend_rows],
        "recent_transactions": [{
            "id": str(row.id), "reference": row.invoice_number or row.stripe_invoice_id,
            "amount": float(row.total_amount_inr or row.amount), "currency": row.currency,
            "status": row.status, "issued_at": row.issued_at.isoformat(),
        } for row in recent_invoices],
        "source": "commerce.organiser_commercial_overview",
    }


@router.get("/contracts")
async def get_commercial_contracts(user: ActiveUser, db: DB):
    return await CloudCommercialService(db).contracts(current_customer_commercial_organization())


@router.get("/contracts/{contract_id}")
async def get_commercial_contract(contract_id: uuid.UUID, user: ActiveUser, db: DB):
    return await CloudCommercialService(db).contract_detail(current_customer_commercial_organization(), contract_id)


@router.post("/contracts/{contract_id}/cancel")
async def cancel_commercial_contract(
    contract_id: uuid.UUID,
    payload: ContractCancellationRequest,
    user: ActiveUser,
    db: DB,
    if_match: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
):
    contract = await CommercialLifecycleService(db).cancel_at_period_end(
        current_customer_commercial_organization(), contract_id, payload, user.id, if_match, idempotency_key
    )
    await db.commit()
    return {"id": contract.id, "status": contract.status, "cancel_at_period_end": contract.cancel_at_period_end, "ends_at": contract.ends_at, "version": contract.version}


@router.get("/usage")
async def get_commercial_usage(user: ActiveUser, db: DB, event_id: Optional[uuid.UUID] = Query(default=None)):
    return await CloudCommercialService(db).usage(current_customer_commercial_organization(), event_id=event_id)


@router.get("/entitlements")
async def get_commercial_entitlements(user: ActiveUser, db: DB, event_id: Optional[uuid.UUID] = Query(default=None)):
    return await CloudCommercialService(db).entitlements(current_customer_commercial_organization(), event_id=event_id)


@router.post("/checkout")
async def create_commercial_checkout(
    payload: CloudCheckoutRequest,
    user: ActiveUser,
    db: DB,
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
):
    payload.billing_profile.setdefault("billing_email", user.email)
    contract, invoice = await CommercialContractService(db).create_checkout(
        current_customer_commercial_organization(), user.id, payload, idempotency_key
    )
    await db.commit()
    return {
        "contract_id": contract.id,
        "contract_status": contract.status,
        "invoice_id": invoice.id,
        "invoice_status": invoice.status,
        "subtotal": invoice.amount,
        "gst": invoice.gst_amount,
        "total": invoice.total_amount_inr,
        "payment_required": True,
    }


@router.post("/cart/checkout")
async def create_commercial_cart_checkout(
    payload: CloudCartCheckoutRequest,
    user: ActiveUser,
    db: DB,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=16, max_length=200),
):
    """Create independently renewable contracts for one bounded cart.

    The cart is committed atomically, but Workspace, Event and Venue lines are
    intentionally not collapsed into one contract because they have different
    expiry, event ownership and auto-renewal rules.
    """
    organization_id = current_customer_commercial_organization()
    receipt = await begin_idempotent(
        db,
        organization_id=organization_id,
        actor_id=user.id,
        operation="commercial.cart.checkout",
        key=idempotency_key,
        payload=payload.model_dump(mode="json"),
    )
    replay = replay_response(receipt)
    if replay is not None:
        return replay[1]

    service = CommercialContractService(db)
    results: list[dict] = []
    cart_includes_workspace = any(
        bool(selection.workspace_offer_code) for selection in payload.items
    )
    try:
        for index, selection in enumerate(payload.items):
            selection.billing_profile.setdefault("billing_email", user.email)
            child_key = hashlib.sha256(
                f"{idempotency_key}:{index}".encode("utf-8")
            ).hexdigest()
            contract, invoice = await service.create_checkout(
                organization_id,
                user.id,
                selection,
                child_key,
                workspace_dependency_satisfied=cart_includes_workspace,
            )
            results.append({
                "contract_id": str(contract.id),
                "contract_type": contract.contract_type,
                "contract_status": contract.status,
                "invoice_id": str(invoice.id),
                "invoice_status": invoice.status,
                "subtotal": float(invoice.amount),
                "gst": float(invoice.gst_amount or 0),
                "total": float(invoice.total_amount_inr or 0),
                "payment_required": True,
            })
        response = {"items": results, "invoice_count": len(results)}
        await complete_idempotent(
            db,
            receipt,
            response_status=200,
            response_body=response,
        )
        await db.commit()
        return response
    except Exception:
        await db.rollback()
        raise


@router.get("/cart/pending-payment")
async def get_pending_commercial_cart_payment(user: ActiveUser, db: DB):
    """Recover the latest checkout owned by this user that still has unpaid invoices."""

    organization_id = current_customer_commercial_organization()
    receipts = list(
        (
            await db.scalars(
                select(IdempotencyRecord)
                .where(
                    IdempotencyRecord.organization_id == organization_id,
                    IdempotencyRecord.actor_id == user.id,
                    IdempotencyRecord.operation == "commercial.cart.checkout",
                    IdempotencyRecord.status == "COMPLETED",
                    IdempotencyRecord.created_at
                    >= datetime.now(timezone.utc) - timedelta(hours=24),
                )
                .order_by(IdempotencyRecord.created_at.desc())
                .limit(10)
            )
        ).all()
    )
    receipt_invoice_ids: list[
        tuple[dict, list[uuid.UUID], list[uuid.UUID]]
    ] = []
    all_invoice_ids: set[uuid.UUID] = set()
    all_contract_ids: set[uuid.UUID] = set()
    for receipt in receipts:
        body = receipt.response_body if isinstance(receipt.response_body, dict) else {}
        items = body.get("items") if isinstance(body.get("items"), list) else []
        try:
            invoice_ids = [uuid.UUID(str(item["invoice_id"])) for item in items]
            contract_ids = [uuid.UUID(str(item["contract_id"])) for item in items]
        except (KeyError, TypeError, ValueError):
            continue
        if not invoice_ids or len(invoice_ids) > 25 or len(contract_ids) != len(invoice_ids):
            continue
        receipt_invoice_ids.append((body, invoice_ids, contract_ids))
        all_invoice_ids.update(invoice_ids)
        all_contract_ids.update(contract_ids)

    if not all_invoice_ids:
        return None
    invoices = list(
        (
            await db.scalars(
                select(Invoice).where(
                    Invoice.organization_id == organization_id,
                    Invoice.id.in_(all_invoice_ids),
                )
            )
        ).all()
    )
    invoice_by_id = {invoice.id: invoice for invoice in invoices}
    for body, invoice_ids, _ in receipt_invoice_ids:
        owned_invoices = [invoice_by_id.get(invoice_id) for invoice_id in invoice_ids]
        if all(owned_invoices) and any(
            invoice.status == "UNPAID" for invoice in owned_invoices if invoice
        ):
            return body
    if settings.environment.lower() in {"development", "test", "testing"}:
        contracts = list(
            (
                await db.scalars(
                    select(CommercialContract)
                    .join(
                        CommercialAccount,
                        CommercialAccount.id
                        == CommercialContract.commercial_account_id,
                    )
                    .where(
                        CommercialContract.id.in_(all_contract_ids),
                        CommercialAccount.owner_organization_id == organization_id,
                    )
                )
            ).all()
        )
        contract_by_id = {contract.id: contract for contract in contracts}
        for body, _, contract_ids in receipt_invoice_ids:
            owned_contracts = [contract_by_id.get(contract_id) for contract_id in contract_ids]
            if all(owned_contracts) and all(
                contract.status == "PENDING_PAYMENT"
                for contract in owned_contracts
                if contract
            ):
                return body
    return None


@router.post("/cart/mock-payment")
async def confirm_mock_commercial_cart_payment(
    payload: MockCommercialPaymentRequest,
    user: ActiveUser,
    db: DB,
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=16, max_length=200),
):
    """Settle a local-development cart without pretending to be a provider webhook."""

    if settings.environment.lower() not in {"development", "test", "testing"}:
        raise HTTPException(status_code=404, detail={"code": "MOCK_PAYMENT_NOT_AVAILABLE"})
    organization_id = current_customer_commercial_organization()
    receipt = await begin_idempotent(
        db,
        organization_id=organization_id,
        actor_id=user.id,
        operation="commercial.cart.mock-payment",
        key=idempotency_key,
        payload=payload.model_dump(mode="json"),
    )
    replay = replay_response(receipt)
    if replay is not None:
        return replay[1]

    invoices = list(
        (
            await db.scalars(
                select(Invoice)
                .where(
                    Invoice.organization_id == organization_id,
                    Invoice.id.in_(payload.invoice_ids),
                )
                .order_by(Invoice.id.asc())
                .with_for_update()
            )
        ).all()
    )
    if len(invoices) != len(payload.invoice_ids):
        found_ids = {invoice.id for invoice in invoices}
        await _recover_local_mock_checkout_invoices(
            db,
            organization_id=organization_id,
            actor_id=user.id,
            missing_invoice_ids=set(payload.invoice_ids) - found_ids,
        )
        invoices = list(
            (
                await db.scalars(
                    select(Invoice)
                    .where(
                        Invoice.organization_id == organization_id,
                        Invoice.id.in_(payload.invoice_ids),
                    )
                    .order_by(Invoice.id.asc())
                    .with_for_update()
                )
            ).all()
        )
    if len(invoices) != len(payload.invoice_ids):
        raise HTTPException(status_code=404, detail={"code": "INVOICE_NOT_FOUND"})
    invalid_invoices = [
        str(invoice.id)
        for invoice in invoices
        if invoice.status not in {"UNPAID", "PAID"}
    ]
    if invalid_invoices:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "INVOICE_NOT_PAYABLE",
                "invoice_ids": invalid_invoices,
            },
        )
    contract_ids = [
        invoice.commercial_contract_id
        for invoice in invoices
        if invoice.commercial_contract_id is not None
    ]
    contracts = list(
        (
            await db.scalars(
                select(CommercialContract).where(CommercialContract.id.in_(contract_ids))
            )
        ).all()
    )
    contract_by_id = {contract.id: contract for contract in contracts}
    priority = {"WORKSPACE": 0, "EVENT": 1, "VENUE": 2, "EMC": 3}
    invoices.sort(
        key=lambda invoice: (
            priority.get(
                getattr(contract_by_id.get(invoice.commercial_contract_id), "contract_type", ""),
                9,
            ),
            str(invoice.id),
        )
    )
    now = datetime.now(timezone.utc)
    payment_reference = f"mock_{secrets.token_hex(8)}"
    activated_contracts: list[str] = []
    try:
        for invoice in invoices:
            old_status = invoice.status
            if invoice.status != "PAID":
                invoice.status = "PAID"
                invoice.paid_at = now
                invoice.status_reason = "Local development mock payment"
                invoice.status_changed_at = now
                invoice.status_changed_by = user.id
                invoice.version += 1
            activated = await CommercialContractService(db).activate_paid_contract(invoice.id)
            if activated is None:
                raise HTTPException(
                    status_code=409,
                    detail={"code": "CONTRACT_ACTIVATION_FAILED", "invoice_id": str(invoice.id)},
                )
            activated_contracts.append(str(activated.id))
            db.add(
                AuditLog(
                    organization_id=organization_id,
                    actor_user_id=user.id,
                    actor_role=getattr(user, "role", "ORGANIZER"),
                    resource_type="invoice",
                    resource_id=invoice.id,
                    action_type="COMMERCIAL_MOCK_PAYMENT_CONFIRMED",
                    old_state={"status": old_status},
                    new_state={
                        "status": invoice.status,
                        "paid_at": invoice.paid_at.isoformat() if invoice.paid_at else None,
                        "payment_reference": payment_reference,
                    },
                    change_diff={"environment": settings.environment},
                    is_sensitive=True,
                )
            )
        response = {
            "status": "PAID",
            "paid_at": now.isoformat(),
            "payment_reference": payment_reference,
            "invoice_ids": [str(invoice.id) for invoice in invoices],
            "activated_contract_ids": activated_contracts,
            "total": float(sum((invoice.total_amount_inr or invoice.amount or 0) for invoice in invoices)),
            "currency": "INR",
        }
        await complete_idempotent(
            db,
            receipt,
            response_status=200,
            response_body=response,
        )
        await db.commit()
        return response
    except Exception:
        await db.rollback()
        raise


@router.post("/capacity-purchases")
async def create_capacity_purchase(
    payload: CloudCheckoutRequest,
    user: ActiveUser,
    db: DB,
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
):
    if not payload.capacity_addon_codes and not any(event.capacity_addon_codes for event in payload.events):
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="At least one capacity add-on is required")
    # This endpoint is deliberately narrower than generic checkout: it must
    # never silently create a workspace, event, or EMC base-plan contract.
    # Resolve the same price book used by checkout and reject any mixed or
    # non-capacity composition before creating the pending invoice.
    preview = await CloudCommercialService(db).pricing_preview(payload)
    if any(line.product_family != "CAPACITY_ADDON" for line in preview.line_items):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=422,
            detail={
                "code": "CAPACITY_PURCHASE_ONLY",
                "message": "Capacity purchases may contain capacity add-ons only.",
            },
        )
    payload.billing_profile.setdefault("billing_email", user.email)
    contract, invoice = await CommercialContractService(db).create_checkout(
        current_customer_commercial_organization(), user.id, payload, idempotency_key
    )
    await db.commit()
    return {
        "contract_id": contract.id,
        "invoice_id": invoice.id,
        "status": contract.status,
        "subtotal": invoice.amount,
        "gst": invoice.gst_amount,
        "total": invoice.total_amount_inr,
    }


@router.get("/capacity-purchases")
async def get_capacity_purchases(user: ActiveUser, db: DB):
    return await CloudCommercialService(db).capacity_purchases(current_customer_commercial_organization())


@router.post("/requests", status_code=202)
async def create_commercial_request(
    payload: CommercialRequestCreateRequest,
    user: ActiveUser,
    db: DB,
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
):
    payload.billing_profile.setdefault("billing_email", user.email)
    request = await CommercialContractService(db).create_request(
        current_customer_commercial_organization(), user.id, payload, idempotency_key
    )
    await db.commit()
    return {
        "id": request.id,
        "product_family": request.product_family,
        "request_type": request.request_type,
        "status": request.status,
        "requested_offer_codes": request.requested_offer_codes,
        "quote_id": request.quote_id,
        "quote_reference": request.quote_reference,
        "created_at": request.created_at,
    }


@router.get("/requests")
async def get_commercial_requests(user: ActiveUser, db: DB):
    service = CommercialContractService(db)
    rows = await service.requests(current_customer_commercial_organization())
    return await service.request_states(rows)


@router.get("/requests/{request_id}")
async def get_commercial_request(request_id: uuid.UUID, user: ActiveUser, db: DB):
    service = CommercialContractService(db)
    row = await service.request_detail(current_customer_commercial_organization(), request_id)
    state = await service.request_state(row)
    state.update({
        "preview_snapshot": row.preview_snapshot_json,
        "billing_profile": row.billing_profile,
        "reason": row.reason,
    })
    return state


@router.post("/requests/{request_id}/accept-quote")
async def accept_commercial_quote(
    request_id: uuid.UUID,
    user: ActiveUser,
    db: DB,
    if_match: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
):
    # The request state and quote status make this idempotent.  The header is
    # still required so a stale portal cannot accept a superseded quote.
    request = await CommercialContractService(db).accept_quoted_request(
        current_customer_commercial_organization(), request_id, user.id, if_match, idempotency_key
    )
    await db.commit()
    return {"id": request.id, "status": request.status, "quote_id": request.quote_id, "version": request.version}


@router.get("/emc/workspaces")
async def get_emc_workspaces(user: ActiveUser, db: DB):
    return await CloudCommercialService(db).emc_workspaces(current_customer_commercial_organization())


@router.post("/emc/workspaces")
async def add_emc_workspace(
    payload: EmcWorkspaceCreateRequest,
    user: ActiveUser,
    db: DB,
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
    if_match: int = Header(..., alias="If-Match", ge=1),
):
    result = await CloudCommercialService(db).add_emc_workspace(current_customer_commercial_organization(), payload, user.id, if_match,
        actor_auth_revision=user.auth_revision, idempotency_key=idempotency_key)
    await db.commit()
    return result


@router.get("/emc/allocations")
async def get_emc_allocations(user: ActiveUser, db: DB):
    return await CloudCommercialService(db).emc_allocations(current_customer_commercial_organization())


@router.post("/emc/allocations")
async def allocate_emc_capacity(
    payload: EmcAllocationCreateRequest,
    user: ActiveUser,
    db: DB,
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
):
    result = await CloudCommercialService(db).allocate_emc_capacity(
        current_customer_commercial_organization(), payload, user.id, idempotency_key
    )
    await db.commit()
    return result


@router.get("/emc/usage")
async def get_emc_usage(user: ActiveUser, db: DB):
    service = CloudCommercialService(db)
    account = await service.account_snapshot(current_customer_commercial_organization())
    if account["account_type"] != "EMC":
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="EMC usage requires an EMC commercial account")
    return await service.usage(current_customer_commercial_organization())


@router.post("/usage/mutate")
async def mutate_commercial_usage(
    payload: UsageMutationRequest,
    user: ActiveUser,
    db: DB,
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
):
    if payload.operation_type == "ADJUST":
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usage adjustments require commercial administration access",
        )
    result = await CommercialUsageService(db).mutate(current_customer_commercial_organization(), payload, user.id, idempotency_key)
    await db.commit()
    return result


@router.post("/emc/allocations/transfers")
async def transfer_emc_allocation(
    payload: AllocationTransferRequest,
    user: ActiveUser,
    db: DB,
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
):
    transfer = await CloudCommercialService(db).transfer_allocation(
        current_customer_commercial_organization(), payload, user.id, idempotency_key
    )
    await db.commit()
    return {"id": transfer.id, "quantity": transfer.quantity, "status": "TRANSFERRED"}


@admin_router.get("/offers")
async def get_admin_cloud_catalog(user: ActiveUser, db: DB, family: Optional[str] = Query(default=None)):
    return await CloudCommercialService(db).catalog(family=family, include_drafts=True)


@admin_router.post("/pricing/preview", response_model=CloudPricingPreviewResponse)
async def preview_admin_cloud_pricing(payload: CloudPricingPreviewRequest, user: ActiveUser, db: DB):
    return await CloudCommercialService(db).pricing_preview(payload)


@admin_router.get("/pricing/configurations")
async def get_admin_pricing_configurations(user: ActiveUser, db: DB):
    return await CloudCommercialService(db).pricing_configurations(user.id)


@admin_router.post("/pricing/configurations")
async def save_admin_pricing_configuration(
    payload: CommercialPricingConfigurationCreateRequest,
    user: ActiveUser,
    db: DB,
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
):
    configuration = await CloudCommercialService(db).save_pricing_configuration(payload, user.id, idempotency_key)
    await db.commit()
    return {
        "id": configuration.id,
        "name": configuration.name,
        "account_type": configuration.account_type,
        "version": configuration.version,
        "created_at": configuration.created_at,
    }


@admin_router.post("/offers")
async def create_admin_cloud_offer(
    payload: CommercialOfferCreateRequest,
    user: ActiveUser,
    db: DB,
    if_match: str = Header(..., alias="If-Match"),
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
):
    if if_match != "0":
        from fastapi import HTTPException
        raise HTTPException(status_code=412, detail={"code": "COMMERCIAL_OFFER_CREATE_CONFLICT", "expected": "0"})
    offer = await CloudCommercialService(db).create_offer(payload, user.id)
    await db.commit()
    return {
        "id": offer.id,
        "code": offer.code,
        "product_family": offer.product_family,
        "name": offer.name,
        "display_name": offer.display_name,
        "description": offer.description,
        "scope_type": offer.scope_type,
        "is_quote_only": offer.is_quote_only,
        "lifecycle_status": offer.lifecycle_status,
        "display_order": offer.display_order,
    }


@admin_router.get("/contracts")
async def get_admin_commercial_contracts(user: ActiveUser, db: DB, status_filter: Optional[str] = Query(default=None, alias="status")):
    from app.modules.billing.models.cloud_commercial import CommercialContract
    stmt = select(CommercialContract).execution_options(skip_tenant_filter=True).order_by(CommercialContract.created_at.desc())
    if status_filter:
        stmt = stmt.where(CommercialContract.status == status_filter)
    return [{"id": row.id, "commercial_account_id": row.commercial_account_id, "contract_type": row.contract_type, "status": row.status, "starts_at": row.starts_at, "ends_at": row.ends_at, "invoice_id": row.invoice_id, "version": row.version} for row in (await db.scalars(stmt)).all()]


@admin_router.get("/emc/accounts")
async def get_admin_emc_accounts(user: ActiveUser, db: DB):
    return await CloudCommercialService(db).admin_emc_accounts()


@admin_router.get("/emc/accounts/{account_id}/workspaces")
async def get_admin_emc_workspaces(account_id: uuid.UUID, user: ActiveUser, db: DB):
    return await CloudCommercialService(db).admin_emc_workspaces(account_id)


@admin_router.post("/emc/accounts/{account_id}/workspaces")
async def create_admin_emc_workspace(
    account_id: uuid.UUID,
    payload: EmcWorkspaceCreateRequest,
    user: ActiveUser,
    db: DB,
    if_match: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
):
    account = await _platform_commercial_account(db, account_id)
    if account.account_type != "EMC":
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="EMC account not found")
    async with TenantContextGuard.scoped(db, account.owner_organization_id):
        result = await CloudCommercialService(db).add_emc_workspace(account.owner_organization_id, payload, user.id, if_match,
            actor_auth_revision=user.auth_revision, idempotency_key=idempotency_key)
    await db.commit()
    return result


@admin_router.get("/emc/accounts/{account_id}/allocations")
async def get_admin_emc_allocations(account_id: uuid.UUID, user: ActiveUser, db: DB):
    return await CloudCommercialService(db).admin_emc_allocations(account_id)


@admin_router.get("/emc/accounts/{account_id}/history")
async def get_admin_emc_history(account_id: uuid.UUID, user: ActiveUser, db: DB):
    return await CloudCommercialService(db).admin_emc_history(account_id)


@admin_router.post("/emc/accounts/{account_id}/allocations")
async def create_admin_emc_allocation(
    account_id: uuid.UUID,
    payload: EmcAllocationCreateRequest,
    user: ActiveUser,
    db: DB,
    if_match: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
):
    account = await _platform_commercial_account(db, account_id)
    if account.account_type != "EMC":
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="EMC account not found")
    async with TenantContextGuard.scoped(db, account.owner_organization_id):
        result = await CloudCommercialService(db).allocate_emc_capacity(account.owner_organization_id, payload, user.id, idempotency_key, if_match)
    await db.commit()
    return result


@admin_router.post("/emc/accounts/{account_id}/allocations/transfers")
async def transfer_admin_emc_allocation(
    account_id: uuid.UUID,
    payload: AllocationTransferRequest,
    user: ActiveUser,
    db: DB,
    if_match: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
):
    account = await _platform_commercial_account(db, account_id)
    if account.account_type != "EMC":
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="EMC account not found")
    async with TenantContextGuard.scoped(db, account.owner_organization_id):
        transfer = await CloudCommercialService(db).transfer_allocation(account.owner_organization_id, payload, user.id, idempotency_key, if_match)
    await db.commit()
    return {"id": transfer.id, "quantity": transfer.quantity, "status": "TRANSFERRED"}


@admin_router.get("/requests")
async def get_admin_commercial_requests(
    user: ActiveUser,
    db: DB,
    organization_id: Optional[uuid.UUID] = Query(default=None),
):
    service = CommercialContractService(db)
    rows = await service.admin_requests(organization_id=organization_id)
    states = []
    for row in rows:
        async with TenantContextGuard.scoped(db, row.organization_id):
            states.append(await service.request_state(row))
    return states


@admin_router.post("/requests", status_code=202)
async def create_admin_commercial_request(
    payload: AdminCommercialRequestCreateRequest,
    user: ActiveUser,
    db: DB,
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
):
    organization_id = await _platform_organization_id(db, payload.organization_id)
    payload.billing_profile.setdefault("billing_email", user.email)
    async with TenantContextGuard.scoped(db, organization_id):
        request = await CommercialContractService(db).create_request(organization_id, user.id, payload, idempotency_key)
    await db.commit()
    return {
        "id": request.id,
        "organization_id": request.organization_id,
        "product_family": request.product_family,
        "request_type": request.request_type,
        "status": request.status,
        "requested_offer_codes": request.requested_offer_codes,
        "quote_id": request.quote_id,
        "quote_reference": request.quote_reference,
        "version": request.version,
        "created_at": request.created_at,
    }


@admin_router.post("/requests/{request_id}/decision")
async def decide_admin_commercial_request(
    request_id: uuid.UUID,
    payload: CommercialRequestDecisionRequest,
    user: ActiveUser,
    db: DB,
    if_match: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
):
    organization_id = await _platform_request_organization(db, request_id)
    async with TenantContextGuard.scoped(db, organization_id):
        request = await CommercialContractService(db).decide_request(request_id, payload, user.id, if_match, idempotency_key)
    await db.commit()
    return {"id": request.id, "status": request.status, "quote_id": request.quote_id, "quote_reference": request.quote_reference, "version": request.version}


@admin_router.post("/requests/{request_id}/activate")
async def activate_admin_commercial_request(
    request_id: uuid.UUID,
    user: ActiveUser,
    db: DB,
    if_match: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
):
    organization_id = await _platform_request_organization(db, request_id)
    async with TenantContextGuard.scoped(db, organization_id):
        contract, invoice = await CommercialContractService(db).activate_quoted_request(request_id, user.id, idempotency_key, if_match)
    await db.commit()
    return {
        "contract_id": contract.id,
        "contract_status": contract.status,
        "invoice_id": invoice.id,
        "invoice_status": invoice.status,
        "subtotal": invoice.amount,
        "gst": invoice.gst_amount,
        "total": invoice.total_amount_inr,
        "source_quote_id": contract.source_quote_id,
    }


@admin_router.post("/offers/{offer_id}/versions")
async def create_offer_version(
    offer_id: uuid.UUID,
    payload: OfferVersionCreateRequest,
    user: ActiveUser,
    db: DB,
    if_match: str = Header(..., alias="If-Match"),
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
):
    version = await CloudCommercialService(db).create_offer_version(offer_id, payload, user.id, if_match, idempotency_key)
    await db.commit()
    return {
        "id": version.id,
        "offer_id": version.offer_id,
        "version_number": version.version_number,
        "effective_from": version.effective_from,
        "version_status": version.version_status,
        "change_reason": version.change_reason,
    }


@admin_router.get("/offers/{offer_id}/versions")
async def get_admin_cloud_offer_versions(offer_id: uuid.UUID, user: ActiveUser, db: DB):
    return await CloudCommercialService(db).admin_offer_versions(offer_id)


@admin_router.get("/impact-preview")
async def get_admin_cloud_impact_preview(
    user: ActiveUser,
    db: DB,
    offer_id: uuid.UUID,
    version_id: Optional[uuid.UUID] = Query(default=None),
):
    return await CloudCommercialService(db).admin_offer_impact_preview(offer_id, version_id)


@admin_router.post("/offer-versions/{version_id}/publish")
async def publish_offer_version(
    version_id: uuid.UUID,
    user: ActiveUser,
    db: DB,
    if_match: str = Header(..., alias="If-Match"),
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
):
    version = await CloudCommercialService(db).publish_offer_version(version_id, user.id, if_match)
    await db.commit()
    return {
        "id": version.id,
        "offer_id": version.offer_id,
        "version_number": version.version_number,
        "effective_from": version.effective_from,
        "version_status": version.version_status,
    }


@admin_router.post("/contracts/{contract_id}/activate")
async def activate_commercial_contract(
    contract_id: uuid.UUID,
    user: ActiveUser,
    db: DB,
    if_match: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
):
    organization_id = await _platform_contract_owner_organization(db, contract_id)
    async with TenantContextGuard.scoped(db, organization_id):
        from app.modules.billing.models.cloud_commercial import CommercialContract
        contract = await db.get(CommercialContract, contract_id)
        if not contract or not contract.invoice_id:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Commercial contract not found")
        activated = await CommercialContractService(db).activate_paid_contract(contract.invoice_id, if_match)
    if not activated:
        from fastapi import HTTPException
        raise HTTPException(status_code=409, detail="Contract invoice is not paid")
    await db.commit()
    return {"id": activated.id, "status": activated.status, "activated_at": activated.activated_at}


@admin_router.post("/contracts/{contract_id}/amend")
async def amend_commercial_contract(
    contract_id: uuid.UUID,
    payload: ContractAmendmentRequest,
    user: ActiveUser,
    db: DB,
    if_match: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
):
    organization_id = await _platform_contract_owner_organization(db, contract_id)
    async with TenantContextGuard.scoped(db, organization_id):
        amendment = await CommercialContractService(db).amend_contract(
            contract_id, payload, user.id, idempotency_key, if_match
        )
    await db.commit()
    return {
        "id": amendment.id,
        "contract_id": amendment.contract_id,
        "status": amendment.status,
        "target_offer_code": amendment.target_offer_code,
        "price_delta": amendment.price_delta,
        "gst_delta": amendment.gst_delta,
        "total_delta": amendment.total_delta,
        "invoice_id": amendment.invoice_id,
        "version": amendment.version,
    }


@admin_router.post("/contracts/{contract_id}/cancel")
async def cancel_admin_commercial_contract(
    contract_id: uuid.UUID,
    payload: ContractCancellationRequest,
    user: ActiveUser,
    db: DB,
    if_match: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
):
    organization_id = await _platform_contract_owner_organization(db, contract_id)
    async with TenantContextGuard.scoped(db, organization_id):
        cancelled = await CommercialLifecycleService(db).cancel_at_period_end(
            organization_id, contract_id, payload, user.id, if_match, idempotency_key
        )
    await db.commit()
    return {"id": cancelled.id, "status": cancelled.status, "cancel_at_period_end": cancelled.cancel_at_period_end, "ends_at": cancelled.ends_at, "version": cancelled.version}


@admin_router.post("/contracts/{contract_id}/renew")
async def renew_commercial_contract(
    contract_id: uuid.UUID,
    user: ActiveUser,
    db: DB,
    if_match: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
):
    organization_id = await _platform_contract_owner_organization(db, contract_id)
    async with TenantContextGuard.scoped(db, organization_id):
        contract, invoice = await CommercialContractService(db).renew_contract(contract_id, user.id, idempotency_key, expected_version=if_match)
    await db.commit()
    return {"contract_id": contract.id, "invoice_id": invoice.id, "status": contract.status, "total": invoice.total_amount_inr}
