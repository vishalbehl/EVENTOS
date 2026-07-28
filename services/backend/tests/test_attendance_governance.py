from __future__ import annotations

import uuid
import asyncio

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models.audit_log import AuditLog
from app.modules.events.models.capacity_rule import CapacityRule
from app.modules.events.models.event import Event
from app.modules.events.models.session import Session
from app.modules.identity.models.user import User
from app.modules.registration.models.check_in import AttendanceMutation, CheckIn
from app.modules.registration.models.participant import Participant
from app.modules.registration.routers.participants import checkin_participant
from app.modules.registration.schemas.participant import CheckInCreate
from tests.conftest import activate_event_for_test
from app.modules.billing.services.event_entitlement_service import EventEntitlementService
from app.modules.platform.models.platform_domain_tables import FeatureFlag


async def _participant(db: AsyncSession, event: Event, suffix: str) -> Participant:
    row = Participant(
        event_id=event.id,
        regno=f"CHK-{suffix}",
        name=f"Check-in {suffix}",
        email=f"checkin-{suffix}@example.test",
        role="Delegate",
        paid_status="Paid",
    )
    db.add(row)
    await db.flush()
    return row


@pytest.mark.asyncio
async def test_participant_checkin_is_durably_idempotent_and_audited(
    db: AsyncSession,
    event: Event,
    session_obj: Session,
    organizer: User,
):
    await activate_event_for_test(db, event)
    participant = await _participant(db, event, uuid.uuid4().hex[:8])
    await db.commit()

    key = f"checkin-{uuid.uuid4()}"
    payload = CheckInCreate(session_id=session_obj.id)
    created = await checkin_participant(
        participant_id=participant.id,
        payload=payload,
        event=event,
        current_user=organizer,
        idempotency_key=key,
        db=db,
    )
    replayed = await checkin_participant(
        participant_id=participant.id,
        payload=payload,
        event=event,
        current_user=organizer,
        idempotency_key=key,
        db=db,
    )

    assert replayed.id == created.id
    assert await db.scalar(select(func.count(CheckIn.id)).where(CheckIn.id == created.id)) == 1
    mutation = await db.scalar(select(AttendanceMutation).where(AttendanceMutation.idempotency_key == key))
    assert mutation is not None
    assert mutation.result_checkin_id == created.id
    audit = await db.scalar(select(AuditLog).where(
        AuditLog.resource_id == created.id,
        AuditLog.action_type == "PARTICIPANT_CHECKED_IN",
    ))
    assert audit is not None


@pytest.mark.asyncio
async def test_participant_checkin_rejects_idempotency_conflict_and_capacity_overflow(
    db: AsyncSession,
    event: Event,
    session_obj: Session,
    organizer: User,
):
    await activate_event_for_test(db, event)
    first = await _participant(db, event, uuid.uuid4().hex[:8])
    second = await _participant(db, event, uuid.uuid4().hex[:8])
    db.add(CapacityRule(event_id=event.id, session_id=session_obj.id, capacity=1))
    await db.commit()

    key = f"checkin-{uuid.uuid4()}"
    await checkin_participant(
        participant_id=first.id,
        payload=CheckInCreate(session_id=session_obj.id),
        event=event,
        current_user=organizer,
        idempotency_key=key,
        db=db,
    )

    with pytest.raises(HTTPException) as conflict:
        await checkin_participant(
            participant_id=second.id,
            payload=CheckInCreate(session_id=session_obj.id),
            event=event,
            current_user=organizer,
            idempotency_key=key,
            db=db,
        )
    assert conflict.value.status_code == 409
    assert conflict.value.detail["code"] == "IDEMPOTENCY_CONFLICT"
    with pytest.raises(HTTPException) as exhausted:
        await checkin_participant(
            participant_id=second.id,
            payload=CheckInCreate(session_id=session_obj.id),
            event=event,
            current_user=organizer,
            idempotency_key=f"checkin-{uuid.uuid4()}",
            db=db,
        )
    assert exhausted.value.status_code == 409
    assert exhausted.value.detail["code"] == "QUOTA_EXHAUSTED"


@pytest.mark.asyncio
async def test_canonical_entitlement_flag_resolves_without_legacy_fallback(
    db: AsyncSession,
    event: Event,
):
    await activate_event_for_test(db, event)
    db.add(FeatureFlag(
        organization_id=event.organization_id,
        flag_key="organizer_console_entitlement_enforce",
        is_enabled=True,
    ))
    await db.commit()
    resolved = await asyncio.wait_for(
        EventEntitlementService.resolve(db, event.organization_id, event.id, explain=True),
        timeout=10,
    )
    assert resolved["rollout_mode"] == "ENFORCED"
    assert resolved["availability"]["available"] is True
