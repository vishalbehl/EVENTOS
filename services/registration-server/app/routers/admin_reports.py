import hashlib
import io
import json
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_database
from app.models.action_log import ParticipantActionLog
from app.models.badge_models import Badge, BadgeHistory, BadgePrintJob
from app.models.companion import Companion
from app.models.event import Event
from app.models.event_report import EventReportAudit, EventReportSnapshot
from app.models.kit_models import Kit, ParticipantKit
from app.models.participant import Participant
from app.models.participant_registration import ParticipantRegistration
from app.models.session import Session
from app.models.venue_checkin import VenueCheckIn
from app.models.venue_sync_job import VenueSyncJob
from app.models.room_device import RoomDevice
from app.models.venue_capacity_rule import VenueCapacityRule
from app.models.sync_outbox import SyncOutbox
from app.models.venue_user import VenueUser
from app.routers.auth import require_admin

router = APIRouter(prefix="/api/v1/venue/admin", tags=["admin_reports"])


class SnapshotCreateRequest(BaseModel):
    revision_reason: Optional[str] = Field(default=None, max_length=1000)
    sections: Optional[list[str]] = None
    columns: Optional[dict[str, list[str]]] = None


REPORT_SECTIONS = [
    ("executive_summary", "Executive Summary", "summary"),
    ("registration", "Registration Report", "delegates"),
    ("attendance", "Attendance / Check-in", "attendance"),
    ("no_show", "No-show", "delegates"),
    ("payment", "Payment", "delegates"),
    ("badge", "Badge", "badges"),
    ("companion", "Companion", "companions"),
    ("kit", "Kit", "kits"),
    ("certificate", "Certificate", "certificates"),
    ("participant_excel", "Participant Excel export", "delegates"),
    ("demographics", "Demographics", "breakdowns"),
    ("checkin_hourly", "Check-in hourly analysis", "hourly_checkins"),
    ("capacity", "Capacity utilization", "capacity"),
    ("review_rejection", "Review / rejection", "delegates"),
    ("checkin_exceptions", "Check-in exceptions", "venue_scans"),
    ("admin_override", "Admin override report", "overrides"),
    ("desk_performance", "Registration desk performance", "desk_performance"),
    ("offline_operation", "Offline operation report", "offline_operation"),
    ("sync_performance", "Sync performance", "sync"),
    ("device_health", "Device/printer health", "devices"),
    ("audit_summary", "Audit summary", "actions"),
    ("automated_insights", "Automated Event Insights", "insights"),
]

DEFAULT_REPORT_SECTIONS = [item[0] for item in REPORT_SECTIONS]


def _report_layout(report: dict[str, Any], sections: Optional[list[str]] = None, columns: Optional[dict[str, list[str]]] = None) -> dict[str, Any]:
    requested = sections if sections is not None else report.get("metadata", {}).get("layout", {}).get("sections", DEFAULT_REPORT_SECTIONS)
    selected = [value for value in requested if value in DEFAULT_REPORT_SECTIONS]
    return {"sections": selected, "columns": columns or report.get("metadata", {}).get("layout", {}).get("columns", {})}


class ReportEnvelope(BaseModel):
    metadata: dict[str, Any]
    summary: dict[str, Any]
    breakdowns: dict[str, list[dict[str, Any]]]
    delegates: list[dict[str, Any]]
    attendance: list[dict[str, Any]]
    venue_scans: list[dict[str, Any]]
    companions: list[dict[str, Any]]
    badges: list[dict[str, Any]]
    kits: list[dict[str, Any]]
    actions: list[dict[str, Any]]
    sync: dict[str, Any]
    warnings: list[str]
    certificates: list[dict[str, Any]] = []
    hourly_checkins: list[dict[str, Any]] = []
    capacity: list[dict[str, Any]] = []
    overrides: list[dict[str, Any]] = []
    desk_performance: list[dict[str, Any]] = []
    offline_operation: dict[str, Any] = {}
    devices: list[dict[str, Any]] = []
    insights: list[dict[str, Any]] = []
    section_catalog: list[dict[str, Any]] = []


def _iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, (datetime,)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): _safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_safe(v) for v in value]
    return str(value)


def _breakdown(values: list[str], label: str) -> list[dict[str, Any]]:
    return [
        {label: key or "Unspecified", "count": count}
        for key, count in sorted(Counter(values).items(), key=lambda item: (-item[1], item[0] or ""))
    ]


async def _event_or_404(db: AsyncSession, event_id: uuid.UUID) -> Event:
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Local event not found")
    return event


