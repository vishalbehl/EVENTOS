# tests/test_dashboard_analytics.py
from __future__ import annotations

import pytest
import uuid
from datetime import datetime, timezone, date, timedelta
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.events.models.event import Event
from app.modules.events.models.session import Session
from app.modules.events.models.speaker import Speaker
from app.modules.events.models.session_speaker import SessionSpeaker
from app.modules.events.models.room import Room
from app.modules.events.models.capacity_rule import CapacityRule
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_role import ParticipantRole
from app.modules.identity.models.user import User
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_dashboard_summary_flow(
    client: AsyncClient,
    db: AsyncSession,
    event: Event,
    organizer: User,
):
    # Setup roles and rules
    role = ParticipantRole(
        event_id=event.id,
        category="General",
        name="Delegate",
        role_code="DEL",
        is_default=True
    )
    db.add(role)
    
    rule = CapacityRule(
        event_id=event.id,
        capacity=100,
        waitlist_enabled=True,
        auto_promote=True
    )
    db.add(rule)
    await db.commit()

    # Add participants
    p1 = Participant(
        event_id=event.id,
        first_name="Alice",
        last_name="Smith",
        role_id=role.id,
        approval_status="Approved",
        paid_status="Paid"
    )
    p2 = Participant(
        event_id=event.id,
        first_name="Bob",
        last_name="Jones",
        role_id=role.id,
        approval_status="Pending",
        paid_status="Unpaid"
    )
    db.add_all([p1, p2])
    await db.commit()

    # Call summary endpoint
    headers = auth_headers(organizer)
    resp = await client.get(
        f"/dashboard/summary?event_id={event.id}",
        headers=headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "scorecards" in data
    
    # Assert registrations counts
    registrations = data["scorecards"]["registrations"]
    assert registrations["ready"] == 1  # Alice is Paid + Approved
    assert registrations["total"] == 100


@pytest.mark.asyncio
async def test_dashboard_registrations_timeline(
    client: AsyncClient,
    db: AsyncSession,
    event: Event,
    organizer: User,
):
    # Call timeline endpoint
    headers = auth_headers(organizer)
    resp = await client.get(
        f"/dashboard/registrations/timeline?event_id={event.id}",
        headers=headers
    )
    assert resp.status_code == 200
    timeline = resp.json()
    assert isinstance(timeline, list)
    assert len(timeline) >= 30


@pytest.mark.asyncio
async def test_dashboard_pending_actions(
    client: AsyncClient,
    db: AsyncSession,
    event: Event,
    organizer: User,
):
    # Call pending actions endpoint
    headers = auth_headers(organizer)
    resp = await client.get(
        f"/dashboard/pending-actions?event_id={event.id}",
        headers=headers
    )
    assert resp.status_code == 200
    actions = resp.json()
    assert isinstance(actions, list)
    assert len(actions) == 5


@pytest.mark.asyncio
async def test_dashboard_recent_activity(
    client: AsyncClient,
    db: AsyncSession,
    event: Event,
    organizer: User,
):
    # Call recent activity endpoint
    headers = auth_headers(organizer)
    resp = await client.get(
        f"/dashboard/recent-activity?event_id={event.id}",
        headers=headers
    )
    assert resp.status_code == 200
    activity = resp.json()
    assert isinstance(activity, list)
    assert len(activity) == 24


@pytest.mark.asyncio
async def test_dashboard_milestones_deadlines(
    client: AsyncClient,
    db: AsyncSession,
    event: Event,
    organizer: User,
):
    # Call deadlines endpoint
    headers = auth_headers(organizer)
    resp = await client.get(
        f"/dashboard/deadlines?event_id={event.id}",
        headers=headers
    )
    assert resp.status_code == 200
    deadlines = resp.json()
    assert isinstance(deadlines, list)
    assert len(deadlines) >= 2
