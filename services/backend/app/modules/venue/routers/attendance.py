# backend/app/routers/attendance.py
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_event, CurrentEvent, AdminOrAbove
from app.modules.analytics.models.attendance_log import AttendanceLog
from app.modules.registration.models.check_in import CheckIn
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.badge_models import Badge
from app.modules.events.models.session import Session
from app.modules.events.models.capacity_rule import CapacityRule
from app.modules.venue.schemas.attendance import (
    CheckInRequest,
    CheckOutRequest,
    AttendanceLogResponse,
    AttendanceMetricsResponse,
)

router = APIRouter(prefix="/events/{event_id}/attendance", tags=["attendance"])


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
    event_id: uuid.UUID,
    payload: CheckInRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Check in a participant to a session. Enforces session and room capacity constraints,
    updates both legacy check_ins and new attendance_logs.
    """
    p_id = await resolve_participant_id(
        db, event_id, payload.participant_id, payload.badge_code, payload.nfc_uid
    )

    if not payload.session_id:
        raise HTTPException(status_code=400, detail="session_id is required for check-in")

    session = await db.get(Session, payload.session_id)
    if not session or session.event_id != event_id:
        raise HTTPException(status_code=404, detail="Session not found for this event")

    # 1. Enforce Capacity Rules (Lowest wins)
    # Check Session Rule
    q_sess_rule = select(CapacityRule).where(
        CapacityRule.event_id == event_id,
        CapacityRule.session_id == session.id
    )
    sess_rule = (await db.execute(q_sess_rule)).scalar_one_or_none()
    if sess_rule:
        # Check current occupancy in session
        q_occ = select(func.count(CheckIn.id)).where(CheckIn.session_id == session.id)
        current_occ = (await db.execute(q_occ)).scalar() or 0
        if current_occ >= sess_rule.capacity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Check-in failed. Session capacity ({sess_rule.capacity}) exceeded."
            )

    # Check Room Rule
    if session.room_id:
        q_room_rule = select(CapacityRule).where(
            CapacityRule.event_id == event_id,
            CapacityRule.room_id == session.room_id
        )
        room_rule = (await db.execute(q_room_rule)).scalar_one_or_none()
        if room_rule:
            # Check room occupancy (all sessions checked in in this room)
            q_occ = select(func.count(CheckIn.id)).join(Session).where(
                Session.room_id == session.room_id
            )
            current_occ = (await db.execute(q_occ)).scalar() or 0
            if current_occ >= room_rule.capacity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Check-in failed. Room capacity ({room_rule.capacity}) exceeded."
                )

    # 2. Add to legacy check_ins (idempotent)
    q_legacy = select(CheckIn).where(
        CheckIn.event_id == event_id,
        CheckIn.participant_id == p_id,
        CheckIn.session_id == session.id
    )
    legacy = (await db.execute(q_legacy)).scalar_one_or_none()
    if not legacy:
        legacy = CheckIn(
            event_id=event_id,
            participant_id=p_id,
            session_id=session.id
        )
        db.add(legacy)

    # 3. Add to attendance_logs (idempotent for active sessions)
    q_log = select(AttendanceLog).where(
        AttendanceLog.participant_id == p_id,
        AttendanceLog.session_id == session.id,
        AttendanceLog.checkout_time.is_(None)
    )
    log = (await db.execute(q_log)).scalar_one_or_none()
    if not log:
        log = AttendanceLog(
            participant_id=p_id,
            session_id=session.id,
            method=payload.method,
            device_id=payload.device_id,
            checkin_time=datetime.now(timezone.utc)
        )
        db.add(log)

    await db.commit()
    await db.refresh(log)
    return log


@router.post("/checkout", response_model=AttendanceLogResponse)
async def check_out_participant(
    event_id: uuid.UUID,
    payload: CheckOutRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Check out a participant from a session, logging duration.
    """
    p_id = await resolve_participant_id(
        db, event_id, payload.participant_id, payload.badge_code, payload.nfc_uid
    )

    if not payload.session_id:
        raise HTTPException(status_code=400, detail="session_id is required for check-out")

    # Find the active check-in log
    q = select(AttendanceLog).where(
        AttendanceLog.participant_id == p_id,
        AttendanceLog.session_id == payload.session_id,
        AttendanceLog.checkout_time.is_(None)
    )
    log = (await db.execute(q)).scalar_one_or_none()
    if not log:
        raise HTTPException(status_code=404, detail="No active check-in found for this participant and session.")

    checkout_time = datetime.now(timezone.utc)
    duration_secs = (checkout_time - log.checkin_time).total_seconds()
    duration_mins = int(duration_secs / 60)

    log.checkout_time = checkout_time
    log.duration = duration_mins

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