async def build_event_report(db: AsyncSession, event: Event) -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc)
    participants = (
        await db.execute(select(Participant).where(Participant.event_id == event.id).order_by(Participant.registered_at))
    ).scalars().all()
    participant_ids = [p.id for p in participants]
    participant_map = {p.id: p for p in participants}

    registrations = (
        await db.execute(select(ParticipantRegistration).where(ParticipantRegistration.event_id == event.id))
    ).scalars().all()
    registration_by_participant = {r.participant_id: r for r in registrations if r.participant_id}

    sessions = (
        await db.execute(select(Session).where(Session.event_id == event.id))
    ).scalars().all()
    session_map = {s.id: s for s in sessions}

    if participant_ids:
        venue_scans = (
            await db.execute(
                select(VenueCheckIn)
                .where((VenueCheckIn.event_id == event.id) | (VenueCheckIn.participant_id.in_(participant_ids)))
                .order_by(VenueCheckIn.checkin_time)
            )
        ).scalars().all()
        attendance_logs = [row for row in venue_scans if row.status in {"success", "admin_overridden"}]
        badges = (
            await db.execute(select(Badge).where(Badge.participant_id.in_(participant_ids)))
        ).scalars().all()
        badge_ids = [badge.id for badge in badges]
        histories = (
            (await db.execute(select(BadgeHistory).where(BadgeHistory.badge_id.in_(badge_ids)))).scalars().all()
            if badge_ids else []
        )
        print_jobs = (
            (await db.execute(select(BadgePrintJob).where(BadgePrintJob.badge_id.in_(badge_ids)))).scalars().all()
            if badge_ids else []
        )
        participant_kits = (
            await db.execute(select(ParticipantKit).where(ParticipantKit.participant_id.in_(participant_ids)))
        ).scalars().all()
        companions = (
            await db.execute(select(Companion).where(Companion.primary_participant_id.in_(participant_ids)))
        ).scalars().all()
        actions = (
            await db.execute(
                select(ParticipantActionLog)
                .where(ParticipantActionLog.participant_id.in_(participant_ids))
                .order_by(ParticipantActionLog.created_at)
            )
        ).scalars().all()
    else:
        attendance_logs, venue_scans, badges, histories, print_jobs, participant_kits, companions, actions = ([],) * 8

    kit_ids = list({row.kit_id for row in participant_kits})
    kits_by_id = {
        row.id: row for row in (
            (await db.execute(select(Kit).where(Kit.id.in_(kit_ids)))).scalars().all() if kit_ids else []
        )
    }
    histories_by_badge: dict[uuid.UUID, list[BadgeHistory]] = defaultdict(list)
    jobs_by_badge: dict[uuid.UUID, list[BadgePrintJob]] = defaultdict(list)
    for row in histories:
        histories_by_badge[row.badge_id].append(row)
    for row in print_jobs:
        jobs_by_badge[row.badge_id].append(row)

    attendance_by_participant: dict[uuid.UUID, list[VenueCheckIn]] = defaultdict(list)
    scans_by_participant: dict[uuid.UUID, list[VenueCheckIn]] = defaultdict(list)
    for row in attendance_logs:
        attendance_by_participant[row.participant_id].append(row)
    for row in venue_scans:
        if row.participant_id:
            scans_by_participant[row.participant_id].append(row)

    delegate_rows: list[dict[str, Any]] = []
    for participant in participants:
        registration = registration_by_participant.get(participant.id)
        person_attendance = attendance_by_participant.get(participant.id, [])
        person_scans = scans_by_participant.get(participant.id, [])
        successful_scans = [scan for scan in person_scans if scan.status in {"success", "admin_overridden"}]
        delegate_rows.append({
            "id": str(participant.id),
            "registration_code": participant.regno or "",
            "name": participant.name,
            "first_name": participant.first_name,
            "last_name": participant.last_name,
            "email": participant.email,
            "phone": participant.phone,
            "role": participant.role or "Delegate",
            "company": participant.company,
            "designation": participant.designation,
            "country": participant.country,
            "payment_status": participant.paid_status,
            "registration_status": registration.registration_status if registration else None,
            "review_status": (participant.custom_fields or {}).get("review_status"),
            "approval_source": registration.approval_source if registration else None,
            "source": participant.source,
            "custom_fields": _safe(participant.custom_fields or {}),
            "registered_at": _iso(participant.registered_at),
            "venue_checkins": len(successful_scans),
            "session_visits": len(person_attendance),
            "currently_checked_in": any(log.checkout_time is None for log in person_attendance),
            "no_show": not successful_scans and not person_attendance,
        })

    attendance_rows = []
    for row in attendance_logs:
        participant = participant_map.get(row.participant_id)
        session = session_map.get(row.session_id)
        duration = row.duration
        if duration is None and row.checkout_time:
            duration = max(0, int((row.checkout_time - row.checkin_time).total_seconds()))
        attendance_rows.append({
            "id": str(row.id),
            "participant_id": str(row.participant_id),
            "registration_code": participant.regno if participant else None,
            "delegate": participant.name if participant else "Unknown delegate",
            "role": participant.role if participant else None,
            "session_id": str(row.session_id) if row.session_id else None,
            "session": session.name if session else "Venue attendance",
            "session_code": session.session_code if session else None,
            "checkin_time": _iso(row.checkin_time),
            "checkout_time": _iso(row.checkout_time),
            "duration_seconds": duration,
            "state": "open" if row.checkout_time is None else "completed",
            "method": row.method,
            "device_id": row.device_id,
        })

    venue_scan_rows = []
    for row in venue_scans:
        participant = participant_map.get(row.participant_id) if row.participant_id else None
        venue_scan_rows.append({
            "id": str(row.id),
            "participant_id": str(row.participant_id) if row.participant_id else None,
            "registration_code": participant.regno if participant else None,
            "delegate": participant.name if participant else "Unknown delegate",
            "role": participant.role if participant else None,
            "station": row.station_name,
            "station_type": row.station_type,
            "scan_type": row.scan_type,
            "status": row.status,
            "rejection_reason": row.rejection_reason,
            "admin_overridden_by": row.admin_overridden_by,
            "badge_code": row.badge_code,
            "checkin_time": _iso(row.checkin_time),
        })

    badge_rows = []
    for row in badges:
        participant = participant_map.get(row.participant_id)
        row_jobs = jobs_by_badge.get(row.id, [])
        row_history = histories_by_badge.get(row.id, [])
        badge_rows.append({
            "id": str(row.id),
            "participant_id": str(row.participant_id),
            "delegate": participant.name if participant else "Unknown delegate",
            "registration_code": participant.regno if participant else None,
            "badge_code": row.badge_code,
            "status": row.status,
            "issued_at": _iso(row.issued_at),
            "print_count": len([job for job in row_jobs if job.status == "printed" or job.printed_at]),
            "reprint_count": len([history for history in row_history if "reprint" in history.action.lower()]),
            "last_printed_at": max((_iso(job.printed_at) for job in row_jobs if job.printed_at), default=None),
        })

    kit_rows = []
    for row in participant_kits:
        participant = participant_map.get(row.participant_id)
        kit = kits_by_id.get(row.kit_id)
        kit_rows.append({
            "id": str(row.id),
            "participant_id": str(row.participant_id),
            "delegate": participant.name if participant else "Unknown delegate",
            "registration_code": participant.regno if participant else None,
            "kit": kit.kit_name if kit else "Unknown kit",
            "category": kit.category if kit else None,
            "status": row.status,
            "issued_by": row.issued_by,
            "issued_at": _iso(row.issued_at),
        })

    companion_rows = []
    for row in companions:
        primary = participant_map.get(row.primary_participant_id)
        companion_rows.append({
            "id": str(row.id),
            "primary_participant_id": str(row.primary_participant_id),
            "primary_delegate": primary.name if primary else "Unknown delegate",
            "name": f"{row.first_name} {row.last_name}".strip(),
            "relationship": row.relationship,
            "email": row.email,
            "phone": row.phone,
            "badge_code": row.badge_code,
            "badge_status": row.badge_status,
            "dietary_preference": row.dietary_preference,
            "special_assistance": row.special_assistance,
            "notes": row.notes,
        })

    action_rows = []
    for row in actions:
        participant = participant_map.get(row.participant_id)
        action_rows.append({
            "id": str(row.id),
            "participant_id": str(row.participant_id),
            "delegate": participant.name if participant else "Unknown delegate",
            "registration_code": participant.regno if participant else None,
            "action": row.action_type,
            "performed_by": row.performed_by,
            "details": row.details,
            "created_at": _iso(row.created_at),
        })

    sync_jobs = (
        await db.execute(select(VenueSyncJob).where(VenueSyncJob.event_id == event.id).order_by(VenueSyncJob.created_at))
    ).scalars().all()
    sync_counts = Counter(job.status for job in sync_jobs)
    latest_sync = max(
        (job.completed_at or job.started_at or job.created_at for job in sync_jobs), default=None
    )

    # These counts are shared by the warning, insight, capacity, and summary sections.
    open_attendance = sum(1 for row in attendance_rows if row["state"] == "open")
    rejected_scans = sum(1 for row in venue_scan_rows if row["status"] == "rejected")
    no_shows = sum(1 for row in delegate_rows if row["no_show"])

    devices = (
        await db.execute(
            select(RoomDevice).where(RoomDevice.event_id == event.id).order_by(RoomDevice.device_name)
        )
    ).scalars().all()
    capacity_rules = (
        await db.execute(select(VenueCapacityRule).order_by(VenueCapacityRule.station_name))
    ).scalars().all()
    outbox_rows = (await db.execute(select(SyncOutbox))).scalars().all()
    participant_id_set = {str(row.id) for row in participants}
    event_outbox = [
        row for row in outbox_rows
        if str((row.payload or {}).get("event_id", "")) == str(event.id)
        or str((row.payload or {}).get("participant_id", "")) in participant_id_set
    ]
    hourly_counts = Counter(
        row.checkin_time.astimezone(timezone.utc).hour if row.checkin_time.tzinfo else row.checkin_time.hour
        for row in venue_scans if row.status in {"success", "admin_overridden"}
    )
    hourly_rows = [{"hour": f"{hour:02d}:00", "checkins": hourly_counts.get(hour, 0)} for hour in range(24)]
    station_counts = Counter(row["station"] for row in venue_scan_rows if row["status"] in {"success", "admin_overridden"})
    capacity_rows = [
        {
            "station": rule.station_name,
            "capacity": rule.station_capacity,
            "checkins": station_counts.get(rule.station_name, 0),
            "utilization_pct": round(station_counts.get(rule.station_name, 0) / rule.station_capacity * 100, 1) if rule.station_capacity else None,
            "updated_by": rule.updated_by,
            "updated_reason": rule.updated_reason,
        }
        for rule in capacity_rules
    ]
    desk_performance = [
        {
            "station": station,
            "total_scans": count,
            "successful_scans": sum(1 for row in venue_scan_rows if row["station"] == station and row["status"] in {"success", "admin_overridden"}),
            "rejected_scans": sum(1 for row in venue_scan_rows if row["station"] == station and row["status"] == "rejected"),
            "overridden_scans": sum(1 for row in venue_scan_rows if row["station"] == station and row["status"] == "admin_overridden"),
        }
        for station, count in sorted(Counter(row["station"] for row in venue_scan_rows).items())
    ]
    override_rows = [row for row in venue_scan_rows if row["status"] == "admin_overridden"]
    device_rows = [
        {
            "device_name": row.device_name,
            "device_type": row.device_type,
            "status": row.status,
            "last_heartbeat_at": _iso(row.last_heartbeat_at),
            "hostname": row.hostname,
            "app_version": row.app_version,
        }
        for row in devices
    ]
    insights = []
    if no_shows:
        insights.append({"severity": "attention", "title": "No-show follow-up", "detail": f"{no_shows} registered delegate(s) have no successful attendance record."})
    if open_attendance:
        insights.append({"severity": "attention", "title": "Open attendance", "detail": f"{open_attendance} attendance record(s) have no check-out time."})
    if rejected_scans:
        insights.append({"severity": "warning", "title": "Rejected scans", "detail": f"{rejected_scans} scan(s) were rejected and should be reviewed."})
    if not insights:
        insights.append({"severity": "positive", "title": "No automated exceptions", "detail": "No exception pattern was identified in the synchronized event records."})

    warnings: list[str] = []
    open_attendance = sum(1 for row in attendance_rows if row["state"] == "open")
    rejected_scans = sum(1 for row in venue_scan_rows if row["status"] == "rejected")
    no_shows = sum(1 for row in delegate_rows if row["no_show"])
    if open_attendance:
        warnings.append(f"{open_attendance} attendance record(s) have no check-out time.")
    if rejected_scans:
        warnings.append(f"{rejected_scans} venue scan(s) were rejected.")
    if no_shows:
        warnings.append(f"{no_shows} registered delegate(s) have no successful attendance record.")
    if sync_counts.get("failed", 0):
        warnings.append(f"{sync_counts['failed']} venue sync job(s) failed.")

    role_values = [row["role"] or "Delegate" for row in delegate_rows]
    status_values = [row["registration_status"] or row["payment_status"] or "Unspecified" for row in delegate_rows]
    source_values = [row["source"] or "Unspecified" for row in delegate_rows]
    company_values = [row["company"] or "Unspecified" for row in delegate_rows]
    country_values = [row["country"] or "Unspecified" for row in delegate_rows]

    report = {
        "metadata": {
            "event_id": str(event.id),
            "event_name": event.name,
            "short_code": event.short_code,
            "venue_name": event.venue_name or event.location,
            "location": event.location,
            "country": event.country,
            "organizer_name": event.organizer_name,
            "start_date": _iso(event.start_date),
            "end_date": _iso(event.end_date),
            "timezone": event.timezone,
            "event_status": event.status,
            "generated_at": generated_at.isoformat(),
            "data_freshness_at": _iso(latest_sync or event.updated_at),
            "source": "venue-local-postgresql",
            "data_scope": "full_pii",
            "layout": {"sections": list(DEFAULT_REPORT_SECTIONS), "columns": {}},
        },
        "summary": {
            "total_delegates": len(delegate_rows),
            "checked_in_delegates": len({row["participant_id"] for row in venue_scan_rows if row["status"] in {"success", "admin_overridden"} and row["participant_id"]}),
            "no_shows": no_shows,
            "open_attendance": open_attendance,
            "completed_attendance": len(attendance_rows) - open_attendance,
            "rejected_scans": rejected_scans,
            "overridden_scans": sum(1 for row in venue_scan_rows if row["status"] == "admin_overridden"),
            "companions": len(companion_rows),
            "badges_issued": sum(1 for row in badge_rows if row["issued_at"] or row["status"] in {"issued", "printed"}),
            "badges_printed": sum(row["print_count"] for row in badge_rows),
            "badge_reprints": sum(row["reprint_count"] for row in badge_rows),
            "kits_issued": len([row for row in kit_rows if row["status"].lower() == "issued"]),
            "operational_actions": len(action_rows),
        },
        "breakdowns": {
            "roles": _breakdown(role_values, "role"),
            "registration_statuses": _breakdown(status_values, "status"),
            "sources": _breakdown(source_values, "source"),
            "companies": _breakdown(company_values, "company"),
            "countries": _breakdown(country_values, "country"),
            "stations": _breakdown([row["station"] or "Unspecified" for row in venue_scan_rows], "station"),
        },
        "delegates": delegate_rows,
        "attendance": attendance_rows,
        "venue_scans": venue_scan_rows,
        "companions": companion_rows,
        "badges": badge_rows,
        "kits": kit_rows,
        "actions": action_rows,
        "sync": {
            "latest_activity_at": _iso(latest_sync),
            "total_jobs": len(sync_jobs),
            "status_counts": dict(sync_counts),
            "failed_jobs": [
                {"id": str(job.id), "type": job.sync_type, "error": job.error_message, "created_at": _iso(job.created_at)}
                for job in sync_jobs if job.status == "failed"
            ],
        },
        "certificates": [],
        "hourly_checkins": hourly_rows,
        "capacity": capacity_rows,
        "overrides": override_rows,
        "desk_performance": desk_performance,
        "offline_operation": {
            "total_outbox_records": len(event_outbox),
            "pending": sum(1 for row in event_outbox if row.status in {"pending", "syncing"}),
            "failed": sum(1 for row in event_outbox if row.status == "failed"),
            "completed": sum(1 for row in event_outbox if row.status == "completed"),
        },
        "devices": device_rows,
        "insights": insights,
        "section_catalog": [{"id": key, "title": title, "data_key": data_key} for key, title, data_key in REPORT_SECTIONS],
        "warnings": warnings,
    }
    return _safe(report)


