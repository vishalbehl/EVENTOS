# =============================================================
# Conference Platform — Analytics Service
# backend/app/services/analytics_service.py
#
# Provides aggregated statistics for the Command Center
# Analytics dashboard.
#
# All queries are read-only. Results are computed on-the-fly
# from the source tables (no pre-aggregated cache yet).
# For production scale, wrap the heavy queries in Redis cache.
#
# Data returned:
#   - Event-level overview stats (speakers, sessions, files)
#   - Upload funnel (pending → uploaded → approved / rejected)
#   - Session coverage (files present vs missing)
#   - File format distribution
#   - Email delivery stats
#   - Venue sync status
#   - SRR check-in throughput
# =============================================================

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional

from loguru import logger
from sqlalchemy import case, func, select, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.communications.models.email_campaign import EmailCampaign
from app.modules.communications.models.email_log import EmailLog
from app.modules.presentations.models.poster import Poster
from app.modules.presentations.models.presentation_file import PresentationFile
from app.modules.events.models.room import Room
from app.modules.events.models.session import Session
from app.modules.events.models.session_speaker import SessionSpeaker
from app.modules.events.models.speaker import Speaker
from app.modules.venue.models.srr_checkin import SRRCheckin
from app.modules.venue.models.venue_sync_job import VenueSyncJob
from app.redis import redis_client
import json
from app.modules.speakers.constants.speaker_types import UPLOAD_REQUIRED_CODES
from app.core.cache_keys import TenantCacheKey


# ── Top-level snapshot ────────────────────────────────────────

async def build_analytics_snapshot(
    db: AsyncSession,
    event_id: uuid.UUID,
    use_cache: bool = True,
) -> dict:
    """
    Build a complete analytics snapshot for one event.

    Includes a short-lived Redis cache (10s) to collapse redundant
    requests from the frontend loading multiple dashboard widgets.
    
    Gracefully falls back to a fresh build if Redis is unreachable.
    """
    cache_key = TenantCacheKey.event(event_id, "analytics", "snapshot")
    
    if use_cache:
        try:
            # Short timeout to prevent hanging the whole request if Redis is slow
            cached = await asyncio.wait_for(redis_client.get(cache_key), timeout=2.0)
            if cached:
                logger.debug(f"Analytics cache hit for event {event_id}")
                return json.loads(cached)
        except Exception as e:
            logger.warning(f"Analytics cache read failed (type={type(e).__name__}): {e}")

    logger.info(f"Building fresh analytics snapshot for event {event_id}")

    # Fetch coverage once and reuse
    session_coverage = await _get_session_coverage(db, event_id)
    
    overview = await _get_overview(db, event_id, coverage_data=session_coverage)
    upload_funnel = await _get_upload_funnel(db, event_id)
    file_formats = await _get_file_format_distribution(db, event_id)
    email_stats = await _get_email_stats(db, event_id)
    venue_sync = await _get_venue_sync_stats(db, event_id)
    srr_stats = await _get_srr_stats(db, event_id)
    daily_history = await _get_daily_upload_history(db, event_id)
    room_readiness = await get_room_readiness(db, event_id)

    snapshot = {
        "event_id": str(event_id),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "overview": overview,
        "upload_funnel": upload_funnel,
        "session_coverage": session_coverage,
        "file_formats": file_formats,
        "email_stats": email_stats,
        "venue_sync": venue_sync,
        "srr_stats": srr_stats,
        "daily_uploads": daily_history,
        "room_readiness": room_readiness,
        "room_heatmap": [
            {
                "room_name": r["room_name"],
                "readiness_pct": r["readiness_pct"],
                "total_sessions": r["session_count"],
                "ready_sessions": int(r["session_count"] * (r["readiness_pct"] / 100)) if r["session_count"] > 0 else 0
            } for r in room_readiness
        ]
    }

    if use_cache:
        try:
            await asyncio.wait_for(
                redis_client.setex(cache_key, 10, json.dumps(snapshot)),
                timeout=2.0
            )
        except Exception as e:
            logger.warning(f"Analytics cache write failed (type={type(e).__name__}): {e}")
    
    return snapshot


async def _get_daily_upload_history(db: AsyncSession, event_id: uuid.UUID) -> list[dict]:
    """Get count of uploads per day for the last 14 days."""
    result = await db.execute(
        select(
            func.date_trunc('day', PresentationFile.created_at).label('day'),
            func.count().label('count')
        )
        .where(
            PresentationFile.event_id == event_id,
            PresentationFile.is_current_version.is_(True)
        )
        .group_by('day')
        .order_by('day')
    )
    return [
        {"label": row.day.strftime("%d %b"), "value": float(row.count)}
        for row in result.all() if row.day
    ]


# ── Overview counts ───────────────────────────────────────────

async def _get_overview(db: AsyncSession, event_id: uuid.UUID, coverage_data: Optional[dict] = None) -> dict:
    """Total counts: rooms, sessions, speakers, files."""

    rooms_q = await db.execute(
        select(func.count()).where(
            Room.event_id == event_id,
            Room.is_active.is_(True),
        )
    )
    sessions_q = await db.execute(
        select(func.count()).where(Session.event_id == event_id)
    )
    speakers_q = await db.execute(
        select(func.count()).where(Speaker.event_id == event_id)
    )
    files_q = await db.execute(
        select(func.count()).where(
            PresentationFile.event_id == event_id,
            PresentationFile.is_current_version.is_(True),
        )
    )
    file_status_q = await db.execute(
        select(
            PresentationFile.upload_status,
            func.count().label("count"),
        )
        .where(
            PresentationFile.event_id == event_id,
            PresentationFile.is_current_version.is_(True),
        )
        .group_by(PresentationFile.upload_status)
    )
    file_counts = {row.upload_status: row.count for row in file_status_q.all()}
    
    # Reuse provided coverage or fetch if missing (fallback)
    coverage = coverage_data or await _get_session_coverage(db, event_id)

    # ── Posters counts ─────────────────────────────────────
    posters_q = await db.execute(
        select(func.count()).where(Poster.event_id == event_id)
    )
    poster_status_q = await db.execute(
        select(
            Poster.status,
            func.count().label("count"),
        )
        .where(Poster.event_id == event_id)
        .group_by(Poster.status)
    )
    poster_counts = {row.status: row.count for row in poster_status_q.all()}

    # Combine file and poster stats
    files_approved = file_counts.get("approved", 0) + poster_counts.get("approved", 0)
    files_rejected = file_counts.get("rejected", 0) + poster_counts.get("rejected", 0)
    
    # Uploaded = anything that was actually submitted
    files_uploaded = (
        sum(file_counts.get(s, 0) for s in ("processing", "pending_validation", "valid", "approved", "rejected", "uploaded")) +
        sum(poster_counts.get(s, 0) for s in ("submitted", "under_review", "approved", "rejected"))
    )
    
    # Pending = needs organizer action
    files_pending = (
        sum(file_counts.get(s, 0) for s in ("processing", "pending_validation", "valid", "invalid")) +
        sum(poster_counts.get(s, 0) for s in ("submitted", "under_review"))
    )

    return {
        "total_rooms": rooms_q.scalar() or 0,
        "total_sessions": sessions_q.scalar() or 0,
        "total_speakers": speakers_q.scalar() or 0,
        "total_files": (files_q.scalar() or 0) + (posters_q.scalar() or 0),
        "files_uploaded": files_uploaded,
        "files_approved": files_approved,
        "files_pending": files_pending,
        "files_rejected": files_rejected,
        "sessions_ready": coverage.get("complete", 0),
        "talks_pending_upload": coverage.get("talks_pending_upload", 0),
    }


