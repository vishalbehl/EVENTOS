"""Read-only source aggregation and durable event payment projection."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.analytics.models.event_payment_summary import EventPaymentSummary
from app.modules.events.models.event import Event
from app.modules.registration.models.payment_transaction import PaymentTransaction


async def refresh_event_payment_summary(
    db: AsyncSession, *, organization_id: uuid.UUID, event_id: uuid.UUID
) -> EventPaymentSummary | None:
    exists = await db.scalar(
        select(Event.id).where(
            Event.id == event_id,
            Event.organization_id == organization_id,
            Event.deleted_at.is_(None),
        )
    )
    if exists is None:
        return None
    values = (
        await db.execute(
            select(
                func.count(PaymentTransaction.id).label("transaction_count"),
                func.count(case((PaymentTransaction.status == "completed", 1))).label("completed_count"),
                func.count(case((PaymentTransaction.status.in_(("refunded", "refund")), 1))).label("refunded_count"),
                func.coalesce(func.sum(PaymentTransaction.amount), 0).label("gross_total"),
                func.coalesce(func.sum(case((PaymentTransaction.status == "completed", PaymentTransaction.amount), else_=0)), 0).label("completed_total"),
                func.coalesce(func.sum(case((PaymentTransaction.status.in_(("refunded", "refund")), PaymentTransaction.amount), else_=0)), 0).label("refunded_total"),
            ).where(PaymentTransaction.event_id == event_id)
        )
    ).mappings().one()
    projection = await db.get(EventPaymentSummary, event_id)
    if projection is None:
        projection = EventPaymentSummary(event_id=event_id, organization_id=organization_id)
        db.add(projection)
    elif projection.organization_id != organization_id:
        return None
    for field in (
        "transaction_count", "completed_count", "refunded_count",
        "gross_total", "completed_total", "refunded_total",
    ):
        setattr(projection, field, values[field] or 0)
    now = datetime.now(timezone.utc)
    projection.freshness_at = now
    projection.updated_at = now
    projection.rebuild_status = "ready"
    projection.last_error = None
    return projection