def _canonical_hash(report: dict[str, Any]) -> str:
    payload = json.dumps(report, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


async def _audit(
    db: AsyncSession,
    event_id: uuid.UUID,
    actor: VenueUser,
    action: str,
    snapshot: EventReportSnapshot | None = None,
    export_format: str | None = None,
    content_hash: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    db.add(EventReportAudit(
        event_id=event_id,
        snapshot_id=snapshot.id if snapshot else None,
        actor_user_id=actor.id,
        action=action,
        export_format=export_format,
        data_scope="full_pii",
        content_hash=content_hash,
        details=details or {},
    ))


def _snapshot_dict(snapshot: EventReportSnapshot) -> dict[str, Any]:
    return {
        "id": str(snapshot.id),
        "event_id": str(snapshot.event_id),
        "version": snapshot.version,
        "content_hash": snapshot.content_hash,
        "created_by": str(snapshot.created_by),
        "supersedes_id": str(snapshot.supersedes_id) if snapshot.supersedes_id else None,
        "revision_reason": snapshot.revision_reason,
        "created_at": _iso(snapshot.created_at),
    }


@router.get("/events")
async def list_local_events(
    db: AsyncSession = Depends(get_database),
    _: VenueUser = Depends(require_admin),
):
    events = (await db.execute(select(Event).order_by(Event.start_date.desc(), Event.name))).scalars().all()
    return [{
        "id": str(event.id), "name": event.name, "short_code": event.short_code,
        "status": event.status, "start_date": _iso(event.start_date), "end_date": _iso(event.end_date),
        "venue_name": event.venue_name or event.location,
    } for event in events]


@router.get("/events/{event_id}/report", response_model=ReportEnvelope)
async def get_event_report(
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_database),
    actor: VenueUser = Depends(require_admin),
):
    event = await _event_or_404(db, event_id)
    report = await build_event_report(db, event)
    await _audit(db, event.id, actor, "view")
    await db.commit()
    return report


@router.get("/events/{event_id}/report/snapshots")
async def list_report_snapshots(
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_database),
    _: VenueUser = Depends(require_admin),
):
    await _event_or_404(db, event_id)
    snapshots = (
        await db.execute(
            select(EventReportSnapshot)
            .where(EventReportSnapshot.event_id == event_id)
            .order_by(EventReportSnapshot.version.desc())
        )
    ).scalars().all()
    return [_snapshot_dict(snapshot) for snapshot in snapshots]


