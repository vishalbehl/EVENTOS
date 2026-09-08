from __future__ import annotations

import os
import shutil
import socket
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_database
from app.models.event import Event
from app.models.network_config import NetworkConfig
from app.models.operational_control import (
    VenueAlert,
    VenueAuditEvent,
    VenueBackupJob,
    VenueCommand,
    VenueInstallation,
    VenueServiceInstance,
    VenueSettingRevision,
    VenueIncident,
    VenueBroadcast,
    VenueOverride,
    VenueChatMessage,
    VenueAssetTransfer,
)
from app.models.presentation_file import PresentationFile
from app.models.participant import Participant
from app.models.participant_registration import ParticipantRegistration
from app.models.badge_models import Badge
from app.models.kit_models import ParticipantKit
from app.models.presentation_queue import PresentationQueue
from app.models.registration_source_key import RegistrationSourceHeartbeat
from app.models.room import Room
from app.models.room_device import RoomDevice
from app.models.room_runtime_state import RoomRuntimeState
from app.models.session import Session
from app.models.session_speaker import SessionSpeaker
from app.models.speaker import Speaker
from app.models.srr_station import SRRStation
from app.models.srr_checkin import SRRCheckin
from app.models.sync_outbox import SyncOutbox
from app.models.venue_node import VenueNodeAssignment
from app.models.venue_sync_job import VenueSyncJob
from app.models.venue_user import VenueUser
from app.routers.auth import DeviceAuth, hash_password, require_admin, require_operator, require_step_up, require_viewer
from app.workers.backup_worker import verify_backup_manifest


router = APIRouter(prefix="/api/v1/venue/admin/control", tags=["venue_operational_control"])
agent_router = APIRouter(prefix="/api/v1/venue/control", tags=["venue_operational_agents"])

HEALTHY_SECONDS = 90
STALE_SECONDS = 300
VALID_STATES = {"healthy", "degraded", "offline", "stale", "unknown", "not_configured", "maintenance"}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def observed_state(last_seen: datetime | None, reported: str | None = None) -> str:
    if reported == "maintenance":
        return "maintenance"
    if last_seen is None:
        return "not_configured"
    age = (utcnow() - (last_seen if last_seen.tzinfo else last_seen.replace(tzinfo=timezone.utc))).total_seconds()
    if age <= HEALTHY_SECONDS:
        return reported if reported in {"degraded", "offline"} else "healthy"
    if age <= STALE_SECONDS:
        return "stale"
    return "offline"


def aggregate_device_state(states: list[str]) -> str:
    """Aggregate persisted device evidence without inventing health."""
    if not states:
        return "not_configured"
    if all(state == "healthy" for state in states):
        return "healthy"
    if any(state == "offline" for state in states):
        return "offline" if all(state == "offline" for state in states) else "degraded"
    if any(state == "stale" for state in states):
        return "stale"
    if any(state == "maintenance" for state in states):
        return "maintenance"
    return "degraded"


async def installation(db: AsyncSession) -> VenueInstallation | None:
    return (await db.execute(select(VenueInstallation).order_by(VenueInstallation.created_at.asc()).limit(1))).scalar_one_or_none()


async def single_event(db: AsyncSession) -> Event | None:
    return (await db.execute(select(Event).order_by(Event.start_date.desc()).limit(1))).scalar_one_or_none()


async def write_audit(
    db: AsyncSession,
    *,
    user: VenueUser | None,
    request: Request | None,
    category: str,
    action: str,
    result: str,
    object_type: str | None = None,
    object_id: str | None = None,
    reason: str | None = None,
    details: dict | None = None,
) -> None:
    db.add(VenueAuditEvent(
        actor_user_id=user.id if user else None,
        actor_role=user.role if user else "system",
        source_ip=request.client.host if request and request.client else None,
        category=category,
        action=action,
        object_type=object_type,
        object_id=object_id,
        result=result,
        reason=reason,
        correlation_id=request.headers.get("X-Correlation-Id", str(uuid.uuid4())) if request else str(uuid.uuid4()),
        details=details or {},
    ))


def service_payload(service: VenueServiceInstance) -> dict:
    state = observed_state(service.last_heartbeat_at, "maintenance" if service.paused else service.status)
    return {
        "id": str(service.id),
        "service_key": service.service_key,
        "name": service.display_name,
        "type": service.service_type,
        "host": service.host,
        "version": service.version,
        "status": state,
        "reported_status": service.status,
        "evidence": service.evidence or ("No heartbeat has been received." if service.last_heartbeat_at is None else "Heartbeat freshness determines this state."),
        "latency_ms": service.latency_ms,
        "queue_depth": service.queue_depth,
        "capabilities": service.capabilities or {},
        "metrics": service.metrics or {},
        "locally_managed": service.locally_managed,
        "paused": service.paused,
        "last_heartbeat_at": iso(service.last_heartbeat_at),
        "last_failure_at": iso(service.last_failure_at),
    }


class ServiceHeartbeat(BaseModel):
    service_key: str = Field(min_length=2, max_length=80)
    display_name: str = Field(min_length=2, max_length=160)
    service_type: str = Field(min_length=2, max_length=60)
    host: str | None = Field(default=None, max_length=255)
    version: str | None = Field(default=None, max_length=80)
    status: str = "healthy"
    evidence: str | None = Field(default=None, max_length=2000)
    latency_ms: int | None = Field(default=None, ge=0)
    queue_depth: int = Field(default=0, ge=0)
    capabilities: dict = Field(default_factory=dict)
    metrics: dict = Field(default_factory=dict)
    locally_managed: bool = False


class CommandRequest(BaseModel):
    command: str = Field(min_length=2, max_length=80)
    reason: str = Field(min_length=5, max_length=1000)
    payload: dict = Field(default_factory=dict)
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=160)


class AlertAction(BaseModel):
    action: str = Field(pattern="^(acknowledge|resolve|snooze|reopen)$")
    reason: str = Field(min_length=3, max_length=2000)
    snooze_minutes: int | None = Field(default=None, ge=5, le=1440)


class BackupRequest(BaseModel):
    backup_type: str = Field(default="full", pattern="^(full|database|content|emergency)$")
    destination: str = Field(min_length=2, max_length=1000)
    reason: str = Field(min_length=5, max_length=1000)


class SettingsUpdate(BaseModel):
    values: dict
    reason: str = Field(min_length=5, max_length=1000)


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=100, pattern=r"^[A-Za-z0-9_.-]+$")
    email: str = Field(min_length=3, max_length=320)
    first_name: str = Field(min_length=1, max_length=150)
    last_name: str = Field(default="", max_length=150)
    password: str = Field(min_length=12, max_length=512)
    role: str = Field(pattern="^(administrator|operator|viewer)$")
    reason: str = Field(min_length=5, max_length=1000)


class UserUpdate(BaseModel):
    role: str | None = Field(default=None, pattern="^(administrator|operator|viewer)$")
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=12, max_length=512)
    reason: str = Field(min_length=5, max_length=1000)


@agent_router.post("/services/heartbeat")
async def receive_service_heartbeat(
    payload: ServiceHeartbeat,
    _: DeviceAuth,
    db: AsyncSession = Depends(get_database),
) -> dict:
    if payload.status not in VALID_STATES:
        raise HTTPException(status_code=422, detail="Unsupported service status.")
    service = await db.scalar(select(VenueServiceInstance).where(VenueServiceInstance.service_key == payload.service_key))
    if service is None:
        service = VenueServiceInstance(
            service_key=payload.service_key,
            display_name=payload.display_name,
            service_type=payload.service_type,
        )
        db.add(service)
    for field in ("display_name", "service_type", "host", "version", "status", "evidence", "latency_ms", "queue_depth", "capabilities", "metrics", "locally_managed"):
        setattr(service, field, getattr(payload, field))
    service.last_heartbeat_at = utcnow()
    if payload.status in {"offline", "degraded"}:
        service.last_failure_at = utcnow()
    await db.commit()
    return {"accepted": True, "server_time": utcnow().isoformat()}


@router.get("/overview")
async def overview(
    db: AsyncSession = Depends(get_database),
    _: VenueUser = Depends(require_viewer),
) -> dict:
    now = utcnow()
    event = await single_event(db)
    install = await installation(db)
    services = list((await db.execute(select(VenueServiceInstance).order_by(VenueServiceInstance.display_name))).scalars().all())
    service_items = [service_payload(item) for item in services]
    service_items.insert(0, {
        "id": "venue-api", "service_key": "venue-api", "name": "Venue API", "type": "venue",
        "host": socket.gethostname(), "version": "1.0.0", "status": "healthy",
        "reported_status": "healthy", "evidence": "This response was generated by the Venue API.",
        "latency_ms": None, "queue_depth": 0, "capabilities": {}, "metrics": {},
        "locally_managed": True, "paused": False, "last_heartbeat_at": now.isoformat(), "last_failure_at": None,
    })
    device_rows = list((await db.execute(select(RoomDevice))).scalars().all())
    device_states = [observed_state(row.last_heartbeat_at, row.status) for row in device_rows]
    alert_counts = dict((await db.execute(
        select(VenueAlert.severity, func.count(VenueAlert.id)).where(VenueAlert.status == "active").group_by(VenueAlert.severity)
    )).all())
    outbox_counts = dict((await db.execute(select(SyncOutbox.status, func.count(SyncOutbox.id)).group_by(SyncOutbox.status))).all())
    audit_event_count = (await db.scalar(select(func.count(VenueAuditEvent.id)))) or 0
    content_counts = dict((await db.execute(
        select(PresentationFile.local_sync_status, func.count(PresentationFile.id))
        .where(PresentationFile.is_current_version.is_(True)).group_by(PresentationFile.local_sync_status)
    )).all())
    configured_path = Path(install.storage_path) if install and install.storage_path else Path.cwd()
    try:
        disk = shutil.disk_usage(configured_path)
        storage = {"path": str(configured_path), "total_bytes": disk.total, "used_bytes": disk.used, "free_bytes": disk.free, "status": "healthy" if disk.free / max(disk.total, 1) >= .1 else "degraded"}
    except OSError as exc:
        storage = {"path": str(configured_path), "status": "unknown", "evidence": str(exc)}
    critical = int(alert_counts.get("critical", 0))
    unhealthy = sum(1 for item in service_items if item["status"] not in {"healthy"})
    overall = "unknown" if not event else ("degraded" if critical or unhealthy else "healthy")
    return {
        "generated_at": now.isoformat(), "status": overall,
        "event": {"id": str(event.id), "name": event.name, "short_code": event.short_code, "status": event.status, "start_date": iso(event.start_date) if isinstance(event.start_date, datetime) else (event.start_date.isoformat() if event.start_date else None), "end_date": iso(event.end_date) if isinstance(event.end_date, datetime) else (event.end_date.isoformat() if event.end_date else None)} if event else None,
        "installation": {"id": str(install.id), "name": install.installation_name, "setup_status": install.setup_status, "maintenance_mode": install.maintenance_mode} if install else None,
        "services": service_items,
        "devices": {"total": len(device_rows), "healthy": device_states.count("healthy"), "stale": device_states.count("stale"), "offline": device_states.count("offline"), "not_configured": device_states.count("not_configured")},
        "alerts": {"total": sum(alert_counts.values()), **alert_counts},
        "audit_events": {"total": audit_event_count},
        "sync": {"outbox": outbox_counts, "pending": int(outbox_counts.get("pending", 0)) + int(outbox_counts.get("failed", 0))},
        "content": content_counts, "storage": storage,
    }