# ── Upload funnel ─────────────────────────────────────────────

async def _get_upload_funnel(db: AsyncSession, event_id: uuid.UUID) -> dict:
    """
    Count speakers by upload_status for the funnel chart.

    Funnel stages:
        pending → uploaded → approved
                           → rejected
    """
    result = await db.execute(
        select(
            Speaker.upload_status,
            func.count().label("count"),
        )
        .where(Speaker.event_id == event_id)
        .group_by(Speaker.upload_status)
    )
    rows = result.all()

    counts = {row.upload_status: row.count for row in rows}
    total = sum(counts.values())

    def pct(n: int) -> float:
        return round(n / total * 100, 1) if total > 0 else 0.0

    pending = counts.get("pending", 0)
    uploaded = counts.get("uploaded", 0)
    replaced = counts.get("replaced", 0)
    approved = counts.get("approved", 0)
    rejected = counts.get("rejected", 0)

    uploaded_total = uploaded + replaced + approved + rejected
    approval_rate = round(approved / uploaded_total * 100, 1) if uploaded_total > 0 else 0.0

    return {
        "invited": total,
        "total_speakers": total,
        "pending": pending,
        "uploaded": uploaded_total,
        "approved": approved,
        "rejected": rejected,
        "pending_pct": pct(pending),
        "uploaded_pct": pct(uploaded_total),
        "upload_rate_pct": pct(uploaded_total),
        "approved_pct": pct(approved),
        "approval_rate_pct": approval_rate,
        "rejected_pct": pct(rejected),
        "completion_rate": pct(approved),
    }


# ── Session file coverage ─────────────────────────────────────

async def _get_session_coverage(db: AsyncSession, event_id: uuid.UUID) -> dict:
    """
    Per-session breakdown: how many speaker slots have a current file.

    Returns:
        complete    → all speakers in session have a file
        partial     → some speakers have files, some don't
        missing     → no speakers have files at all
    """
    # Count total speaker slots per session
    total_q = await db.execute(
        select(
            SessionSpeaker.session_id,
            func.count().label("total_slots"),
        )
        .join(Session, Session.id == SessionSpeaker.session_id)
        .where(Session.event_id == event_id)
        .group_by(SessionSpeaker.session_id)
    )
    total_rows = {row.session_id: row.total_slots for row in total_q.all()}

    # Count slots WITH a current file
    files_q = await db.execute(
        select(
            PresentationFile.session_speaker_id,
            func.count().label("file_count"),
        )
        .join(SessionSpeaker, SessionSpeaker.id == PresentationFile.session_speaker_id)
        .join(Session, Session.id == SessionSpeaker.session_id)
        .where(
            Session.event_id == event_id,
            PresentationFile.is_current_version.is_(True),
            PresentationFile.upload_status.in_(["valid", "approved", "pending_validation", "processing", "uploaded"]),
        )
        .group_by(PresentationFile.session_speaker_id)
    )
    has_file = {row.session_speaker_id for row in files_q.all()}

    # Re-aggregate per session
    # (simplified: count sessions with at least one file vs none)
    all_sessions = set()

    ss_q = await db.execute(
        select(SessionSpeaker.session_id, SessionSpeaker.id, SessionSpeaker.speaker_type)
        .join(Session, Session.id == SessionSpeaker.session_id)
        .where(Session.event_id == event_id)
    )
    session_slots: dict[uuid.UUID, list] = {}
    pending_talks_count = 0
    for row in ss_q.all():
        session_slots.setdefault(row.session_id, []).append(row.id)
        all_sessions.add(row.session_id)
        
        # New logic: only count session_speaker rows without files where speaker_type is NULL or in UPLOAD_REQUIRED_CODES
        if row.id not in has_file:
            if row.speaker_type is None or row.speaker_type in UPLOAD_REQUIRED_CODES:
                pending_talks_count += 1

    complete = partial = missing = 0
    for sess_id, slots in session_slots.items():
        filled = sum(1 for s in slots if s in has_file)
        if filled == len(slots):
            complete += 1
        elif filled > 0:
            partial += 1
        else:
            missing += 1

    total = len(all_sessions)
    
    # Query pending eposters and add to the pending count
    posters_count_q = await db.execute(
        select(func.count(Poster.id))
        .where(
            Poster.event_id == event_id,
            Poster.status == "pending"
        )
    )
    pending_eposters = posters_count_q.scalar() or 0
    talks_pending_upload = pending_talks_count + pending_eposters

    # Fetch session details for the breakdown list
    from app.modules.events.models.room import Room
    session_details_q = await db.execute(
        select(Session, Room.name.label("room_name"))
        .outerjoin(Room, Room.id == Session.room_id)
        .where(Session.event_id == event_id)
    )
    
    session_rows = []
    for s_row in session_details_q.all():
        sess = s_row[0]
        room_name = s_row[1]
        
        slots_for_sess = session_slots.get(sess.id, [])
        total_speakers = len(slots_for_sess)
        files_approved = sum(1 for slot_id in slots_for_sess if slot_id in has_file)
        files_pending = total_speakers - files_approved
        
        readiness_pct = round(files_approved / total_speakers * 100, 1) if total_speakers > 0 else 0.0
        
        session_rows.append({
            "session_id": str(sess.id),
            "session_name": sess.name,
            "session_code": sess.session_code or "",
            "room_name": room_name,
            "start_time": sess.start_time.isoformat() if sess.start_time else None,
            "total_speakers": total_speakers,
            "files_approved": files_approved,
            "files_pending": files_pending,
            "readiness_pct": readiness_pct,
        })
        
    _sentinel = datetime(9999, 12, 31, tzinfo=timezone.utc)
    session_rows.sort(key=lambda x: x["start_time"] or _sentinel)


    return {
        "total_sessions": total,
        "complete": complete,
        "partial": partial,
        "missing": missing,
        "coverage_pct": round(complete / total * 100, 1) if total > 0 else 0.0,
        "talks_pending_upload": talks_pending_upload,
        "sessions": session_rows,
    }


# ── File format distribution ──────────────────────────────────

async def _get_file_format_distribution(db: AsyncSession, event_id: uuid.UUID) -> list[dict]:
    """
    Count current files by format (pptx, pdf, mp4, etc.).
    Returns a list sorted by count descending.
    """
    result = await db.execute(
        select(
            PresentationFile.file_format,
            func.count().label("count"),
        )
        .where(
            PresentationFile.event_id == event_id,
            PresentationFile.is_current_version.is_(True),
        )
        .group_by(PresentationFile.file_format)
        .order_by(func.count().desc())
    )
    return [{"format": row.file_format, "count": row.count} for row in result.all()]


# ── Email stats ───────────────────────────────────────────────

