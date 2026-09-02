"""Read-only source aggregation and durable event registration projection."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.analytics.models.event_registration_summary import EventRegistrationSummary
from app.modules.events.models.event import Event
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.registration.models.payment_transaction import PaymentTransaction


async def refresh_event_registration_summary(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    event_id: uuid.UUID,
) -> EventRegistrationSummary | None:
    """Rebuild one event projection without committing the caller's transaction."""
    event = await db.scalar(
        select(Event.id).where(
            Event.id == event_id,
            Event.organization_id == organization_id,
            Event.deleted_at.is_(None),
        )
    )
    if event is None:
        return None

    # Scalar subqueries keep participant/registration/payment counts independent,
    # preventing many-to-many join multiplication in financial totals.
    participant_count = select(func.count(Participant.id)).where(
        Participant.event_id == event_id, Participant.deleted_at.is_(None)
    ).scalar_subquery()
    approved_participant_count = select(func.count(Participant.id)).where(
        Participant.event_id == event_id,
        Participant.deleted_at.is_(None),
        Participant.approval_status == "Approved",
    ).scalar_subquery()
    paid_participant_count = select(func.count(Participant.id)).where(
        Participant.event_id == event_id,
        Participant.deleted_at.is_(None),
        Participant.paid_status == "Paid",
    ).scalar_subquery()
    registration_count = select(func.count(ParticipantRegistration.id)).where(
        ParticipantRegistration.event_id == event_id,
        ParticipantRegistration.deleted_at.is_(None),
    ).scalar_subquery()
    approved_registration_count = select(func.count(ParticipantRegistration.id)).where(
        ParticipantRegistration.event_id == event_id,
        ParticipantRegistration.deleted_at.is_(None),
        ParticipantRegistration.registration_status == "approved",
    ).scalar_subquery()
    waitlisted_registration_count = select(func.count(ParticipantRegistration.id)).where(
        ParticipantRegistration.event_id == event_id,
        ParticipantRegistration.deleted_at.is_(None),
        ParticipantRegistration.registration_status == "waitlisted",
    ).scalar_subquery()
    payment_count = select(func.count(PaymentTransaction.id)).where(
        PaymentTransaction.event_id == event_id,
        PaymentTransaction.status == "completed",
    ).scalar_subquery()
    payment_total = select(func.coalesce(func.sum(PaymentTransaction.amount), 0)).where(
        PaymentTransaction.event_id == event_id,
        PaymentTransaction.status == "completed",
    ).scalar_subquery()
    status_rows = await db.execute(
        select(
            ParticipantRegistration.registration_status,
            func.count(ParticipantRegistration.id),
        ).where(
            ParticipantRegistration.event_id == event_id,
            ParticipantRegistration.deleted_at.is_(None),
        ).group_by(ParticipantRegistration.registration_status)
    )
    status_counts = {str(status or "unknown"): int(count or 0) for status, count in status_rows.all()}
    row = await db.execute(select(
        participant_count.label("participant_count"),
        approved_participant_count.label("approved_participant_count"),
        paid_participant_count.label("paid_participant_count"),
        registration_count.label("registration_count"),
        approved_registration_count.label("approved_registration_count"),
        waitlisted_registration_count.label("waitlisted_registration_count"),
        payment_count.label("completed_payment_count"),
        payment_total.label("completed_payment_total"),
    ))
    values = row.one()
    now = datetime.now(timezone.utc)
    projection = await db.get(EventRegistrationSummary, event_id)
    if projection is None:
        projection = EventRegistrationSummary(event_id=event_id, organization_id=organization_id)
        db.add(projection)
    elif projection.organization_id != organization_id:
        return None
    for field in (
        "participant_count", "approved_participant_count", "paid_participant_count",
        "registration_count", "approved_registration_count", "waitlisted_registration_count",
        "completed_payment_count", "completed_payment_total",
    ):
        setattr(projection, field, getattr(values, field) or 0)
    projection.registration_status_counts = status_counts
    projection.freshness_at = now
    projection.rebuild_status = "ready"
    projection.last_error = None
    projection.updated_at = now
    return projection
