from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.commercial.models import (
    CommercialQuote,
    CommercialQuoteLineItem,
    CommercialQuoteRevision,
)
from app.modules.commercial.quote_schemas import QuotePricingInput


MONEY = Decimal("0.01")


def money(value: Decimal) -> Decimal:
    return value.quantize(MONEY, rounding=ROUND_HALF_UP)


def calculate_quote(payload: QuotePricingInput) -> dict[str, Decimal]:
    subtotal = money(sum(
        (item.quantity * Decimal(item.duration_days) * item.unit_rate for item in payload.line_items),
        Decimal("0"),
    ))
    if payload.discount_type == "PERCENTAGE":
        discount_amount = money(subtotal * payload.discount_value / Decimal("100"))
    elif payload.discount_type == "FIXED":
        discount_amount = min(money(payload.discount_value), subtotal)
    else:
        discount_amount = Decimal("0.00")
    taxable_amount = money(subtotal - discount_amount)
    tax_amount = money(taxable_amount * payload.tax_rate / Decimal("100"))
    return {
        "subtotal": subtotal,
        "discount_amount": discount_amount,
        "taxable_amount": taxable_amount,
        "tax_amount": tax_amount,
        "total_amount": money(taxable_amount + tax_amount),
    }


def request_fingerprint(payload: dict) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def quote_snapshot(quote: CommercialQuote) -> dict:
    return {
        "quote_id": str(quote.id),
        "organization_id": str(quote.organization_id),
        "event_id": str(quote.event_id),
        "service_request_id": str(quote.service_request_id) if quote.service_request_id else None,
        "quote_number": quote.quote_number,
        "title": quote.title,
        "status": quote.status,
        "currency": quote.currency,
        "validity_days": quote.validity_days,
        "valid_until": quote.valid_until.isoformat() if quote.valid_until else None,
        "discount_type": quote.discount_type,
        "discount_value": str(quote.discount_value),
        "tax_rate": str(quote.tax_rate),
        "subtotal": str(quote.subtotal),
        "discount_amount": str(quote.discount_amount),
        "taxable_amount": str(quote.taxable_amount),
        "tax_amount": str(quote.tax_amount),
        "total_amount": str(quote.total_amount),
        "version": quote.version,
        "internal_notes": quote.internal_notes,
        "line_items": [
            {
                "category": item.category,
                "name": item.name,
                "description": item.description,
                "quantity": str(item.quantity),
                "duration_days": item.duration_days,
                "unit_rate": str(item.unit_rate),
                "line_subtotal": str(item.line_subtotal),
                "sort_order": item.sort_order,
            }
            for item in quote.line_items
        ],
    }


def apply_quote_payload(quote: CommercialQuote, payload: QuotePricingInput) -> None:
    totals = calculate_quote(payload)
    quote.discount_type = payload.discount_type
    quote.discount_value = totals["discount_amount"] if payload.discount_type == "FIXED" else payload.discount_value
    quote.tax_rate = payload.tax_rate
    quote.subtotal = totals["subtotal"]
    quote.discount_amount = totals["discount_amount"]
    quote.taxable_amount = totals["taxable_amount"]
    quote.tax_amount = totals["tax_amount"]
    quote.total_amount = totals["total_amount"]
    quote.line_items = [
        CommercialQuoteLineItem(
            category=item.category,
            name=item.name,
            description=item.description,
            quantity=item.quantity,
            duration_days=item.duration_days,
            unit_rate=item.unit_rate,
            line_subtotal=money(item.quantity * Decimal(item.duration_days) * item.unit_rate),
            sort_order=index,
        )
        for index, item in enumerate(payload.line_items)
    ]


async def load_quote(
    db: AsyncSession,
    quote_id: uuid.UUID,
    organization_id: uuid.UUID,
    *,
    for_update: bool = False,
) -> CommercialQuote | None:
    query = (
        select(CommercialQuote)
        .options(selectinload(CommercialQuote.line_items))
        .where(CommercialQuote.id == quote_id, CommercialQuote.organization_id == organization_id)
    )
    if for_update:
        query = query.with_for_update()
    return await db.scalar(query)


def new_quote_number() -> str:
    return f"QTE-{datetime.now(timezone.utc):%Y%m%d}-{uuid.uuid4().hex[:8].upper()}"


def validity_deadline(days: int) -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=days)


def add_revision(
    db: AsyncSession,
    quote: CommercialQuote,
    actor_id: uuid.UUID,
    reason: str,
) -> CommercialQuoteRevision:
    revision = CommercialQuoteRevision(
        quote_id=quote.id,
        organization_id=quote.organization_id,
        version=quote.version,
        snapshot_json=quote_snapshot(quote),
        reason=reason,
        created_by=actor_id,
    )
    db.add(revision)
    return revision