async def _get_email_stats(db: AsyncSession, event_id: uuid.UUID) -> dict:
    """
    Email delivery stats for the event's campaigns.
    """
    # Total emails sent (logs scoped to campaigns in this event)
    total_q = await db.execute(
        select(func.count())
        .select_from(EmailLog)
        .join(EmailCampaign, EmailCampaign.id == EmailLog.campaign_id)
        .where(EmailCampaign.event_id == event_id)
    )
    total = total_q.scalar() or 0

    # By status
    status_q = await db.execute(
        select(
            EmailLog.status,
            func.count().label("count"),
        )
        .join(EmailCampaign, EmailCampaign.id == EmailLog.campaign_id)
        .where(EmailCampaign.event_id == event_id)
        .group_by(EmailLog.status)
    )
    by_status = {row.status: row.count for row in status_q.all()}

    # Opened count (where opened_at is set)
    opened_q = await db.execute(
        select(func.count())
        .select_from(EmailLog)
        .join(EmailCampaign, EmailCampaign.id == EmailLog.campaign_id)
        .where(
            EmailCampaign.event_id == event_id,
            EmailLog.opened_at.is_not(None),
        )
    )
    opened = opened_q.scalar() or 0

    delivered = by_status.get("delivered", 0)

    return {
        "total_sent": total,
        "delivered": delivered,
        "bounced": by_status.get("bounced", 0),
        "failed": by_status.get("failed", 0),
        "opened": opened,
        "open_rate_pct": round(opened / delivered * 100, 1) if delivered > 0 else 0.0,
        "delivery_rate_pct": round(delivered / total * 100, 1) if total > 0 else 0.0,
    }


async def get_event_email_analytics(db: AsyncSession, event_id: uuid.UUID, target_type: str = "speaker", use_cache: bool = True):
    """
    Fetch aggregated email metrics for the event.
    Uses Redis caching (10s) and aggregate DB queries.
    """
    cache_key = TenantCacheKey.event(event_id, "analytics", "emails", target_type)
    
    if use_cache:
        try:
            cached = await asyncio.wait_for(redis_client.get(cache_key), timeout=2.0)
            if cached:
                return json.loads(cached)
        except Exception as e:
            logger.warning(f"Email analytics cache read failed (type={type(e).__name__}): {e}")

    # Fetch all campaigns for this event and target type
    res = await db.execute(
        select(EmailCampaign).where(
            EmailCampaign.event_id == event_id,
            EmailCampaign.target_type == target_type
        )
    )
    campaigns = res.scalars().all()

    total_recipients = sum(c.total_recipients for c in campaigns)
    total_sent = sum(c.sent_count for c in campaigns)

    # Fetch aggregate log counts based on target_type
    if target_type == "participant":
        from app.modules.registration.models.participant import Participant
        # Failed / Bounced
        failed_q = await db.execute(
            select(func.count(EmailLog.id))
            .join(Participant, EmailLog.participant_id == Participant.id)
            .where(Participant.event_id == event_id, EmailLog.status.in_(["failed", "bounced"]))
        )
        failed_count = failed_q.scalar() or 0

        # Opened
        opened_q = await db.execute(
            select(func.count(EmailLog.id))
            .join(Participant, EmailLog.participant_id == Participant.id)
            .where(Participant.event_id == event_id, EmailLog.opened_at.is_not(None))
        )
        opened_count = opened_q.scalar() or 0
    else:
        # Failed / Bounced
        failed_q = await db.execute(
            select(func.count(EmailLog.id))
            .join(Speaker, EmailLog.speaker_id == Speaker.id)
            .where(Speaker.event_id == event_id, EmailLog.status.in_(["failed", "bounced"]))
        )
        failed_count = failed_q.scalar() or 0

        # Opened
        opened_q = await db.execute(
            select(func.count(EmailLog.id))
            .join(Speaker, EmailLog.speaker_id == Speaker.id)
            .where(Speaker.event_id == event_id, EmailLog.opened_at.is_not(None))
        )
        opened_count = opened_q.scalar() or 0

    analytics = {
        "total_campaigns": len(campaigns),
        "total_recipients": total_recipients,
        "total_sent": total_sent,
        "failed_count": failed_count,
        "opened_count": opened_count,
        "success_rate": round(total_sent / total_recipients * 100, 1) if total_recipients > 0 else 0.0,
        "open_rate": round(opened_count / total_sent * 100, 1) if total_sent > 0 else 0.0,
    }

    if use_cache:
        try:
            await asyncio.wait_for(
                redis_client.setex(cache_key, 10, json.dumps(analytics)),
                timeout=2.0
            )
        except Exception as e:
            logger.warning(f"Email analytics cache write failed (type={type(e).__name__}): {e}")

    return analytics

# ── Venue sync stats ──────────────────────────────────────────

async def _get_venue_sync_stats(db: AsyncSession, event_id: uuid.UUID) -> dict:
    """Latest venue sync job status for the event."""
    result = await db.execute(
        select(VenueSyncJob)
        .where(VenueSyncJob.event_id == event_id)
        .order_by(VenueSyncJob.created_at.desc())
        .limit(1)
    )
    latest = result.scalar_one_or_none()

    if latest is None:
        return {"last_sync": None, "status": "never_synced"}

    return {
        "last_sync": latest.created_at.isoformat() if latest.created_at else None,
        "status": latest.status,
        "files_synced": latest.files_synced if hasattr(latest, "files_synced") else None,
        "completed_at": latest.completed_at.isoformat() if hasattr(latest, "completed_at") and latest.completed_at else None,
    }


# ── SRR check-in stats ────────────────────────────────────────

async def _get_srr_stats(db: AsyncSession, event_id: uuid.UUID) -> dict:
    """Speaker Ready Room throughput stats."""
    total_checkins_q = await db.execute(
        select(func.count()).where(SRRCheckin.event_id == event_id)
    )
    total = total_checkins_q.scalar() or 0

    method_q = await db.execute(
        select(
            SRRCheckin.checkin_method,
            func.count().label("count"),
        )
        .where(SRRCheckin.event_id == event_id)
        .group_by(SRRCheckin.checkin_method)
    )
    by_method = {row.checkin_method: row.count for row in method_q.all()}

    # Currently checked in (no checkout yet)
    active_q = await db.execute(
        select(func.count()).where(
            SRRCheckin.event_id == event_id,
            SRRCheckin.checked_out_at.is_(None),
        )
    )
    active = active_q.scalar() or 0

    return {
        "total_checkins": total,
        "currently_active": active,
        "by_method": by_method,
        "qr_scan": by_method.get("qr_scan", 0),
        "manual": by_method.get("manual", 0),
        "token": by_method.get("token", 0),
    }


# ── Per-room file readiness ────────────────────────────────────

async def get_room_readiness(db: AsyncSession, event_id: uuid.UUID) -> list[dict]:
    """
    Per-room summary of file readiness for organizer overview cards.

    Returns list of rooms with session count, files expected, files ready.
    """
    rooms_q = await db.execute(
        select(Room).where(Room.event_id == event_id, Room.is_active.is_(True))
    )
    rooms = rooms_q.scalars().all()

    result = []
    for room in rooms:
        # Sessions in this room
        sessions_q = await db.execute(
            select(func.count()).where(
                Session.event_id == event_id,
                Session.room_id == room.id,
            )
        )
        session_count = sessions_q.scalar() or 0

        # Speaker slots in this room's sessions
        slots_q = await db.execute(
            select(func.count())
            .select_from(SessionSpeaker)
            .join(Session, Session.id == SessionSpeaker.session_id)
            .where(
                Session.event_id == event_id,
                Session.room_id == room.id,
            )
        )
        slots = slots_q.scalar() or 0

        # Files ready (valid/approved, current version) for this room
        files_q = await db.execute(
            select(func.count())
            .select_from(PresentationFile)
            .join(SessionSpeaker, SessionSpeaker.id == PresentationFile.session_speaker_id)
            .join(Session, Session.id == SessionSpeaker.session_id)
            .where(
                Session.event_id == event_id,
                Session.room_id == room.id,
                PresentationFile.is_current_version.is_(True),
                PresentationFile.upload_status.in_(["valid", "approved", "pending_validation", "processing", "uploaded"]),
            )
        )
        files_ready = files_q.scalar() or 0

        result.append({
            "room_id": str(room.id),
            "room_name": room.name,
            "session_count": session_count,
            "speaker_slots": slots,
            "files_ready": files_ready,
            "readiness_pct": round(files_ready / slots * 100, 1) if slots > 0 else 0.0,
        })

    return sorted(result, key=lambda r: r["room_name"])