@router.post("/events/{event_id}/report/snapshots", status_code=status.HTTP_201_CREATED)
async def create_report_snapshot(
    event_id: uuid.UUID,
    payload: SnapshotCreateRequest,
    db: AsyncSession = Depends(get_database),
    actor: VenueUser = Depends(require_admin),
):
    event = await _event_or_404(db, event_id)
    latest = (
        await db.execute(
            select(EventReportSnapshot)
            .where(EventReportSnapshot.event_id == event.id)
            .order_by(EventReportSnapshot.version.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    reason = (payload.revision_reason or "").strip()
    if latest and not reason:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A revision reason is required after the first final report")
    report = await build_event_report(db, event)
    report["metadata"]["layout"] = _report_layout(report, payload.sections, payload.columns)
    snapshot = EventReportSnapshot(
        event_id=event.id,
        version=(latest.version + 1) if latest else 1,
        report_data=report,
        content_hash=_canonical_hash(report),
        created_by=actor.id,
        supersedes_id=latest.id if latest else None,
        revision_reason=reason or None,
    )
    db.add(snapshot)
    await db.flush()
    await _audit(db, event.id, actor, "finalize" if not latest else "revise", snapshot=snapshot, content_hash=snapshot.content_hash, details={"revision_reason": reason or None})
    await db.commit()
    await db.refresh(snapshot)
    return _snapshot_dict(snapshot)


def _text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    return str(value)


def _pdf_bytes(report: dict[str, Any], version: str) -> bytes:
    try:
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_CENTER
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    except ImportError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="PDF export dependency is unavailable") from exc

    output = io.BytesIO()
    meta = report["metadata"]
    doc = SimpleDocTemplate(output, pagesize=landscape(A4), rightMargin=10*mm, leftMargin=10*mm, topMargin=12*mm, bottomMargin=12*mm)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="ReportTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=18, leading=22, alignment=TA_CENTER, textColor=colors.HexColor("#162033")))
    styles.add(ParagraphStyle(name="Small", parent=styles["BodyText"], fontSize=6.5, leading=8))
    story: list[Any] = [
        Paragraph(_text(meta.get("event_name")), styles["ReportTitle"]),
        Paragraph(f"Complete venue operations report · {version} · Generated {_text(meta.get('generated_at'))}", styles["BodyText"]),
        Spacer(1, 4*mm),
        Paragraph("Sensitive data: this administrator export contains delegate contact information. Store and share it securely.", styles["BodyText"]),
        Spacer(1, 4*mm),
    ]

    def add_table(title: str, rows: list[dict[str, Any]], columns: list[tuple[str, str]], page_break: bool = True):
        if page_break:
            story.append(PageBreak())
        story.append(Paragraph(title, styles["Heading2"]))
        if not rows:
            story.append(Paragraph("No records available.", styles["BodyText"]))
            return
        data = [[Paragraph(label, styles["Small"]) for _, label in columns]]
        for row in rows:
            data.append([Paragraph(_text(row.get(key)).replace("&", "&amp;").replace("<", "&lt;"), styles["Small"]) for key, _ in columns])
        table = Table(data, repeatRows=1, hAlign="LEFT")
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#162033")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CBD5E1")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
            ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(table)

    add_table("Event overview", [{**meta, **report["summary"]}], [("short_code", "Code"), ("venue_name", "Venue"), ("start_date", "Starts"), ("end_date", "Ends"), ("event_status", "Status"), ("total_delegates", "Delegates"), ("checked_in_delegates", "Checked in"), ("no_shows", "No-shows")], page_break=False)
    add_table("Role distribution", report["breakdowns"]["roles"], [("role", "Role"), ("count", "Count")])
    add_table("Delegate appendix", report["delegates"], [("registration_code", "Reg code"), ("name", "Name"), ("email", "Email"), ("phone", "Phone"), ("role", "Role"), ("company", "Company"), ("designation", "Designation"), ("country", "Country"), ("registration_status", "Registration"), ("payment_status", "Payment"), ("source", "Source"), ("registered_at", "Registered")])
    add_table("Session attendance", report["attendance"], [("registration_code", "Reg code"), ("delegate", "Delegate"), ("role", "Role"), ("session", "Session"), ("checkin_time", "Check-in"), ("checkout_time", "Check-out"), ("duration_seconds", "Seconds"), ("state", "State"), ("method", "Method"), ("device_id", "Device")])
    add_table("Venue scans", report["venue_scans"], [("registration_code", "Reg code"), ("delegate", "Delegate"), ("station", "Station"), ("scan_type", "Type"), ("status", "Status"), ("checkin_time", "Time"), ("rejection_reason", "Rejection"), ("admin_overridden_by", "Override by")])
    add_table("Companions", report["companions"], [("primary_delegate", "Primary delegate"), ("name", "Companion"), ("relationship", "Relationship"), ("email", "Email"), ("phone", "Phone"), ("badge_status", "Badge"), ("special_assistance", "Assistance")])
    add_table("Badges", report["badges"], [("registration_code", "Reg code"), ("delegate", "Delegate"), ("badge_code", "Badge"), ("status", "Status"), ("issued_at", "Issued"), ("print_count", "Prints"), ("reprint_count", "Reprints")])
    add_table("Kits", report["kits"], [("registration_code", "Reg code"), ("delegate", "Delegate"), ("kit", "Kit"), ("category", "Category"), ("status", "Status"), ("issued_by", "Issued by"), ("issued_at", "Issued at")])
    add_table("Operational audit", report["actions"], [("registration_code", "Reg code"), ("delegate", "Delegate"), ("action", "Action"), ("performed_by", "Operator"), ("details", "Details"), ("created_at", "Time")])

    def footer(canvas, document):
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.drawString(10*mm, 7*mm, f"{meta.get('event_name')} · {version} · full PII")
        canvas.drawRightString(landscape(A4)[0] - 10*mm, 7*mm, f"Page {document.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return output.getvalue()


def _docx_bytes(report: dict[str, Any], version: str) -> bytes:
    try:
        from docx import Document
        from docx.enum.section import WD_ORIENT
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from docx.shared import Inches, Pt
    except ImportError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="DOCX export dependency is unavailable") from exc

    document = Document()
    section = document.sections[0]
    section.orientation = WD_ORIENT.LANDSCAPE
    section.page_width, section.page_height = section.page_height, section.page_width
    section.left_margin = section.right_margin = Inches(0.45)
    title = document.add_heading(_text(report["metadata"].get("event_name")), 0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    document.add_paragraph(f"Complete venue operations report · {version} · Generated {_text(report['metadata'].get('generated_at'))}")
    warning = document.add_paragraph("SENSITIVE DATA — This administrator export contains full delegate contact information.")
    warning.runs[0].bold = True

    def add_table(title_text: str, rows: list[dict[str, Any]], columns: list[tuple[str, str]]):
        document.add_heading(title_text, level=1)
        if not rows:
            document.add_paragraph("No records available.")
            return
        table = document.add_table(rows=1, cols=len(columns))
        table.style = "Table Grid"
        for cell, (_, label) in zip(table.rows[0].cells, columns):
            cell.text = label
        for row in rows:
            cells = table.add_row().cells
            for cell, (key, _) in zip(cells, columns):
                cell.text = _text(row.get(key))
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    for run in paragraph.runs:
                        run.font.size = Pt(7)

    meta = report["metadata"]
    add_table("Event overview", [{**meta, **report["summary"]}], [("short_code", "Code"), ("venue_name", "Venue"), ("start_date", "Starts"), ("end_date", "Ends"), ("event_status", "Status"), ("total_delegates", "Delegates"), ("checked_in_delegates", "Checked in"), ("no_shows", "No-shows")])
    add_table("Role distribution", report["breakdowns"]["roles"], [("role", "Role"), ("count", "Count")])
    add_table("Delegate appendix", report["delegates"], [("registration_code", "Reg code"), ("name", "Name"), ("email", "Email"), ("phone", "Phone"), ("role", "Role"), ("company", "Company"), ("designation", "Designation"), ("country", "Country"), ("registration_status", "Registration"), ("payment_status", "Payment"), ("source", "Source"), ("registered_at", "Registered")])
    add_table("Session attendance", report["attendance"], [("registration_code", "Reg code"), ("delegate", "Delegate"), ("role", "Role"), ("session", "Session"), ("checkin_time", "Check-in"), ("checkout_time", "Check-out"), ("duration_seconds", "Seconds"), ("state", "State"), ("method", "Method"), ("device_id", "Device")])
    add_table("Venue scans", report["venue_scans"], [("registration_code", "Reg code"), ("delegate", "Delegate"), ("station", "Station"), ("scan_type", "Type"), ("status", "Status"), ("checkin_time", "Time"), ("rejection_reason", "Rejection"), ("admin_overridden_by", "Override by")])
    add_table("Companions", report["companions"], [("primary_delegate", "Primary delegate"), ("name", "Companion"), ("relationship", "Relationship"), ("email", "Email"), ("phone", "Phone"), ("badge_status", "Badge"), ("special_assistance", "Assistance")])
    add_table("Badges", report["badges"], [("registration_code", "Reg code"), ("delegate", "Delegate"), ("badge_code", "Badge"), ("status", "Status"), ("issued_at", "Issued"), ("print_count", "Prints"), ("reprint_count", "Reprints")])
    add_table("Kits", report["kits"], [("registration_code", "Reg code"), ("delegate", "Delegate"), ("kit", "Kit"), ("category", "Category"), ("status", "Status"), ("issued_by", "Issued by"), ("issued_at", "Issued at")])
    add_table("Operational audit", report["actions"], [("registration_code", "Reg code"), ("delegate", "Delegate"), ("action", "Action"), ("performed_by", "Operator"), ("details", "Details"), ("created_at", "Time")])
    output = io.BytesIO()
    document.save(output)
    return output.getvalue()


def _export_specs(report: dict[str, Any]) -> list[tuple[str, str, list[dict[str, Any]], list[tuple[str, str]], str]]:
    return [
        ("registration", "Registration Report", report["delegates"], [("registration_code", "Reg code"), ("name", "Name"), ("email", "Email"), ("phone", "Phone"), ("role", "Role"), ("company", "Company"), ("designation", "Designation"), ("country", "Country"), ("registration_status", "Registration"), ("payment_status", "Payment"), ("source", "Source"), ("registered_at", "Registered")], "delegates"),
        ("attendance", "Attendance / Check-in", report["attendance"], [("registration_code", "Reg code"), ("delegate", "Delegate"), ("role", "Role"), ("session", "Session"), ("checkin_time", "Check-in"), ("checkout_time", "Check-out"), ("duration_seconds", "Seconds"), ("state", "State"), ("method", "Method"), ("device_id", "Device")], "attendance"),
        ("no_show", "No-show", [row for row in report["delegates"] if row.get("no_show")], [("registration_code", "Reg code"), ("name", "Name"), ("role", "Role"), ("company", "Company"), ("registered_at", "Registered")], "delegates"),
        ("payment", "Payment", report["delegates"], [("registration_code", "Reg code"), ("name", "Name"), ("role", "Role"), ("payment_status", "Payment"), ("review_status", "Review"), ("registered_at", "Registered")], "payment"),
        ("badge", "Badge", report["badges"], [("registration_code", "Reg code"), ("delegate", "Delegate"), ("badge_code", "Badge"), ("status", "Status"), ("issued_at", "Issued"), ("print_count", "Prints"), ("reprint_count", "Reprints")], "badges"),
        ("companion", "Companion", report["companions"], [("primary_delegate", "Primary delegate"), ("name", "Companion"), ("relationship", "Relationship"), ("email", "Email"), ("phone", "Phone"), ("badge_status", "Badge"), ("special_assistance", "Assistance")], "companions"),
        ("kit", "Kit", report["kits"], [("registration_code", "Reg code"), ("delegate", "Delegate"), ("kit", "Kit"), ("category", "Category"), ("status", "Status"), ("issued_by", "Issued by"), ("issued_at", "Issued at")], "kits"),
        ("certificate", "Certificate", report.get("certificates", []), [("registration_code", "Reg code"), ("delegate", "Delegate"), ("status", "Status"), ("issued_at", "Issued")], "certificates"),
        ("participant_excel", "Participant Excel export", report["delegates"], [("registration_code", "Reg code"), ("name", "Name"), ("email", "Email"), ("phone", "Phone"), ("role", "Role"), ("company", "Company"), ("custom_fields", "Custom fields")], "delegates"),
        ("demographics", "Demographics", report["breakdowns"].get("countries", []), [("country", "Country"), ("count", "Count")], "demographics"),
        ("checkin_hourly", "Check-in hourly analysis", report.get("hourly_checkins", []), [("hour", "Hour"), ("checkins", "Check-ins")], "hourly_checkins"),
        ("capacity", "Capacity utilization", report.get("capacity", []), [("station", "Station"), ("capacity", "Capacity"), ("checkins", "Check-ins"), ("utilization_pct", "Utilization %"), ("updated_by", "Updated by"), ("updated_reason", "Override reason")], "capacity"),
        ("review_rejection", "Review / rejection", report["delegates"], [("registration_code", "Reg code"), ("name", "Name"), ("registration_status", "Registration"), ("review_status", "Review"), ("review_notes", "Notes")], "review"),
        ("checkin_exceptions", "Check-in exceptions", [row for row in report["venue_scans"] if row.get("status") == "rejected"], [("registration_code", "Reg code"), ("delegate", "Delegate"), ("station", "Station"), ("status", "Status"), ("rejection_reason", "Reason"), ("checkin_time", "Time")], "venue_scans"),
        ("admin_override", "Admin override report", report.get("overrides", []), [("registration_code", "Reg code"), ("delegate", "Delegate"), ("station", "Station"), ("admin_overridden_by", "Override by"), ("checkin_time", "Time")], "overrides"),
        ("desk_performance", "Registration desk performance", report.get("desk_performance", []), [("station", "Station"), ("total_scans", "Total scans"), ("successful_scans", "Successful"), ("rejected_scans", "Rejected"), ("overridden_scans", "Overrides")], "desk_performance"),
        ("offline_operation", "Offline operation report", [report.get("offline_operation", {})], [("total_outbox_records", "Outbox"), ("pending", "Pending"), ("failed", "Failed"), ("completed", "Completed")], "offline_operation"),
        ("sync_performance", "Sync performance", report["sync"].get("failed_jobs", []), [("id", "Job"), ("type", "Type"), ("error", "Error"), ("created_at", "Created")], "sync"),
        ("device_health", "Device/printer health", report.get("devices", []), [("device_name", "Device"), ("device_type", "Type"), ("status", "Status"), ("last_heartbeat_at", "Heartbeat"), ("hostname", "Hostname"), ("app_version", "Version")], "devices"),
        ("audit_summary", "Audit summary", report["actions"], [("registration_code", "Reg code"), ("delegate", "Delegate"), ("action", "Action"), ("performed_by", "Operator"), ("details", "Details"), ("created_at", "Time")], "actions"),
        ("automated_insights", "Automated Event Insights", report.get("insights", []), [("severity", "Severity"), ("title", "Insight"), ("detail", "Detail")], "insights"),
    ]


def _selected_columns(report: dict[str, Any], key: str, defaults: list[tuple[str, str]]) -> list[tuple[str, str]]:
    selected = (report.get("metadata", {}).get("layout", {}).get("columns", {}) or {}).get(key)
    if not selected:
        return defaults
    allowed = {name: label for name, label in defaults}
    return [(name, allowed[name]) for name in selected if name in allowed] or defaults


def _premium_pdf_bytes(report: dict[str, Any], version: str) -> bytes:
    try:
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_CENTER
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
        from reportlab.platypus.tableofcontents import TableOfContents
    except ImportError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="PDF export dependency is unavailable") from exc
    meta = report["metadata"]
    layout = _report_layout(report)
    selected = set(layout["sections"])
    output = io.BytesIO()
    class TocDocTemplate(SimpleDocTemplate):
        def afterFlowable(self, flowable):
            if isinstance(flowable, Paragraph) and getattr(flowable.style, "name", "") == "PremiumHeading":
                self.notify("TOCEntry", (0, flowable.getPlainText(), self.page))
    doc = TocDocTemplate(output, pagesize=A4, rightMargin=14 * mm, leftMargin=14 * mm, topMargin=16 * mm, bottomMargin=18 * mm)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="PremiumTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=26, leading=31, alignment=TA_CENTER, textColor=colors.HexColor("#102A43")))
    styles.add(ParagraphStyle(name="PremiumHeading", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=17, leading=21, textColor=colors.HexColor("#102A43"), spaceAfter=5 * mm))
    styles.add(ParagraphStyle(name="PremiumBody", parent=styles["BodyText"], fontName="Helvetica", fontSize=9, leading=12, textColor=colors.HexColor("#243B53")))
    styles.add(ParagraphStyle(name="PremiumTiny", parent=styles["BodyText"], fontName="Helvetica", fontSize=6.5, leading=8, textColor=colors.HexColor("#243B53")))
    story: list[Any] = [Spacer(1, 42 * mm), Paragraph("FINAL EVENT REPORT", styles["PremiumBody"]), Paragraph(_text(meta.get("event_name")), styles["PremiumTitle"]), Paragraph(f"{_text(meta.get('short_code'))} · {version}", styles["PremiumBody"]), Spacer(1, 12 * mm), Paragraph(f"Generated {_text(meta.get('generated_at'))}<br/>Event dates: {_text(meta.get('start_date'))} to {_text(meta.get('end_date'))}<br/>Venue: {_text(meta.get('venue_name')) or 'Not specified'}", styles["PremiumBody"]), Spacer(1, 20 * mm), Paragraph("SENSITIVE DATA NOTICE", styles["PremiumBody"]), Paragraph("This package contains full delegate identity and contact details. Store and share it securely.", styles["PremiumBody"]), PageBreak(), Paragraph("Table of Contents", styles["PremiumHeading"])]
    toc = TableOfContents()
    toc.levelStyles = [ParagraphStyle(name="PremiumTOC", parent=styles["PremiumBody"], leftIndent=8, firstLineIndent=-8, leading=14)]
    story.append(toc)
    story.append(PageBreak())
    summary = report["summary"]
    if "executive_summary" in selected:
        story.append(Paragraph("Executive Summary", styles["PremiumHeading"]))
        cards = [[Paragraph(label, styles["PremiumTiny"]) for label, _ in [("Delegates", summary.get("total_delegates", 0)), ("Checked in", summary.get("checked_in_delegates", 0)), ("No-shows", summary.get("no_shows", 0)), ("Badge prints", summary.get("badges_printed", 0))]], [Paragraph(str(value), styles["PremiumTitle"]) for _, value in [("Delegates", summary.get("total_delegates", 0)), ("Checked in", summary.get("checked_in_delegates", 0)), ("No-shows", summary.get("no_shows", 0)), ("Badge prints", summary.get("badges_printed", 0))]]]
        story.append(Table(cards, colWidths=[42 * mm] * 4, style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#E8F1F8")), ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#9FB3C8")), ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")), ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7)])))
        story.append(Spacer(1, 5 * mm)); story.append(Paragraph("The report is event-scoped and generated from the local synchronized PostgreSQL dataset. Empty sections are intentionally retained to show that the source was checked.", styles["PremiumBody"]))
    def add_table(section_id: str, title: str, rows: list[dict[str, Any]], columns: list[tuple[str, str]], key: str):
        if section_id not in selected: return
        story.append(PageBreak()); story.append(Paragraph(title, styles["PremiumHeading"]))
        if not rows: story.append(Paragraph("No records available in the synchronized event dataset.", styles["PremiumBody"])); return
        columns = _selected_columns(report, key, columns)
        data = [[Paragraph(label, styles["PremiumTiny"]) for _, label in columns]]
        data.extend([[Paragraph(_text(row.get(column)).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"), styles["PremiumTiny"]) for column, _ in columns] for row in rows])
        table = Table(data, repeatRows=1)
        table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#102A43")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CBD5E1")), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F6F9FC")]), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4)])); story.append(table)
    for section_id, title, rows, columns, key in _export_specs(report): add_table(section_id, title, rows, columns, key)
    def footer(canvas, document):
        canvas.saveState(); canvas.setStrokeColor(colors.HexColor("#D7DEE8")); canvas.line(14 * mm, 12 * mm, A4[0] - 14 * mm, 12 * mm); canvas.setFont("Helvetica", 7); canvas.setFillColor(colors.HexColor("#65758B")); canvas.drawString(14 * mm, 7 * mm, f"{meta.get('event_name')} · {version} · Sensitive administrator report"); canvas.drawRightString(A4[0] - 14 * mm, 7 * mm, f"Page {document.page}"); canvas.restoreState()
    doc.multiBuild(story, onFirstPage=footer, onLaterPages=footer)
    return output.getvalue()


def _premium_docx_bytes(report: dict[str, Any], version: str) -> bytes:
    try:
        from docx import Document
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from docx.shared import Inches, Pt, RGBColor
    except ImportError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="DOCX export dependency is unavailable") from exc
    document = Document(); section = document.sections[0]; section.top_margin = section.bottom_margin = Inches(0.75); section.left_margin = section.right_margin = Inches(0.7); document.styles["Normal"].font.name = "Aptos"; document.styles["Normal"].font.size = Pt(9)
    meta = report["metadata"]; layout = _report_layout(report); titles = {key: title for key, title, _ in REPORT_SECTIONS}
    cover = document.add_paragraph(); cover.alignment = WD_ALIGN_PARAGRAPH.CENTER; run = cover.add_run("FINAL EVENT REPORT\n"); run.bold = True; run.font.size = Pt(25); run.font.color.rgb = RGBColor(16, 42, 67); event_run = cover.add_run(_text(meta.get("event_name"))); event_run.bold = True; event_run.font.size = Pt(20); event_run.font.color.rgb = RGBColor(43, 93, 135)
    document.add_paragraph(f"{_text(meta.get('short_code'))} · {version} · Generated {_text(meta.get('generated_at'))}").alignment = WD_ALIGN_PARAGRAPH.CENTER; document.add_paragraph("SENSITIVE DATA NOTICE: This package contains full delegate identity and contact details. Store and share it securely."); document.add_page_break(); document.add_heading("Table of Contents", level=1)
    for index, section_id in enumerate(layout["sections"], start=3): document.add_paragraph(f"{titles.get(section_id, section_id)} ................................ {index}")
    document.add_page_break()
    if "executive_summary" in layout["sections"]:
        document.add_heading("Executive Summary", level=1); document.add_paragraph(f"Event: {_text(meta.get('event_name'))} | {_text(meta.get('start_date'))} to {_text(meta.get('end_date'))} | Source: {_text(meta.get('source'))}"); document.add_paragraph(" | ".join(f"{label}: {value}" for label, value in [("Delegates", report["summary"].get("total_delegates", 0)), ("Checked in", report["summary"].get("checked_in_delegates", 0)), ("No-shows", report["summary"].get("no_shows", 0)), ("Badge prints", report["summary"].get("badges_printed", 0))]))
    def add_table(section_id, title, rows, columns, key):
        if section_id not in layout["sections"]: return
        document.add_page_break(); document.add_heading(title, level=1)
        if not rows: document.add_paragraph("No records available in the synchronized event dataset."); return
        columns = _selected_columns(report, key, columns); table = document.add_table(rows=1, cols=len(columns)); table.style = "Light Shading Accent 1"
        for cell, (_, label) in zip(table.rows[0].cells, columns): cell.text = label
        for row in rows:
            cells = table.add_row().cells
            for cell, (column, _) in zip(cells, columns): cell.text = _text(row.get(column))
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    for run in paragraph.runs: run.font.size = Pt(7)
    for section_id, title, rows, columns, key in _export_specs(report): add_table(section_id, title, rows, columns, key)
    output = io.BytesIO(); document.save(output); return output.getvalue()


@router.get("/events/{event_id}/report/export")
async def export_event_report(
    event_id: uuid.UUID,
    format: Literal["pdf", "docx"] = Query(...),
    snapshot_id: Optional[uuid.UUID] = Query(default=None),
    sections: Optional[str] = Query(default=None, description="Comma-separated report section ids for live exports"),
    columns: Optional[str] = Query(default=None, description="JSON object mapping data keys to selected columns"),
    db: AsyncSession = Depends(get_database),
    actor: VenueUser = Depends(require_admin),
):
    event = await _event_or_404(db, event_id)
    snapshot = None
    if snapshot_id:
        snapshot = await db.get(EventReportSnapshot, snapshot_id)
        if not snapshot or snapshot.event_id != event.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report snapshot not found")
        report = snapshot.report_data
        version_label = f"Final v{snapshot.version}"
        content_hash = snapshot.content_hash
    else:
        report = await build_event_report(db, event)
        parsed_columns = None
        if columns:
            try:
                parsed_columns = json.loads(columns)
            except json.JSONDecodeError as exc:
                raise HTTPException(status_code=400, detail="columns must be valid JSON") from exc
        report["metadata"]["layout"] = _report_layout(report, sections.split(",") if sections is not None else None, parsed_columns)
        version_label = "Live"
        content_hash = _canonical_hash(report)
    content = _premium_pdf_bytes(report, version_label) if format == "pdf" else _premium_docx_bytes(report, version_label)
    await _audit(db, event.id, actor, "export", snapshot=snapshot, export_format=format, content_hash=content_hash, details={"version": version_label})
    await db.commit()
    safe_code = "".join(ch for ch in event.short_code if ch.isalnum() or ch in {"-", "_"}) or str(event.id)
    suffix = f"final-v{snapshot.version}" if snapshot else "live"
    filename = f"{safe_code}-venue-report-{suffix}.{format}"
    media_type = "application/pdf" if format == "pdf" else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    return StreamingResponse(
        io.BytesIO(content), media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "Access-Control-Expose-Headers": "Content-Disposition"},
    )
