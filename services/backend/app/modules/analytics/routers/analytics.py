# backend/app/routers/analytics.py
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.tenant_context import TenantContextGuard
from app.dependencies import get_db, get_current_event, CurrentEvent, get_current_user
from app.modules.audit.services.audit_service import AuditContext, AuditService
from app.modules.identity.models.user import User
from app.modules.presentations.services.upload_service import create_presigned_download
from app.modules.rbac.models.user_assignment import UserEventAssignment
from app.modules.analytics.schemas.analytics import (
    DashboardStats, UploadFunnelStats, SessionReadinessRow,
    RoomBreakdownRow, ActivityItem, ApprovalTimeRow, FileFormatRow,
    PerRoomBreakdownRow, MainEventDashboardData,
)
from app.modules.analytics.services.analytics_service import (
    build_analytics_snapshot,
    get_room_readiness,
    get_approval_times,
    get_file_format_distribution,
    get_per_room_breakdown,
    build_main_event_dashboard_data,
)
from app.worker import celery_app
from app.core.dependencies.feature_gate import enforce_event_operation
from app.modules.billing.services.usage_reservation_service import UsageReservationService
from app.modules.analytics.application.queries import (
    EventRegistrationSummaryProjection,
    EventRegistrationSummaryQueryService,
    EventAttendanceSummaryProjection,
    EventAttendanceSummaryQueryService,
    EventPaymentSummaryProjection,
    EventPaymentSummaryQueryService,
    EventSpeakerSummaryProjection,
    EventSpeakerSummaryQueryService,
)
from app.modules.analytics.application.commands import AnalyticsExportCommandService
from app.modules.analytics.application.queries import AnalyticsExportQueryService

router = APIRouter(prefix="/events/{event_id}/analytics", tags=["analytics"])
global_router = APIRouter(prefix="/analytics", tags=["global_analytics"])



async def get_allowed_sessions(user: User, event_id: uuid.UUID, db: AsyncSession) -> Optional[set[str]]:
    """Returns a set of allowed session_ids (as strings) or None if all are allowed."""
    if user.role in ["super_admin", "organiser", "admin"]:
        return None
    
    result = await db.execute(
        select(UserEventAssignment)
        .where(UserEventAssignment.user_id == user.id, UserEventAssignment.event_id == event_id)
    )
    assignment = result.scalars().first()
    if not assignment:
        return set() # nothing allowed if no assignment
        
    perms = assignment.permissions or {}
    sessions = perms.get("sessions", [])
    if not sessions:
        return None # an empty sessions array often implies full event access for the assigned event
    return {str(s) for s in sessions}