# ── Approval time analysis ─────────────────────────────────────

async def get_approval_times(db: AsyncSession, event_id: uuid.UUID) -> list[dict]:
    """
    Average days from file upload (created_at) to approval (updated_at where status=approved)
    grouped by room.
    """
    from app.modules.presentations.models.presentation_file import PresentationFile
    from app.modules.events.models.session_speaker import SessionSpeaker
    from app.modules.events.models.session import Session
    from app.modules.events.models.room import Room
    from sqlalchemy import func, select

    result = await db.execute(
        select(
            Room.id.label("room_id"),
            Room.name.label("room_name"),
            func.avg(
                func.extract("epoch", PresentationFile.updated_at - PresentationFile.created_at) / 86400
            ).label("avg_days"),
            func.count(PresentationFile.id).label("sample_count"),
        )
        .select_from(PresentationFile)
        .join(SessionSpeaker, SessionSpeaker.id == PresentationFile.session_speaker_id)
        .join(Session, Session.id == SessionSpeaker.session_id)
        .join(Room, Room.id == Session.room_id)
        .where(
            Session.event_id == event_id,
            PresentationFile.upload_status == "approved",
            PresentationFile.is_current_version.is_(True),
        )
        .group_by(Room.id, Room.name)
        .order_by(Room.name)
    )
    rows = result.all()
    return [
        {
            "group_type": "room",
            "group_id": str(r.room_id),
            "group_name": r.room_name,
            "avg_days": round(float(r.avg_days or 0), 2),
            "sample_count": r.sample_count,
        }
        for r in rows
    ]


# ── Public wrapper for file format distribution ────────────────

async def get_file_format_distribution(db: AsyncSession, event_id: uuid.UUID) -> list[dict]:
    """Public-facing wrapper with percentage calculation."""
    raw = await _get_file_format_distribution(db, event_id)
    total = sum(r["count"] for r in raw)
    return [
        {
            "format": r["format"] or "unknown",
            "count": r["count"],
            "pct": round(r["count"] / total * 100, 1) if total > 0 else 0.0,
        }
        for r in raw
    ]


# ── Per-room upload / validation / approval breakdown ──────────

async def get_per_room_breakdown(db: AsyncSession, event_id: uuid.UUID) -> list[dict]:
    """
    For each room: upload %, validation_pass %, approval % side-by-side.
    Validated = upload_status in (valid, approved, pending_validation)
    """
    from app.modules.presentations.models.presentation_file import PresentationFile
    from app.modules.events.models.session_speaker import SessionSpeaker
    from app.modules.events.models.session import Session
    from app.modules.events.models.room import Room
    from sqlalchemy import func, case, select

    rooms_q = await db.execute(
        select(Room).where(Room.event_id == event_id, Room.is_active.is_(True))
    )
    rooms = rooms_q.scalars().all()

    results = []
    for room in rooms:
        # Slots
        slots_q = await db.execute(
            select(func.count())
            .select_from(SessionSpeaker)
            .join(Session, Session.id == SessionSpeaker.session_id)
            .where(Session.event_id == event_id, Session.room_id == room.id)
        )
        slots = slots_q.scalar() or 0

        # File status counts
        files_q = await db.execute(
            select(
                PresentationFile.upload_status,
                func.count(PresentationFile.id).label("cnt")
            )
            .select_from(PresentationFile)
            .join(SessionSpeaker, SessionSpeaker.id == PresentationFile.session_speaker_id)
            .join(Session, Session.id == SessionSpeaker.session_id)
            .where(
                Session.event_id == event_id,
                Session.room_id == room.id,
                PresentationFile.is_current_version.is_(True),
            )
            .group_by(PresentationFile.upload_status)
        )
        by_status = {row.upload_status: row.cnt for row in files_q.all()}

        uploaded_statuses = {"uploaded", "processing", "pending_validation", "valid", "approved", "rejected"}
        validated_statuses = {"valid", "approved", "pending_validation"}

        uploaded = sum(by_status.get(s, 0) for s in uploaded_statuses)
        validated = sum(by_status.get(s, 0) for s in validated_statuses)
        approved = by_status.get("approved", 0)

        # Session count for this room
        session_count_q = await db.execute(
            select(func.count()).where(Session.event_id == event_id, Session.room_id == room.id)
        )
        session_count = session_count_q.scalar() or 0

        results.append({
            "room_id": str(room.id),
            "room_name": room.name,
            "session_count": session_count,
            "speaker_slots": slots,
            "uploaded_count": uploaded,
            "validated_count": validated,
            "approved_count": approved,
            "upload_pct": round(uploaded / slots * 100, 1) if slots > 0 else 0.0,
            "validation_pct": round(validated / slots * 100, 1) if slots > 0 else 0.0,
            "approval_pct": round(approved / slots * 100, 1) if slots > 0 else 0.0,
        })

    return sorted(results, key=lambda r: r["room_name"])


# ── Export helpers ─────────────────────────────────────────────

async def export_event_data_csv(db: AsyncSession, event_id: uuid.UUID) -> str:
    """Export speaker + session + file data as a CSV string."""
    import csv, io
    from app.modules.events.models.speaker import Speaker
    from app.modules.events.models.session import Session
    from app.modules.events.models.room import Room
    from app.modules.presentations.models.presentation_file import PresentationFile
    from app.modules.events.models.session_speaker import SessionSpeaker
    from sqlalchemy.orm import selectinload

    output = io.StringIO()
    writer = csv.writer(output)

    # Sheet 1 — Speakers
    writer.writerow(["--- SPEAKERS ---"])
    writer.writerow(["First Name", "Last Name", "Email", "Phone", "Affiliation", "Upload Status", "Speaker Code"])
    spk_q = await db.execute(select(Speaker).where(Speaker.event_id == event_id).order_by(Speaker.last_name))
    for s in spk_q.scalars().all():
        writer.writerow([s.first_name, s.last_name, s.email, s.phone or "", s.affiliation or "", s.upload_status or "pending", s.speaker_code or ""])

    writer.writerow([])
    # Sheet 2 — Sessions
    writer.writerow(["--- SESSIONS ---"])
    writer.writerow(["Code", "Name", "Room", "Start", "End", "Speaker Count", "Readiness %"])
    sess_q = await db.execute(
        select(Session, Room.name.label("room_name"))
        .outerjoin(Room, Room.id == Session.room_id)
        .where(Session.event_id == event_id)
        .order_by(Session.start_time)
    )
    for row in sess_q.all():
        s, room_name = row[0], row[1]
        writer.writerow([
            s.session_code or "", s.name, room_name or "",
            s.start_time.isoformat() if s.start_time else "",
            s.end_time.isoformat() if s.end_time else "",
            "", ""  # readiness computed separately — omit for simplicity
        ])

    writer.writerow([])
    # Sheet 3 — Files
    writer.writerow(["--- FILES ---"])
    writer.writerow(["Speaker Email", "File Name", "Format", "Status", "File Size (MB)", "Uploaded At"])
    files_q = await db.execute(
        select(PresentationFile, Speaker.email.label("speaker_email"))
        .join(SessionSpeaker, SessionSpeaker.id == PresentationFile.session_speaker_id)
        .join(Speaker, Speaker.id == SessionSpeaker.speaker_id)
        .where(PresentationFile.event_id == event_id, PresentationFile.is_current_version.is_(True))
        .order_by(PresentationFile.created_at.desc())
    )
    for row in files_q.all():
        f, email = row[0], row[1]
        size_mb = round((f.file_size_bytes or 0) / 1_048_576, 2)
        writer.writerow([
            email, f.original_filename or "", f.file_format or "",
            f.upload_status or "", size_mb,
            f.created_at.isoformat() if f.created_at else "",
        ])

    return output.getvalue()