@router.get("/services")
async def services(db: AsyncSession = Depends(get_database), _: VenueUser = Depends(require_viewer)) -> dict:
    rows = list((await db.execute(select(VenueServiceInstance).order_by(VenueServiceInstance.display_name))).scalars().all())
    return {"generated_at": utcnow().isoformat(), "items": [service_payload(row) for row in rows]}


@router.post("/services/{service_id}/commands")
async def service_command(
    service_id: uuid.UUID,
    payload: CommandRequest,
    request: Request,
    db: AsyncSession = Depends(get_database),
    user: VenueUser = Depends(require_operator),
) -> dict:
    service = await db.get(VenueServiceInstance, service_id)
    if not service:
        raise HTTPException(status_code=404, detail="Service not found.")
    allowed = {"test", "pause", "resume", "restart", "diagnostics"}
    if payload.command not in allowed:
        raise HTTPException(status_code=422, detail="Unsupported service command.")
    if payload.command == "restart" and not service.locally_managed:
        raise HTTPException(status_code=409, detail="This service is not managed by the Venue Server supervisor.")
    if payload.command in {"pause", "resume"}:
        service.paused = payload.command == "pause"
    command = VenueCommand(target_type="service", target_id=str(service.id), command=payload.command, payload=payload.payload, requested_by=user.id, reason=payload.reason)
    db.add(command)
    await write_audit(db, user=user, request=request, category="service", action=payload.command, result="queued", object_type="service", object_id=str(service.id), reason=payload.reason)
    await db.commit()
    return {"id": str(command.id), "status": command.status}


@router.post("/commands/{target_type}/{target_id}")
async def queue_operational_command(
    target_type: str,
    target_id: str,
    payload: CommandRequest,
    request: Request,
    db: AsyncSession = Depends(get_database),
    user: VenueUser = Depends(require_operator),
) -> dict:
    allowed = {
        "device": {"ping", "push_configuration", "restart", "disable", "rotate_enrollment", "revoke"},
        "content": {"fetch", "verify", "retry", "prioritize", "push", "quarantine"},
        "room": {"push_schedule", "push_content", "broadcast", "maintenance", "restart_service", "fallback_package"},
    }
    if target_type not in allowed or payload.command not in allowed[target_type]:
        raise HTTPException(status_code=422, detail="Unsupported operational command.")
    if target_type == "device":
        try:
            device = await db.get(RoomDevice, uuid.UUID(target_id))
        except ValueError:
            device = None
        if not device:
            raise HTTPException(status_code=404, detail="Device not found.")
        if payload.command == "disable":
            device.status = "maintenance"
    elif target_type == "content":
        try:
            item = await db.get(PresentationFile, uuid.UUID(target_id))
        except ValueError:
            item = None
        if not item:
            raise HTTPException(status_code=404, detail="Content item not found.")
        if payload.command in {"fetch", "retry", "prioritize", "push"}:
            priority = 1 if payload.command == "prioritize" else 5
            db.add(VenueSyncJob(event_id=item.event_id, file_id=item.id, sync_type="download", priority=priority, status="pending"))
        elif payload.command == "quarantine":
            item.local_sync_status = "quarantined"
    else:
        try:
            room = await db.get(Room, uuid.UUID(target_id))
        except ValueError:
            room = None
        if not room:
            raise HTTPException(status_code=404, detail="Room not found.")
    command = VenueCommand(target_type=target_type, target_id=target_id, command=payload.command, payload=payload.payload, requested_by=user.id, reason=payload.reason)
    db.add(command)
    await write_audit(db, user=user, request=request, category=target_type, action=payload.command, result="queued", object_type=target_type, object_id=target_id, reason=payload.reason)
    await db.commit()
    return {"id": str(command.id), "status": command.status}


@router.get("/devices")
async def devices(db: AsyncSession = Depends(get_database), _: VenueUser = Depends(require_viewer)) -> dict:
    rows = list((await db.execute(select(RoomDevice).order_by(RoomDevice.registered_at.desc()))).scalars().all())
    assignments = list((await db.execute(select(VenueNodeAssignment))).scalars().all())
    by_device = {row.device_id: row for row in assignments}
    return {"generated_at": utcnow().isoformat(), "items": [{
        "id": str(row.id), "name": row.device_name, "type": row.device_type,
        "hostname": row.hostname, "ip_address": str(row.ip_address) if row.ip_address else None,
        "mac_address": str(row.mac_address) if row.mac_address else None,
        "os_version": row.os_version, "app_version": row.app_version,
        "status": observed_state(row.last_heartbeat_at, row.status), "reported_status": row.status,
        "last_heartbeat_at": iso(row.last_heartbeat_at), "registered_at": iso(row.registered_at),
        "room_id": str(row.room_id) if row.room_id else None,
        "assignment": {"id": str(by_device[row.id].id), "mode": by_device[row.id].mode, "status": by_device[row.id].status, "last_sync_at": iso(by_device[row.id].last_sync_at)} if row.id in by_device else None,
    } for row in rows]}


@router.get("/content")
async def content(db: AsyncSession = Depends(get_database), _: VenueUser = Depends(require_viewer)) -> dict:
    rows = list((await db.execute(select(PresentationFile).where(PresentationFile.is_current_version.is_(True)).order_by(PresentationFile.uploaded_at.desc()).limit(2000))).scalars().all())
    jobs = list((await db.execute(select(VenueSyncJob).order_by(VenueSyncJob.created_at.desc()).limit(2000))).scalars().all())
    latest_job = {}
    for job in jobs:
        latest_job.setdefault(job.file_id, job)
    return {"generated_at": utcnow().isoformat(), "items": [{
        "id": str(row.id), "name": row.original_filename, "type": row.file_format,
        "size_bytes": row.file_size_bytes, "version": row.version_number,
        "approval_status": row.upload_status, "delivery_status": row.local_sync_status,
        "local_cache_path": row.local_cache_path, "uploaded_at": iso(row.uploaded_at), "synced_at": iso(row.local_synced_at),
        "job": {"id": str(latest_job[row.id].id), "status": latest_job[row.id].status, "priority": latest_job[row.id].priority, "retry_count": latest_job[row.id].retry_count, "error": latest_job[row.id].error_message} if row.id in latest_job else None,
    } for row in rows]}


@router.get("/rooms")
async def rooms(db: AsyncSession = Depends(get_database), _: VenueUser = Depends(require_viewer)) -> dict:
    now = utcnow()
    rows = list((await db.execute(select(Room).where(Room.is_active.is_(True)).order_by(Room.name))).scalars().all())
    sessions = list((await db.execute(select(Session).where(Session.end_time >= now - timedelta(hours=1)).order_by(Session.start_time))).scalars().all())
    devices = list((await db.execute(select(RoomDevice))).scalars().all())
    return {"generated_at": now.isoformat(), "items": [{
        "id": str(room.id), "name": room.name, "type": room.room_type, "capacity": room.capacity,
        "technician": room.av_technician, "location_notes": room.location_notes,
        "current_session": next(({"id": str(s.id), "name": s.name, "code": s.session_code, "start": iso(s.start_time), "end": iso(s.end_time), "status": s.status} for s in sessions if s.room_id == room.id and s.start_time <= now <= s.end_time), None),
        "next_session": next(({"id": str(s.id), "name": s.name, "code": s.session_code, "start": iso(s.start_time), "end": iso(s.end_time), "status": s.status} for s in sessions if s.room_id == room.id and s.start_time > now), None),
        "devices": [{"id": str(d.id), "name": d.device_name, "type": d.device_type, "status": observed_state(d.last_heartbeat_at, d.status), "last_heartbeat_at": iso(d.last_heartbeat_at)} for d in devices if d.room_id == room.id],
    } for room in rows]}


@router.get("/network")
async def network(db: AsyncSession = Depends(get_database), _: VenueUser = Depends(require_viewer)) -> dict:
    config = await db.scalar(select(NetworkConfig).where(NetworkConfig.is_active.is_(True)).limit(1))
    return {"generated_at": utcnow().isoformat(), "hostname": socket.gethostname(), "configured": config is not None, "adapter": {
        "name": config.active_adapter_name, "description": config.adapter_description, "media_type": config.media_type,
        "ip_address": config.ip_address, "subnet": config.subnet, "gateway": config.gateway,
        "mac_address": config.mac_address, "updated_at": iso(config.updated_at),
    } if config else None, "api": {"host": settings.HOST, "port": settings.PORT, "tls_required": settings.DEPLOYMENT_PROFILE == "production"}}


@router.get("/alerts")
async def alerts(
    state: str | None = Query(default=None),
    db: AsyncSession = Depends(get_database),
    _: VenueUser = Depends(require_viewer),
) -> dict:
    query = select(VenueAlert).order_by(VenueAlert.last_seen_at.desc()).limit(1000)
    if state:
        query = query.where(VenueAlert.status == state)
    rows = list((await db.execute(query)).scalars().all())
    return {"items": [{
        "id": str(row.id), "severity": row.severity, "status": row.status, "source_type": row.source_type,
        "source_id": row.source_id, "title": row.title, "evidence": row.evidence,
        "suggested_action": row.suggested_action, "recurrence_count": row.recurrence_count,
        "first_seen_at": iso(row.first_seen_at), "last_seen_at": iso(row.last_seen_at),
        "acknowledged_at": iso(row.acknowledged_at), "resolved_at": iso(row.resolved_at), "snoozed_until": iso(row.snoozed_until),
    } for row in rows]}


