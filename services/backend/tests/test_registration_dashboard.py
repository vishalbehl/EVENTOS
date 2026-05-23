# tests/test_registration_dashboard.py
from __future__ import annotations

import pytest
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.rbac.models.event import Event
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.check_in import CheckIn
from app.modules.speakers.models.session import Session
from app.modules.registration.models.ticket_type import TicketType
from app.modules.registration.routers.participants import get_registration_analytics


@pytest.mark.asyncio
async def test_get_registration_analytics_dashboard(
    db: AsyncSession,
    event: Event,
    session_obj: Session,
):
    # 0. Set event location to specify local country
    event.location = "Mumbai, India"
    db.add(event)
    await db.flush()

    # 1. Seed Ticket Types for pricing matrix
    ticket_std = TicketType(
        event_id=event.id,
        role_name="Delegate",
        tier_name="Standard",
        price=120.0
    )
    ticket_vip = TicketType(
        event_id=event.id,
        role_name="VIP",
        tier_name="Standard",
        price=300.0
    )
    db.add_all([ticket_std, ticket_vip])
    await db.flush()

    # 2. Seed Participants
    p1 = Participant(
        event_id=event.id,
        regno="DEL-0001",
        name="Participant One",
        role="Delegate",
        paid_status="Paid",
        country="India",
        source="online_registration",
        registered_at=datetime(2026, 5, 23, 10, 0, tzinfo=timezone.utc),
    )
    p2 = Participant(
        event_id=event.id,
        regno="VIP-0001",
        name="Participant Two (VIP)",
        role="VIP",
        paid_status="Paid",
        country="US",
        source="excel_import",
        registered_at=datetime(2026, 5, 23, 11, 0, tzinfo=timezone.utc),
    )
    p3 = Participant(
        event_id=event.id,
        regno="DEL-0002",
        name="Participant Three",
        role="Delegate",
        paid_status="Unpaid",
        country="India",
        source="online_registration",
        registered_at=datetime(2026, 5, 22, 9, 0, tzinfo=timezone.utc),
    )
    db.add_all([p1, p2, p3])
    await db.flush()

    # 3. Seed check-ins
    c1 = CheckIn(
        event_id=event.id,
        participant_id=p1.id,
        session_id=session_obj.id,
        check_in_time=datetime.now(timezone.utc)
    )
    db.add(c1)
    await db.commit()

    # 4. Request analytics directly by calling route function
    data = await get_registration_analytics(event=event, db=db)
    
    # 5. Assert KPIs
    kpis = data["kpis"]
    assert kpis["total_registrations"] == 3
    assert kpis["checked_in_attendees"] == 1
    assert kpis["pending_payments"] == 1  # p3 is Unpaid
    assert kpis["confirmed_attendees"] == 2  # p1, p2 are Paid
    assert kpis["vip_attendees"] == 1  # p2 is VIP
    assert kpis["international_attendees"] == 1  # p2 is US (not India/event location)
    
    # Revenue: p1 (Delegate) price 120.0 + p2 (VIP) price 300.0 = 420.0
    assert kpis["total_revenue"] == 420.0

    # Assert breakdowns
    assert len(data["growth_trends"]) > 0
    assert len(data["participant_type_distribution"]) > 0
    assert len(data["registration_source_tracking"]) > 0
    assert len(data["payment_status_analytics"]) > 0
    assert len(data["country_registrations"]) > 0