async def export_event_data_xlsx(db: AsyncSession, event_id: uuid.UUID) -> bytes:
    """Export speaker + session + file data as an XLSX workbook (in memory)."""
    import io
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment
    from app.modules.events.models.speaker import Speaker
    from app.modules.events.models.session import Session
    from app.modules.events.models.room import Room
    from app.modules.presentations.models.presentation_file import PresentationFile
    from app.modules.events.models.session_speaker import SessionSpeaker

    wb = openpyxl.Workbook()
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(fill_type="solid", fgColor="4F46E5")

    def write_sheet(ws, headers: list, rows: list):
        ws.append(headers)
        for cell in ws[1]:
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center")
        for row in rows:
            ws.append(row)
        for col in ws.columns:
            ws.column_dimensions[col[0].column_letter].auto_size = True

    # Speakers sheet
    ws_speakers = wb.active
    ws_speakers.title = "Speakers"
    spk_q = await db.execute(select(Speaker).where(Speaker.event_id == event_id).order_by(Speaker.last_name))
    speakers_data = [[s.first_name, s.last_name, s.email, s.phone or "", s.affiliation or "", s.upload_status or "pending", s.speaker_code or ""] for s in spk_q.scalars().all()]
    write_sheet(ws_speakers, ["First Name", "Last Name", "Email", "Phone", "Affiliation", "Upload Status", "Speaker Code"], speakers_data)

    # Sessions sheet
    ws_sessions = wb.create_sheet("Sessions")
    sess_q = await db.execute(
        select(Session, Room.name.label("room_name"))
        .outerjoin(Room, Room.id == Session.room_id)
        .where(Session.event_id == event_id)
        .order_by(Session.start_time)
    )
    sessions_data = [
        [row[0].session_code or "", row[0].name, row[1] or "",
         row[0].start_time.isoformat() if row[0].start_time else "",
         row[0].end_time.isoformat() if row[0].end_time else ""]
        for row in sess_q.all()
    ]
    write_sheet(ws_sessions, ["Code", "Name", "Room", "Start", "End"], sessions_data)

    # Files sheet
    ws_files = wb.create_sheet("Files")
    files_q = await db.execute(
        select(PresentationFile, Speaker.email.label("speaker_email"))
        .join(SessionSpeaker, SessionSpeaker.id == PresentationFile.session_speaker_id)
        .join(Speaker, Speaker.id == SessionSpeaker.speaker_id)
        .where(PresentationFile.event_id == event_id, PresentationFile.is_current_version.is_(True))
        .order_by(PresentationFile.created_at.desc())
    )
    files_data = [
        [row[1], row[0].original_filename or "", row[0].file_format or "",
         row[0].upload_status or "", round((row[0].file_size_bytes or 0) / 1_048_576, 2),
         row[0].created_at.isoformat() if row[0].created_at else ""]
        for row in files_q.all()
    ]
    write_sheet(ws_files, ["Speaker Email", "File Name", "Format", "Status", "Size (MB)", "Uploaded At"], files_data)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


async def export_event_data_pdf(db: AsyncSession, event_id: uuid.UUID) -> bytes:
    """Export a PDF summary using reportlab."""
    import io
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from app.modules.events.models.speaker import Speaker
    from app.modules.events.models.session import Session
    from app.modules.events.models.room import Room

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4)
    styles = getSampleStyleSheet()
    story = []

    story.append(Paragraph("Event Analytics Summary", styles["Title"]))
    story.append(Spacer(1, 12))

    # Speakers table
    story.append(Paragraph("Speakers", styles["Heading2"]))
    spk_q = await db.execute(select(Speaker).where(Speaker.event_id == event_id).order_by(Speaker.last_name).limit(200))
    spk_data = [["Name", "Email", "Status"]]
    for s in spk_q.scalars().all():
        spk_data.append([f"{s.first_name} {s.last_name}", s.email, s.upload_status or "pending"])
    if len(spk_data) > 1:
        t = Table(spk_data, hAlign="LEFT")
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4F46E5")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F3F4F6")]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        story.append(t)
    story.append(Spacer(1, 20))

    # Sessions table
    story.append(Paragraph("Sessions", styles["Heading2"]))
    sess_q = await db.execute(
        select(Session, Room.name.label("room_name"))
        .outerjoin(Room, Room.id == Session.room_id)
        .where(Session.event_id == event_id)
        .order_by(Session.start_time)
        .limit(200)
    )
    sess_data = [["Code", "Name", "Room", "Start"]]
    for row in sess_q.all():
        s = row[0]
        sess_data.append([
            s.session_code or "", s.name[:40], row[1] or "",
            s.start_time.strftime("%d %b %H:%M") if s.start_time else ""
        ])
    if len(sess_data) > 1:
        t2 = Table(sess_data, hAlign="LEFT")
        t2.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4F46E5")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F3F4F6")]),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        story.append(t2)

    doc.build(story)
    return buf.getvalue()


