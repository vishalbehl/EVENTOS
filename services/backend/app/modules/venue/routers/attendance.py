# backend/app/routers/attendance.py
from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user, CurrentEvent
from app.core.dependencies.feature_gate import require_event_operation
from app.modules.analytics.models.attendance_log import AttendanceLog
from app.modules.audit.models.audit_log import AuditLog
from app.modules.identity.models.user import User
from app.modules.registration.models.check_in import AttendanceMutation, CheckIn
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.badge_models import Badge
from app.modules.events.models.session import Session
from app.modules.registration.services.checkin_service import CheckInService
from app.modules.venue.schemas.attendance import (
    CheckInRequest,
    CheckOutRequest,
    AttendanceLogResponse,
    AttendanceMetricsResponse,
)

router = APIRouter(prefix="/events/{event_id}/attendance", tags=["attendance"], dependencies=[require_event_operation("registration.checkin")])


async def resolve_participant_id(
    db: AsyncSession,
    event_id: uuid.UUID,
    participant_id: Optional[uuid.UUID] = None,
    badge_code: Optional[str] = None,
    nfc_uid: Optional[str] = None
) -> uuid.UUID:
    """
    Helper to resolve a participant ID from participant_id, badge_code, or nfc_uid.
    """
    if participant_id:
        p = await db.get(Participant, participant_id)
        if p and p.event_id == event_id:
            return p.id
    
    if badge_code:
        q = select(Badge).where(Badge.badge_code == badge_code)
        badge = (await db.execute(q)).scalar_one_or_none()
        if badge:
            p = await db.get(Participant, badge.participant_id)
            if p and p.event_id == event_id:
                return p.id

    if nfc_uid:
        q = select(Badge).where(Badge.nfc_uid == nfc_uid)
        badge = (await db.execute(q)).scalar_one_or_none()
        if badge:
            p = await db.get(Participant, badge.participant_id)
            if p and p.event_id == event_id:
                return p.id

    raise HTTPException(status_code=404, detail="Participant or Badge not found for this event.")


@router.post("/checkin", response_model=AttendanceLogResponse, status_code=status.HTTP_201_CREATED)
async def check_in_participant(
    payload: CheckInRequest,
    event: CurrentEvent,
    actor: User = Depends(get_current_user),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db)
):
    """
    Check in a participant to a session. Enforces session and room capacity constraints,
    updates both legacy check_ins and new attendance_logs.
    """
    p_id = await resolve_participant_id(
        db, event.id, payload.participant_id, payload.badge_code, payload.nfc_uid
    )

    if not payload.session_id:
        raise HTTPException(status_code=400, detail="session_id is required for check-in")

    request_hash = hashlib.sha256(
        f"CHECK_IN:{event.id}:{p_id}:{payload.session_id}:{payload.method}:{payload.device_id}".encode("utf-8")
    ).hexdigest()
    replay = await CheckInService.acquire_mutation(
        db,
        event=event,
        operation_type="CHECK_IN",
        idempotency_key=idempotency_key,
        request_hash=request_hash,
    )
    if replay:
        if replay.result_attendance_log_id is None:
            raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_RESULT_UNAVAILABLE"})
        replay_log = await db.get(AttendanceLog, replay.result_attendance_log_id)
        if replay_log is None:
            raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_RESULT_UNAVAILABLE"})
        return replay_log

    legacy, legacy_created = await CheckInService.create(db, event, p_id, payload.session_id)

    # Detailed attendance remains idempotent while the participant is checked in.
    q_log = select(AttendanceLog).where(
        AttendanceLog.participant_id == p_id,
        AttendanceLog.session_id == payload.session_id,
        AttendanceLog.checkout_time.is_(None)
    )
    log = (await db.execute(q_log)).scalar_one_or_none()
    if not log:
        log = AttendanceLog(
            participant_id=p_id,
            session_id=payload.session_id,
            method=payload.method,
            device_id=payload.device_id,
            checkin_time=datetime.now(timezone.utc)
        )
        db.add(log)

    await db.flush()
    db.add(AttendanceMutation(
        organization_id=event.organization_id,
        event_id=event.id,
        actor_user_id=actor.id,
        operation_type="CHECK_IN",
        idempotency_key=idempotency_key,
        request_hash=request_hash,
        result_checkin_id=legacy.id,
        result_attendance_log_id=log.id,
        result_created=legacy_created,
    ))
    db.add(AuditLog(
        organization_id=event.organization_id,
        actor_user_id=actor.id,
        actor_role=actor.platform_role or actor.role,
        resource_type="attendance_log",
        resource_id=log.id,
        action_type="ATTENDANCE_CHECKED_IN" if legacy_created else "ATTENDANCE_CHECKIN_RECORDED",
        new_state={
            "event_id": str(event.id),
            "participant_id": str(p_id),
            "session_id": str(payload.session_id),
            "method": payload.method,
            "device_id": payload.device_id,
        },
    ))

    await db.commit()
    await db.refresh(log)
    return log


