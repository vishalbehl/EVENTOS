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
from app.modules.agenda.models import Session
from app.modules.events.models.speaker import Speaker
from app.modules.agenda.models import SessionPerson as SessionSpeaker
from app.modules.events.models.capacity_rule import CapacityRule
from app.modules.presentations.models.presentation_file import PresentationFile
from app.modules.presentations.models.file_validation import FileValidation
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_role import ParticipantRole
from app.modules.registration.models.payment_transaction import PaymentTransaction
from app.modules.venue.models.room_device import RoomDevice
from app.modules.agenda.models import Room

router = APIRouter(prefix="/dashboard", tags=["dashboard_analytics"])


async def _get_accessible_event(
    db: AsyncSession,
    current_user: User,
    event_id: uuid.UUID,
) -> Event:
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event {event_id} not found",
        )

    if current_user.role != "super_admin" and event.organization_id != current_user.organization_id:
        # Hide cross-tenant event existence from non-super-admin users.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event {event_id} not found",
        )

    return event


@router.get("/summary")
async def get_dashboard_summary(
    event_id: uuid.UUID = Query(..., description="The event ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Calculates all 5 pre-event readiness scorecards and dynamic overview stats."""
    event = await _get_accessible_event(db, current_user, event_id)

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
    event = await _get_accessible_event(db, current_user, event_id)

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
    await _get_accessible_event(db, current_user, event_id)
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
    event = await _get_accessible_event(db, current_user, event_id)

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
    await _get_accessible_event(db, current_user, event_id)
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
    event = await _get_accessible_event(db, current_user, event_id)

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


# =============================================================
# Super Admin Platform Dashboard Endpoints
# Added below existing event-scoped routes.
# All three endpoints require SUPER_ADMIN via require_super_admin.
# =============================================================

from app.modules.superadmin.dependencies import require_super_admin
from app.modules.analytics.schemas.analytics import (
    PlatformOverviewResponse,
    MrrDataPoint,
    PlatformActivityItem,
)


@router.get(
    "/superadmin/overview",
    response_model=PlatformOverviewResponse,
    summary="Super Admin — Platform KPI Overview",
    tags=["superadmin-dashboard"],
)
async def get_superadmin_overview(
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns platform-wide KPIs for the Super Admin command center dashboard:
    org counts, user counts, MRR/ARR, events this month, open support tickets.

    Queries:
      - platform.organizations
      - commerce.organization_subscriptions + commerce.subscription_transactions
      - identity.users
      - events.events
      - support.support_tickets (if populated)
    """
    from app.modules.platform.models.organization import Organization
    from app.modules.billing.models.subscription import OrganizationSubscription, SubscriptionTransaction
    from app.modules.support.models.ticket import SupportTicket

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    thirty_days_ago = now - timedelta(days=30)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # ── Org counts ─────────────────────────────────────────────
    total_orgs = (await db.scalar(select(func.count(Organization.id)))) or 0
    active_orgs = (await db.scalar(
        select(func.count(Organization.id)).where(Organization.is_active.is_(True))
    )) or 0
    trial_orgs = (await db.scalar(
        select(func.count(Organization.id)).where(Organization.plan == "trial")
    )) or 0
    suspended_orgs = (await db.scalar(
        select(func.count(Organization.id)).where(Organization.is_active.is_(False))
    )) or 0

    # ── User counts ────────────────────────────────────────────
    from app.modules.identity.models.user import User as UserModel
    total_users = (await db.scalar(
        select(func.count(UserModel.id)).where(UserModel.deleted_at.is_(None))
    )) or 0
    active_users_30d = (await db.scalar(
        select(func.count(UserModel.id)).where(
            UserModel.deleted_at.is_(None),
            UserModel.last_login_at >= thirty_days_ago,
        )
    )) or 0

    # ── Event counts ───────────────────────────────────────────
    total_events = (await db.scalar(
        select(func.count(Event.id)).where(Event.deleted_at.is_(None))
    )) or 0
    events_this_month = (await db.scalar(
        select(func.count(Event.id)).where(
            Event.deleted_at.is_(None),
            Event.created_at >= month_start,
        )
    )) or 0

    # ── Support tickets ────────────────────────────────────────
    try:
        tickets_open = (await db.scalar(
            select(func.count(SupportTicket.id)).where(SupportTicket.status == "OPEN")
        )) or 0
    except Exception:
        tickets_open = 0

    # ── MRR — sum active subscription transaction amounts ──────
    # Use SubscriptionTransaction as the source of truth since
    # commerce.revenue_metrics may be empty (it's an optional cache).
    # MRR = sum of latest successful transactions per org.
    # We approximate with the sum of all SUCCESS transactions in the
    # current calendar month / 12 for ARR representation.
    # For a more accurate MRR we use per-org latest transaction amount.
    try:
        # Subquery: latest transaction per org
        from sqlalchemy import and_
        latest_txn_subq = (
            select(
                SubscriptionTransaction.organization_id,
                func.max(SubscriptionTransaction.created_at).label("latest_at"),
            )
            .where(SubscriptionTransaction.status == "SUCCESS")
            .group_by(SubscriptionTransaction.organization_id)
            .subquery()
        )
        mrr_result = await db.execute(
            select(func.coalesce(func.sum(SubscriptionTransaction.amount), 0.0))
            .join(
                latest_txn_subq,
                and_(
                    SubscriptionTransaction.organization_id == latest_txn_subq.c.organization_id,
                    SubscriptionTransaction.created_at == latest_txn_subq.c.latest_at,
                ),
            )
            .where(SubscriptionTransaction.status == "SUCCESS")
        )
        mrr = float(mrr_result.scalar() or 0.0)

        # Previous month MRR: same logic but transactions before this month
        prev_month_end = month_start - timedelta(seconds=1)
        prev_month_start = prev_month_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        prev_txn_subq = (
            select(
                SubscriptionTransaction.organization_id,
                func.max(SubscriptionTransaction.created_at).label("latest_at"),
            )
            .where(
                SubscriptionTransaction.status == "SUCCESS",
                SubscriptionTransaction.created_at <= prev_month_end,
            )
            .group_by(SubscriptionTransaction.organization_id)
            .subquery()
        )
        mrr_prev_result = await db.execute(
            select(func.coalesce(func.sum(SubscriptionTransaction.amount), 0.0))
            .join(
                prev_txn_subq,
                and_(
                    SubscriptionTransaction.organization_id == prev_txn_subq.c.organization_id,
                    SubscriptionTransaction.created_at == prev_txn_subq.c.latest_at,
                ),
            )
            .where(SubscriptionTransaction.status == "SUCCESS")
        )
        mrr_prev_month = float(mrr_prev_result.scalar() or 0.0)

        # Revenue today
        revenue_today_result = await db.execute(
            select(func.coalesce(func.sum(SubscriptionTransaction.amount), 0.0)).where(
                SubscriptionTransaction.status == "SUCCESS",
                SubscriptionTransaction.created_at >= today_start,
            )
        )
        revenue_today = float(revenue_today_result.scalar() or 0.0)

    except Exception:
        mrr = mrr_prev_month = revenue_today = 0.0

    # ── Churn rate ─────────────────────────────────────────────
    try:
        cancelled_count = (await db.scalar(
            select(func.count(OrganizationSubscription.id)).where(
                OrganizationSubscription.status == "CANCELLED"
            )
        )) or 0
        active_sub_count = (await db.scalar(
            select(func.count(OrganizationSubscription.id)).where(
                OrganizationSubscription.status.in_(["ACTIVE", "TRIAL"])
            )
        )) or 0
        churn_denom = active_sub_count + cancelled_count
        churn_rate = round(cancelled_count / churn_denom * 100, 2) if churn_denom > 0 else 0.0
    except Exception:
        churn_rate = 0.0

    return PlatformOverviewResponse(
        total_orgs=total_orgs,
        active_orgs=active_orgs,
        trial_orgs=trial_orgs,
        suspended_orgs=suspended_orgs,
        total_users=total_users,
        total_events=total_events,
        events_this_month=events_this_month,
        tickets_open=tickets_open,
        mrr=mrr,
        arr=mrr * 12,
        mrr_prev_month=mrr_prev_month,
        active_users_30d=active_users_30d,
        churn_rate=churn_rate,
        revenue_today=revenue_today,
    )


@router.get(
    "/superadmin/mrr-history",
    response_model=List[MrrDataPoint],
    summary="Super Admin — MRR/ARR Monthly History",
    tags=["superadmin-dashboard"],
)
async def get_superadmin_mrr_history(
    months: int = Query(default=12, ge=1, le=36, description="Number of months of history"),
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns monthly MRR and ARR history for the platform-level area chart.

    Strategy:
      1. Try commerce.revenue_metrics table first (pre-aggregated, accurate).
      2. If empty, compute from commerce.subscription_transactions grouped by month.
    """
    from app.modules.billing.models.subscription import RevenueMetric, SubscriptionTransaction
    from sqlalchemy import text as sql_text

    # Try pre-aggregated revenue_metrics first
    rm_rows = await db.execute(
        select(
            RevenueMetric.period,
            func.sum(RevenueMetric.mrr).label("mrr"),
            func.sum(RevenueMetric.arr).label("arr"),
        )
        .group_by(RevenueMetric.period)
        .order_by(RevenueMetric.period.desc())
        .limit(months)
    )
    rm_data = rm_rows.all()

    if rm_data:
        result = []
        for row in reversed(rm_data):  # chronological order
            # period is stored as "2026-06" format
            try:
                from datetime import date as date_cls
                year, month_num = int(row.period[:4]), int(row.period[5:7])
                month_label = date_cls(year, month_num, 1).strftime("%b %Y")
            except Exception:
                month_label = row.period
            result.append(MrrDataPoint(
                month=month_label,
                period=row.period,
                mrr=float(row.mrr or 0.0),
                arr=float(row.arr or 0.0),
            ))
        return result

    # Fallback: compute from subscription_transactions grouped by calendar month
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=months * 31)

    txn_rows = await db.execute(
        select(
            func.to_char(SubscriptionTransaction.created_at, "YYYY-MM").label("period"),
            func.sum(SubscriptionTransaction.amount).label("total"),
        )
        .where(
            SubscriptionTransaction.status == "SUCCESS",
            SubscriptionTransaction.created_at >= cutoff,
        )
        .group_by(sql_text("period"))
        .order_by(sql_text("period"))
    )
    txn_data = txn_rows.all()

    result = []
    for row in txn_data:
        try:
            from datetime import date as date_cls
            year, month_num = int(row.period[:4]), int(row.period[5:7])
            month_label = date_cls(year, month_num, 1).strftime("%b %Y")
        except Exception:
            month_label = row.period
        mrr_val = float(row.total or 0.0)
        result.append(MrrDataPoint(
            month=month_label,
            period=row.period,
            mrr=mrr_val,
            arr=mrr_val * 12,
        ))
    return result


@router.get(
    "/superadmin/activity-feed",
    response_model=List[PlatformActivityItem],
    summary="Super Admin — Platform Activity Feed",
    tags=["superadmin-dashboard"],
)
async def get_superadmin_activity_feed(
    limit: int = Query(default=20, ge=1, le=100, description="Number of activity items"),
    _: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns recent platform-level activity from ActivityFeed.
    Uses the existing ActivityService / platform_activity models.
    No org filter is applied — super admins see all orgs' activity.
    """
    from app.modules.platform_activity.models import ActivityFeed
    from sqlalchemy import desc as sql_desc

    stmt = (
        select(ActivityFeed)
        .order_by(sql_desc(ActivityFeed.created_at))
        .limit(limit)
    )
    result = await db.execute(stmt)
    items = result.scalars().all()

    return [
        PlatformActivityItem(
            id=str(item.id),
            entity_type=item.entity_type,
            entity_id=str(item.entity_id),
            activity_type=item.activity_type,
            title=item.title,
            description=item.description,
            icon=item.icon,
            metadata=item.metadata_data,
            created_at=item.created_at,
        )
        for item in items
    ]
