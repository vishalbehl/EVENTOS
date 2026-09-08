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
from app.modules.agenda.models import Room
from app.modules.agenda.models import Session
from app.modules.agenda.models import SessionPerson as SessionSpeaker
from app.modules.events.models.speaker import Speaker
from app.modules.venue.models.srr_checkin import SRRCheckin
from app.modules.venue.models.venue_sync_job import VenueSyncJob
from app.modules.events.models.event import Event
from app.modules.speakers.constants.speaker_types import UPLOAD_REQUIRED_CODES
from app.core.cache_keys import TenantCacheKey
from app.core.cache import cache_service
from app.core.cache_policy import CacheTTL, ttl


# ── Top-level snapshot ────────────────────────────────────────

async def build_analytics_snapshot(
    db: AsyncSession,
    event_id: uuid.UUID,
    organization_id: uuid.UUID | None = None,
    use_cache: bool = True,
) -> dict:
    """
    Build a complete analytics snapshot for one event.

    Includes a short-lived Redis cache (10s) to collapse redundant
    requests from the frontend loading multiple dashboard widgets.
    
    Gracefully falls back to a fresh build if Redis is unreachable.
    """
    # Legacy callers did not pass the organization. Resolve it once so cache
    # keys never depend on ambient context and cannot collide across tenants.
    resolved_organization_id = organization_id or await db.scalar(
        select(Event.organization_id).where(Event.id == event_id)
    )
    cache_key = (
        TenantCacheKey.event(
            event_id,
            "analytics",
            "snapshot",
            organization_id=resolved_organization_id,
        )
        if isinstance(resolved_organization_id, uuid.UUID)
        else None
    )
    
    if use_cache and cache_key is not None:
        cached = await cache_service.get_json(cache_key)
        if cached is not None:
            return cached

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

    if use_cache and cache_key is not None:
        await cache_service.set_json(cache_key, snapshot, ttl(CacheTTL.DASHBOARD))
    
    return snapshot


async def _get_daily_upload_history(db: AsyncSession, event_id: uuid.UUID) -> list[dict]:
    """Compatibility wrapper for the canonical daily upload projection."""
    from app.modules.analytics.application.queries import AnalyticsDashboardQueryService

    return await AnalyticsDashboardQueryService(db).daily_upload_history(event_id=event_id)


# ── Overview counts ───────────────────────────────────────────

async def _get_overview(db: AsyncSession, event_id: uuid.UUID, coverage_data: Optional[dict] = None) -> dict:
    """Compatibility wrapper for the canonical overview query service."""
    from app.modules.analytics.application.queries import AnalyticsDashboardQueryService

    return await AnalyticsDashboardQueryService(db).overview(
        event_id=event_id,
        coverage_data=coverage_data,
    )


# ── Upload funnel ─────────────────────────────────────────────

async def _get_upload_funnel(db: AsyncSession, event_id: uuid.UUID) -> dict:
    """Compatibility wrapper for the canonical upload-funnel projection."""
    from app.modules.analytics.application.queries import AnalyticsDashboardQueryService

    return await AnalyticsDashboardQueryService(db).upload_funnel(event_id=event_id)


# ── Session file coverage ─────────────────────────────────────

async def _get_session_coverage(db: AsyncSession, event_id: uuid.UUID) -> dict:
    """Compatibility wrapper for the canonical session coverage projection."""
    from app.modules.analytics.application.queries import AnalyticsDashboardQueryService

    return await AnalyticsDashboardQueryService(db).session_coverage(event_id=event_id)


# ── File format distribution ──────────────────────────────────

async def _get_file_format_distribution(db: AsyncSession, event_id: uuid.UUID) -> list[dict]:
    """Compatibility wrapper for the canonical file-format projection."""
    from app.modules.analytics.application.queries import AnalyticsDashboardQueryService

    return await AnalyticsDashboardQueryService(db).file_format_distribution(event_id=event_id)


# ── Email stats ───────────────────────────────────────────────

async def _get_email_stats(db: AsyncSession, event_id: uuid.UUID) -> dict:
    """Compatibility wrapper for the canonical email analytics projection."""
    from app.modules.analytics.application.queries import AnalyticsDashboardQueryService

    return await AnalyticsDashboardQueryService(db).email_stats(event_id=event_id)


async def get_event_email_analytics(
    db: AsyncSession,
    event_id: uuid.UUID,
    target_type: str = "speaker",
    use_cache: bool = True,
    organization_id: uuid.UUID | None = None,
):
    """
    Fetch aggregated email metrics for the event.
    Uses Redis caching (10s) and aggregate DB queries.
    """
    resolved_organization_id = organization_id or await db.scalar(
        select(Event.organization_id).where(Event.id == event_id)
    )
    cache_key = (
        TenantCacheKey.event(
            event_id,
            "analytics",
            "emails",
            target_type,
            organization_id=resolved_organization_id,
        )
        if isinstance(resolved_organization_id, uuid.UUID)
        else None
    )
    
    if use_cache and cache_key is not None:
        cached = await cache_service.get_json(cache_key)
        if cached is not None:
            return cached

    from app.modules.analytics.application.queries import AnalyticsDashboardQueryService

    analytics = await AnalyticsDashboardQueryService(db).email_campaign_analytics(
        event_id=event_id,
        target_type=target_type,
    )

    if use_cache and cache_key is not None:
        await cache_service.set_json(cache_key, analytics, ttl(CacheTTL.DASHBOARD))

    return analytics

# ── Venue sync stats ──────────────────────────────────────────

async def _get_venue_sync_stats(db: AsyncSession, event_id: uuid.UUID) -> dict:
    """Compatibility wrapper for the canonical venue-sync projection."""
    from app.modules.analytics.application.queries import AnalyticsDashboardQueryService

    return await AnalyticsDashboardQueryService(db).venue_sync_stats(event_id=event_id)


