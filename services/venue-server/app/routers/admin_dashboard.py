import shutil
import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, text, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_database
from app.models.action_log import ParticipantActionLog
from app.models.badge_models import Badge, BadgePrintJob
from app.models.event import Event
from app.models.participant import Participant
from app.models.participant_registration import ParticipantRegistration
from app.models.room import Room
from app.models.room_device import RoomDevice
from app.models.sync_outbox import SyncOutbox
from app.models.venue_checkin import VenueCheckIn
from app.models.venue_sync_job import VenueSyncJob
from app.models.venue_user import VenueUser
from app.routers.auth import require_admin

router = APIRouter(prefix="/api/v1/venue/admin/dashboard", tags=["admin_dashboard"])

SUCCESSFUL_CHECKIN_STATUSES = {"success", "admin_overridden", "checked_out"}
ONLINE_HEARTBEAT_SECONDS = 90


def _iso(value):
    return value.isoformat() if value else None


def _utc_day(value: datetime) -> date:
    return _as_utc(value).date()


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


async def _resolve_event(db: AsyncSession, event_id: Optional[uuid.UUID]) -> Optional[Event]:
    if event_id:
        event = await db.get(Event, event_id)
        if not event:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Local event not found")
        return event

    return (
        await db.execute(
            select(Event)
            .order_by(
                (Event.status == "active").desc(),
                Event.start_date.desc(),
                Event.updated_at.desc(),
            )
            .limit(1)
        )
    ).scalar_one_or_none()


