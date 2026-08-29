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
)
from app.models.presentation_file import PresentationFile
from app.models.registration_source_key import RegistrationSourceHeartbeat
from app.models.room import Room
from app.models.room_device import RoomDevice
from app.models.session import Session
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
