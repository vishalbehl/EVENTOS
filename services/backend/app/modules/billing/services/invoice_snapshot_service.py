"""Build the allowlisted, tenant-owned snapshot consumed by invoice PDFs."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.billing.models.billing_domain_tables import (
    Invoice,
    InvoiceItem,
    OrganizationBillingProfile,
)
from app.modules.billing.models.cloud_commercial import (
    CommercialAccount,
    CommercialContract,
    CommercialContractItem,
    CommercialOffer,
)
from app.modules.billing.services.invoice_pdf_service import invoice_issuer_from_settings
from app.modules.events.models.event import Event
from app.modules.platform.models.organization import Organization


def _money(value: Any) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))


def _iso(value: date | datetime | None) -> str | None:
    return value.isoformat() if value else None


def _address(organization: Organization) -> str:
    raw = organization.billing_address or {}
    parts = [
        raw.get("line1"), raw.get("line2"), raw.get("city"), raw.get("state"),
        raw.get("postal_code"), raw.get("country"),
    ]
    normalized = [str(value).strip() for value in parts if str(value or "").strip()]
    return ", ".join(normalized) or "Address not recorded"


def _period(
    contract_item: CommercialContractItem | None,
    contract: CommercialContract | None,
    event: Event | None,
) -> str:
    if event is not None:
        return f"Event: {event.name}\n{event.start_date.strftime('%d %b %Y')} - {event.end_date.strftime('%d %b %Y')}"
    snapshot = (contract_item.allocation_snapshot_json if contract_item else None) or {}
    valid_from = snapshot.get("valid_from")
    valid_until = snapshot.get("valid_until")
    if valid_from or valid_until:
        return f"{valid_from or 'Start'} - {valid_until or 'Ongoing'}"
    if contract is not None:
        start = contract.starts_at.strftime("%d %b %Y")
        end = contract.ends_at.strftime("%d %b %Y") if contract.ends_at else "Ongoing"
        return f"{start} - {end}"
    return "As contracted"


def _entitlement_label(key: str) -> str:
    aliases = {
        "active_events": "Active Events",
        "team_members": "Team Members",
        "registrations": "Registrations",
        "storage_gb": "Storage",
        "email_credits": "Email Credits",
        "venue_events": "Venue Events",
    }
    return aliases.get(key, key.replace("_", " ").title())


def _entitlement_value(entitlement: dict[str, Any]) -> str:
    quantity = entitlement.get("quantity")
    unit = str(entitlement.get("unit_type") or "").replace("_", " ")
    if quantity is None:
        return "Included"
    if str(quantity).strip().lower() in {"infinite", "infinity", "unlimited", "inf"}:
        return "Unlimited"
    try:
        numeric = Decimal(str(quantity))
        display = f"{int(numeric):,}" if numeric == numeric.to_integral_value() else f"{numeric:,}"
    except (InvalidOperation, ValueError):
        display = str(quantity)
    return f"{display} {unit}".strip()


async def build_invoice_pdf_snapshot(
    db: AsyncSession,
    *,
    organization: Organization,
    invoice: Invoice,
    settings: Any,
) -> dict[str, Any]:
    """Build one bounded invoice snapshot after tenant ownership is proven."""

    if invoice.organization_id != organization.id:
        raise ValueError("Invoice does not belong to the selected organization")

    billing_profile = await db.scalar(
        select(OrganizationBillingProfile).where(
            OrganizationBillingProfile.organization_id == organization.id
        )
    )
    items = list(
        (
            await db.scalars(
                select(InvoiceItem)
                .where(InvoiceItem.invoice_id == invoice.id)
                .order_by(InvoiceItem.id.asc())
                .limit(100)
            )
        ).all()
    )
    contract_item_ids = [
        item.commercial_contract_item_id
        for item in items
        if item.commercial_contract_item_id is not None
    ]
    contract_item_rows = list(
        (
            await db.execute(
                select(CommercialContractItem, CommercialOffer)
                .join(CommercialOffer, CommercialOffer.id == CommercialContractItem.offer_id)
                .where(CommercialContractItem.id.in_(contract_item_ids))
            )
        ).all()
    ) if contract_item_ids else []
    contract_items = [row[0] for row in contract_item_rows]
    contract_item_by_id = {item.id: item for item in contract_items}
    offer_by_contract_item_id = {row[0].id: row[1] for row in contract_item_rows}
    contract_ids = {item.contract_id for item in contract_items}
    contracts = list(
        (
            await db.scalars(
                select(CommercialContract).where(
                    CommercialContract.commercial_account_id.in_(
                        select(CommercialAccount.id).where(
                            CommercialAccount.owner_organization_id == organization.id
                        )
                    ),
                    CommercialContract.id.in_(contract_ids),
                )
            )
        ).all()
    ) if contract_ids else []
    contract_by_id = {contract.id: contract for contract in contracts}
    event_ids: set[uuid.UUID] = {
        item.event_id for item in contract_items if item.event_id is not None
    }
    if invoice.event_id is not None:
        event_ids.add(invoice.event_id)
    events = list((await db.scalars(select(Event).where(
        Event.organization_id == organization.id,
        Event.id.in_(event_ids),
    ))).all()) if event_ids else []
    event_by_id = {event.id: event for event in events}

    item_projection: list[dict[str, Any]] = []
    plan_summary: dict[str, str] = {}
    for item in items:
        contract_item = contract_item_by_id.get(item.commercial_contract_item_id)
        offer = offer_by_contract_item_id.get(item.commercial_contract_item_id)
        contract = contract_by_id.get(contract_item.contract_id) if contract_item else None
        event = event_by_id.get(contract_item.event_id) if contract_item and contract_item.event_id else None
        quantity = max(int(item.quantity or 1), 1)
        line_amount = _money(item.amount)
        unit_price = _money(contract_item.unit_price if contract_item else line_amount / quantity)
        item_projection.append({
            "name": (offer.display_name or offer.name) if offer else item.description,
            "description": item.description,
            "offer_code": item.commercial_offer_code,
            "offer_version_id": str(item.commercial_offer_version_id) if item.commercial_offer_version_id else None,
            "quantity": quantity,
            "unit_price": str(unit_price),
            "amount": str(line_amount),
            "period": _period(contract_item, contract, event),
            "event_name": event.name if event else None,
        })
        entitlement_snapshot = (
            (contract_item.allocation_snapshot_json or {}).get("entitlements", [])
            if contract_item else []
        )
        if isinstance(entitlement_snapshot, dict):
            entitlement_snapshot = [
                {"key": key, "quantity": value}
                for key, value in entitlement_snapshot.items()
            ]
        for entitlement in entitlement_snapshot:
            if not isinstance(entitlement, dict):
                continue
            key = str(entitlement.get("key") or entitlement.get("entitlement_key") or "").strip()
            if key and key not in plan_summary:
                plan_summary[key] = _entitlement_value(entitlement)

    if not item_projection:
        item_projection.append({
            "name": "Invoice charge",
            "description": "EventOS platform services",
            "offer_code": None,
            "quantity": 1,
            "unit_price": str(_money(invoice.amount)),
            "amount": str(_money(invoice.amount)),
            "period": "As invoiced",
        })

    tax_rate = next((item.tax_rate for item in items if item.tax_rate is not None), Decimal("18"))
    buyer_name = (
        billing_profile.billing_name if billing_profile else None
    ) or organization.legal_name or organization.name
    buyer_gstin = billing_profile.gst_number if billing_profile else None
    snapshot = {
        "snapshot_version": 1,
        "invoice_id": str(invoice.id),
        "invoice_version": invoice.version,
        "invoice_number": invoice.invoice_number or invoice.stripe_invoice_id or f"INV-{str(invoice.id)[:8].upper()}",
        "issued_at": _iso(invoice.issued_at),
        "due_date": _iso(invoice.due_date),
        "paid_at": _iso(invoice.paid_at),
        "status": invoice.status,
        "currency": invoice.currency or "INR",
        "amount": str(_money(invoice.amount)),
        "gst_amount": str(_money(invoice.gst_amount)),
        "total_amount": str(_money(invoice.total_amount_inr or invoice.amount)),
        "tax_label": f"GST ({_money(tax_rate).normalize()}%)",
        "buyer": {
            "name": buyer_name,
            "address": _address(organization),
            "gstin": buyer_gstin or "Not registered",
            "email": (billing_profile.billing_email if billing_profile else None) or organization.billing_email,
            "phone": (billing_profile.billing_phone if billing_profile else None) or organization.contact_phone,
        },
        "issuer": invoice_issuer_from_settings(settings),
        "items": item_projection,
        "plan_summary": [
            {"label": _entitlement_label(key), "value": value}
            for key, value in list(plan_summary.items())[:6]
        ],
        "payment_mode": "Online - payment gateway" if invoice.stripe_invoice_id else "Online payment",
        "payment_reference": invoice.stripe_invoice_id,
        "notes": [
            "This system-generated invoice includes a certificate-backed digital signature when configured.",
            "Plans, add-ons and licences apply only for the period shown above.",
            "Additional terms are governed by the EventOS Terms of Service.",
        ],
    }
    return snapshot

