from __future__ import annotations

import uuid

from sqlalchemy import Date, and_, case, cast, extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.registration.models.check_in import CheckIn
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.registration.models.participant_role import ParticipantRole
from app.modules.registration.models.payment_transaction import PaymentTransaction
from app.modules.registration.models.ticket_type import TicketType


class ParticipantAnalyticsQueryService:
    """Read-only analytics projection for one verified event."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def dashboard(self, *, event_id: uuid.UUID, location: str | None) -> dict:
        local_country = "India"
        if location and "," in location:
            local_country = location.rsplit(",", 1)[-1].strip() or local_country

        counts = (
            await self.db.execute(
                select(
                    func.count(Participant.id),
                    select(func.count(func.distinct(CheckIn.participant_id)))
                    .where(CheckIn.event_id == event_id)
                    .scalar_subquery(),
                    func.count(Participant.id).filter(
                        Participant.paid_status.in_(["Unpaid", "Pending"])
                    ),
                    func.count(Participant.id).filter(Participant.paid_status == "Paid"),
                    func.count(Participant.id).filter(Participant.role == "VIP"),
                    func.count(Participant.id).filter(Participant.role == "Student"),
                    func.count(Participant.id).filter(
                        Participant.country.is_not(None),
                        Participant.country != "",
                        ~Participant.country.ilike(f"%{local_country}%"),
                    ),
                    func.count(Participant.id).filter(
                        Participant.paid_status.in_(["Cancelled", "Canceled"])
                    ),
                    func.count(Participant.id).filter(
                        Participant.paid_status.in_(["Refunded", "Refund Requested", "Pending Refund"])
                    ),
                )
                .select_from(Participant)
                .where(Participant.event_id == event_id, Participant.deleted_at.is_(None))
            )
        ).one()

        pricing_rows = (
            await self.db.execute(
                select(TicketType.role_name, TicketType.price).where(TicketType.event_id == event_id)
            )
        ).all()
        pricing_matrix = {str(role).lower(): price for role, price in pricing_rows if role}

        revenue_rows = (
            await self.db.execute(
                select(Participant.role, PaymentTransaction.amount)
                .select_from(Participant)
                .outerjoin(
                    ParticipantRegistration,
                    ParticipantRegistration.participant_id == Participant.id,
                )
                .outerjoin(
                    PaymentTransaction,
                    and_(
                        PaymentTransaction.registration_id == ParticipantRegistration.id,
                        PaymentTransaction.status == "completed",
                    ),
                )
                .where(
                    Participant.event_id == event_id,
                    Participant.paid_status == "Paid",
                    Participant.deleted_at.is_(None),
                )
            )
        ).all()
        total_revenue = 0.0
        for role_name, amount in revenue_rows:
            if amount is not None:
                total_revenue += float(amount)
                continue
            role_key = (role_name or "delegate").lower().strip()
            fallback = 0.0 if "free" in role_key or "complimentary" in role_key else pricing_matrix.get(role_key, 0.0)
            total_revenue += float(fallback or 0.0)

        growth_rows = (
            await self.db.execute(
                select(cast(Participant.registered_at, Date), func.count(Participant.id))
                .where(Participant.event_id == event_id, Participant.deleted_at.is_(None))
                .group_by(cast(Participant.registered_at, Date))
                .order_by(cast(Participant.registered_at, Date))
            )
        ).all()
        role_rows = (
            await self.db.execute(
                select(ParticipantRole.name, func.count(Participant.id))
                .select_from(Participant)
                .outerjoin(ParticipantRole, ParticipantRole.id == Participant.role_id)
                .where(Participant.event_id == event_id, Participant.deleted_at.is_(None))
                .group_by(ParticipantRole.name)
            )
        ).all()
        source_rows = (
            await self.db.execute(
                select(Participant.source, func.count(Participant.id))
                .where(Participant.event_id == event_id, Participant.deleted_at.is_(None))
                .group_by(Participant.source)
            )
        ).all()
        payment_rows = (
            await self.db.execute(
                select(Participant.paid_status, func.count(Participant.id))
                .where(Participant.event_id == event_id, Participant.deleted_at.is_(None))
                .group_by(Participant.paid_status)
            )
        ).all()
        country_rows = (
            await self.db.execute(
                select(Participant.country, func.count(Participant.id))
                .where(
                    Participant.event_id == event_id,
                    Participant.deleted_at.is_(None),
                    Participant.country.is_not(None),
                    Participant.country != "",
                )
                .group_by(Participant.country)
            )
        ).all()
        heatmap_rows = (
            await self.db.execute(
                select(
                    extract("dow", Participant.registered_at),
                    extract("hour", Participant.registered_at),
                    func.count(Participant.id),
                )
                .where(Participant.event_id == event_id, Participant.deleted_at.is_(None))
                .group_by(
                    extract("dow", Participant.registered_at),
                    extract("hour", Participant.registered_at),
                )
            )
        ).all()

        return {
            "kpis": {
                "total_registrations": counts[0],
                "checked_in_attendees": counts[1],
                "pending_payments": counts[2],
                "confirmed_attendees": counts[3],
                "vip_attendees": counts[4],
                "student_registrations": counts[5],
                "international_attendees": counts[6],
                "cancellations": counts[7],
                "total_revenue": total_revenue,
                "refund_requests": counts[8],
            },
            "growth_trends": [{"date": str(date), "count": count} for date, count in growth_rows],
            "participant_type_distribution": [
                {"role": name or "Delegate", "count": count} for name, count in role_rows
            ],
            "registration_source_tracking": [
                {"source": source or "Unknown", "count": count} for source, count in source_rows
            ],
            "payment_status_analytics": [
                {"status": status or "Unpaid", "count": count} for status, count in payment_rows
            ],
            "country_registrations": [
                {"country": country, "count": count} for country, count in country_rows
            ],
            "daily_heatmap": [
                {"day": int(day), "hour": int(hour), "count": count}
                for day, hour, count in heatmap_rows
            ],
        }