@router.post("/alerts/{alert_id}/action")
async def act_on_alert(
    alert_id: uuid.UUID,
    payload: AlertAction,
    request: Request,
    db: AsyncSession = Depends(get_database),
    user: VenueUser = Depends(require_operator),
) -> dict:
    alert = await db.get(VenueAlert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found.")
    now = utcnow()
    if payload.action == "acknowledge":
        alert.status, alert.acknowledged_at, alert.owner_user_id = "acknowledged", now, user.id
    elif payload.action == "resolve":
        alert.status, alert.resolved_at, alert.resolution_note = "resolved", now, payload.reason
    elif payload.action == "snooze":
        alert.status, alert.snoozed_until = "snoozed", now + timedelta(minutes=payload.snooze_minutes or 30)
    else:
        alert.status, alert.resolved_at, alert.snoozed_until = "active", None, None
    await write_audit(db, user=user, request=request, category="alert", action=payload.action, result="success", object_type="alert", object_id=str(alert.id), reason=payload.reason)
    await db.commit()
    return {"id": str(alert.id), "status": alert.status}


@router.get("/audit")
async def audit_events(
    category: str | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    db: AsyncSession = Depends(get_database),
    _: VenueUser = Depends(require_viewer),
) -> dict:
    query = select(VenueAuditEvent).order_by(VenueAuditEvent.created_at.desc()).limit(limit)
    if category:
        query = query.where(VenueAuditEvent.category == category)
    rows = list((await db.execute(query)).scalars().all())
    return {"items": [{
        "id": str(row.id), "category": row.category, "action": row.action, "result": row.result,
        "actor_role": row.actor_role, "source_ip": row.source_ip, "object_type": row.object_type,
        "object_id": row.object_id, "reason": row.reason, "correlation_id": row.correlation_id,
        "details": row.details, "created_at": iso(row.created_at),
    } for row in rows]}


@router.get("/backups")
async def backups(db: AsyncSession = Depends(get_database), _: VenueUser = Depends(require_viewer)) -> dict:
    rows = list((await db.execute(select(VenueBackupJob).order_by(VenueBackupJob.created_at.desc()).limit(200))).scalars().all())
    return {"items": [{
        "id": str(row.id), "type": row.backup_type, "status": row.status, "destination": row.destination,
        "manifest": row.manifest, "checksum": row.checksum, "size_bytes": row.size_bytes,
        "error": row.error_message, "created_at": iso(row.created_at), "completed_at": iso(row.completed_at), "verified_at": iso(row.verified_at),
    } for row in rows]}


@router.post("/backups")
async def queue_backup(
    payload: BackupRequest,
    request: Request,
    db: AsyncSession = Depends(get_database),
    user: VenueUser = Depends(require_step_up),
) -> dict:
    target = Path(payload.destination).expanduser()
    if not target.is_absolute():
        raise HTTPException(status_code=422, detail="Backup destination must be an absolute path.")
    job = VenueBackupJob(backup_type=payload.backup_type, status="queued", destination=str(target), requested_by=user.id, manifest={"requested_at": utcnow().isoformat()})
    db.add(job)
    await write_audit(db, user=user, request=request, category="backup", action="queue", result="queued", object_type="backup", object_id=str(job.id), reason=payload.reason)
    await db.commit()
    return {"id": str(job.id), "status": job.status}


@router.post("/backups/{backup_id}/verify")
async def verify_backup(
    backup_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_database),
    user: VenueUser = Depends(require_step_up),
) -> dict:
    job = await db.get(VenueBackupJob, backup_id)
    if not job:
        raise HTTPException(status_code=404, detail="Backup job not found.")
    if job.status != "completed" or not job.manifest or not job.manifest.get("root"):
        raise HTTPException(status_code=409, detail="Only completed backups with a manifest can be verified.")
    root = Path(str(job.manifest["root"])).expanduser().resolve()
    destination = Path(job.destination).expanduser().resolve()
    if destination not in root.parents:
        raise HTTPException(status_code=422, detail="Backup manifest root is outside its destination.")
    try:
        verify_backup_manifest(root, job.manifest)
    except (OSError, RuntimeError) as exc:
        job.status = "failed"
        job.error_message = str(exc)[:4000]
        job.verified_at = None
        await write_audit(db, user=user, request=request, category="backup", action="verify", result="failed", object_type="backup", object_id=str(job.id), reason="Backup integrity verification failed.", details={"error": str(exc)})
        await db.commit()
        raise HTTPException(status_code=422, detail="Backup integrity verification failed.") from exc
    job.verified_at = utcnow()
    await write_audit(db, user=user, request=request, category="backup", action="verify", result="success", object_type="backup", object_id=str(job.id), reason="Backup integrity verified.")
    await db.commit()
    return {"id": str(job.id), "status": job.status, "verified_at": iso(job.verified_at)}


@router.get("/settings")
async def settings_view(db: AsyncSession = Depends(get_database), _: VenueUser = Depends(require_viewer)) -> dict:
    rows = list((await db.execute(select(VenueSettingRevision).where(VenueSettingRevision.is_active.is_(True)).order_by(VenueSettingRevision.section))).scalars().all())
    return {"sections": {row.section: {"revision": row.revision, "values": row.values, "changed_at": iso(row.created_at)} for row in rows}}


@router.put("/settings/{section}")
async def update_settings(
    section: str,
    payload: SettingsUpdate,
    request: Request,
    db: AsyncSession = Depends(get_database),
    user: VenueUser = Depends(require_step_up),
) -> dict:
    if section not in {"general", "security", "storage", "services", "notifications", "time", "retention", "updates", "license"}:
        raise HTTPException(status_code=422, detail="Unknown settings section.")
    active = await db.scalar(select(VenueSettingRevision).where(VenueSettingRevision.section == section, VenueSettingRevision.is_active.is_(True)).order_by(VenueSettingRevision.revision.desc()).limit(1))
    revision = (active.revision if active else 0) + 1
    if active:
        active.is_active = False
    row = VenueSettingRevision(section=section, revision=revision, values=payload.values, changed_by=user.id, reason=payload.reason)
    db.add(row)
    await write_audit(db, user=user, request=request, category="settings", action="update", result="success", object_type="settings", object_id=section, reason=payload.reason, details={"revision": revision})
    await db.commit()
    return {"section": section, "revision": revision, "values": payload.values}


def stored_role(role: str) -> str:
    return "admin" if role == "administrator" else role


@router.get("/users")
async def users(db: AsyncSession = Depends(get_database), _: VenueUser = Depends(require_admin)) -> dict:
    rows = list((await db.execute(select(VenueUser).order_by(VenueUser.created_at.asc()))).scalars().all())
    return {"items": [{
        "id": str(row.id), "username": row.username, "email": row.email, "name": row.full_name,
        "role": "administrator" if row.role in {"admin", "super_admin"} else row.role,
        "is_active": row.is_active, "created_at": iso(row.created_at), "updated_at": iso(row.updated_at),
    } for row in rows]}


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    request: Request,
    db: AsyncSession = Depends(get_database),
    user: VenueUser = Depends(require_step_up),
) -> dict:
    duplicate = await db.scalar(select(VenueUser.id).where((VenueUser.username == payload.username.lower()) | (VenueUser.email == payload.email.lower())))
    if duplicate:
        raise HTTPException(status_code=409, detail="Username or email is already in use.")
    row = VenueUser(
        username=payload.username.lower(), email=payload.email.lower(), first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(), password_hash=hash_password(payload.password), role=stored_role(payload.role),
        allowed_modes=["admin"], mode_preferences={}, notification_preferences={}, is_active=True,
    )
    db.add(row)
    await db.flush()
    await write_audit(db, user=user, request=request, category="identity", action="create_user", result="success", object_type="user", object_id=str(row.id), reason=payload.reason, details={"role": payload.role})
    await db.commit()
    return {"id": str(row.id), "username": row.username, "role": payload.role, "is_active": True}