async def build_main_event_dashboard_data(
    db: AsyncSession,
    event_id: uuid.UUID,
    current_user: User,
) -> MainEventDashboardData:
    """
    Build a complete aggregated response for the Main Event Dashboard.
    Respects RBAC by hiding/masking financial data for unauthorized roles.
    Uses in-memory computation for alerts and metrics to optimize performance.
    """
    from datetime import timedelta
    from app.modules.registration.models.participant import Participant
    from app.modules.registration.models.ticket_type import TicketType
    from app.modules.venue.models.room_device import RoomDevice
    from app.modules.registration.models.check_in import CheckIn
    from app.modules.rbac.models.user_assignment import UserEventAssignment
    from app.modules.events.models.event import Event
    from app.modules.analytics.schemas.analytics import (
        MainEventDashboardData, ChartDataPoint, DemographicPoint,
        DeviceStatusCount, UpcomingSession, UpcomingDeadline, AlertItem,
        UploadFunnelStats, ActivityItem
    )

    now = datetime.now(timezone.utc)

    # 1. Fetch Event details
    event_q = await db.execute(select(Event).where(Event.id == event_id))
    event = event_q.scalar_one_or_none()
    if not event:
        raise ValueError(f"Event {event_id} not found")

    # 2. Basic KPI Counts
    reg_count_q = await db.execute(
        select(func.count(Participant.id)).where(Participant.event_id == event_id)
    )
    total_registrations = reg_count_q.scalar() or 0

    spk_count_q = await db.execute(
        select(func.count(Speaker.id)).where(Speaker.event_id == event_id)
    )
    total_speakers = spk_count_q.scalar() or 0

    sess_count_q = await db.execute(
        select(func.count(Session.id)).where(Session.event_id == event_id)
    )
    total_sessions = sess_count_q.scalar() or 0

    rooms_count_q = await db.execute(
        select(func.count(Room.id)).where(Room.event_id == event_id, Room.is_active.is_(True))
    )
    active_rooms = rooms_count_q.scalar() or 0

    checkin_count_q = await db.execute(
        select(func.count(distinct(CheckIn.participant_id))).where(CheckIn.event_id == event_id)
    )
    attendees_checked_in = checkin_count_q.scalar() or 0

    staff_count_q = await db.execute(
        select(func.count(distinct(UserEventAssignment.user_id))).where(UserEventAssignment.event_id == event_id)
    )
    active_staff_count = staff_count_q.scalar() or 0
    # Ensure there's at least 1 staff (e.g. event creator)
    if active_staff_count == 0:
        active_staff_count = 1

    # 3. File/Poster upload stats (completed vs pending)
    # Reuse existing overview counts logic for consistency
    file_status_q = await db.execute(
        select(PresentationFile.upload_status, func.count().label("count"))
        .where(PresentationFile.event_id == event_id, PresentationFile.is_current_version.is_(True))
        .group_by(PresentationFile.upload_status)
    )
    file_counts = {row.upload_status: row.count for row in file_status_q.all()}

    poster_status_q = await db.execute(
        select(Poster.status, func.count().label("count"))
        .where(Poster.event_id == event_id)
        .group_by(Poster.status)
    )
    poster_counts = {row.status: row.count for row in poster_status_q.all()}

    uploads_completed = file_counts.get("approved", 0) + poster_counts.get("approved", 0)
    uploads_pending = (
        sum(file_counts.get(s, 0) for s in ("processing", "pending_validation", "valid", "invalid")) +
        sum(poster_counts.get(s, 0) for s in ("submitted", "under_review"))
    )

    # 4. Device status counts
    devices_q = await db.execute(
        select(RoomDevice, Room.name.label("room_name"))
        .outerjoin(Room, Room.id == RoomDevice.room_id)
        .where(RoomDevice.event_id == event_id)
    )
    devices = devices_q.all()

    device_online = 0
    device_offline = 0
    device_error = 0
    device_maintenance = 0

    device_alerts = []
    for row in devices:
        dev = row[0]
        r_name = row[1] or "Unknown Room"
        if dev.status == "maintenance":
            device_maintenance += 1
        elif dev.status == "error":
            device_error += 1
            device_alerts.append(AlertItem(
                id=f"device-error-{dev.id}",
                type="offline_device",
                severity="critical",
                timestamp=dev.updated_at or now,
                message=f"Device '{dev.device_name}' in room '{r_name}' reported error status.",
                details={"device_id": str(dev.id), "room_name": r_name, "hostname": dev.hostname}
            ))
        elif dev.last_heartbeat_at:
            hb = dev.last_heartbeat_at
            if hb.tzinfo is None:
                hb = hb.replace(tzinfo=timezone.utc)
            if (now - hb).total_seconds() <= 60:
                device_online += 1
            else:
                device_offline += 1
                device_alerts.append(AlertItem(
                    id=f"device-offline-{dev.id}",
                    type="offline_device",
                    severity="warning",
                    timestamp=hb,
                    message=f"Device '{dev.device_name}' in room '{r_name}' is offline (last heartbeat {hb.strftime('%H:%M:%S')}).",
                    details={"device_id": str(dev.id), "room_name": r_name, "hostname": dev.hostname}
                ))
        else:
            device_offline += 1
            device_alerts.append(AlertItem(
                id=f"device-offline-{dev.id}",
                type="offline_device",
                severity="warning",
                timestamp=dev.created_at or now,
                message=f"Device '{dev.device_name}' in room '{r_name}' has never sent a heartbeat.",
                details={"device_id": str(dev.id), "room_name": r_name, "hostname": dev.hostname}
            ))

    device_status = DeviceStatusCount(
        online=device_online,
        offline=device_offline,
        error=device_error,
        maintenance=device_maintenance
    )

    # 5. Role-Based Revenue Calculation
    total_revenue = 0.0
    if current_user.role in ["super_admin", "admin", "organiser"]:
        # Fetch pricing matrix
        ticket_types_q = await db.execute(
            select(TicketType).where(TicketType.event_id == event_id)
        )
        ticket_types = ticket_types_q.scalars().all()

        pricing_map = {}
        default_role_pricing = {}
        for tt in ticket_types:
            r_name = tt.role_name.lower().strip() if tt.role_name else ""
            t_name = tt.tier_name.lower().strip() if tt.tier_name else ""
            pricing_map[(r_name, t_name)] = tt.price
            if r_name not in default_role_pricing:
                default_role_pricing[r_name] = tt.price

        # Fetch paid participants
        paid_parts_q = await db.execute(
            select(Participant).where(
                Participant.event_id == event_id,
                func.lower(Participant.paid_status) == "paid"
            )
        )
        paid_participants = paid_parts_q.scalars().all()

        for p in paid_participants:
            p_role = p.role.lower().strip() if p.role else "delegate"
            tier_name = ""
            if p.custom_fields:
                for key in ["tier_name", "tier", "ticket_tier", "ticket_type"]:
                    if key in p.custom_fields and p.custom_fields[key]:
                        tier_name = str(p.custom_fields[key]).lower().strip()
                        break
                if not tier_name and "registration_data" in p.custom_fields:
                    reg_data = p.custom_fields["registration_data"]
                    if isinstance(reg_data, dict):
                        for key in ["tier_name", "tier", "ticket_tier", "ticket_type"]:
                            if key in reg_data and reg_data[key]:
                                tier_name = str(reg_data[key]).lower().strip()
                                break
            price = None
            if tier_name:
                price = pricing_map.get((p_role, tier_name))
            if price is None:
                price = default_role_pricing.get(p_role, 0.0)
            total_revenue += price

    # 6. Event Readiness Percentage
    coverage = await _get_session_coverage(db, event_id)
    event_readiness_pct = coverage.get("coverage_pct", 0.0)

    # 7. Analytics Widgets Data
    # A. Registration growth (cumulative registrations over the last 14 days)
    reg_growth_q = await db.execute(
        select(
            func.date_trunc('day', Participant.registered_at).label('day'),
            func.count().label('count')
        )
        .where(Participant.event_id == event_id)
        .group_by('day')
        .order_by('day')
    )
    reg_growth_rows = reg_growth_q.all()

    registration_growth = []
    cumulative_sum = 0
    for r in reg_growth_rows:
        if r.day:
            cumulative_sum += r.count
            registration_growth.append(ChartDataPoint(
                label=r.day.strftime("%d %b"),
                value=float(cumulative_sum)
            ))

    # B. Upload completion trends (daily uploads)
    upload_completion_trends = await _get_daily_upload_history(db, event_id)

    # C. Attendee demographics (top 5 countries)
    demographics_q = await db.execute(
        select(
            Participant.country,
            func.count().label('count')
        )
        .where(Participant.event_id == event_id)
        .group_by(Participant.country)
        .order_by(func.count().desc())
        .limit(5)
    )
    attendee_demographics = [
        DemographicPoint(
            label=row.country if row.country else "Unknown",
            value=row.count
        )
        for row in demographics_q.all()
    ]

    # D. Session distribution by room
    session_dist_q = await db.execute(
        select(
            Room.name,
            func.count(Session.id).label('count')
        )
        .join(Session, Session.room_id == Room.id)
        .where(Session.event_id == event_id)
        .group_by(Room.name)
        .order_by(func.count(Session.id).desc())
    )
    session_distribution = [
        ChartDataPoint(label=row.name, value=float(row.count))
        for row in session_dist_q.all()
    ]

    # E. Room occupancy (scheduled session duration in hours per room)
    all_sessions_q = await db.execute(
        select(Session, Room.name.label("room_name"))
        .join(Room, Room.id == Session.room_id)
        .where(Session.event_id == event_id, Session.start_time.isnot(None), Session.end_time.isnot(None))
    )
    all_sessions_data = all_sessions_q.all()

    room_durations = {}
    for row in all_sessions_data:
        sess = row[0]
        r_name = row[1]
        duration_hours = (sess.end_time - sess.start_time).total_seconds() / 3600.0
        room_durations[r_name] = room_durations.get(r_name, 0.0) + duration_hours

    room_occupancy = [
        ChartDataPoint(label=r_name, value=round(hours, 1))
        for r_name, hours in sorted(room_durations.items(), key=lambda x: x[1], reverse=True)
    ]

    # F. Daily activity heatmap (DOW vs Hour check-ins)
    checkins_q = await db.execute(
        select(CheckIn.check_in_time)
        .where(CheckIn.event_id == event_id)
    )
    checkin_times = [row.check_in_time for row in checkins_q.all() if row.check_in_time]

    heatmap_counts = {}  # (dow, hour) -> count
    for ci_time in checkin_times:
        # CheckIn.check_in_time has timezone. Convert to event timezone or utc.
        dow = ci_time.strftime("%a")  # Mon, Tue, etc.
        hour = ci_time.hour
        key = (dow, hour)
        heatmap_counts[key] = heatmap_counts.get(key, 0) + 1

    days_order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    daily_activity_heatmap = []
    for day in days_order:
        for hr in range(24):
            val = heatmap_counts.get((day, hr), 0)
            daily_activity_heatmap.append({
                "day": day,
                "hour": hr,
                "value": val
            })

    # G. Speaker upload progress (Funnel stats)
    speaker_funnel = await _get_upload_funnel(db, event_id)
    speaker_upload_progress = UploadFunnelStats(
        invited=speaker_funnel.get("invited", 0),
        uploaded=speaker_funnel.get("uploaded", 0),
        approved=speaker_funnel.get("approved", 0),
        rejected=speaker_funnel.get("rejected", 0),
        pending=speaker_funnel.get("pending", 0),
        upload_rate_pct=speaker_funnel.get("upload_rate_pct", 0.0),
        approval_rate_pct=speaker_funnel.get("approval_rate_pct", 0.0)
    )

    # 8. Live Activity Feed
    recent_activities = []

    recent_files_q = await db.execute(
        select(
            PresentationFile,
            Speaker.first_name,
            Speaker.last_name,
            Session.name.label("session_name")
        )
        .join(Speaker, Speaker.id == PresentationFile.speaker_id)
        .join(SessionSpeaker, SessionSpeaker.id == PresentationFile.session_speaker_id)
        .join(Session, Session.id == SessionSpeaker.session_id)
        .where(PresentationFile.event_id == event_id)
        .order_by(PresentationFile.created_at.desc())
        .limit(10)
    )
    for row in recent_files_q.all():
        pf = row[0]
        spk_name = f"{row[1]} {row[2]}"
        s_name = row[3]
        action_type = "file_approved" if pf.upload_status == "approved" else "file_uploaded"
        desc = (
            f"File '{pf.original_filename}' approved for session '{s_name}'."
            if pf.upload_status == "approved"
            else f"Speaker {spk_name} uploaded file '{pf.original_filename}' for session '{s_name}'."
        )
        recent_activities.append(ActivityItem(
            id=pf.id,
            event_type=action_type,
            speaker_name=spk_name,
            session_name=s_name,
            description=desc,
            occurred_at=pf.created_at
        ))

    recent_checkins_q = await db.execute(
        select(
            CheckIn,
            Participant.name,
            Session.name.label("session_name")
        )
        .join(Participant, Participant.id == CheckIn.participant_id)
        .join(Session, Session.id == CheckIn.session_id)
        .where(CheckIn.event_id == event_id)
        .order_by(CheckIn.check_in_time.desc())
        .limit(10)
    )
    for row in recent_checkins_q.all():
        ci = row[0]
        p_name = row[1]
        s_name = row[2]
        recent_activities.append(ActivityItem(
            id=ci.id,
            event_type="attendee_checkin",
            speaker_name=p_name,
            session_name=s_name,
            description=f"Attendee {p_name} checked in for session '{s_name}'.",
            occurred_at=ci.check_in_time
        ))

    recent_activities.sort(key=lambda x: x.occurred_at, reverse=True)
    recent_activity = recent_activities[:15]

    # 9. Alert Center Items
    alerts = []
    # Include device offline/error alerts computed earlier
    alerts.extend(device_alerts)

    # Failed uploads (rejected files)
    rejected_files_q = await db.execute(
        select(
            PresentationFile,
            Speaker.first_name,
            Speaker.last_name,
            Session.name.label("session_name")
        )
        .join(Speaker, Speaker.id == PresentationFile.speaker_id)
        .join(SessionSpeaker, SessionSpeaker.id == PresentationFile.session_speaker_id)
        .join(Session, Session.id == SessionSpeaker.session_id)
        .where(PresentationFile.event_id == event_id, PresentationFile.upload_status == "rejected")
    )
    for row in rejected_files_q.all():
        pf = row[0]
        spk_name = f"{row[1]} {row[2]}"
        s_name = row[3]
        alerts.append(AlertItem(
            id=f"failed-upload-{pf.id}",
            type="failed_upload",
            severity="critical",
            timestamp=pf.updated_at or now,
            message=f"Presentation file '{pf.original_filename}' uploaded by {spk_name} was rejected.",
            details={"speaker_name": spk_name, "session_name": s_name, "file_id": str(pf.id)}
        ))

    # Room conflicts (overlapping sessions in the same room)
    # Group sessions by room and check overlaps
    room_sessions = {}
    for row in all_sessions_data:
        sess = row[0]
        r_name = row[1]
        room_sessions.setdefault(r_name, []).append(sess)

    for r_name, sess_list in room_sessions.items():
        sess_sorted = sorted(sess_list, key=lambda x: x.start_time)
        for i in range(len(sess_sorted) - 1):
            s1 = sess_sorted[i]
            s2 = sess_sorted[i + 1]
            if s1.end_time > s2.start_time:
                alerts.append(AlertItem(
                    id=f"conflict-{s1.id}-{s2.id}",
                    type="session_conflict",
                    severity="critical",
                    timestamp=now,
                    message=f"Time conflict in room '{r_name}': '{s1.name}' ({s1.start_time.strftime('%H:%M')}-{s1.end_time.strftime('%H:%M')}) overlaps with '{s2.name}' ({s2.start_time.strftime('%H:%M')}-{s2.end_time.strftime('%H:%M')}).",
                    details={"room_name": r_name, "session_1": s1.name, "session_2": s2.name}
                ))

    # Speaker missing uploads past deadline
    deadline = event.upload_deadline
    if deadline:
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)
        
        # Select speakers who haven't uploaded
        pending_speakers_q = await db.execute(
            select(Speaker).where(
                Speaker.event_id == event_id,
                Speaker.upload_status == "pending"
            )
        )
        pending_speakers = pending_speakers_q.scalars().all()

        if deadline < now:
            # Overdue
            for s in pending_speakers:
                alerts.append(AlertItem(
                    id=f"missed-deadline-{s.id}",
                    type="deadline_warning",
                    severity="critical",
                    timestamp=deadline,
                    message=f"Speaker {s.first_name} {s.last_name} missed the upload deadline.",
                    details={"speaker_id": str(s.id), "speaker_email": s.email}
                ))
        elif (deadline - now).total_seconds() < 86400 * 2:
            # Critical upcoming deadline (within 48 hours)
            hours_left = int((deadline - now).total_seconds() / 3600)
            for s in pending_speakers:
                alerts.append(AlertItem(
                    id=f"approaching-deadline-{s.id}",
                    type="deadline_warning",
                    severity="warning",
                    timestamp=now,
                    message=f"Speaker {s.first_name} {s.last_name} upload deadline is approaching in {hours_left} hours.",
                    details={"speaker_id": str(s.id), "speaker_email": s.email, "hours_left": hours_left}
                ))

    # Upcoming sessions starting in < 48 hours without approved files
    upcoming_48h_q = await db.execute(
        select(Session, Room.name.label("room_name"))
        .outerjoin(Room, Room.id == Session.room_id)
        .where(
            Session.event_id == event_id,
            Session.start_time >= now,
            Session.start_time <= now + timedelta(days=2)
        )
    )
    upcoming_48h_sessions = upcoming_48h_q.all()

    # Find which speaker slots have approved files
    # Re-use slot has_file check or fetch session speaker statuses
    for s_row in upcoming_48h_sessions:
        sess = s_row[0]
        r_name = s_row[1] or "Unknown Room"
        
        # Fetch session speakers for this session
        sess_speakers_q = await db.execute(
            select(SessionSpeaker, Speaker.first_name, Speaker.last_name, Speaker.upload_status)
            .join(Speaker, Speaker.id == SessionSpeaker.speaker_id)
            .where(SessionSpeaker.session_id == sess.id)
        )
        sess_speakers = sess_speakers_q.all()

        missing_approved = []
        for s_spk_row in sess_speakers:
            s_spk = s_spk_row[0]
            spk_full = f"{s_spk_row[1]} {s_spk_row[2]}"
            spk_status = s_spk_row[3]
            
            # Check if this session speaker has any approved file version
            file_exists_q = await db.execute(
                select(PresentationFile)
                .where(
                    PresentationFile.session_speaker_id == s_spk.id,
                    PresentationFile.upload_status == "approved",
                    PresentationFile.is_current_version.is_(True)
                )
            )
            if not file_exists_q.scalar_one_or_none():
                missing_approved.append(spk_full)
        
        if missing_approved:
            hours_left = int((sess.start_time - now).total_seconds() / 3600)
            alerts.append(AlertItem(
                id=f"missing-file-{sess.id}",
                type="missing_file",
                severity="warning",
                timestamp=now,
                message=f"Session '{sess.name}' starts in {hours_left} hours but is missing approved files for speakers: {', '.join(missing_approved)}.",
                details={"session_id": str(sess.id), "room_name": r_name, "missing_speakers": missing_approved}
            ))

    alerts.sort(key=lambda x: x.timestamp, reverse=True)

    # 10. Upcoming Section (Sessions & Deadlines)
    # Upcoming sessions
    upcoming_sess_q = await db.execute(
        select(Session, Room.name.label("room_name"))
        .outerjoin(Room, Room.id == Session.room_id)
        .where(Session.event_id == event_id, Session.start_time >= now)
        .order_by(Session.start_time.asc())
        .limit(5)
    )
    upcoming_sess_rows = upcoming_sess_q.all()

    upcoming_sessions = []
    for s_row in upcoming_sess_rows:
        sess = s_row[0]
        r_name = s_row[1]
        
        # Get speakers
        spk_q = await db.execute(
            select(Speaker.first_name, Speaker.last_name)
            .join(SessionSpeaker, SessionSpeaker.speaker_id == Speaker.id)
            .where(SessionSpeaker.session_id == sess.id)
        )
        speakers = [f"{row.first_name} {row.last_name}" for row in spk_q.all()]

        upcoming_sessions.append(UpcomingSession(
            id=sess.id,
            name=sess.name,
            room_name=r_name,
            start_time=sess.start_time,
            end_time=sess.end_time,
            speaker_names=speakers
        ))

    # Upcoming milestones/deadlines
    upcoming_deadlines = []
    if deadline:
        status_str = "Passed" if deadline < now else ("Critical" if (deadline - now).total_seconds() < 86400 * 2 else "Upcoming")
        upcoming_deadlines.append(UpcomingDeadline(
            title="Presentation Upload Deadline",
            time=deadline,
            status=status_str
        ))
    
    # Add standard/milestone deadlines relative to event start date
    event_start = datetime.combine(event.start_date, datetime.min.time(), tzinfo=timezone.utc)
    
    # Milestone 1: Speaker Registration Deadline (3 days before start)
    spk_reg_deadline = event_start - timedelta(days=3)
    status_str = "Passed" if spk_reg_deadline < now else ("Critical" if (spk_reg_deadline - now).total_seconds() < 86400 * 2 else "Upcoming")
    upcoming_deadlines.append(UpcomingDeadline(
        title="Speaker Registration Verification",
        time=spk_reg_deadline,
        status=status_str
    ))

    # Milestone 2: On-site Room Telemetry Setup (1 day before start)
    room_setup_deadline = event_start - timedelta(days=1)
    status_str = "Passed" if room_setup_deadline < now else ("Critical" if (room_setup_deadline - now).total_seconds() < 86400 * 2 else "Upcoming")
    upcoming_deadlines.append(UpcomingDeadline(
        title="On-site Telemetry Verification",
        time=room_setup_deadline,
        status=status_str
    ))

    # Milestone 3: Early Bird Ticketing Closes (7 days before start)
    eb_deadline = event_start - timedelta(days=7)
    status_str = "Passed" if eb_deadline < now else ("Critical" if (eb_deadline - now).total_seconds() < 86400 * 2 else "Upcoming")
    upcoming_deadlines.append(UpcomingDeadline(
        title="Early Bird Pricing Ends",
        time=eb_deadline,
        status=status_str
    ))

    upcoming_deadlines.sort(key=lambda x: x.time)

    # 11. Final Assembly
    return MainEventDashboardData(
        total_registrations=total_registrations,
        total_speakers=total_speakers,
        total_sessions=total_sessions,
        active_rooms=active_rooms,
        uploads_completed=uploads_completed,
        uploads_pending=uploads_pending,
        attendees_checked_in=attendees_checked_in,
        event_readiness_pct=round(event_readiness_pct, 1),
        device_status=device_status,
        total_revenue=total_revenue,
        active_staff_count=active_staff_count,
        alert_count=len(alerts),
        registration_growth=registration_growth,
        upload_completion_trends=upload_completion_trends,
        attendee_demographics=attendee_demographics,
        session_distribution=session_distribution,
        room_occupancy=room_occupancy,
        daily_activity_heatmap=daily_activity_heatmap,
        speaker_upload_progress=speaker_upload_progress,
        recent_activity=recent_activity,
        alerts=alerts,
        upcoming_sessions=upcoming_sessions,
        upcoming_deadlines=upcoming_deadlines
    )