@router.get("/dashboard", response_model=DashboardStats)
async def dashboard(
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DashboardStats:
    """Top-level KPI snapshot for the organizer dashboard."""
    snapshot = await build_analytics_snapshot(db, event.id)
    overview = snapshot.get("overview", {})
    funnel = snapshot.get("upload_funnel", {})
    srr = snapshot.get("srr", {})
    return DashboardStats(
        event_id=event.id,
        total_speakers=overview.get("total_speakers", 0),
        total_sessions=overview.get("total_sessions", 0),
        total_rooms=overview.get("total_rooms", 0),
        files_uploaded=overview.get("files_uploaded", 0),
        files_approved=overview.get("files_approved", 0),
        files_pending=overview.get("files_pending", 0),
        files_rejected=overview.get("files_rejected", 0),
        speakers_checked_in=srr.get("checked_in_today", 0),
        upload_rate_pct=funnel.get("upload_rate_pct", 0.0),
        approval_rate_pct=funnel.get("approval_rate_pct", 0.0),
        sessions_ready=overview.get("sessions_ready", 0),
        sessions_total=overview.get("total_sessions", 0),
        talks_pending_upload=overview.get("talks_pending_upload", 0),
        daily_uploads=snapshot.get("daily_uploads", []),
        room_readiness=[
            RoomBreakdownRow(
                room_id=uuid.UUID(r["room_id"]),
                room_name=r["room_name"],
                session_count=r["session_count"],
                speaker_count=r["speaker_slots"],
                files_approved=r["files_ready"],
                readiness_pct=r["readiness_pct"]
            ) for r in snapshot.get("room_readiness", [])
        ],
        room_heatmap=snapshot.get("room_heatmap", [])
    )


@router.get("/registration-summary", response_model=EventRegistrationSummaryProjection)
async def registration_summary_projection(
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EventRegistrationSummaryProjection:
    """Read the maintained registration projection without rebuilding it on demand."""
    await enforce_event_operation(
        db,
        event.organization_id,
        event.id,
        "registration.analytics.view",
        user_id=current_user.id,
    )
    summary = await EventRegistrationSummaryQueryService(db).get_for_event(
        organization_id=event.organization_id,
        event_id=event.id,
    )
    if summary is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ANALYTICS_PROJECTION_UNAVAILABLE", "message": "The event registration summary is not available yet."},
        )
    return summary


@router.get("/attendance-summary", response_model=EventAttendanceSummaryProjection)
async def attendance_summary_projection(
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EventAttendanceSummaryProjection:
    """Read the maintained attendance projection without rebuilding on demand."""
    await enforce_event_operation(
        db, event.organization_id, event.id, "registration.analytics.view", user_id=current_user.id
    )
    summary = await EventAttendanceSummaryQueryService(db).get_for_event(
        organization_id=event.organization_id, event_id=event.id
    )
    if summary is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ANALYTICS_PROJECTION_UNAVAILABLE", "message": "The event attendance summary is not available yet."},
        )
    return summary


@router.get("/payment-summary", response_model=EventPaymentSummaryProjection)
async def payment_summary_projection(
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EventPaymentSummaryProjection:
    """Read the maintained payment projection without rebuilding on demand."""
    await enforce_event_operation(
        db, event.organization_id, event.id, "registration.analytics.view", user_id=current_user.id
    )
    summary = await EventPaymentSummaryQueryService(db).get_for_event(
        organization_id=event.organization_id, event_id=event.id
    )
    if summary is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ANALYTICS_PROJECTION_UNAVAILABLE", "message": "The event payment summary is not available yet."},
        )
    return summary


@router.get("/speaker-summary", response_model=EventSpeakerSummaryProjection)
async def speaker_summary_projection(
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> EventSpeakerSummaryProjection:
    """Read the maintained speaker projection without rebuilding it on demand."""
    await enforce_event_operation(
        db, event.organization_id, event.id, "registration.analytics.view", user_id=current_user.id
    )
    summary = await EventSpeakerSummaryQueryService(db).get_for_event(
        organization_id=event.organization_id, event_id=event.id
    )
    if summary is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ANALYTICS_PROJECTION_UNAVAILABLE", "message": "The event speaker summary is not available yet."},
        )
    return summary


@router.get("/funnel", response_model=UploadFunnelStats)
async def upload_funnel(
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UploadFunnelStats:
    """Speaker upload completion funnel."""
    snapshot = await build_analytics_snapshot(db, event.id)
    f = snapshot.get("upload_funnel", {})
    return UploadFunnelStats(
        invited=f.get("invited", 0),
        uploaded=f.get("uploaded", 0),
        approved=f.get("approved", 0),
        rejected=f.get("rejected", 0),
        pending=f.get("pending", 0),
        upload_rate_pct=f.get("upload_rate_pct", 0.0),
        approval_rate_pct=f.get("approval_rate_pct", 0.0),
    )


@router.get("/sessions", response_model=List[SessionReadinessRow])
async def session_readiness(
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[SessionReadinessRow]:
    """Per-session readiness — % of speakers with approved files."""
    snapshot = await build_analytics_snapshot(db, event.id)
    rows = snapshot.get("session_coverage", {}).get("sessions", [])
    
    allowed = await get_allowed_sessions(current_user, event.id, db)
    if allowed is not None:
        rows = [r for r in rows if str(r["session_id"]) in allowed]
        
    return [
        SessionReadinessRow(
            session_id=r["session_id"],
            session_name=r["session_name"],
            session_code=r.get("session_code", ""),
            room_name=r.get("room_name"),
            start_time=r["start_time"],
            total_speakers=r.get("total_speakers", 0),
            files_approved=r.get("files_approved", 0),
            files_pending=r.get("files_pending", 0),
            readiness_pct=r.get("readiness_pct", 0.0),
        )
        for r in rows
    ]


@router.get("/rooms", response_model=List[RoomBreakdownRow])
async def room_breakdown(
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[RoomBreakdownRow]:
    """Per-room session and file readiness breakdown."""
    rows = await get_room_readiness(db, event.id)
    
    allowed = await get_allowed_sessions(current_user, event.id, db)
    if allowed is not None:
        from app.modules.agenda.models import Session
        res = await db.execute(select(Session.room_id).where(Session.id.in_(allowed)))
        allowed_rooms = {str(r) for r in res.scalars().all() if r}
        rows = [r for r in rows if str(r["room_id"]) in allowed_rooms]
        
    return [
        RoomBreakdownRow(
            room_id=r["room_id"],
            room_name=r["room_name"],
            session_count=r.get("session_count", 0),
            speaker_count=r.get("speaker_slots", 0),
            files_approved=r.get("files_ready", 0),
            readiness_pct=r.get("readiness_pct", 0.0),
        )
        for r in rows
    ]



@router.get("/activity", response_model=List[ActivityItem])
async def recent_activity(
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
) -> List[ActivityItem]:
    """Recent activity feed — delegated to snapshot srr/file events."""
    snapshot = await build_analytics_snapshot(db, event.id)
    # Activity feed is returned as-is from the snapshot if available
    return snapshot.get("recent_activity", [])


@router.get("/approval-times", response_model=List[ApprovalTimeRow])
async def approval_times(
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[ApprovalTimeRow]:
    """Average days from upload to approval per session/room."""
    rows = await get_approval_times(db, event.id)
    return [ApprovalTimeRow(**r) for r in rows]


@router.get("/formats", response_model=List[FileFormatRow])
async def file_formats(
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[FileFormatRow]:
    """File format distribution for pie chart."""
    rows = await get_file_format_distribution(db, event.id)
    return [FileFormatRow(**r) for r in rows]


@router.get("/rooms/breakdown", response_model=List[PerRoomBreakdownRow])
async def per_room_breakdown(
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[PerRoomBreakdownRow]:
    """Per-room upload %, validation %, approval % breakdown table."""
    rows = await get_per_room_breakdown(db, event.id)
    return [PerRoomBreakdownRow(**r) for r in rows]


@router.post("/exports", status_code=status.HTTP_202_ACCEPTED)
async def request_analytics_export(
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    idempotency_key: str = Header(
        ..., alias="Idempotency-Key", min_length=8, max_length=200
    ),
    db: AsyncSession = Depends(get_db),
    format: str = Query("xlsx", pattern="^xlsx$"),
) -> dict:
    """Queue a tenant-scoped analytics export and return its durable record."""
    await enforce_event_operation(
        db,
        event.organization_id,
        event.id,
        "exports.create",
        user_id=current_user.id,
    )
    return await AnalyticsExportCommandService.request(
        db,
        event=event,
        actor=current_user,
        idempotency_key=idempotency_key,
        file_format=format,
    )


@router.get("/exports/{export_id}")
async def get_analytics_export(
    export_id: uuid.UUID,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await enforce_event_operation(
        db, event.organization_id, event.id, "exports.create", user_id=current_user.id
    )
    await TenantContextGuard.apply(db, event.organization_id)
    export = await AnalyticsExportQueryService(db).get_for_event(
        organization_id=event.organization_id,
        event_id=event.id,
        export_id=export_id,
    )
    if export is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export not found.")
    return {
        "export_id": str(export.id),
        "status": export.status,
        "event_id": str(export.event_id),
        "format": export.file_format,
        "export_type": export.export_type,
        "created_at": export.created_at,
        "completed_at": export.completed_at,
        "expires_at": export.expires_at,
        "failure_reason": export.failure_reason,
    }


@router.get("/exports/{export_id}/download")
async def download_analytics_export(
    export_id: uuid.UUID,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await enforce_event_operation(
        db, event.organization_id, event.id, "exports.create", user_id=current_user.id
    )
    await TenantContextGuard.apply(db, event.organization_id)
    export = await AnalyticsExportQueryService(db).get_for_event(
        organization_id=event.organization_id,
        event_id=event.id,
        export_id=export_id,
    )
    if export is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export not found.")
    if export.status != "COMPLETED" or not export.storage_key:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "EXPORT_NOT_READY", "status": export.status},
        )
    now = datetime.now(timezone.utc)
    if export.expires_at and export.expires_at <= now:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail={"code": "EXPORT_EXPIRED"})

    filename = f"{event.name.replace(' ', '_')[:40]}_analytics.{export.file_format}"
    download_url = await asyncio.to_thread(
        create_presigned_download,
        bucket=settings.S3_BUCKET_EXPORTS,
        storage_path=export.storage_key,
        filename=filename,
        expiry_seconds=min(settings.S3_PRESIGNED_EXPIRY_SECONDS, 300),
    )
    await AuditService.write_log(AuditContext(
        action_type="EXPORT_DOWNLOADED",
        resource_type="data_export",
        resource_id=export.id,
        actor_user_id=current_user.id,
        organization_id=event.organization_id,
        actor_role=getattr(current_user, "role", None),
        old_state={"status": export.status},
        new_state={"downloaded_at": now.isoformat()},
        is_sensitive=True,
    ))
    return {
        "download_url": download_url,
        "expires_in": min(settings.S3_PRESIGNED_EXPIRY_SECONDS, 300),
        "filename": filename,
    }


@router.get("/export")
async def export_analytics(
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    format: str = Query("csv", pattern="^(csv|xlsx|pdf)$"),
) -> None:
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail={
            "code": "DIRECT_EXPORT_DISABLED",
            "message": "Use POST /exports, poll GET /exports/{export_id}, then download through the authorized endpoint.",
        },
    )
    """
    Export event analytics as a streaming file download.
    format=csv  → application/csv
    format=xlsx → application/xlsx
    format=pdf  → application/pdf
    """
    event_name_slug = event.title.replace(" ", "_")[:40] if hasattr(event, "title") and event.title else str(event.id)[:8]
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M")
    filename = f"{event_name_slug}_analytics_{timestamp}.{format}"

    if format == "csv":
        content = await export_event_data_csv(db, event.id)
        return StreamingResponse(
            iter([content]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    elif format == "xlsx":
        content = await export_event_data_xlsx(db, event.id)
        return StreamingResponse(
            io.BytesIO(content),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    elif format == "pdf":
        content = await export_event_data_pdf(db, event.id)
        return StreamingResponse(
            io.BytesIO(content),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )


@global_router.get("/summary", response_model=DashboardStats)
async def global_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DashboardStats:
    """Aggregated metrics across all events the user has access to."""
    # For now, let's just get all events if super_admin, or assigned events otherwise
    from app.modules.events.models.event import Event
    from app.modules.rbac.models.user_assignment import UserEventAssignment
    
    if current_user.role in ["super_admin", "admin"]:
        res = await db.execute(select(Event.id))
        event_ids = res.scalars().all()
    else:
        res = await db.execute(
            select(UserEventAssignment.event_id)
            .where(UserEventAssignment.user_id == current_user.id)
        )
        event_ids = list(set(res.scalars().all()))

    # Build a combined snapshot
    total_stats = {
        "total_speakers": 0, "total_sessions": 0, "total_rooms": 0,
        "files_uploaded": 0, "files_approved": 0, "files_pending": 0, "files_rejected": 0,
        "sessions_ready": 0, "sessions_total": 0, "upload_rate_pct": 0.0, "approval_rate_pct": 0.0
    }
    
    all_room_readiness = []
    
    for eid in event_ids:
        try:
            snap = await build_analytics_snapshot(db, eid)
            ov = snap.get("overview", {})
            total_stats["total_speakers"] += ov.get("total_speakers", 0)
            total_stats["total_sessions"] += ov.get("total_sessions", 0)
            total_stats["total_rooms"] += ov.get("total_rooms", 0)
            total_stats["files_uploaded"] += ov.get("files_uploaded", 0)
            total_stats["files_approved"] += ov.get("files_approved", 0)
            total_stats["files_pending"] += ov.get("files_pending", 0)
            total_stats["files_rejected"] += ov.get("files_rejected", 0)
            total_stats["sessions_ready"] += ov.get("sessions_ready", 0)
            total_stats["sessions_total"] += ov.get("total_sessions", 0)
            
            # Aggregate room readiness
            for r in snap.get("room_readiness", []):
                all_room_readiness.append(RoomBreakdownRow(
                    room_id=uuid.UUID(r["room_id"]),
                    room_name=f"{r['room_name']}",
                    session_count=r["session_count"],
                    speaker_count=r["speaker_slots"],
                    files_approved=r["files_ready"],
                    readiness_pct=r["readiness_pct"]
                ))
        except Exception:
            continue

    # Recalculate percentages
    if total_stats["total_speakers"] > 0:
        total_stats["upload_rate_pct"] = round(total_stats["files_uploaded"] / total_stats["total_speakers"] * 100, 1)
    if total_stats["files_uploaded"] > 0:
        total_stats["approval_rate_pct"] = round(total_stats["files_approved"] / total_stats["files_uploaded"] * 100, 1)

    return DashboardStats(
        event_id=uuid.UUID('00000000-0000-0000-0000-000000000000'), # Global marker
        total_speakers=total_stats["total_speakers"],
        total_sessions=total_stats["total_sessions"],
        total_rooms=total_stats["total_rooms"],
        files_uploaded=total_stats["files_uploaded"],
        files_approved=total_stats["files_approved"],
        files_pending=total_stats["files_pending"],
        files_rejected=total_stats["files_rejected"],
        speakers_checked_in=0, # SRR not globally aggregated yet
        upload_rate_pct=total_stats["upload_rate_pct"],
        approval_rate_pct=total_stats["approval_rate_pct"],
        sessions_ready=total_stats["sessions_ready"],
        sessions_total=total_stats["sessions_total"],
        daily_uploads=[], # TBD history
        room_readiness=all_room_readiness[:20], # limit for UI
        room_heatmap=[] # heatmaps are event-specific
    )


@router.get("/main-dashboard", response_model=MainEventDashboardData)
async def get_main_event_dashboard(
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MainEventDashboardData:
    """Get the full dashboard data aggregate, respecting permissions."""
    return await build_main_event_dashboard_data(db, event.id, current_user)