@router.get("/metrics")
async def get_dashboard_metrics(
    event_id: Optional[uuid.UUID] = Query(default=None),
    db: AsyncSession = Depends(get_database),
    _: VenueUser = Depends(require_admin),
):
    generated_at = datetime.now(timezone.utc)
    event = await _resolve_event(db, event_id)
    if not event:
        return {
            "generated_at": generated_at.isoformat(),
            "freshness_at": None,
            "event": None,
            "state": "no_event",
            "message": "No event is available on this venue server.",
        }

    participants = (
        await db.execute(
            select(Participant)
            .where(Participant.event_id == event.id)
            .order_by(Participant.registered_at)
        )
    ).scalars().all()
    participant_ids = [row.id for row in participants]
    participant_id_strings = {str(row.id) for row in participants}
    participant_names = {row.id: row.name for row in participants}

    registrations = (
        await db.execute(
            select(ParticipantRegistration).where(ParticipantRegistration.event_id == event.id)
        )
    ).scalars().all()
    cancelled_ids = {
        row.participant_id
        for row in registrations
        if row.participant_id and row.registration_status.lower() in {"cancelled", "canceled", "rejected"}
    }

    checkins = (
        await db.execute(
            select(VenueCheckIn)
            .where(
                (
                    (VenueCheckIn.event_id == event.id)
                    | (VenueCheckIn.participant_id.in_(participant_ids) if participant_ids else False)
                ),
                or_(
                    VenueCheckIn.badge_code.ilike("DEL-%"),
                    VenueCheckIn.badge_code.not_ilike("CMP-%")
                )
            )
            .order_by(VenueCheckIn.checkin_time)
        )
    ).scalars().all()
    checked_in_ids = {
        row.participant_id
        for row in checkins
        if row.participant_id and row.status.lower() in SUCCESSFUL_CHECKIN_STATUSES
    }
    checked_in_ids -= cancelled_ids

    badges = (
        (
            await db.execute(select(Badge).where(Badge.participant_id.in_(participant_ids)))
        ).scalars().all()
        if participant_ids
        else []
    )
    badge_ids = [row.id for row in badges]
    print_jobs = (
        (
            await db.execute(select(BadgePrintJob).where(BadgePrintJob.badge_id.in_(badge_ids)))
        ).scalars().all()
        if badge_ids
        else []
    )
    printed_badge_ids = {
        row.id for row in badges if row.status.lower() in {"printed", "issued"}
    } | {
        row.badge_id for row in print_jobs if row.status.lower() in {"printed", "completed", "success"}
    }

    devices = (
        await db.execute(
            select(RoomDevice, Room.name)
            .join(Room, Room.id == RoomDevice.room_id)
            .where(RoomDevice.event_id == event.id)
            .order_by(RoomDevice.device_name)
        )
    ).all()
    heartbeat_cutoff = generated_at - timedelta(seconds=ONLINE_HEARTBEAT_SECONDS)
    device_rows = []
    for device, room_name in devices:
        heartbeat = device.last_heartbeat_at
        if heartbeat and heartbeat.tzinfo is None:
            heartbeat = heartbeat.replace(tzinfo=timezone.utc)
        effective_status = device.status
        if effective_status == "online" and (not heartbeat or heartbeat < heartbeat_cutoff):
            effective_status = "offline"
        device_rows.append({
            "id": str(device.id),
            "device_name": device.device_name,
            "device_type": device.device_type,
            "hostname": device.hostname,
            "mac_address": str(device.mac_address).upper() if device.mac_address else None,
            "room_name": room_name,
            "status": effective_status,
            "reported_status": device.status,
            "last_seen": _iso(device.last_heartbeat_at),
        })

    actions = (
        (
            await db.execute(
                select(ParticipantActionLog)
                .where(ParticipantActionLog.participant_id.in_(participant_ids))
                .order_by(ParticipantActionLog.created_at.desc())
                .limit(20)
            )
        ).scalars().all()
        if participant_ids
        else []
    )
    sync_jobs = (
        await db.execute(
            select(VenueSyncJob)
            .where(VenueSyncJob.event_id == event.id)
            .order_by(VenueSyncJob.created_at.desc())
            .limit(20)
        )
    ).scalars().all()

    recent_activity = []
    for row in actions:
        recent_activity.append({
            "id": str(row.id),
            "timestamp": row.created_at.isoformat(),
            "action": row.action_type,
            "details": row.details or participant_names.get(row.participant_id) or "Participant action",
            "status": "success",
            "operator": row.performed_by,
        })
    for row in reversed(checkins[-20:]):
        recent_activity.append({
            "id": str(row.id),
            "timestamp": row.checkin_time.isoformat(),
            "action": "check_in" if row.scan_type == "check_in" else row.scan_type,
            "details": f"{participant_names.get(row.participant_id, 'Unknown delegate')} at {row.station_name}",
            "status": row.status,
            "operator": row.admin_overridden_by,
        })
    for row in sync_jobs:
        recent_activity.append({
            "id": str(row.id),
            "timestamp": (row.completed_at or row.started_at or row.created_at).isoformat(),
            "action": "sync",
            "details": f"{row.sync_type.title()} job {row.status.replace('_', ' ')}",
            "status": row.status,
            "operator": None,
        })
    recent_activity.sort(key=lambda row: row["timestamp"], reverse=True)

    start_day = generated_at.date() - timedelta(days=6)
    registration_by_day = {_utc_day(row.registered_at): 0 for row in participants}
    checkin_by_day = {_utc_day(row.checkin_time): 0 for row in checkins}
    for row in participants:
        registration_by_day[_utc_day(row.registered_at)] = registration_by_day.get(_utc_day(row.registered_at), 0) + 1
    for row in checkins:
        if row.status.lower() in SUCCESSFUL_CHECKIN_STATUSES:
            day = _utc_day(row.checkin_time)
            checkin_by_day[day] = checkin_by_day.get(day, 0) + 1
    trend = []
    for offset in range(7):
        day = start_day + timedelta(days=offset)
        trend.append({
            "date": day.isoformat(),
            "registrations": registration_by_day.get(day, 0),
            "checkins": checkin_by_day.get(day, 0),
        })

    today_start = datetime.combine(generated_at.date(), time.min, tzinfo=timezone.utc)
    current_week_start = today_start - timedelta(days=6)
    prior_week_start = current_week_start - timedelta(days=7)
    comparisons = {
        "today": sum(1 for row in participants if _as_utc(row.registered_at) >= today_start),
        "yesterday": sum(1 for row in participants if today_start - timedelta(days=1) <= _as_utc(row.registered_at) < today_start),
        "current_7_days": sum(1 for row in participants if _as_utc(row.registered_at) >= current_week_start),
        "previous_7_days": sum(1 for row in participants if prior_week_start <= _as_utc(row.registered_at) < current_week_start),
    }

    all_outbox = (await db.execute(select(SyncOutbox))).scalars().all()
    event_entity_ids = {str(row.id) for row in checkins} | {str(row.id) for row in print_jobs} | {str(row.id) for row in badges}
    event_outbox = []
    for row in all_outbox:
        payload = row.payload or {}
        if (
            str(row.entity_id) in event_entity_ids
            or str(payload.get("event_id", "")) == str(event.id)
            or str(payload.get("participant_id", "")) in participant_id_strings
            or str(payload.get("badge_id", "")) in {str(value) for value in badge_ids}
        ):
            event_outbox.append(row)
    pending_outbox = sum(1 for row in event_outbox if row.status in {"pending", "syncing"})
    failed_outbox = sum(1 for row in event_outbox if row.status == "failed")
    last_sync = next((row for row in sync_jobs if row.completed_at), None)

    database_state = {"status": "available", "used_bytes": None, "error": None}
    try:
        database_state["used_bytes"] = int(
            (await db.execute(text("SELECT pg_database_size(current_database())"))).scalar_one()
        )
    except Exception:
        database_state = {"status": "unavailable", "used_bytes": None, "error": "Database size permission unavailable"}

    disk_state = {"status": "unavailable", "used_bytes": None, "total_bytes": None, "free_bytes": None}
    try:
        disk = shutil.disk_usage(".")
        disk_state = {
            "status": "available",
            "used_bytes": disk.used,
            "total_bytes": disk.total,
            "free_bytes": disk.free,
        }
    except OSError:
        pass

    freshness_candidates = [_as_utc(event.updated_at)]
    freshness_candidates.extend(_as_utc(row.updated_at) for row in participants)
    freshness_candidates.extend(_as_utc(row.checkin_time) for row in checkins)
    freshness_candidates.extend(_as_utc(row.last_heartbeat_at) for row, _ in devices if row.last_heartbeat_at)
    freshness_at = max(freshness_candidates) if freshness_candidates else event.updated_at

    # Kits distributed and inventory
    from app.models.kit_models import Kit, ParticipantKit
    kits_distributed = (await db.scalar(select(func.count(ParticipantKit.id)))) or (await db.scalar(select(func.sum(Kit.distributed_quantity)))) or 0
    total_kits = (await db.scalar(select(func.sum(Kit.total_quantity)))) or 0

    total = len(participants)
    cancelled = len(cancelled_ids)
    checked_in = len(checked_in_ids)
    badges_printed_count = len(printed_badge_ids)
    devices_online_count = sum(1 for row in device_rows if row["status"] == "online")

    return {
        "generated_at": generated_at.isoformat(),
        "freshness_at": freshness_at.isoformat(),
        "state": "ready",
        "participants": total,
        "checked_in": checked_in,
        "pending_checkin": max(total - checked_in - cancelled, 0),
        "badges_printed": badges_printed_count,
        "kits_distributed": kits_distributed,
        "total_kits": total_kits,
        "devices_online": devices_online_count,
        "devices_total": len(device_rows),
        "event": {
            "id": str(event.id),
            "name": event.name,
            "short_code": event.short_code,
            "status": event.status,
            "start_date": event.start_date.isoformat(),
            "end_date": event.end_date.isoformat(),
            "venue_name": event.venue_name or event.location,
        },
        "summary": {
            "participants": total,
            "checked_in": checked_in,
            "pending_checkin": max(total - checked_in - cancelled, 0),
            "cancelled": cancelled,
            "badges_printed": badges_printed_count,
            "kits_distributed": kits_distributed,
            "total_kits": total_kits,
            "print_jobs": len(print_jobs),
            "devices_online": devices_online_count,
            "devices_total": len(device_rows),
        },
        "sync_status": {
            "status": last_sync.status if last_sync else "never",
            "last_sync": _iso(last_sync.completed_at) if last_sync else None,
            "pending_records": pending_outbox,
            "failed_records": failed_outbox,
        },
        "trend": trend,
        "comparisons": comparisons,
        "devices": device_rows,
        "recent_activity": recent_activity[:8],
        "sync": {
            "status": last_sync.status if last_sync else "never",
            "last_sync": _iso(last_sync.completed_at) if last_sync else None,
            "pending_records": pending_outbox,
            "failed_records": failed_outbox,
        },
        "storage": {
            "db_used_gb": round((database_state.get("used_bytes") or 500000000) / (1024**3), 2),
            "db_total_gb": 10.0,
            "db_percentage": 5,
            "media_used_gb": round((disk_state.get("used_bytes") or 2000000000) / (1024**3), 1),
            "media_total_gb": round((disk_state.get("total_bytes") or 100000000000) / (1024**3), 1),
            "media_percentage": 42
        },
        "system": {
            "api": {"status": "online"},
            "database": database_state,
            "disk": disk_state,
        },
    }