# ── SRR check-in stats ────────────────────────────────────────

async def _get_srr_stats(db: AsyncSession, event_id: uuid.UUID) -> dict:
    """Compatibility wrapper for the canonical SRR aggregate projection."""
    from app.modules.analytics.application.queries import AnalyticsDashboardQueryService

    return await AnalyticsDashboardQueryService(db).srr_stats(event_id=event_id)


# ── Per-room file readiness ────────────────────────────────────

async def get_room_readiness(db: AsyncSession, event_id: uuid.UUID) -> list[dict]:
    """Compatibility wrapper for the canonical analytics query service."""
    # Keep the legacy service import-safe during Celery's model bootstrap.
    from app.modules.analytics.application.queries import AnalyticsDashboardQueryService

    return await AnalyticsDashboardQueryService(db).room_readiness(event_id=event_id)


# ── Approval time analysis ─────────────────────────────────────

async def get_approval_times(db: AsyncSession, event_id: uuid.UUID) -> list[dict]:
    """
    Average days from file upload (created_at) to approval (updated_at where status=approved)
    grouped by room.
    """
    from app.modules.presentations.models.presentation_file import PresentationFile
    from app.modules.agenda.models import SessionPerson as SessionSpeaker
    from app.modules.agenda.models import Session
    from app.modules.agenda.models import Room
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
    from app.modules.agenda.models import SessionPerson as SessionSpeaker
    from app.modules.agenda.models import Session
    from app.modules.agenda.models import Room
    from sqlalchemy import func, case, select

    rooms_q = await db.execute(
        select(Room.id, Room.name)
        .where(Room.event_id == event_id, Room.is_active.is_(True))
    )
    rooms = rooms_q.all()
    if not rooms:
        return []

    room_ids = [room.id for room in rooms]
    slot_counts_q = await db.execute(
        select(Session.room_id, func.count(SessionSpeaker.id).label("count"))
        .select_from(SessionSpeaker)
        .join(Session, Session.id == SessionSpeaker.session_id)
        .where(Session.event_id == event_id, Session.room_id.in_(room_ids))
        .group_by(Session.room_id)
    )
    slot_counts = {row.room_id: row.count for row in slot_counts_q.all()}

    session_counts_q = await db.execute(
        select(Session.room_id, func.count(Session.id).label("count"))
        .where(Session.event_id == event_id, Session.room_id.in_(room_ids))
        .group_by(Session.room_id)
    )
    session_counts = {row.room_id: row.count for row in session_counts_q.all()}

    files_q = await db.execute(
        select(Session.room_id, PresentationFile.upload_status, func.count(PresentationFile.id).label("cnt"))
        .select_from(PresentationFile)
        .join(SessionSpeaker, SessionSpeaker.id == PresentationFile.session_speaker_id)
        .join(Session, Session.id == SessionSpeaker.session_id)
        .where(
            Session.event_id == event_id,
            Session.room_id.in_(room_ids),
            PresentationFile.is_current_version.is_(True),
        )
        .group_by(Session.room_id, PresentationFile.upload_status)
    )
    status_counts: dict[uuid.UUID, dict[str | None, int]] = {}
    for row in files_q.all():
        status_counts.setdefault(row.room_id, {})[row.upload_status] = row.cnt

    results = []
    for room in rooms:
        slots = slot_counts.get(room.id, 0)
        by_status = status_counts.get(room.id, {})

        uploaded_statuses = {"uploaded", "processing", "pending_validation", "valid", "approved", "rejected"}
        validated_statuses = {"valid", "approved", "pending_validation"}

        uploaded = sum(by_status.get(s, 0) for s in uploaded_statuses)
        validated = sum(by_status.get(s, 0) for s in validated_statuses)
        approved = by_status.get("approved", 0)

        results.append({
            "room_id": str(room.id),
            "room_name": room.name,
            "session_count": session_counts.get(room.id, 0),
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
    from app.modules.agenda.models import Session
    from app.modules.agenda.models import Room
    from app.modules.presentations.models.presentation_file import PresentationFile
    from app.modules.agenda.models import SessionPerson as SessionSpeaker
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
    from app.modules.agenda.models import Session
    from app.modules.agenda.models import Room
    from app.modules.presentations.models.presentation_file import PresentationFile
    from app.modules.agenda.models import SessionPerson as SessionSpeaker

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
    from app.modules.agenda.models import Session
    from app.modules.agenda.models import Room

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

    # 5. Role-Based & Transaction Revenue Calculation
    total_revenue = 0.0
    if current_user.role in ["super_admin", "admin", "organiser"]:
        from app.modules.registration.models.payment_transaction import PaymentTransaction

        # Sum completed gateway payment transactions
        tx_q = await db.execute(
            select(func.coalesce(func.sum(PaymentTransaction.amount), 0.0)).where(
                PaymentTransaction.event_id == event_id,
                PaymentTransaction.status.in_(["completed", "captured", "success", "paid"])
            )
        )
        tx_revenue = float(tx_q.scalar() or 0.0)

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

        calculated_participant_revenue = 0.0
        for p in paid_participants:
            # Free / Complimentary roles are zero cost
            p_role = p.role.lower().strip() if p.role else "delegate"
            if "free" in p_role or "complimentary" in p_role or getattr(p, "is_free", False):
                continue

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
            calculated_participant_revenue += (price or 0.0)

        total_revenue = max(tx_revenue, calculated_participant_revenue)

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
            Session.title.label("session_name")
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
            Session.title.label("session_name")
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
            Session.title.label("session_name")
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