@router.patch("/users/{user_id}")
async def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    request: Request,
    db: AsyncSession = Depends(get_database),
    user: VenueUser = Depends(require_step_up),
) -> dict:
    target = await db.get(VenueUser, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Venue user not found.")
    if target.id == user.id and payload.is_active is False:
        raise HTTPException(status_code=409, detail="You cannot deactivate your own active session.")
    if payload.role is not None:
        target.role = stored_role(payload.role)
    if payload.is_active is not None:
        target.is_active = payload.is_active
    if payload.password:
        target.password_hash = hash_password(payload.password)
    await write_audit(db, user=user, request=request, category="identity", action="update_user", result="success", object_type="user", object_id=str(target.id), reason=payload.reason, details={"role": payload.role, "is_active": payload.is_active, "password_reset": bool(payload.password)})
    await db.commit()
    return {"id": str(target.id), "role": "administrator" if target.role in {"admin", "super_admin"} else target.role, "is_active": target.is_active}


# =============================================================================
# 02. LIVE OPERATIONS & ROOM OPERATIONS
# =============================================================================

@router.get("/live-operations")
async def get_live_operations(
    db: AsyncSession = Depends(get_database),
    _: VenueUser = Depends(require_viewer),
) -> dict:
    now = utcnow()
    rooms_list = list((await db.execute(select(Room).where(Room.is_active.is_(True)).order_by(Room.display_order.asc(), Room.name.asc()))).scalars().all())
    devices_list = list((await db.execute(select(RoomDevice))).scalars().all())
    sessions_list = list((await db.execute(select(Session).order_by(Session.start_time.asc()))).scalars().all())
    session_speakers_list = list((await db.execute(select(SessionSpeaker))).scalars().all())
    confirmed_by_session = {
        session_id: any(bool(item.is_confirmed) for item in session_speakers_list if item.session_id == session_id)
        for session_id in {item.session_id for item in session_speakers_list}
    }
    speakers_list = list((await db.execute(select(Speaker))).scalars().all())
    speaker_map = {s.id: f"{s.title or ''} {s.first_name} {s.last_name}".strip() for s in speakers_list}
    session_speakers = list((await db.execute(select(SessionSpeaker))).scalars().all())
    sess_speaker_map = {ss.session_id: speaker_map.get(ss.speaker_id) for ss in session_speakers}
    presentation_rows = list((await db.execute(
        select(PresentationFile, SessionSpeaker.session_id)
        .join(SessionSpeaker, PresentationFile.session_speaker_id == SessionSpeaker.id)
        .where(PresentationFile.is_current_version.is_(True))
    )).all())
    pres_map = {session_id: file for file, session_id in presentation_rows}
    current_file_ids = [file.id for file, _ in presentation_rows]
    transfer_rows = list((await db.execute(
        select(VenueAssetTransfer).where(VenueAssetTransfer.file_id.in_(current_file_ids))
    )).scalars().all()) if current_file_ids else []
    runtime_states = list((await db.execute(select(RoomRuntimeState))).scalars().all())
    runtime_by_room = {state.room_id: state for state in runtime_states}

    incidents = list((await db.execute(select(VenueIncident).where(VenueIncident.status != "resolved").order_by(VenueIncident.started_at.desc()))).scalars().all())
    devices_by_room: dict[uuid.UUID, list[RoomDevice]] = {}
    for d in devices_list:
        if d.room_id:
            devices_by_room.setdefault(d.room_id, []).append(d)

    room_items = []
    for r in rooms_list:
        r_devs = devices_by_room.get(r.id, [])
        tech_dev = next((d for d in r_devs if d.device_type in {"technician_tablet", "technician_pc", "technical_app", "technical"}), None)
        stage_dev = next((d for d in r_devs if d.device_type in {"presentation_pc", "stage_app", "stage"}), None)
        mod_dev = next((d for d in r_devs if d.device_type == "moderator_tablet"), None)

        tech_st = observed_state(tech_dev.last_heartbeat_at, tech_dev.status) if tech_dev else "not_configured"
        stage_st = observed_state(stage_dev.last_heartbeat_at, stage_dev.status) if stage_dev else "not_configured"
        mod_st = observed_state(mod_dev.last_heartbeat_at, mod_dev.status) if mod_dev else "not_configured"

        # Match active or next session
        active_s = next((s for s in sessions_list if s.room_id == r.id and s.start_time <= now <= s.end_time), None)
        next_s = next((s for s in sessions_list if s.room_id == r.id and s.start_time > now), None)
        target_s = active_s or next_s or next((s for s in sessions_list if s.room_id == r.id), None)

        pres = pres_map.get(target_s.id) if target_s else None
        spk_name = sess_speaker_map.get(target_s.id) if target_s else None

        # Use the persisted room timer. A scheduled session countdown is not a
        # substitute for the operator-controlled timer state.
        runtime_state = runtime_by_room.get(r.id)
        timer_seconds = None
        timer_status = "unknown"
        if runtime_state:
            timer_status = runtime_state.timer_status
            timer_seconds = runtime_state.timer_remaining_seconds
            if timer_status == "running" and runtime_state.timer_started_at and timer_seconds is not None:
                started_at = runtime_state.timer_started_at if runtime_state.timer_started_at.tzinfo else runtime_state.timer_started_at.replace(tzinfo=timezone.utc)
                timer_seconds = max(0, timer_seconds - int((now - started_at).total_seconds()))

        # Determine room operational status
        if stage_st == "not_configured" or tech_st == "not_configured":
            status_text = "NOT CONFIGURED"
        elif stage_st == "offline" or tech_st == "offline":
            status_text = "OFFLINE" if stage_st == "offline" and tech_st == "offline" else "DEGRADED"
        elif stage_st in {"stale", "degraded", "maintenance"} or tech_st in {"stale", "degraded", "maintenance"}:
            status_text = "DEGRADED"
        elif pres and pres.local_sync_status == "transferring":
            status_text = "FILE UPDATE"
        elif active_s and stage_st == "healthy" and tech_st == "healthy":
            status_text = "LIVE"
        elif stage_st == "healthy" and tech_st == "healthy":
            status_text = "READY"
        else:
            status_text = "DEGRADED"

        room_items.append({
            "id": str(r.id),
            "name": r.name,
            "type": r.room_type,
            "status_text": status_text,
            "status": "healthy" if status_text in {"LIVE", "READY"} else ("warning" if status_text in {"FILE UPDATE", "DEGRADED"} else ("unknown" if status_text == "NOT CONFIGURED" else "critical")),
            "current_speaker": spk_name,
            "current_session": {
                "id": str(target_s.id) if target_s else None,
                "code": target_s.session_code if target_s else None,
                "title": target_s.name if target_s else None,
                "start": iso(target_s.start_time) if target_s else None,
                "end": iso(target_s.end_time) if target_s else None,
                "is_active": active_s is not None,
            },
            "technical": {
                "status": tech_st,
                "device_name": tech_dev.device_name if tech_dev else None,
                "cpu_pct": None,
                "ram_pct": None,
            },
            "stage": {
                "status": stage_st,
                "device_name": stage_dev.device_name if stage_dev else None,
                "cpu_pct": None,
                "ram_pct": None,
            # A healthy Stage App does not prove that a file is playing. The
            # playback event stream is the authority; absent a persisted
            # playback state, keep this value unknown.
            "playback_status": "unknown",
            },
            "moderator": {"status": mod_st},
            "presentation": {
                "id": str(pres.id) if pres else None,
                "filename": pres.original_filename if pres else None,
                "version": f"v{pres.version_number}" if pres else None,
                "sync_status": pres.local_sync_status if pres else "not_available",
            },
            "timer_seconds": timer_seconds,
            "timer_status": timer_status,
        })

    timeline_items = []
    for s in sessions_list[:12]:
        room_name = next((r.name for r in rooms_list if r.id == s.room_id), None)
        timeline_items.append({
            "id": str(s.id),
            "session_code": s.session_code,
            "title": s.name,
            "room_name": room_name,
            "speaker": sess_speaker_map.get(s.id),
            "start": iso(s.start_time),
            "end": iso(s.end_time),
            "status": s.status,
        })

    incident_items = [{
        "id": str(inc.id),
        "code": inc.incident_code,
        "title": inc.title,
        "severity": inc.severity,
        "status": inc.status,
        "room_name": inc.room_name,
        "device_name": inc.device_name,
        "assigned_to": inc.assigned_to,
        "started_at": iso(inc.started_at),
        "timeline": inc.timeline,
        "resolution": inc.resolution,
    } for inc in incidents]

    return {
        "generated_at": now.isoformat(),
        "venue_healthy": bool(room_items) and not any(i.severity == "critical" for i in incidents) and all(
            item["status_text"] not in {"OFFLINE", "NOT CONFIGURED"} for item in room_items
        ),
        "rooms": room_items,
        "timeline": timeline_items,
        "incidents": incident_items,
        "stats": {
            "total_rooms": len(rooms_list),
            "live_rooms": sum(1 for r in room_items if r["status_text"] == "LIVE"),
            "warning_rooms": sum(1 for r in room_items if r["status_text"] in {"FILE UPDATE", "DEGRADED"}),
            "offline_rooms": sum(1 for r in room_items if r["status_text"] == "OFFLINE"),
        }
    }


@router.get("/rooms/{room_id}/workspace")
async def get_room_workspace(
    room_id: uuid.UUID,
    db: AsyncSession = Depends(get_database),
    _: VenueUser = Depends(require_viewer),
) -> dict:
    now = utcnow()
    room = await db.get(Room, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found.")

    devices = list((await db.execute(select(RoomDevice).where(RoomDevice.room_id == room_id))).scalars().all())
    runtime_state = await db.scalar(
        select(RoomRuntimeState).where(
            RoomRuntimeState.event_id == room.event_id,
            RoomRuntimeState.room_id == room.id,
        )
    )
    sessions = list((await db.execute(select(Session).where(Session.room_id == room_id).order_by(Session.start_time.asc()))).scalars().all())
    session_ids = [s.id for s in sessions]

    session_speakers = list((await db.execute(select(SessionSpeaker).where(SessionSpeaker.session_id.in_(session_ids)))).scalars().all()) if session_ids else []
    speakers_list = list((await db.execute(select(Speaker))).scalars().all())
    speaker_map = {s.id: s for s in speakers_list}

    presentations = list((await db.execute(
        select(PresentationFile)
        .join(SessionSpeaker, PresentationFile.session_speaker_id == SessionSpeaker.id)
        .where(SessionSpeaker.session_id.in_(session_ids), PresentationFile.is_current_version.is_(True))
    )).scalars().all()) if session_ids else []
    pres_map = {p.session_speaker_id: p for p in presentations}

    tech_dev = next((d for d in devices if d.device_type in {"technician_tablet", "technician_pc", "technical_app", "technical"}), None)
    stage_dev = next((d for d in devices if d.device_type in {"presentation_pc", "stage_app", "stage"}), None)
    mod_dev = next((d for d in devices if d.device_type == "moderator_tablet"), None)

    room_device_states = [
        observed_state(device.last_heartbeat_at, device.status)
        for device in (stage_dev, tech_dev)
        if device is not None
    ]
    if not room_device_states:
        room_status = "not_configured"
    elif all(state == "healthy" for state in room_device_states):
        room_status = "healthy"
    elif any(state == "offline" for state in room_device_states):
        room_status = "offline" if all(state == "offline" for state in room_device_states) else "degraded"
    else:
        room_status = "degraded"

    timer_remaining = runtime_state.timer_remaining_seconds if runtime_state else None
    timer_status = runtime_state.timer_status if runtime_state else "unknown"
    if runtime_state and timer_status == "running" and runtime_state.timer_started_at and timer_remaining is not None:
        started_at = runtime_state.timer_started_at if runtime_state.timer_started_at.tzinfo else runtime_state.timer_started_at.replace(tzinfo=timezone.utc)
        timer_remaining = max(0, timer_remaining - int((now - started_at).total_seconds()))
        if timer_remaining == 0:
            timer_status = "expired"

    active_s = next((s for s in sessions if s.start_time <= now <= s.end_time), None)
    next_s = next((s for s in sessions if s.start_time > now), None)
    target_s = active_s or next_s or (sessions[0] if sessions else None)

    spk_rel = next((ss for ss in session_speakers if target_s and ss.session_id == target_s.id), None)
    speaker = speaker_map.get(spk_rel.speaker_id) if spk_rel else None

    pres = pres_map.get(spk_rel.id) if spk_rel else None

    # Overrides for this room
    overrides = list((await db.execute(select(VenueOverride).where(VenueOverride.target_id == str(room.id), VenueOverride.is_active.is_(True)))).scalars().all())

    return {
        "room": {
            "id": str(room.id),
            "name": room.name,
            "type": room.room_type,
            "capacity": room.capacity,
            "av_technician": room.av_technician,
            "status": room_status,
        },
        "current_session": {
            "id": str(target_s.id) if target_s else None,
            "code": target_s.session_code if target_s else None,
            "title": target_s.name if target_s else None,
            "start": iso(target_s.start_time) if target_s else None,
            "end": iso(target_s.end_time) if target_s else None,
            "is_active": active_s is not None,
            "speaker": {
                "name": f"{speaker.title or ''} {speaker.first_name} {speaker.last_name}".strip() if speaker else None,
                "affiliation": speaker.affiliation if speaker else None,
            } if target_s else None,
            "presentation": {
                "id": str(pres.id) if pres else None,
                "filename": pres.original_filename if pres else None,
                "version": f"v{pres.version_number}" if pres else None,
                "size_bytes": pres.file_size_bytes if pres else None,
                "status": pres.local_sync_status if pres else "not_available",
                "checksum": pres.content_sha256 if pres else None,
            } if target_s else None,
        },
        "upcoming_sessions": [{
            "id": str(s.id),
            "code": s.session_code,
            "title": s.name,
            "start": iso(s.start_time),
            "end": iso(s.end_time),
        } for s in sessions if s != target_s][:5],
        "devices": {
            "technical": {
                "id": str(tech_dev.id) if tech_dev else None,
                "name": tech_dev.device_name if tech_dev else None,
                "status": observed_state(tech_dev.last_heartbeat_at, tech_dev.status) if tech_dev else "not_configured",
                "cpu_pct": None, "ram_pct": None, "ip": str(tech_dev.ip_address) if tech_dev and tech_dev.ip_address else None,
                "app_version": tech_dev.app_version if tech_dev else None,
                "current_presentation": pres.original_filename if pres else None,
            },
            "stage": {
                "id": str(stage_dev.id) if stage_dev else None,
                "name": stage_dev.device_name if stage_dev else None,
                "status": observed_state(stage_dev.last_heartbeat_at, stage_dev.status) if stage_dev else "not_configured",
                "cpu_pct": None, "ram_pct": None, "ip": str(stage_dev.ip_address) if stage_dev and stage_dev.ip_address else None,
                "app_version": stage_dev.app_version if stage_dev else None,
                "playing_presentation": pres.original_filename if pres else None,
                "version_cached": f"v{pres.version_number}" if pres else None,
            },
            "moderator": {
                "id": str(mod_dev.id) if mod_dev else None,
                "name": mod_dev.device_name if mod_dev else None,
                "status": observed_state(mod_dev.last_heartbeat_at, mod_dev.status) if mod_dev else "not_configured",
            },
            "timer": {
                "status": timer_status,
                "display_active": (timer_status != "hidden") if runtime_state else None,
                "remaining_seconds": timer_remaining,
                "duration_seconds": runtime_state.timer_duration_seconds if runtime_state else None,
                "updated_at": iso(runtime_state.updated_at) if runtime_state else None,
            },
        },
        "overrides": [{
            "id": str(ov.id), "type": ov.override_type, "reason": ov.reason, "authorized_by": ov.authorized_by,
        } for ov in overrides],
    }


@router.post("/rooms/{room_id}/command")
async def send_room_command(
    room_id: uuid.UUID,
    payload: CommandRequest,
    request: Request,
    db: AsyncSession = Depends(get_database),
    user: VenueUser = Depends(require_operator),
) -> dict:
    room = await db.get(Room, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found.")

    allowed = {
        "launch_presentation", "pause", "stop", "reload", "switch_session",
        "show_timer", "hide_timer", "start_timer", "pause_timer", "reset_timer",
        "emergency_message", "prepare_now"
    }
    if payload.command not in allowed:
        raise HTTPException(status_code=422, detail=f"Unsupported room command '{payload.command}'.")

    if payload.idempotency_key:
        existing = (await db.execute(select(VenueCommand).where(VenueCommand.idempotency_key == payload.idempotency_key))).scalar_one_or_none()
        if existing:
            if existing.room_id != room.id or existing.event_id != room.event_id or existing.command != payload.command:
                raise HTTPException(status_code=409, detail="Idempotency key belongs to another room command.")
            return {"command_id": str(existing.id), "status": existing.status, "room_id": str(room.id), "action": existing.command, "idempotent": True}

    command = VenueCommand(
        target_type="room",
        target_id=str(room.id),
        event_id=room.event_id,
        room_id=room.id,
        command=payload.command,
        payload=payload.payload,
        requested_by=user.id,
        reason=payload.reason,
        status="queued",
        idempotency_key=payload.idempotency_key,
        expires_at=utcnow() + timedelta(minutes=5),
    )
    db.add(command)
    await write_audit(
        db, user=user, request=request, category="room_control", action=payload.command,
        result="queued", object_type="room", object_id=str(room.id), reason=payload.reason,
        details=payload.payload
    )
    await db.commit()
    return {"command_id": str(command.id), "status": command.status, "room_id": str(room.id), "action": payload.command}


@router.get("/rooms/readiness")
async def get_rooms_readiness(
    db: AsyncSession = Depends(get_database),
    _: VenueUser = Depends(require_viewer),
) -> dict:
    now = utcnow()
    rooms_list = list((await db.execute(select(Room).where(Room.is_active.is_(True)).order_by(Room.display_order.asc()))).scalars().all())
    devices_list = list((await db.execute(select(RoomDevice))).scalars().all())
    sessions_list = list((await db.execute(select(Session).order_by(Session.start_time.asc()))).scalars().all())
    presentation_rows = list((await db.execute(
        select(PresentationFile, SessionSpeaker.session_id)
        .join(SessionSpeaker, PresentationFile.session_speaker_id == SessionSpeaker.id)
        .where(PresentationFile.is_current_version.is_(True))
    )).all())
    pres_map = {session_id: file for file, session_id in presentation_rows}

    devices_by_room: dict[uuid.UUID, list[RoomDevice]] = {}
    for d in devices_list:
        if d.room_id:
            devices_by_room.setdefault(d.room_id, []).append(d)

    readiness_items = []
    for r in rooms_list:
        r_devs = devices_by_room.get(r.id, [])
        tech_dev = next((d for d in r_devs if d.device_type in {"technician_tablet", "technician_pc"}), None)
        stage_dev = next((d for d in r_devs if d.device_type == "presentation_pc"), None)
        mod_dev = next((d for d in r_devs if d.device_type == "moderator_tablet"), None)

        tech_ok = observed_state(tech_dev.last_heartbeat_at, tech_dev.status) == "healthy" if tech_dev else False
        stage_ok = observed_state(stage_dev.last_heartbeat_at, stage_dev.status) == "healthy" if stage_dev else False
        mod_ok = observed_state(mod_dev.last_heartbeat_at, mod_dev.status) == "healthy" if mod_dev else False

        target_s = next((s for s in sessions_list if s.room_id == r.id and s.start_time <= now <= s.end_time), None)
        if not target_s:
            target_s = next((s for s in sessions_list if s.room_id == r.id and s.start_time > now), None)

        pres = pres_map.get(target_s.id) if target_s else None
        pres_downloaded = bool(pres and pres.local_sync_status == "synced" and pres.local_cache_path)
        stage_delivery = next((transfer for transfer in transfer_rows if pres and stage_dev and transfer.file_id == pres.id and transfer.version_number == pres.version_number and transfer.target_id == stage_dev.id), None)
        pres_checksum = bool(stage_delivery and stage_delivery.status == "verified" and stage_delivery.checksum_verified and stage_delivery.acknowledged_sha256 and stage_delivery.acknowledged_sha256.lower() == (pres.content_sha256 or "").lower())
        viewer_ready = stage_ok and pres_checksum
        speaker_confirmed = confirmed_by_session.get(target_s.id, False) if target_s else False
        timer_available = any(device.device_type in {"timer", "timer_display"} and device.status == "online" for device in r_devs)

        all_checks = [tech_ok, stage_ok, pres_downloaded, pres_checksum, viewer_ready, speaker_confirmed, timer_available, mod_ok]
        is_ready = all(all_checks)
        warning_count = sum(1 for c in all_checks if not c)

        readiness_items.append({
            "room_id": str(r.id),
            "room_name": r.name,
            "session_title": target_s.name if target_s else None,
            "session_code": target_s.session_code if target_s else None,
            "starts_in_minutes": max(0, int((target_s.start_time - now).total_seconds() // 60)) if target_s and target_s.start_time > now else 0 if target_s else None,
            "overall_status": "READY" if is_ready else ("WARNING" if warning_count >= 2 else "PREPARING"),
            "checklist": {
                "technical_connected": tech_ok,
                "stage_connected": stage_ok,
                "presentation_downloaded": pres_downloaded,
                "file_checksum_verified": pres_checksum,
                "presentation_viewer_ready": viewer_ready,
                "speaker_confirmed": speaker_confirmed,
                "timer_available": timer_available,
                "moderator_connected": mod_ok,
            },
            "presentation_info": {
                "filename": pres.original_filename if pres else None,
                "version": f"v{pres.version_number}" if pres else None,
                "viewer_status": "Loaded" if viewer_ready else "Not loaded",
            }
        })

    return {
        "generated_at": now.isoformat(),
        "total_rooms": len(readiness_items),
        "ready_rooms": sum(1 for r in readiness_items if r["overall_status"] == "READY"),
        "preparing_rooms": sum(1 for r in readiness_items if r["overall_status"] == "PREPARING"),
        "warning_rooms": sum(1 for r in readiness_items if r["overall_status"] == "WARNING"),
        "items": readiness_items
    }


# =============================================================================
# 03. SRR WORKSPACE & FLEET CONTROL
# =============================================================================

@router.get("/srr-fleet")
async def get_srr_fleet(
    db: AsyncSession = Depends(get_database),
    _: VenueUser = Depends(require_viewer),
) -> dict:
    now = utcnow()
    event = await single_event(db)
    event_id = event.id if event else None
    station_query = select(SRRStation).order_by(SRRStation.station_number.asc())
    checkin_query = select(SRRCheckin).order_by(SRRCheckin.created_at.desc()).limit(1)
    file_query = select(PresentationFile).where(PresentationFile.is_current_version.is_(True)).order_by(PresentationFile.uploaded_at.desc()).limit(20)
    if event_id:
        station_query = station_query.where(SRRStation.event_id == event_id)
        checkin_query = checkin_query.where(SRRCheckin.event_id == event_id)
        file_query = file_query.where(PresentationFile.event_id == event_id)
    stations = list((await db.execute(station_query)).scalars().all())
    latest_checkin = (await db.execute(checkin_query)).scalar_one_or_none()
    files = list((await db.execute(file_query)).scalars().all())
    
    # Pre-fetch Sessions, Rooms, Speakers
    file_session_rows = list((await db.execute(
        select(PresentationFile.id, SessionSpeaker.session_id)
        .join(SessionSpeaker, PresentationFile.session_speaker_id == SessionSpeaker.id)
        .where(PresentationFile.id.in_([f.id for f in files]))
    )).all()) if files else []
    file_session_map = {file_id: session_id for file_id, session_id in file_session_rows}
    session_ids = [session_id for _, session_id in file_session_rows]
    sessions = list((await db.execute(select(Session).where(Session.id.in_(session_ids)))).scalars().all()) if session_ids else []
    session_map = {s.id: s for s in sessions}

    room_ids = [s.room_id for s in sessions if s.room_id]
    rooms = list((await db.execute(select(Room).where(Room.id.in_(room_ids)))).scalars().all()) if room_ids else []
    room_map = {r.id: r.name for r in rooms}

    session_speakers = list((await db.execute(select(SessionSpeaker).where(SessionSpeaker.session_id.in_(session_ids)))).scalars().all()) if session_ids else []
    speaker_ids = [ss.speaker_id for ss in session_speakers]
    speakers = list((await db.execute(select(Speaker).where(Speaker.id.in_(speaker_ids)))).scalars().all()) if speaker_ids else []
    speaker_map = {s.id: f"{s.title or ''} {s.first_name} {s.last_name}".strip() for s in speakers}
    sess_speaker_map = {ss.session_id: speaker_map.get(ss.speaker_id, "Speaker") for ss in session_speakers}

    assigned_speaker_ids = {s.assigned_speaker_id for s in stations if s.assigned_speaker_id}
    assigned_speakers = list((await db.execute(select(Speaker).where(Speaker.id.in_(assigned_speaker_ids)))).scalars().all()) if assigned_speaker_ids else []
    assigned_speaker_map = {s.id: f"{s.title or ''} {s.first_name} {s.last_name}".strip() for s in assigned_speakers}
    file_ids = [f.id for f in files]
    transfer_rows = list((await db.execute(select(VenueAssetTransfer).where(VenueAssetTransfer.file_id.in_(file_ids)))).scalars().all()) if file_ids else []
    transfers_by_file: dict[uuid.UUID, list[VenueAssetTransfer]] = {}
    for transfer in transfer_rows:
        transfers_by_file.setdefault(transfer.file_id, []).append(transfer)
    room_device_query = select(RoomDevice)
    if event_id:
        room_device_query = room_device_query.where(RoomDevice.event_id == event_id)
    room_devices = list((await db.execute(room_device_query)).scalars().all())

    def delivery_state(rows: list[VenueAssetTransfer]) -> str:
        if not rows:
            return "NOT_CONFIGURED"
        if any(row.status == "failed" for row in rows):
            return "FAILED"
        if any(row.status == "cancelled" for row in rows):
            return "STALE"
        if all(row.status == "verified" and row.checksum_verified for row in rows):
            return "SYNCED"
        return "PENDING"

    station_items = []
    for s in stations:
        observed = station_payload(s, now)
        st_state = observed["status"]
        status_text = {
            "occupied": "Working", "uploading": "Uploading", "idle": "Available",
            "completed": "Completed", "locked": "Locked", "error": "Error", "offline": "Offline",
        }.get(st_state, "Unknown")
        station_items.append({
            "station_number": s.station_number,
            "station_code": f"SRR-{s.station_number:02d}",
            "device_name": s.device_name or f"SRR-Station-{s.station_number:02d}",
            "ip_address": str(s.ip_address) if s.ip_address else None,
            "status": st_state,
            "status_text": status_text,
            "speaker": assigned_speaker_map.get(s.assigned_speaker_id),
            "current_file": None,
            "cpu_pct": None,
            "ram_pct": None,
            "disk_pct": None,
            "agent_version": None,
            "last_heartbeat": iso(s.last_heartbeat_at),
        })

    # Available count
    available_stations = [s["station_code"] for s in station_items if s["status"] == "idle"]

    checkin_speaker = None
    checkin_station = None
    checkin_scan = None
    if latest_checkin:
        checkin_scan = latest_checkin.created_at.strftime("%H:%M:%S") if latest_checkin.created_at else None
        station = await db.get(SRRStation, latest_checkin.station_id) if latest_checkin.station_id else None
        checkin_station = f"SRR-{station.station_number:02d}" if station else None
        if latest_checkin.speaker_id:
            spk = await db.get(Speaker, latest_checkin.speaker_id)
            if spk:
                checkin_speaker = f"{spk.title or ''} {spk.first_name} {spk.last_name}".strip()

    stage_types = {"presentation_pc", "stage_app", "stage"}
    technical_types = {"technician_tablet", "technical_app", "technician", "technical"}
    active_stations = [s for s in stations if s.is_active]
    recent_files = []
    for f in files[:10]:
        session_id = file_session_map.get(f.id)
        sess = session_map.get(session_id)
        r_name = room_map.get(sess.room_id) if sess else None
        spk_name = sess_speaker_map.get(session_id)
        file_transfers = transfers_by_file.get(f.id, [])
        srr_transfers = [t for t in file_transfers if t.target_type == "srr_station" and any(t.target_id == station.id for station in active_stations)]
        room_file_devices = [d for d in room_devices if d.room_id == f.room_id and d.event_id == f.event_id]
        stage_ids = {d.id for d in room_file_devices if (d.device_type or "").strip().lower() in stage_types and d.enrollment_token_revoked_at is None}
        technical_ids = {d.id for d in room_file_devices if (d.device_type or "").strip().lower() in technical_types and d.enrollment_token_revoked_at is None}
        stage_transfers = [t for t in file_transfers if t.target_id in stage_ids]
        technical_transfers = [t for t in file_transfers if t.target_id in technical_ids]
        srr_state = delivery_state(srr_transfers)
        tech_state = delivery_state(technical_transfers)
        stage_state = delivery_state(stage_transfers)
        all_states = [srr_state, tech_state, stage_state]
        overall_state = "FAILED" if "FAILED" in all_states else "STALE" if "STALE" in all_states else "SYNCED" if all(state == "SYNCED" for state in all_states) else "NOT_CONFIGURED" if all(state == "NOT_CONFIGURED" for state in all_states) else "TRANSFERRING"
        recent_files.append({
            "id": str(f.id),
            "speaker": spk_name,
            "session": sess.name if sess else None,
            "room": r_name,
            "filename": f.original_filename,
            "version": f"v{f.version_number}",
            "modified": (f.uploaded_at if f.uploaded_at else now).strftime("%H:%M"),
            "srr_status": srr_state,
            "tech_status": tech_state,
            "stage_status": stage_state,
            "distribution_status": overall_state,
        })

    return {
        "generated_at": now.isoformat(),
        "srr_status": "NOT_CONFIGURED" if not stations else "READY" if any(s["status"] not in {"offline", "locked"} for s in station_items) else "OFFLINE",
        "total_stations": len(station_items),
        "active_stations": sum(1 for s in station_items if s["status"] != "idle"),
        "available_stations": available_stations,
        "checkin_node": {
            "status": "UNKNOWN",
            "last_scan_time": checkin_scan,
            "last_speaker": checkin_speaker,
            "assigned_station": checkin_station,
            "status_text": "LAST SCAN RECORDED" if checkin_speaker else "NO HEARTBEAT EVIDENCE",
        },
        "stations": station_items,
        "recent_files": recent_files,
    }


@router.post("/srr/stations/{station_number}/command")
async def send_srr_station_command(
    station_number: int,
    payload: CommandRequest,
    request: Request,
    db: AsyncSession = Depends(get_database),
    user: VenueUser = Depends(require_operator),
) -> dict:
    event = await single_event(db)
    station_query = select(SRRStation).where(SRRStation.station_number == station_number)
    if event:
        station_query = station_query.where(SRRStation.event_id == event.id)
    station = await db.scalar(station_query)
    if not station:
        raise HTTPException(status_code=404, detail="SRR Station not found.")

    allowed = {"force_release", "reassign", "disable", "restart_agent", "sync", "send_message"}
    if payload.command not in allowed:
        raise HTTPException(status_code=422, detail=f"Unsupported SRR command '{payload.command}'.")

    if payload.command == "force_release":
        station.status = "idle"
        station.assigned_speaker_id = None
        station.session_assigned_at = None
    elif payload.command == "disable":
        station.status = "locked"

    await write_audit(
        db, user=user, request=request, category="srr", action=payload.command,
        result="success", object_type="srr_station", object_id=str(station_number), reason=payload.reason
    )
    await db.commit()
    return {"accepted": True, "station_number": station_number, "action": payload.command}


# =============================================================================
# 04. CONTENT & DISTRIBUTION CENTER
# =============================================================================

@router.get("/distribution")
async def get_distribution_center(
    db: AsyncSession = Depends(get_database),
    _: VenueUser = Depends(require_viewer),
) -> dict:
    now = utcnow()
    transfers = list((await db.execute(select(VenueAssetTransfer).order_by(VenueAssetTransfer.updated_at.desc()))).scalars().all())

    items = [{
        "id": str(t.id),
        "file_id": str(t.file_id),
        "asset_code": f"A{t.file_id.hex[:3].upper()} v{t.version_number}",
        "filename": t.filename,
        "version": f"v{t.version_number}",
        "source_node": t.source_node,
        "target_node": t.target_node,
        "target_type": t.target_type,
        "priority": t.priority.upper(),
        "progress_pct": t.progress_pct,
        "status": t.status,
        "checksum_verified": t.checksum_verified,
        "targets": [{"node": t.target_node, "type": t.target_type, "status": t.status, "progress_pct": t.progress_pct}],
    } for t in transfers]

    return {
        "generated_at": now.isoformat(),
        "stats": {
            "active_transfers": sum(1 for t in transfers if t.status == "transferring"),
            "queued": sum(1 for t in transfers if t.status == "pending"),
            "failed": sum(1 for t in transfers if t.status == "failed"),
            "completed": sum(1 for t in transfers if t.status in {"completed", "verified"}),
        },
        "transfers": items,
    }


@router.post("/distribution/{file_id}/priority")
async def set_asset_priority(
    file_id: uuid.UUID,
    payload: CommandRequest,
    request: Request,
    db: AsyncSession = Depends(get_database),
    user: VenueUser = Depends(require_operator),
) -> dict:
    priority = payload.payload.get("priority", "urgent").lower()
    transfers = list((await db.execute(select(VenueAssetTransfer).where(VenueAssetTransfer.file_id == file_id))).scalars().all())
    for t in transfers:
        t.priority = priority
        t.updated_at = utcnow()

    await write_audit(
        db, user=user, request=request, category="distribution", action="set_priority",
        result="success", object_type="asset", object_id=str(file_id), reason=payload.reason,
        details={"priority": priority}
    )
    await db.commit()
    return {"file_id": str(file_id), "priority": priority, "updated": len(transfers)}


# =============================================================================
# 05. FLEET & DEVICE WALL
# =============================================================================

@router.get("/devices/wall")
async def get_device_wall(
    db: AsyncSession = Depends(get_database),
    _: VenueUser = Depends(require_viewer),
) -> dict:
    now = utcnow()
    devices = list((await db.execute(select(RoomDevice).order_by(RoomDevice.device_name.asc()))).scalars().all())
    rooms = list((await db.execute(select(Room))).scalars().all())
    room_map = {r.id: r.name for r in rooms}

    wall_items = []
    for d in devices:
        st = observed_state(d.last_heartbeat_at, d.status)
        r_name = room_map.get(d.room_id, "Unassigned")
        service_category = "Rooms"
        if "srr" in d.device_type.lower() or "srr" in d.device_name.lower():
            service_category = "SRR"
        elif "kiosk" in d.device_type.lower() or "desk" in d.device_name.lower():
            service_category = "Registration"
        elif "signage" in d.device_type.lower():
            service_category = "Signage"
        elif "poster" in d.device_type.lower():
            service_category = "ePoster"

        wall_items.append({
            "id": str(d.id),
            "name": d.device_name,
            "hostname": d.hostname or d.device_name,
            "service_category": service_category,
            "room_name": r_name,
            "type": d.device_type,
            "status": st,
            "ip_address": str(d.ip_address) if d.ip_address else None,
            "mac_address": str(d.mac_address) if d.mac_address else None,
            "os_version": d.os_version,
            "app_version": d.app_version,
            "cpu_pct": None,
            "ram_pct": None,
            "disk_pct": None,
            "last_heartbeat": iso(d.last_heartbeat_at),
        })

    return {
        "generated_at": now.isoformat(),
        "total_devices": len(wall_items),
        "online_count": sum(1 for d in wall_items if d["status"] == "healthy"),
        "warning_count": sum(1 for d in wall_items if d["status"] == "stale"),
        "offline_count": sum(1 for d in wall_items if d["status"] == "offline"),
        "devices": wall_items,
    }


# =============================================================================
# 06. SERVICES & CONNECTIVITY WORKSPACE
# =============================================================================

@router.get("/services/summary")
async def get_services_summary(
    db: AsyncSession = Depends(get_database),
    _: VenueUser = Depends(require_viewer),
) -> dict:
    stations = list((await db.execute(select(SRRStation))).scalars().all())
    rooms = list((await db.execute(select(Room))).scalars().all())
    devices = list((await db.execute(select(RoomDevice))).scalars().all())
    station_states = [observed_state(row.last_heartbeat_at, row.status) for row in stations]
    room_states = [observed_state(row.last_heartbeat_at, row.status) for row in devices if row.device_type in {"stage", "technical", "stage_app", "technical_app"}]

    def aggregate(states: list[str], configured: bool = True) -> str:
        if not configured:
            return "not_configured"
        if not states:
            return "not_configured"
        if any(state == "offline" for state in states):
            return "offline"
        if any(state in {"stale", "degraded", "maintenance"} for state in states):
            return "degraded"
        return "healthy"

    by_type = {}
    for row in devices:
        by_type.setdefault(row.device_type, []).append(row)

    def device_group(device_type: str) -> dict[str, object]:
        rows = by_type.get(device_type, [])
        return {"status": aggregate([observed_state(row.last_heartbeat_at, row.status) for row in rows]), "devices": len(rows)}

    return {
        "srr": {"status": aggregate(station_states), "stations": len(stations), "subsystem": "SRR Master & Intake Node"},
        "rooms": {"status": aggregate(room_states), "rooms": len(rooms), "subsystem": "Technical & Stage Nodes"},
        "registration": {**device_group("registration_desk"), "desks": len(by_type.get("registration_desk", [])), "kiosks": len(by_type.get("registration_kiosk", [])), "printers": None},
        "signage": {**device_group("signage_display"), "displays": len(by_type.get("signage_display", [])), "subsystem": "Digital Signage Hub"},
        "eposter": {**device_group("eposter_display"), "displays": len(by_type.get("eposter_display", [])), "subsystem": "ePoster Cluster"},
    }


@router.get("/connectivity")
async def get_connectivity_status(
    db: AsyncSession = Depends(get_database),
    _: VenueUser = Depends(require_viewer),
) -> dict:
    outbox_counts = dict((await db.execute(select(SyncOutbox.status, func.count(SyncOutbox.id)).group_by(SyncOutbox.status))).all())
    install = await installation(db)
    event = await single_event(db)
    latest_job = await db.scalar(select(VenueSyncJob).order_by(VenueSyncJob.created_at.desc()).limit(1))
    services = list((await db.execute(select(VenueServiceInstance))).scalars().all())
    latest_source = await db.scalar(select(RegistrationSourceHeartbeat).order_by(RegistrationSourceHeartbeat.received_at.desc()).limit(1))
    service_states = [observed_state(item.last_heartbeat_at, item.status) for item in services]
    venue_state = "healthy"
    
    return {
        "cloud": {"status": "unknown", "latency_ms": None, "endpoint": settings.CLOUD_API_URL or None, "evidence": "No live cloud probe is recorded by Venue Server."},
        "venue_server": {"status": venue_state, "node_id": install.installation_name if install else None, "ip": "127.0.0.1", "evidence": "This response was served by Venue Server."},
        "local_services": {"status": "not_configured" if not services else ("degraded" if any(state != "healthy" for state in service_states) else "healthy"), "healthy_count": sum(1 for state in service_states if state == "healthy"), "total_count": len(services)},
        "sync": {
            "cloud_to_venue": "unknown",
            "venue_to_cloud_pending": int(outbox_counts.get("pending", 0)),
            "failed": int(outbox_counts.get("failed", 0)),
            "conflicts": int(outbox_counts.get("conflict", 0)),
            "last_sync": iso(latest_job.completed_at if latest_job else None),
            "event_version": None,
            "venue_snapshot": None,
            "registration_source_last_heartbeat": iso(latest_source.received_at if latest_source else None),
        },
        "topology_modes": {
            "srr": "VENUE",
            "rooms": "VENUE",
            "registration": "CLOUD + LOCAL",
            "signage": "CLOUD",
            "eposter": "VENUE",
        }
    }


@router.get("/network/topology")
async def get_network_topology(
    db: AsyncSession = Depends(get_database),
    _: VenueUser = Depends(require_viewer),
) -> dict:
    devices = list((await db.execute(select(RoomDevice).order_by(RoomDevice.device_name))).scalars().all())
    stations = list((await db.execute(select(SRRStation).order_by(SRRStation.station_number))).scalars().all())
    rooms = list((await db.execute(select(Room).order_by(Room.name))).scalars().all())
    room_map = {room.id: room for room in rooms}
    room_children = []
    for room in rooms:
        room_devices = [device for device in devices if device.room_id == room.id]
        room_states = [observed_state(device.last_heartbeat_at, device.status) for device in room_devices]
        room_children.append({
            "name": room.name,
            "type": "room",
            "status": aggregate_device_state(room_states),
            "room_id": str(room.id),
            "children": [{"name": device.device_name, "id": str(device.id), "type": device.device_type, "status": observed_state(device.last_heartbeat_at, device.status), "ip": str(device.ip_address) if device.ip_address else None} for device in room_devices],
        })
    station_children = [{"name": station.device_name or f"Station {station.station_number}", "id": str(station.id), "type": station.device_role, "status": observed_state(station.last_heartbeat_at, station.status), "ip": str(station.ip_address) if station.ip_address else None} for station in stations]
    registration_children = [{"name": device.device_name, "id": str(device.id), "type": device.device_type, "status": observed_state(device.last_heartbeat_at, device.status), "ip": str(device.ip_address) if device.ip_address else None} for device in devices if device.device_type in {"registration_desk", "registration_kiosk"}]
    return {
        "root": {
            "name": "Cloud Gateway", "type": "cloud", "status": "unknown", "latency_ms": None,
            "children": [{
                "name": "Venue Server Core", "type": "venue_server", "status": "healthy", "ip": "127.0.0.1",
                "children": [
                    {
                        "name": "SRR Cluster", "type": "srr_master", "status": aggregate_device_state([item["status"] for item in station_children]),
                        "children": station_children
                    },
                    {"name": "Room Clusters", "type": "room_master", "status": aggregate_device_state([item["status"] for item in room_children]), "children": room_children},
                    {"name": "Registration & Kiosks", "type": "registration_master", "status": aggregate_device_state([item["status"] for item in registration_children]), "children": registration_children}
                ]
            }]
        },
        "vlans": [],
        "bandwidth": {"rx_mbps": None, "tx_mbps": None, "file_distribution_mbps": None, "control_traffic_mbps": None}
    }


# =============================================================================
# 07. INCIDENTS, CHAT, BROADCAST & OVERRIDES
# =============================================================================

@router.get("/incidents")
async def get_incidents(
    db: AsyncSession = Depends(get_database),
    _: VenueUser = Depends(require_viewer),
) -> dict:
    rows = list((await db.execute(select(VenueIncident).order_by(VenueIncident.created_at.desc()))).scalars().all())
    return {"items": [{
        "id": str(r.id), "code": r.incident_code, "title": r.title, "severity": r.severity,
        "status": r.status, "room_name": r.room_name, "device_name": r.device_name,
        "assigned_to": r.assigned_to, "started_at": iso(r.started_at), "resolved_at": iso(r.resolved_at),
        "timeline": r.timeline, "resolution": r.resolution,
    } for r in rows]}


@router.get("/chat/messages")
async def get_chat_messages(
    channel: str = Query(default="technical-support"),
    db: AsyncSession = Depends(get_database),
    _: VenueUser = Depends(require_viewer),
) -> dict:
    rows = list((await db.execute(select(VenueChatMessage).where(VenueChatMessage.channel == channel).order_by(VenueChatMessage.created_at.asc()).limit(200))).scalars().all())
    return {"channel": channel, "messages": [{
        "id": str(r.id), "sender_name": r.sender_name, "sender_role": r.sender_role,
        "device_id": r.device_id, "room_id": r.room_id, "session_id": r.session_id,
        "message": r.message, "metadata_context": r.metadata_context, "created_at": iso(r.created_at),
    } for r in rows]}


class ChatMessageRequest(BaseModel):
    channel: str = "technical-support"
    message: str = Field(min_length=1, max_length=2000)
    device_id: str | None = None
    room_id: str | None = None
    session_id: str | None = None
    metadata_context: dict = Field(default_factory=dict)


@router.post("/chat/messages")
async def send_chat_message(
    payload: ChatMessageRequest,
    db: AsyncSession = Depends(get_database),
    user: VenueUser = Depends(require_viewer),
) -> dict:
    msg = VenueChatMessage(
        channel=payload.channel,
        sender_name=user.full_name or user.username,
        sender_role=user.role or "Operator",
        device_id=payload.device_id,
        room_id=payload.room_id,
        session_id=payload.session_id,
        message=payload.message,
        metadata_context=payload.metadata_context,
    )
    db.add(msg)
    await db.commit()
    return {"id": str(msg.id), "channel": msg.channel, "created_at": iso(msg.created_at)}


class BroadcastRequest(BaseModel):
    target_scope: str = "all_venue"
    target_ids: list[str] = Field(default_factory=list)
    message: str = Field(min_length=3, max_length=1000)
    priority: str = "urgent"


@router.post("/broadcast")
async def send_emergency_broadcast(
    payload: BroadcastRequest,
    request: Request,
    db: AsyncSession = Depends(get_database),
    user: VenueUser = Depends(require_operator),
) -> dict:
    bcast = VenueBroadcast(
        target_scope=payload.target_scope,
        target_ids=payload.target_ids,
        message=payload.message,
        priority=payload.priority,
        sent_by=user.full_name or user.username,
        expires_at=utcnow() + timedelta(minutes=30),
    )
    db.add(bcast)
    await write_audit(
        db, user=user, request=request, category="broadcast", action="emergency_broadcast",
        result="dispatched", object_type="broadcast", object_id=str(bcast.id), reason=payload.message,
        details={"scope": payload.target_scope, "targets": payload.target_ids}
    )
    await db.commit()
    return {"id": str(bcast.id), "status": "dispatched", "message": bcast.message}


@router.get("/overrides")
async def get_overrides(
    db: AsyncSession = Depends(get_database),
    _: VenueUser = Depends(require_viewer),
) -> dict:
    rows = list((await db.execute(select(VenueOverride).where(VenueOverride.is_active.is_(True)).order_by(VenueOverride.created_at.desc()))).scalars().all())
    return {"items": [{
        "id": str(r.id), "target_type": r.target_type, "target_id": r.target_id,
        "target_name": r.target_name, "override_type": r.override_type, "payload": r.payload,
        "reason": r.reason, "authorized_by": r.authorized_by, "is_active": r.is_active,
        "expires_at": iso(r.expires_at), "created_at": iso(r.created_at),
    } for r in rows]}


# =============================================================================
# 08. GLOBAL SEARCH & READINESS CHECKLIST
# =============================================================================

@router.get("/search")
async def global_search(
    q: str = Query(min_length=1),
    db: AsyncSession = Depends(get_database),
    _: VenueUser = Depends(require_viewer),
) -> dict:
    term = f"%{q.strip().lower()}%"
    results = []

    # 1. Match Rooms
    matched_rooms = list((await db.execute(select(Room).where(func.lower(Room.name).like(term)).limit(5))).scalars().all())
    for r in matched_rooms:
        results.append({
            "type": "room", "id": str(r.id), "title": r.name,
            "detail": f"{r.room_type} · Capacity {r.capacity}",
            "href": f"/dashboard/rooms/{r.id}",
            "actions": [{"label": "Open Room", "href": f"/dashboard/rooms/{r.id}"}]
        })

    # 2. Match Speakers
    matched_speakers = list((await db.execute(select(Speaker).where(
        func.lower(Speaker.first_name).like(term) | func.lower(Speaker.last_name).like(term) | func.lower(Speaker.affiliation).like(term)
    ).limit(5))).scalars().all())
    for spk in matched_speakers:
        results.append({
            "type": "speaker", "id": str(spk.id), "title": f"{spk.title or ''} {spk.first_name} {spk.last_name}".strip(),
            "detail": f"{spk.affiliation or 'Speaker'}",
            "href": "/dashboard/srr",
            "actions": [{"label": "View in SRR", "href": "/dashboard/srr"}]
        })

    # 3. Match Sessions
    matched_sessions = list((await db.execute(select(Session).where(
        func.lower(Session.name).like(term) | func.lower(Session.session_code).like(term)
    ).limit(5))).scalars().all())
    for s in matched_sessions:
        results.append({
            "type": "session", "id": str(s.id), "title": f"[{s.session_code}] {s.name}",
            "detail": f"Status: {s.status}",
            "href": "/dashboard/live",
            "actions": [{"label": "Open in Live Ops", "href": "/dashboard/live"}]
        })

    # 4. Match Devices
    matched_devices = list((await db.execute(select(RoomDevice).where(
        func.lower(RoomDevice.device_name).like(term) | func.lower(RoomDevice.hostname).like(term)
    ).limit(5))).scalars().all())
    for dev in matched_devices:
        results.append({
            "type": "device", "id": str(dev.id), "title": dev.device_name,
            "detail": f"{dev.device_type} · IP: {dev.ip_address or 'Unknown'}",
            "href": "/dashboard/devices",
            "actions": [{"label": "Inspect Device", "href": "/dashboard/devices"}]
        })

    # 5. Match Presentation Files
    matched_files = list((await db.execute(select(PresentationFile).where(
        func.lower(PresentationFile.original_filename).like(term)
    ).limit(5))).scalars().all())
    for f in matched_files:
        results.append({
            "type": "file", "id": str(f.id), "title": f.original_filename,
            "detail": f"Version {f.version_number} · {f.local_sync_status}",
            "href": "/dashboard/content",
            "actions": [{"label": "Distribution State", "href": "/dashboard/content"}]
        })

    return {"query": q, "count": len(results), "results": results}


@router.get("/performance")
async def get_performance_metrics(
    db: AsyncSession = Depends(get_database),
    _: VenueUser = Depends(require_viewer),
) -> dict:
    install = await installation(db)
    configured_path = Path(install.storage_path) if install and install.storage_path else Path.cwd()
    try:
        disk = shutil.disk_usage(configured_path)
        disk_pct = round((disk.used / max(disk.total, 1)) * 100, 2)
    except OSError:
        disk_pct = None
    transfer_counts = dict((await db.execute(
        select(VenueAssetTransfer.status, func.count(VenueAssetTransfer.id)).group_by(VenueAssetTransfer.status)
    )).all())
    command_counts = dict((await db.execute(
        select(VenueCommand.status, func.count(VenueCommand.id)).group_by(VenueCommand.status)
    )).all())
    return {
        "api_latency": {"p50": None, "p95": None, "p99": None},
        "websocket_latency": {"p50": None, "p95": None, "p99": None},
        "file_transfer_throughput_mbps": None,
        "queue_depth": int(transfer_counts.get("pending", 0)) + int(transfer_counts.get("transferring", 0)),
        "database_connections": {"active": None, "pool_size": None},
        "commands": {"queued": int(command_counts.get("queued", 0)), "failed": int(command_counts.get("failed", 0))},
        "transfers": {status: int(count) for status, count in transfer_counts.items()},
        "resources": {"cpu_pct": None, "ram_pct": None, "disk_pct": disk_pct, "network_pct": None},
        "source": "Venue Server persisted transfer/command state and local disk inspection; latency and host telemetry are not configured.",
    }


@router.get("/registration/desks")
async def get_registration_desks(
    db: AsyncSession = Depends(get_database),
    _: VenueUser = Depends(require_viewer),
) -> dict:
    devices = list((await db.execute(select(RoomDevice).where(
        RoomDevice.device_type.in_(["registration_desk", "registration_kiosk", "kiosk"]) |
        RoomDevice.device_name.ilike("%reg%") | RoomDevice.device_name.ilike("%kiosk%")
    ))).scalars().all())

    desks = []
    kiosks = []
    
    for idx, d in enumerate(devices):
        is_kiosk = "kiosk" in d.device_name.lower() or d.device_type == "registration_kiosk"
        st = observed_state(d.last_heartbeat_at, d.status)
        item = {
            "id": str(d.id),
            "name": d.device_name,
            "hostname": d.hostname,
            "ip": str(d.ip_address) if d.ip_address else None,
            "status": "online" if st == "healthy" else st,
            "printer_status": None,
            "operator": None,
            "scans": None,
            "self_checkins": None,
        }
        if is_kiosk or idx >= 10:
            kiosks.append(item)
        else:
            desks.append(item)

    return {
        "stats": {
            "total_registered": await db.scalar(select(func.count(Participant.id))),
            "checked_in": await db.scalar(select(func.count(Participant.id)).where(Participant.checked_in_at.is_not(None))),
            "badges_printed": await db.scalar(select(func.count(Badge.id)).where(Badge.status == "issued")),
            "kits_distributed": await db.scalar(select(func.count(ParticipantKit.id)).where(ParticipantKit.status == "Issued")),
        },
        "desks": desks,
        "kiosks": kiosks,
    }


@router.get("/signage/screens")
async def get_signage_screens(
    db: AsyncSession = Depends(get_database),
    _: VenueUser = Depends(require_viewer),
) -> dict:
    devices = list((await db.execute(select(RoomDevice).where(
        RoomDevice.device_type.in_(["signage_display", "signage", "eposter_display"]) |
        RoomDevice.device_name.ilike("%signage%") | RoomDevice.device_name.ilike("%screen%")
    ))).scalars().all())

    screens = []
    zones = ["Lobby Main", "Hallway A", "Hallway B", "Room Entrance", "Main Stage", "Sponsor"]
    
    for idx, d in enumerate(devices):
        st = observed_state(d.last_heartbeat_at, d.status)
        screens.append({
            "id": str(d.id),
            "screen_code": f"SCREEN-{idx+1:02d}",
            "name": d.device_name,
            "zone": zones[idx % len(zones)],
            "status": "online" if st == "healthy" else st,
            "schedule": None,
            "ip_address": str(d.ip_address) if d.ip_address else None,
            "app_version": d.app_version,
        })

    return {
        "total_screens": len(screens),
        "online_screens": len([s for s in screens if s["status"] == "online"]),
        "reconnecting_screens": len([s for s in screens if s["status"] == "reconnecting"]),
        "screens": screens,
    }


@router.get("/readiness")
async def get_venue_readiness_checklist(
    db: AsyncSession = Depends(get_database),
    _: VenueUser = Depends(require_viewer),
) -> dict:
    rooms_count = (await db.execute(select(func.count(Room.id)))).scalar() or 0
    devices_count = (await db.execute(select(func.count(RoomDevice.id)))).scalar() or 0
    files_count = (await db.execute(select(func.count(PresentationFile.id)))).scalar() or 0
    srr_count = (await db.execute(select(func.count(SRRStation.id)))).scalar() or 0
    event = await single_event(db)

    services = list((await db.execute(select(VenueServiceInstance))).scalars().all())
    files_verified = (await db.scalar(select(func.count(VenueAssetTransfer.id)).where(VenueAssetTransfer.checksum_verified.is_(True)))) or 0
    mapped_rooms = len({device.room_id for device in (await db.execute(select(RoomDevice))).scalars().all() if device.room_id})
    station_states = [observed_state(row.last_heartbeat_at, row.status) for row in (await db.execute(select(SRRStation))).scalars().all()]
    steps = [
        {"num": 1, "name": "Event Selection & Provisioning", "status": "passed" if event else "not_configured", "detail": f"{event.name} is active" if event else "No event is provisioned."},
        {"num": 2, "name": "Cloud Authentication & Certs", "status": "unknown", "detail": "No live cloud certificate or connectivity probe is recorded."},
        {"num": 3, "name": "Event Snapshot Verification", "status": "unknown", "detail": "Snapshot verification evidence is not recorded."},
        {"num": 4, "name": "Venue Network & VLAN Routing", "status": "unknown", "detail": "Network telemetry is not recorded by Venue Server."},
        {"num": 5, "name": "Local Core Services Registry", "status": "passed" if services else "not_configured", "detail": f"{len(services)} persisted services registered" if services else "No local service heartbeat records exist."},
        {"num": 6, "name": "Fleet Workstation Registration", "status": "passed" if devices_count else "not_configured", "detail": f"{devices_count} devices registered" if devices_count else "No room devices are enrolled."},
        {"num": 7, "name": "Device-to-Hall Assignments", "status": "passed" if mapped_rooms == rooms_count and rooms_count else ("degraded" if mapped_rooms else "not_configured"), "detail": f"{mapped_rooms} of {rooms_count} rooms have assigned devices"},
        {"num": 8, "name": "Scientific Asset Distribution", "status": "passed" if files_count and files_verified >= files_count else ("degraded" if files_verified else "not_configured"), "detail": f"{files_verified} verified deliveries for {files_count} current files"},
        {"num": 9, "name": "SRR Cluster Readiness", "status": "passed" if station_states and all(state == "healthy" for state in station_states) else ("degraded" if station_states else "not_configured"), "detail": f"{station_states.count('healthy')} of {srr_count} stations healthy"},
        {"num": 10, "name": "End-to-End Operational Pre-flight", "status": "unknown", "detail": "Real-device acceptance evidence has not been recorded."},
    ]
    passed_probes = sum(1 for step in steps if step["status"] == "passed")

    return {
        "status": "VENUE READY" if passed_probes == len(steps) else "NOT READY",
        "passed_probes": passed_probes,
        "total_probes": 10,
        "steps": steps,
    }


@router.post("/closure/final-sync")
async def finalize_event_closure(
    request: Request,
    db: AsyncSession = Depends(get_database),
    user: VenueUser = Depends(require_step_up),
) -> dict:
    now = utcnow()
    event = await single_event(db)
    if not event:
        raise HTTPException(status_code=409, detail="No event is provisioned for closure.")
    current_files = list((await db.execute(select(PresentationFile).where(
        PresentationFile.event_id == event.id,
        PresentationFile.is_current_version.is_(True),
    ))).scalars().all())
    current_file_ids = {file.id for file in current_files}
    transfers = list((await db.execute(select(VenueAssetTransfer).where(
        VenueAssetTransfer.file_id.in_(current_file_ids)
    ))).scalars().all()) if current_file_ids else []
    transfers_by_file: dict[uuid.UUID, list[VenueAssetTransfer]] = {}
    for transfer in transfers:
        transfers_by_file.setdefault(transfer.file_id, []).append(transfer)
    synced_files = sum(
        1 for file_id in current_file_ids
        if transfers_by_file.get(file_id)
        and all(row.status == "verified" and row.checksum_verified for row in transfers_by_file[file_id])
    )
    registration_count = (await db.scalar(select(func.count(ParticipantRegistration.id)).where(ParticipantRegistration.event_id == event.id))) or 0
    closure_verified = synced_files == len(current_file_ids) and all(
        row.status == "verified" and row.checksum_verified for row in transfers
    )
    await write_audit(
        db, user=user, request=request, category="event_closure", action="final_sync_executed",
        result="success" if closure_verified else "incomplete", object_type="event", object_id=str(event.id), reason="End-of-event final sync and closure.",
        details={"event_id": str(event.id), "current_files": len(current_file_ids), "synced_files": synced_files, "registration_count": registration_count, "closure_verified": closure_verified}
    )
    await db.commit()
    return {
        "status": "EVENT CLOSED" if closure_verified else "EVENT CLOSURE INCOMPLETE",
        "final_sync_timestamp": now.isoformat(),
        "event_id": str(event.id),
        "synced_files": synced_files,
        "total_current_files": len(current_file_ids),
        "synced_registrations": registration_count,
        "closure_verified": closure_verified,
    }
