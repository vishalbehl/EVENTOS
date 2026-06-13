# backend/app/modules/analytics/routers/dashboard.py
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, case, or_, Date, distinct
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_db, get_current_user
from app.modules.identity.models.user import User
from app.modules.events.models.event import Event
from app.modules.events.models.session import Session
from app.modules.events.models.speaker import Speaker
from app.modules.events.models.session_speaker import SessionSpeaker
from app.modules.events.models.capacity_rule import CapacityRule
from app.modules.presentations.models.presentation_file import PresentationFile
from app.modules.presentations.models.file_validation import FileValidation
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_role import ParticipantRole
from app.modules.registration.models.payment_transaction import PaymentTransaction
from app.modules.venue.models.room_device import RoomDevice
from app.modules.events.models.room import Room

router = APIRouter(prefix="/dashboard", tags=["dashboard_analytics"])


@router.get("/summary")
async def get_dashboard_summary(
    event_id: uuid.UUID = Query(..., description="The event ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Calculates all 5 pre-event readiness scorecards and dynamic overview stats."""
    # Check event existence
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event {event_id} not found"
        )

    # 1. Sessions Ready: sessions with confirmed speakers + uploaded files / total sessions
    sessions_stmt = (
        select(Session)
        .where(Session.event_id == event_id)
        .options(
            selectinload(Session.session_speakers)
            .selectinload(SessionSpeaker.presentation_files)
        )
    )
    sessions_res = await db.execute(sessions_stmt)
    sessions = sessions_res.scalars().all()
    
    total_sessions = len(sessions)
    ready_sessions = 0
    for s in sessions:
        if not s.session_speakers:
            continue
        all_ready = True
        for ss in s.session_speakers:
            if not ss.is_confirmed:
                all_ready = False
                break
            # Check if they have an uploaded file (current version)
            has_file = any(f.is_current_version for f in ss.presentation_files)
            if not has_file:
                all_ready = False
                break
        if all_ready:
            ready_sessions += 1

    # 2. Speakers Confirmed: confirmed + checked-in speakers / total invited
    total_sp = (await db.execute(select(func.count(Speaker.id)).where(Speaker.event_id == event_id))).scalar() or 0
    conf_sp = (await db.execute(
        select(func.count(distinct(Speaker.id)))
        .select_from(Speaker)
        .outerjoin(SessionSpeaker, SessionSpeaker.speaker_id == Speaker.id)
        .where(
            Speaker.event_id == event_id,
            or_(
                Speaker.checked_in_at.isnot(None),
                SessionSpeaker.is_confirmed == True
            )
        )
    )).scalar() or 0

    # 3. Registrations: paid + approved / target capacity
    total_reg = (await db.execute(
        select(func.count(Participant.id))
        .where(
            Participant.event_id == event_id,
            or_(
                Participant.paid_status == "Paid",
                Participant.approval_status == "Approved"
            )
        )
    )).scalar() or 0
    
    cap = (await db.execute(
        select(CapacityRule.capacity)
        .where(
            CapacityRule.event_id == event_id,
            CapacityRule.session_id.is_(None),
            CapacityRule.room_id.is_(None)
        )
    )).scalar() or 500  # Fallback to 500

    # 4. Files Validated: files with overall_result='PASS' / total uploaded files
    total_files = (await db.execute(
        select(func.count(PresentationFile.id))
        .where(PresentationFile.event_id == event_id, PresentationFile.is_current_version == True)
    )).scalar() or 0
    
    pass_files = (await db.execute(
        select(func.count(PresentationFile.id))
        .join(FileValidation, FileValidation.file_id == PresentationFile.id)
        .where(
            PresentationFile.event_id == event_id,
            PresentationFile.is_current_version == True,
            func.lower(FileValidation.overall_result) == 'pass'
        )
    )).scalar() or 0

    # 5. Rooms Configured: rooms with assigned devices / total rooms
    total_rooms = (await db.execute(
        select(func.count(Room.id)).where(Room.event_id == event_id, Room.is_active == True)
    )).scalar() or 0
    
    configured_rooms = (await db.execute(
        select(func.count(distinct(Room.id)))
        .join(RoomDevice, RoomDevice.room_id == Room.id)
        .where(Room.event_id == event_id, Room.is_active == True)
    )).scalar() or 0

    return {
        "event_id": event_id,
        "is_live": event.start_date <= date.today() <= event.end_date,
        "scorecards": {
            "sessions_ready": {
                "ready": ready_sessions,
                "total": total_sessions,
                "pct": round(ready_sessions / total_sessions * 100, 1) if total_sessions > 0 else 0.0
            },
            "speakers_confirmed": {
                "ready": conf_sp,
                "total": total_sp,
                "pct": round(conf_sp / total_sp * 100, 1) if total_sp > 0 else 0.0
            },
            "registrations": {
                "ready": total_reg,
                "total": cap,
                "pct": round(total_reg / cap * 100, 1) if cap > 0 else 0.0
            },
            "files_validated": {
                "ready": pass_files,
                "total": total_files,
                "pct": round(pass_files / total_files * 100, 1) if total_files > 0 else 0.0
            },
            "rooms_configured": {
                "ready": configured_rooms,
                "total": total_rooms,
                "pct": round(configured_rooms / total_rooms * 100, 1) if total_rooms > 0 else 0.0
            }
        }
    }


@router.get("/registrations/timeline")
async def get_registrations_timeline(
    event_id: uuid.UUID = Query(..., description="The event ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Daily cumulative registrations for the last 30 days plus linear projection to start date."""
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    today = date.today()
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    
    # Baseline prior to 30 days ago
    baseline_res = await db.execute(
        select(
            func.count(Participant.id).label("total"),
            func.sum(case((Participant.paid_status == "Paid", 1), else_=0)).label("paid"),
            func.sum(case((Participant.approval_status == "Approved", 1), else_=0)).label("approved")
        )
        .where(Participant.event_id == event_id, Participant.registered_at < thirty_days_ago)
    )
    baseline = baseline_res.fetchone()
    cum_registered = baseline[0] or 0
    cum_paid = baseline[1] or 0
    cum_approved = baseline[2] or 0

    # Last 30 days timeline
    daily_res = await db.execute(
        select(
            func.cast(Participant.registered_at, Date).label("reg_date"),
            func.count(Participant.id).label("total"),
            func.sum(case((Participant.paid_status == "Paid", 1), else_=0)).label("paid"),
            func.sum(case((Participant.approval_status == "Approved", 1), else_=0)).label("approved")
        )
        .where(Participant.event_id == event_id, Participant.registered_at >= thirty_days_ago)
        .group_by(func.cast(Participant.registered_at, Date))
        .order_by("reg_date")
    )
    daily_data = {r.reg_date: r for r in daily_res.all()}

    timeline = []
    for i in range(30):
        d = today - timedelta(days=29 - i)
        day_data = daily_data.get(d)
        if day_data:
            cum_registered += day_data[1] or 0
            cum_paid += day_data[2] or 0
            cum_approved += day_data[3] or 0
        
        timeline.append({
            "date": d.strftime("%b %d"),
            "registered": cum_registered,
            "paid": cum_paid,
            "approved": cum_approved,
            "is_forecast": False
        })

    # Forecast calculation (simple linear projection to start_date)
    total_reg_last_30d = sum(r[1] for r in daily_data.values())
    avg_daily_rate = total_reg_last_30d / 30.0

    if event.start_date > today:
        forecast_days = min((event.start_date - today).days, 30)
        for f_day in range(1, forecast_days + 1):
            proj_date = today + timedelta(days=f_day)
            timeline.append({
                "date": proj_date.strftime("%b %d"),
                "registered": int(cum_registered + avg_daily_rate * f_day),
                "paid": int(cum_paid + (avg_daily_rate * 0.8) * f_day),
                "approved": int(cum_approved + (avg_daily_rate * 0.85) * f_day),
                "is_forecast": True
            })

    return timeline


@router.get("/roles-breakdown")
async def get_roles_breakdown(
    event_id: uuid.UUID = Query(..., description="The event ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Role distribution count for DonutChart."""
    stmt = (
        select(
            ParticipantRole.name,
            func.count(Participant.id)
        )
        .join(Participant, Participant.role_id == ParticipantRole.id)
        .where(Participant.event_id == event_id)
        .group_by(ParticipantRole.name)
    )
    res = await db.execute(stmt)
    return [{"name": r[0], "value": r[1]} for r in res.all()]


@router.get("/pending-actions")
async def get_pending_actions(
    event_id: uuid.UUID = Query(..., description="The event ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Auto-generates critical organizer tasks."""
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # 1. Sessions without speakers assigned
    no_speaker_sessions = (await db.execute(
        select(func.count(Session.id))
        .where(Session.event_id == event_id)
        .where(~Session.session_speakers.any())
    )).scalar() or 0

    # 2. Speakers invited but not confirmed (>5 days since invite)
    five_days_ago = datetime.now(timezone.utc) - timedelta(days=5)
    unconfirmed_speakers = (await db.execute(
        select(func.count(distinct(Speaker.id)))
        .join(SessionSpeaker, SessionSpeaker.speaker_id == Speaker.id)
        .where(
            Speaker.event_id == event_id,
            Speaker.created_at < five_days_ago,
            SessionSpeaker.is_confirmed == False
        )
    )).scalar() or 0

    # 3. Files uploaded but not validated (status='PENDING' or 'processing')
    pending_validation_files = (await db.execute(
        select(func.count(PresentationFile.id))
        .where(
            PresentationFile.event_id == event_id,
            PresentationFile.is_current_version == True,
            PresentationFile.upload_status.in_(["processing", "pending_validation"])
        )
    )).scalar() or 0

    # 4. Registrations in PENDING_REVIEW state
    pending_review_registrations = (await db.execute(
        select(func.count(Participant.id))
        .where(
            Participant.event_id == event_id,
            Participant.approval_status.in_(["PENDING_REVIEW", "Pending"])
        )
    )).scalar() or 0

    # 5. Speakers without files uploaded (N days before deadline)
    speakers_missing_files = 0
    if event.upload_deadline:
        if event.upload_deadline > datetime.now(timezone.utc):
            days_remaining = (event.upload_deadline - datetime.now(timezone.utc)).days
            if days_remaining <= 7:
                speakers_missing_files = (await db.execute(
                    select(func.count(Speaker.id))
                    .where(
                        Speaker.event_id == event_id,
                        Speaker.upload_status == "pending"
                    )
                )).scalar() or 0

    return [
        {
            "type": "no_speakers",
            "message": "Sessions without speakers assigned",
            "count": no_speaker_sessions,
            "action_link": f"/events/{event_id}/speaker/sessions"
        },
        {
            "type": "unconfirmed_speakers",
            "message": "Speakers invited but not confirmed (>5 days)",
            "count": unconfirmed_speakers,
            "action_link": f"/events/{event_id}/speaker/speakers"
        },
        {
            "type": "pending_files",
            "message": "Files uploaded but not validated",
            "count": pending_validation_files,
            "action_link": f"/events/{event_id}/speaker/files"
        },
        {
            "type": "pending_reviews",
            "message": "Registrations in PENDING_REVIEW state",
            "count": pending_review_registrations,
            "action_link": f"/events/{event_id}/registration/review"
        },
        {
            "type": "missing_files",
            "message": "Speakers without files uploaded (deadline approaching)",
            "count": speakers_missing_files,
            "action_link": f"/events/{event_id}/speaker/files"
        }
    ]


@router.get("/recent-activity")
async def get_recent_activity(
    event_id: uuid.UUID = Query(..., description="The event ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Activity counts grouped by hour for the last 24h."""
    now = datetime.now(timezone.utc)
    one_day_ago = now - timedelta(hours=24)

    # Fetch registrations
    reg_res = await db.execute(
        select(Participant.registered_at)
        .where(Participant.event_id == event_id, Participant.registered_at >= one_day_ago)
    )
    registrations = reg_res.scalars().all()

    # Fetch file uploads
    file_res = await db.execute(
        select(PresentationFile.uploaded_at)
        .where(PresentationFile.event_id == event_id, PresentationFile.uploaded_at >= one_day_ago)
    )
    uploads = file_res.scalars().all()

    # Fetch speakers confirmed/checked in
    sp_res = await db.execute(
        select(Speaker.checked_in_at)
        .where(Speaker.event_id == event_id, Speaker.checked_in_at >= one_day_ago)
    )
    checked_ins = sp_res.scalars().all()

    # Bucket counts by hour
    activity_buckets = []
    for h in range(24):
        bucket_time = now - timedelta(hours=23 - h)
        bucket_start = bucket_time.replace(minute=0, second=0, microsecond=0)
        bucket_end = bucket_start + timedelta(hours=1)

        reg_count = sum(1 for r in registrations if bucket_start <= r < bucket_end)
        upload_count = sum(1 for u in uploads if bucket_start <= u < bucket_end)
        sp_count = sum(1 for sp in checked_ins if bucket_start <= sp < bucket_end)

        activity_buckets.append({
            "hour": bucket_start.strftime("%H:00"),
            "registrations": reg_count,
            "files": upload_count,
            "speakers": sp_count
        })

    return activity_buckets


@router.get("/deadlines")
async def get_upcoming_deadlines(
    event_id: uuid.UUID = Query(..., description="The event ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upcoming upload and custom deadlines."""
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    deadlines = []
    if event.upload_deadline:
        deadlines.append({
            "name": "Speaker Upload Deadline",
            "date": event.upload_deadline.strftime("%b %d, %Y"),
            "days_remaining": (event.upload_deadline - datetime.now(timezone.utc)).days
        })
    else:
        deadlines.append({
            "name": "Speaker Upload Deadline",
            "date": "Not Configured",
            "days_remaining": -1
        })

    # Add general custom organizer deadlines
    deadlines.append({
        "name": "Speaker Registration Closes",
        "date": (event.start_date - timedelta(days=5)).strftime("%b %d, %Y"),
        "days_remaining": ((datetime.combine(event.start_date - timedelta(days=5), datetime.min.time())).replace(tzinfo=timezone.utc) - datetime.now(timezone.utc)).days
    })
    
    deadlines.append({
        "name": "AV Systems On-Site Dry Run",
        "date": (event.start_date - timedelta(days=1)).strftime("%b %d, %Y"),
        "days_remaining": ((datetime.combine(event.start_date - timedelta(days=1), datetime.min.time())).replace(tzinfo=timezone.utc) - datetime.now(timezone.utc)).days
    })

    return deadlines