@router.post("/checkout", response_model=AttendanceLogResponse)
async def check_out_participant(
    payload: CheckOutRequest,
    event: CurrentEvent,
    actor: User = Depends(get_current_user),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db)
):
    """
    Check out a participant from a session, logging duration.
    """
    p_id = await resolve_participant_id(
        db, event.id, payload.participant_id, payload.badge_code, payload.nfc_uid
    )

    if not payload.session_id:
        raise HTTPException(status_code=400, detail="session_id is required for check-out")

    request_hash = hashlib.sha256(
        f"CHECK_OUT:{event.id}:{p_id}:{payload.session_id}:{payload.device_id}".encode("utf-8")
    ).hexdigest()
    replay = await CheckInService.acquire_mutation(
        db,
        event=event,
        operation_type="CHECK_OUT",
        idempotency_key=idempotency_key,
        request_hash=request_hash,
    )
    if replay:
        if replay.result_attendance_log_id is None:
            raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_RESULT_UNAVAILABLE"})
        replay_log = await db.get(AttendanceLog, replay.result_attendance_log_id)
        if replay_log is None:
            raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_RESULT_UNAVAILABLE"})
        return replay_log

    # Find and lock the active check-in log.
    q = select(AttendanceLog).where(
        AttendanceLog.participant_id == p_id,
        AttendanceLog.session_id == payload.session_id,
        AttendanceLog.checkout_time.is_(None)
    ).with_for_update()
    log = (await db.execute(q)).scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="No active check-in found for this participant and session.")

    checkout_time = datetime.now(timezone.utc)
    duration_secs = (checkout_time - log.checkin_time).total_seconds()
    duration_mins = int(duration_secs / 60)

    log.checkout_time = checkout_time
    log.duration = duration_mins

    db.add(AttendanceMutation(
        organization_id=event.organization_id,
        event_id=event.id,
        actor_user_id=actor.id,
        operation_type="CHECK_OUT",
        idempotency_key=idempotency_key,
        request_hash=request_hash,
        result_attendance_log_id=log.id,
        result_created=False,
    ))
    db.add(AuditLog(
        organization_id=event.organization_id,
        actor_user_id=actor.id,
        actor_role=actor.platform_role or actor.role,
        resource_type="attendance_log",
        resource_id=log.id,
        action_type="ATTENDANCE_CHECKED_OUT",
        old_state={"checkout_time": None, "duration": None},
        new_state={
            "event_id": str(event.id),
            "participant_id": str(p_id),
            "session_id": str(payload.session_id),
            "checkout_time": checkout_time.isoformat(),
            "duration": duration_mins,
            "device_id": payload.device_id,
        },
    ))

    await db.commit()
    await db.refresh(log)
    return log


@router.get("", response_model=List[AttendanceLogResponse])
async def list_attendance_logs(
    event: CurrentEvent,
    session_id: Optional[uuid.UUID] = Query(None),
    participant_id: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """
    List all attendance logs, optionally filtered by session or participant.
    """
    q = select(AttendanceLog).join(Participant).where(Participant.event_id == event.id)
    if session_id:
        q = q.where(AttendanceLog.session_id == session_id)
    if participant_id:
        q = q.where(AttendanceLog.participant_id == participant_id)
    
    q = q.order_by(AttendanceLog.checkin_time.desc())
    result = await db.execute(q)
    return list(result.scalars().all())


@router.get("/metrics", response_model=AttendanceMetricsResponse)
async def get_attendance_metrics(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db)
):
    """
    Retrieve attendance metrics, rate percentages, no-show rates, and session occupancies.
    """
    # 1. Total registered participants
    q_reg = select(func.count(Participant.id)).where(Participant.event_id == event.id)
    total_reg = (await db.execute(q_reg)).scalar() or 0

    # 2. Total checked-in participants (distinct participants with at least one checkin record)
    q_ci = select(func.count(func.distinct(CheckIn.participant_id))).where(CheckIn.event_id == event.id)
    total_ci = (await db.execute(q_ci)).scalar() or 0

    # 3. Calculations
    rate = float(total_ci / total_reg) if total_reg > 0 else 0.0
    no_shows = total_reg - total_ci
    no_show_rate = float(no_shows / total_reg) if total_reg > 0 else 0.0

    # 4. Session occupancy (session name/id mapped to count of checkins)
    q_sessions = select(Session.id, Session.name, func.count(CheckIn.id)).outerjoin(
        CheckIn, CheckIn.session_id == Session.id
    ).where(Session.event_id == event.id).group_by(Session.id, Session.name)
    
    sess_res = await db.execute(q_sessions)
    session_occupancy = {}
    for s_id, name, count in sess_res:
        session_occupancy[name or str(s_id)] = count

    return AttendanceMetricsResponse(
        total_registered=total_reg,
        total_checked_in=total_ci,
        attendance_rate=rate,
        no_show_count=no_shows,
        no_show_rate=no_show_rate,
        session_occupancy=session_occupancy
    )
