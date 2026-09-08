import uuid
import hashlib
import os
import secrets
import sqlite3
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Cookie, Depends, File, Form, Header, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_database
from app.config import settings
from app.models.operational_control import VenueInstallation
from app.models.event import Event
from app.models.presentation_file import PresentationFile
from app.models.presentation_queue import PresentationQueue
from app.models.operational_control import VenueAssetTransfer
from app.models.room_device import RoomDevice
from app.models.session import Session
from app.models.session_speaker import SessionSpeaker
from app.models.speaker import Speaker
from app.models.srr_activity_log import SRRActivityLog
from app.models.srr_checkin import SRRCheckin
from app.models.srr_station import SRRStation
from app.models.venue_sync_job import VenueSyncJob
from app.models.venue_user import VenueUser
from app.models.venue_runtime_event import VenueRuntimeEvent
from app.runtime_events import record_runtime_event
from app.routers.auth import BEARER, decode_token, mode_allowed, require_admin, require_operator, require_viewer, resolve_srr_device_credential
from app.websocket.connection import manager

router = APIRouter(prefix="/api/v1/srr", tags=["srr"])
SUPPORTED_PRESENTATION_EXTENSIONS = {
    "ppt", "pptx", "pdf", "mp4", "webm", "png", "jpg", "jpeg", "gif",
    "txt", "doc", "docx", "xls", "xlsx", "odp",
}

ONLINE_WINDOW = timedelta(seconds=45)
VALID_STATION_STATUSES = {"idle", "occupied", "uploading", "previewing", "completed", "error", "locked"}
DELIVERY_ROOM_DEVICE_TYPES = {
    "presentation_pc", "stage_app", "stage",
    "technician_tablet", "technical_app", "technician", "technical",
}


class StationHeartbeatRequest(BaseModel):
    station_number: int
    device_name: Optional[str] = Field(default=None, max_length=100)
    hostname: Optional[str] = Field(default=None, max_length=100)
    app_version: Optional[str] = Field(default=None, max_length=30)
    ip_address: Optional[str] = None
    status: Optional[str] = "idle"
    event_id: Optional[str] = None
    last_server_sequence: Optional[int] = None


class AssignStationRequest(BaseModel):
    speaker_id: str
    session_id: Optional[str] = None
    operation_id: Optional[str] = None


class CheckinRequest(BaseModel):
    qr_code: Optional[str] = None
    speaker_id: Optional[str] = None
    event_id: Optional[str] = None
    preferred_station: Optional[int] = None
    checkin_method: Optional[str] = "qr_scan"
    operation_id: Optional[str] = None


class FinalizeFileRequest(BaseModel):
    notes: Optional[str] = None
    slides_count: Optional[int] = None
    has_video: Optional[bool] = False
    has_animation: Optional[bool] = False


class EnrollDeviceRequest(BaseModel):
    station_number: int
    device_name: Optional[str] = None
    ip_address: Optional[str] = None
    role: str = "workstation"
    event_id: Optional[str] = None
    mac_address: Optional[str] = None


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def as_uuid(value: str, label: str = "id") -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Invalid {label}") from exc


def hash_device_key(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def generate_device_key() -> str:
    return f"srrdev_{secrets.token_urlsafe(40)}"


def verify_station_device_key(station: SRRStation, device_key: str | None = None) -> None:
    """Require the enrolled station secret for station-context operations."""
    if not station.enrollment_token_hash or not device_key:
        raise HTTPException(status_code=401, detail="A valid enrolled SRR station key is required.")
    if station.enrollment_token_revoked_at:
        raise HTTPException(status_code=401, detail="Invalid or revoked SRR station key.")
    if device_key.count(".") == 2:
        try:
            payload = decode_token(device_key, "srr_device_access")
            if payload.get("sub") == str(station.id) and payload.get("event_id") == str(station.event_id):
                return
        except HTTPException:
            pass
    if settings.DEPLOYMENT_PROFILE == "local" and secrets.compare_digest(station.enrollment_token_hash, hash_device_key(device_key)):
        return
    raise HTTPException(status_code=401, detail="Invalid or revoked SRR station key.")


async def require_srr_operator_or_device(
    credentials: HTTPAuthorizationCredentials | None = Depends(BEARER),
    venue_access_token: str | None = Cookie(default=None),
    x_device_key: str | None = Header(default=None, alias="X-Device-Key"),
    db: AsyncSession = Depends(get_database),
) -> VenueUser | SRRStation:
    token = credentials.credentials if credentials and credentials.scheme.lower() == "bearer" else venue_access_token
    if token:
        payload = decode_token(token, "access")
        user = await db.get(VenueUser, as_uuid(str(payload.get("sub")), "user_id"))
        if (
            user
            and user.is_active
            and payload.get("role") == user.role
            and mode_allowed(user, str(payload.get("mode")))
            and user.role in {"operator", "admin", "super_admin"}
        ):
            return user
    if x_device_key:
        station = await resolve_srr_device_credential(
            db, x_device_key, allow_enrollment_token=settings.DEPLOYMENT_PROFILE == "local"
        )
        if station:
            return station
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Operator session or valid SRR station device key required")


async def broadcast_srr(event_name: str, payload: dict) -> None:
    try:
        event_id = payload.get("event_id")
        await manager.publish("venue_events", {"event": event_name, **payload, **({"room": f"event_{event_id}"} if event_id else {})})
    except Exception as exc:
        logger.warning(f"Failed to publish SRR WebSocket event '{event_name}': {exc}")


def assert_station_file_scope(actor: VenueUser | SRRStation | Any, file: PresentationFile) -> None:
    """Prevent an SRR workstation from reading or finalizing another station's file."""
    if not isinstance(actor, SRRStation):
        return
    if actor.event_id != file.event_id or actor.assigned_speaker_id != file.speaker_id:
        raise HTTPException(status_code=403, detail="Station is not assigned to this presentation speaker.")


def station_online(station: SRRStation, now: datetime | None = None) -> bool:
    if not station.last_heartbeat_at:
        return False
    observed = station.last_heartbeat_at
    if observed.tzinfo is None:
        observed = observed.replace(tzinfo=timezone.utc)
    return ((now or utcnow()) - observed) < ONLINE_WINDOW


def speaker_payload(speaker: Speaker | None) -> dict | None:
    if not speaker:
        return None
    return {
        "id": str(speaker.id),
        "first_name": speaker.first_name,
        "last_name": speaker.last_name,
        "full_name": speaker.full_name,
        "email": speaker.email,
        "organization": speaker.affiliation or "",
        "designation": getattr(speaker, "designation", "") or "",
    }


def file_payload(file: PresentationFile) -> dict:
    size_mb = round((file.file_size_bytes or 0) / (1024 * 1024), 2)
    return {
        "id": str(file.id),
        "original_filename": file.original_filename,
        "filename": file.original_filename,
        "stored_filename": file.stored_filename,
        "storage_path": file.storage_path,
        "local_cache_path": file.local_cache_path,
        "download_url": f"/api/v1/srr/files/{file.id}/download" if file.local_cache_path else None,
        "content_sha256": file.content_sha256,
        "delivery_status": next((entry.status for entry in file.queue_entries), None) if "queue_entries" in getattr(file, "__dict__", {}) else None,
        "sync_status": next((job.status for job in file.venue_sync_jobs), None) if "venue_sync_jobs" in getattr(file, "__dict__", {}) else file.local_sync_status,
        "file_format": (file.file_format or "").upper(),
        "file_size_bytes": file.file_size_bytes or 0,
        "file_size_mb": size_mb,
        "slides_count": None,
        "videos_count": None,
        "animations_count": None,
        "images_count": None,
        "analysis_available": False,
        "version": file.version_number,
        "upload_status": file.upload_status,
        "is_current": file.is_current_version,
        "is_locked": file.is_locked,
        "uploaded_at": iso(file.uploaded_at),
    }


def station_payload(station: SRRStation, now: datetime | None = None) -> dict:
    online = station_online(station, now)
    status = "offline" if not online and station.status != "locked" else station.status
    return {
        "id": str(station.id),
        "station_number": station.station_number,
        "device_name": station.device_name or f"Station {station.station_number}",
        "hostname": station.hostname,
        "agent_version": station.agent_version,
        "ip_address": str(station.ip_address) if station.ip_address else None,
        "status": status,
        "reported_status": station.status,
        "is_active": station.is_active,
        "is_online": online,
        "assigned_speaker_id": str(station.assigned_speaker_id) if station.assigned_speaker_id else None,
        "assigned_speaker": speaker_payload(station.assigned_speaker),
        "session_assigned_at": iso(station.session_assigned_at),
        "last_heartbeat_at": iso(station.last_heartbeat_at),
        "notes": station.notes,
    }


async def bound_event(db: AsyncSession, event_id: str | None = None) -> Event | None:
    if event_id:
        return await db.get(Event, as_uuid(event_id, "event_id"))
    return (await db.execute(select(Event).order_by(Event.created_at.asc()).limit(1))).scalar_one_or_none()


async def content_root(db: AsyncSession) -> Path:
    install = (await db.execute(select(VenueInstallation).order_by(VenueInstallation.created_at.asc()).limit(1))).scalar_one_or_none()
    root = Path((install.storage_path if install and install.storage_path else None) or Path.cwd() / "data" / "content").expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


async def store_upload_file(upload: UploadFile, root: Path, relative_path: str, max_bytes: int | None = None) -> tuple[Path, str, int]:
    target = (root / relative_path).resolve()
    if not str(target).startswith(str(root)):
        raise HTTPException(status_code=400, detail="Invalid storage path")
    target.parent.mkdir(parents=True, exist_ok=True)
    temp_target = target.with_name(f".{target.name}.{uuid.uuid4().hex}.tmp")
    digest = hashlib.sha256()
    size = 0
    try:
        with temp_target.open("wb") as handle:
            while True:
                chunk = await upload.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if max_bytes is not None and size > max_bytes:
                    raise HTTPException(status_code=413, detail=f"Presentation exceeds the {max_bytes // (1024 * 1024)} MB Venue Server limit.")
                digest.update(chunk)
                handle.write(chunk)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_target, target)
    except Exception:
        if temp_target.exists():
            temp_target.unlink()
        raise
    finally:
        await upload.close()
    return target, digest.hexdigest(), size


async def find_station(db: AsyncSession, station_id: str) -> SRRStation | None:
    try:
        return await db.get(SRRStation, uuid.UUID(station_id))
    except Exception:
        pass
    if station_id.isdigit():
        return (await db.execute(select(SRRStation).where(SRRStation.station_number == int(station_id)))).scalar_one_or_none()
    return None


async def find_speaker(db: AsyncSession, req: CheckinRequest) -> Speaker | None:
    event_uuid = as_uuid(req.event_id, "event_id") if req.event_id else None
    filters = []
    if req.speaker_id:
        filters.append(Speaker.id == as_uuid(req.speaker_id, "speaker_id"))
    if req.qr_code:
        term = req.qr_code.strip()
        try:
            filters.append(Speaker.id == uuid.UUID(term))
        except Exception:
            pass
        like = f"%{term}%"
        filters.append(or_(Speaker.email.ilike(like), Speaker.first_name.ilike(like), Speaker.last_name.ilike(like), Speaker.upload_token == term, Speaker.qr_code_url == term))
    if not filters:
        return None
    stmt = select(Speaker).where(or_(*filters)).limit(1)
    if event_uuid:
        stmt = stmt.where(Speaker.event_id == event_uuid)
    return (await db.execute(stmt)).scalar_one_or_none()


async def add_log(
    db: AsyncSession,
    *,
    event_id: uuid.UUID,
    action: str,
    station_id: uuid.UUID | None = None,
    speaker_id: uuid.UUID | None = None,
    file_id: uuid.UUID | None = None,
    details: dict | None = None,
) -> None:
    db.add(
        SRRActivityLog(
            event_id=event_id,
            station_id=station_id,
            speaker_id=speaker_id,
            file_id=file_id,
            action=action,
            details=details or {},
            occurred_at=utcnow(),
        )
    )


async def ensure_delivery_records(db: AsyncSession, pf: PresentationFile) -> tuple[PresentationQueue | None, VenueSyncJob]:
    slot = await db.get(SessionSpeaker, pf.session_speaker_id)
    queue_entry = None
    if slot:
        queue_entry = (
            await db.execute(
                select(PresentationQueue).where(
                    PresentationQueue.session_speaker_id == slot.id,
                    PresentationQueue.file_id == pf.id,
                    PresentationQueue.status != "skipped",
                )
            )
        ).scalar_one_or_none()
        if not queue_entry:
            max_order = (
                await db.execute(
                    select(PresentationQueue)
                    .where(PresentationQueue.session_id == slot.session_id)
                    .order_by(PresentationQueue.queue_order.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()
            queue_entry = PresentationQueue(
                id=uuid.uuid4(),
                session_id=slot.session_id,
                session_speaker_id=slot.id,
                file_id=pf.id,
                queue_order=(max_order.queue_order + 1) if max_order else 0,
                status="queued",
                notes="Queued from SRR finalize",
            )
            db.add(queue_entry)
        elif queue_entry.status not in {"active", "completed"}:
            queue_entry.status = "queued"
            queue_entry.notes = "Re-queued from SRR finalize"

    sync_job = (
        await db.execute(
            select(VenueSyncJob).where(
                VenueSyncJob.file_id == pf.id,
                VenueSyncJob.sync_type == "upload",
                VenueSyncJob.status.in_(["pending", "in_progress"]),
            )
        )
    ).scalar_one_or_none()
    if not sync_job:
        sync_job = VenueSyncJob(id=uuid.uuid4(), event_id=pf.event_id, file_id=pf.id, sync_type="upload", priority=1, status="pending")
        db.add(sync_job)

    return queue_entry, sync_job


async def create_asset_transfer_intents(db: AsyncSession, pf: PresentationFile, session_id: uuid.UUID | None = None) -> None:
    """Create one pending transfer ledger row per SRR station and room device."""
    target_rows: list[tuple[str, str, uuid.UUID | None, str | None]] = []
    stations = list((await db.execute(
        select(SRRStation).where(SRRStation.event_id == pf.event_id, SRRStation.is_active.is_(True))
    )).scalars().all())
    target_rows.extend((f"SRR-{station.station_number:02d}", "srr_station", station.id, None) for station in stations)
    if session_id:
        session = await db.get(Session, session_id)
        devices = list((await db.execute(
            select(RoomDevice).where(
                RoomDevice.event_id == pf.event_id,
                RoomDevice.room_id == session.room_id,
                RoomDevice.enrollment_token_hash.is_not(None),
                RoomDevice.enrollment_token_revoked_at.is_(None),
            )
        )).scalars().all()) if session else []
        devices = [
            device for device in devices
            if device.enrollment_token_hash
            and device.enrollment_token_revoked_at is None
            and (device.device_type or "").strip().lower() in DELIVERY_ROOM_DEVICE_TYPES
        ]
        target_rows.extend((device.device_name, device.device_type, device.id, f"http://{device.ip_address}" if device.ip_address else None) for device in devices)
    existing = {
        (row.target_node, row.target_type, row.target_id) for row in (await db.execute(select(VenueAssetTransfer).where(
            VenueAssetTransfer.file_id == pf.id,
            VenueAssetTransfer.version_number == pf.version_number,
        ))).scalars().all()
    }
    for target_node, target_type, target_id, target_url in target_rows:
        if (target_node, target_type, target_id) not in existing:
            db.add(VenueAssetTransfer(
                id=uuid.uuid4(), file_id=pf.id, filename=pf.original_filename,
                version_number=pf.version_number, source_node="venue_server",
                target_node=target_node, target_id=target_id, target_url=target_url, target_type=target_type, priority="normal",
                progress_pct=0, status="pending", checksum_verified=False,
                source_acknowledged_at=utcnow(),
                idempotency_key=f"delivery:{pf.id}:{pf.version_number}:{target_id or target_node}",
            ))


@router.get("/stations")
async def list_srr_stations(db: AsyncSession = Depends(get_database), _: Any = Depends(require_viewer)):
    rows = (
        await db.execute(
            select(SRRStation)
            .options(selectinload(SRRStation.assigned_speaker))
            .order_by(SRRStation.station_number.asc())
        )
    ).scalars().all()
    now = utcnow()
    return [station_payload(row, now) for row in rows]


@router.get("/stations/{station_id}/context")
async def station_context(
    station_id: str,
    x_device_key: str | None = Header(default=None, alias="X-Device-Key"),
    db: AsyncSession = Depends(get_database),
):
    station = await find_station(db, station_id)
    if not station:
        raise HTTPException(status_code=404, detail="Station is not configured on this Venue Server.")
    verify_station_device_key(station, x_device_key)
    await db.refresh(station, attribute_names=["assigned_speaker"])
    event = await db.get(Event, station.event_id)
    sessions = await get_speaker_sessions_helper(db, station.assigned_speaker_id) if station.assigned_speaker_id else []
    latest_sequence = await db.scalar(select(VenueRuntimeEvent.sequence).where(VenueRuntimeEvent.event_id == station.event_id).order_by(VenueRuntimeEvent.sequence.desc()).limit(1))
    return {
        "state": "assigned" if station.assigned_speaker_id else ("locked" if station.status == "locked" else "idle"),
        "station": station_payload(station),
        "event": {"id": str(event.id), "name": event.name, "short_code": event.short_code} if event else None,
        "speaker": speaker_payload(station.assigned_speaker),
        "sessions": sessions,
        "server_sequence": int(latest_sequence or 0),
        "server_time": iso(utcnow()),
    }


@router.post("/stations/heartbeat")
async def station_heartbeat(
    req: StationHeartbeatRequest,
    x_device_key: str | None = Header(default=None, alias="X-Device-Key"),
    db: AsyncSession = Depends(get_database),
):
    status = req.status if req.status in VALID_STATION_STATUSES else "error"
    # Resolve the station from its enrolled secret first. Station numbers are
    # only unique inside an event and must never select another event's node.
    if not isinstance(x_device_key, str) or not x_device_key:
        raise HTTPException(status_code=401, detail="A valid enrolled SRR station key is required.")
    station = await resolve_srr_device_credential(
        db, x_device_key, allow_enrollment_token=settings.DEPLOYMENT_PROFILE == "local"
    )
    now = utcnow()
    if station:
        verify_station_device_key(station, x_device_key)
        if station.station_number != req.station_number:
            raise HTTPException(status_code=403, detail="Station number does not match the enrolled device.")
        if req.event_id and str(station.event_id) != str(req.event_id):
            raise HTTPException(status_code=403, detail="Station is outside the requested event scope.")
        station.last_heartbeat_at = now
        station.device_name = req.device_name or station.device_name
        station.hostname = req.hostname or station.hostname
        station.agent_version = req.app_version or station.agent_version
        station.ip_address = req.ip_address or station.ip_address
        if station.status != "locked":
            station.status = status
        if req.last_server_sequence is not None:
            station.last_server_sequence = req.last_server_sequence
    else:
        raise HTTPException(status_code=404, detail="SRR station is not configured. Enroll this device from the admin console before sending heartbeats.")
    await db.commit()
    await db.refresh(station)
    latest_sequence = await db.scalar(select(VenueRuntimeEvent.sequence).where(VenueRuntimeEvent.event_id == station.event_id).order_by(VenueRuntimeEvent.sequence.desc()).limit(1))
    await broadcast_srr("srr:station_heartbeat", {"event_id": str(station.event_id), "station_id": str(station.id), "station_number": station.station_number, "status": station.status, "last_heartbeat_at": iso(station.last_heartbeat_at)})
    return {"status": "ok", "station_id": str(station.id), "station_number": station.station_number, "server_sequence": int(latest_sequence or 0)}


@router.post("/stations/{station_id}/assign")
async def assign_speaker_to_station(station_id: str, req: AssignStationRequest, db: AsyncSession = Depends(get_database), _: Any = Depends(require_operator)):
    if isinstance(db, AsyncSession):
        try:
            station_uuid = uuid.UUID(station_id)
            station = (await db.execute(select(SRRStation).where(SRRStation.id == station_uuid).with_for_update())).scalar_one_or_none()
        except ValueError:
            station = await find_station(db, station_id)
    else:
        station = await find_station(db, station_id)
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    if req.operation_id:
        previous = (await db.execute(select(SRRCheckin).where(SRRCheckin.operation_id == req.operation_id))).scalar_one_or_none()
        if previous:
            if previous.station_id != station.id or previous.speaker_id != as_uuid(req.speaker_id, "speaker_id"):
                raise HTTPException(status_code=409, detail="Assignment operation ID belongs to another station or speaker.")
            return {"status": "success", "duplicate": True, "station_id": str(station.id), "station_number": station.station_number, "speaker_id": str(previous.speaker_id), "message": "Assignment operation was already applied."}
    if station.status == "locked":
        raise HTTPException(status_code=409, detail="Station is locked")
    requested_speaker_id = as_uuid(req.speaker_id, "speaker_id")
    if station.assigned_speaker_id and station.assigned_speaker_id != requested_speaker_id:
        raise HTTPException(status_code=409, detail="Station is already assigned to another speaker.")
    if not station.is_active or station.status not in {"idle", "completed"}:
        raise HTTPException(status_code=409, detail="Station is not idle and healthy for assignment.")
    if not station_online(station):
        raise HTTPException(status_code=409, detail="Station has not sent a recent heartbeat and cannot be assigned.")
    speaker = await db.get(Speaker, requested_speaker_id)
    if not speaker:
        raise HTTPException(status_code=404, detail="Speaker not found")
    if speaker.event_id != station.event_id:
        raise HTTPException(status_code=403, detail="Speaker is outside the station event scope.")
    station.assigned_speaker_id = speaker.id
    station.status = "occupied"
    station.session_assigned_at = utcnow()
    speaker.checked_in_at = utcnow()
    if req.operation_id:
        db.add(SRRCheckin(event_id=station.event_id, speaker_id=speaker.id, station_id=station.id, checkin_method="manual", checked_in_at=station.session_assigned_at, operation_id=req.operation_id))
    await add_log(db, event_id=station.event_id, station_id=station.id, speaker_id=speaker.id, action="assign", details={"station_number": station.station_number, "session_id": req.session_id})
    record_runtime_event(db, event_id=station.event_id, event_type="srr.speaker_assigned", entity_type="srr_station", entity_id=str(station.id), payload={"station_number": station.station_number, "speaker_id": str(speaker.id), "speaker_name": speaker.full_name, "session_id": req.session_id})
    await db.commit()
    await broadcast_srr("srr:speaker_assigned", {"event_id": str(station.event_id), "station_id": str(station.id), "station_number": station.station_number, "speaker_id": str(speaker.id), "speaker_name": speaker.full_name})
    return {"status": "success", "message": f"Assigned {speaker.full_name} to Station #{station.station_number}"}


@router.post("/stations/{station_id}/reset")
async def reset_station(station_id: str, db: AsyncSession = Depends(get_database), _: Any = Depends(require_operator)):
    station = await find_station(db, station_id)
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    prev_speaker_id = station.assigned_speaker_id
    station.assigned_speaker_id = None
    station.status = "idle"
    station.session_assigned_at = None
    await add_log(db, event_id=station.event_id, station_id=station.id, speaker_id=prev_speaker_id, action="reset", details={"station_number": station.station_number})
    record_runtime_event(db, event_id=station.event_id, event_type="srr.station_released", entity_type="srr_station", entity_id=str(station.id), payload={"station_number": station.station_number, "previous_speaker_id": str(prev_speaker_id) if prev_speaker_id else None})
    await db.commit()
    await broadcast_srr("srr:station_reset", {"event_id": str(station.event_id), "station_id": str(station.id), "station_number": station.station_number})
    return {"status": "success", "message": f"Station #{station.station_number} reset to idle"}


@router.post("/stations/{station_id}/lock")
async def lock_station(station_id: str, db: AsyncSession = Depends(get_database), _: Any = Depends(require_operator)):
    station = await find_station(db, station_id)
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    station.status = "locked"
    await add_log(db, event_id=station.event_id, station_id=station.id, action="lock", details={"station_number": station.station_number})
    record_runtime_event(db, event_id=station.event_id, event_type="srr.station_locked", entity_type="srr_station", entity_id=str(station.id), payload={"station_number": station.station_number, "locked": True})
    await db.commit()
    await broadcast_srr("srr:station_locked", {"event_id": str(station.event_id), "station_id": str(station.id), "station_number": station.station_number, "locked": True})
    return {"status": "success", "message": f"Station #{station.station_number} locked"}


@router.post("/stations/{station_id}/unlock")
async def unlock_station(station_id: str, db: AsyncSession = Depends(get_database), _: Any = Depends(require_operator)):
    station = await find_station(db, station_id)
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    station.status = "idle"
    await add_log(db, event_id=station.event_id, station_id=station.id, action="unlock", details={"station_number": station.station_number})
    record_runtime_event(db, event_id=station.event_id, event_type="srr.station_locked", entity_type="srr_station", entity_id=str(station.id), payload={"station_number": station.station_number, "locked": False})
    await db.commit()
    await broadcast_srr("srr:station_locked", {"event_id": str(station.event_id), "station_id": str(station.id), "station_number": station.station_number, "locked": False})
    return {"status": "success", "message": f"Station #{station.station_number} unlocked"}


@router.post("/checkin")
async def srr_speaker_checkin(req: CheckinRequest, db: AsyncSession = Depends(get_database), actor: VenueUser | SRRStation = Depends(require_srr_operator_or_device)):
    if isinstance(actor, SRRStation) and actor.device_role not in {"checkin_node", "checkin", "master", "srr_checkin", "srr_master"}:
        raise HTTPException(status_code=403, detail="Only an enrolled SRR check-in node or master may assign speakers.")
    if req.operation_id:
        previous = (await db.execute(select(SRRCheckin).where(SRRCheckin.operation_id == req.operation_id))).scalar_one_or_none()
        if previous:
            actor_event_id = actor.event_id if isinstance(actor, SRRStation) else None
            requested_event_id = as_uuid(req.event_id, "event_id") if req.event_id else actor_event_id
            if requested_event_id and previous.event_id != requested_event_id:
                raise HTTPException(status_code=403, detail="Operation is outside the requested event scope.")
            station = await db.get(SRRStation, previous.station_id) if previous.station_id else None
            speaker = await db.get(Speaker, previous.speaker_id)
            return {"status": "success", "duplicate": True, "station_number": station.station_number if station else None, "station_id": str(previous.station_id) if previous.station_id else None, "speaker": speaker_payload(speaker)}
    speaker = await find_speaker(db, req)
    if not speaker:
        raise HTTPException(status_code=404, detail="Speaker not found for this venue event.")
    if isinstance(actor, SRRStation) and actor.event_id != speaker.event_id:
        raise HTTPException(status_code=403, detail="Station is outside the speaker event scope.")
    now = utcnow()
    stmt = select(SRRStation).where(SRRStation.event_id == speaker.event_id, SRRStation.is_active.is_(True), SRRStation.status.in_(["idle", "completed"])).order_by(SRRStation.station_number.asc()).with_for_update(skip_locked=True)
    target_station = None
    if req.preferred_station:
        preferred = (await db.execute(stmt.where(SRRStation.station_number == req.preferred_station))).scalar_one_or_none()
        target_station = preferred if preferred and station_online(preferred, now) else None
    if not target_station:
        target_station = next((station for station in (await db.execute(stmt)).scalars().all() if station_online(station, now)), None)
    if not target_station:
        raise HTTPException(status_code=409, detail="All SRR workstations are busy, offline, or locked.")
    target_station.assigned_speaker_id = speaker.id
    target_station.status = "occupied"
    target_station.session_assigned_at = now
    speaker.checked_in_at = now
    db.add(SRRCheckin(event_id=target_station.event_id, speaker_id=speaker.id, station_id=target_station.id, checkin_method=req.checkin_method or "qr_scan", checked_in_at=now, operation_id=req.operation_id))
    record_runtime_event(db, event_id=target_station.event_id, event_type="srr.speaker_assigned", entity_type="srr_station", entity_id=str(target_station.id), payload={"station_number": target_station.station_number, "speaker_id": str(speaker.id), "speaker_name": speaker.full_name, "operation_id": req.operation_id})
    await add_log(db, event_id=target_station.event_id, station_id=target_station.id, speaker_id=speaker.id, action="checkin", details={"station_number": target_station.station_number, "method": req.checkin_method, "speaker_name": speaker.full_name})
    await db.commit()
    sessions_data = await get_speaker_sessions_helper(db, speaker.id)
    await broadcast_srr("srr:speaker_assigned", {"event_id": str(target_station.event_id), "station_id": str(target_station.id), "station_number": target_station.station_number, "speaker_id": str(speaker.id), "speaker_name": speaker.full_name, "sessions_count": len(sessions_data)})
    return {"status": "success", "station_number": target_station.station_number, "station_id": str(target_station.id), "speaker": speaker_payload(speaker), "sessions": sessions_data, "message": f"Welcome {speaker.full_name}. Please proceed to Workstation #{target_station.station_number}."}


@router.get("/speakers/search")
async def search_speakers(q: str = Query(min_length=1), event_id: str | None = None, limit: int = Query(default=20, le=50), db: AsyncSession = Depends(get_database), _: Any = Depends(require_operator)):
    like = f"%{q.strip()}%"
    event = await bound_event(db, event_id)
    if not event:
        return []
    rows = (
        await db.execute(
            select(Speaker)
            .where(Speaker.event_id == event.id, or_(Speaker.first_name.ilike(like), Speaker.last_name.ilike(like), Speaker.email.ilike(like), Speaker.affiliation.ilike(like)))
            .order_by(Speaker.last_name.asc(), Speaker.first_name.asc())
            .limit(limit)
        )
    ).scalars().all()
    return [{"speaker": speaker_payload(row), "sessions": await get_speaker_sessions_helper(db, row.id)} for row in rows]


async def get_speaker_sessions_helper(db: AsyncSession, speaker_id: uuid.UUID | None) -> List[Dict[str, Any]]:
    if not speaker_id:
        return []
    rows = (
        await db.execute(
            select(SessionSpeaker)
            .options(
                selectinload(SessionSpeaker.session).selectinload(Session.room),
                selectinload(SessionSpeaker.presentation_files).selectinload(PresentationFile.queue_entries),
                selectinload(SessionSpeaker.presentation_files).selectinload(PresentationFile.venue_sync_jobs),
            )
            .where(SessionSpeaker.speaker_id == speaker_id)
            .order_by(SessionSpeaker.talk_order.asc())
        )
    ).scalars().all()
    now = utcnow()
    sessions_out = []
    for ss in rows:
        sess = ss.session
        files = [file_payload(pf) for pf in ss.presentation_files if pf.is_current_version]
        starts_in = None
        if sess and sess.start_time:
            start = sess.start_time if sess.start_time.tzinfo else sess.start_time.replace(tzinfo=timezone.utc)
            starts_in = int((start - now).total_seconds() / 60)
        sessions_out.append({
            "session_id": str(sess.id) if sess else str(ss.session_id),
            "session_speaker_id": str(ss.id),
            "title": ss.presentation_title or (sess.name if sess else "Untitled session"),
            "room_name": sess.room.name if sess and sess.room else "Unassigned room",
            "start_time": sess.start_time.strftime("%I:%M %p") if sess and sess.start_time else None,
            "end_time": sess.end_time.strftime("%I:%M %p") if sess and sess.end_time else None,
            "starts_in_minutes": starts_in,
            "status": "ready" if files else "not_uploaded",
            "presentations": files,
        })
    return sessions_out


@router.get("/speakers/{speaker_id}/sessions")
async def get_speaker_sessions(speaker_id: str, db: AsyncSession = Depends(get_database), _: Any = Depends(require_operator)):
    return {"speaker_id": speaker_id, "sessions": await get_speaker_sessions_helper(db, as_uuid(speaker_id, "speaker_id"))}


@router.post("/files/upload")
async def upload_presentation_file(
    speaker_id: str = Form(...),
    session_speaker_id: str = Form(...),
    filename: str = Form(...),
    file_size_bytes: int = Form(...),
    expected_version: int | None = Form(default=None),
    operation_id: str = Form(default=""),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_database),
    actor: VenueUser | SRRStation = Depends(require_srr_operator_or_device),
):
    speaker_uuid = as_uuid(speaker_id, "speaker_id")
    session_speaker_uuid = as_uuid(session_speaker_id, "session_speaker_id")
    speaker = await db.get(Speaker, speaker_uuid)
    if not speaker:
        raise HTTPException(status_code=404, detail="Speaker not found")
    if isinstance(actor, SRRStation):
        if actor.event_id != speaker.event_id or actor.assigned_speaker_id != speaker_uuid:
            raise HTTPException(status_code=403, detail="Station is not assigned to this speaker.")
    if not isinstance(operation_id, str):
        operation_id = ""
    if operation_id.strip():
        operation_id = operation_id.strip()
        previous_upload = (await db.execute(select(PresentationFile).where(PresentationFile.upload_idempotency_key == operation_id))).scalar_one_or_none()
        if previous_upload:
            if previous_upload.speaker_id != speaker_uuid or previous_upload.session_speaker_id != session_speaker_uuid:
                raise HTTPException(status_code=409, detail="Upload operation ID belongs to another presentation.")
            return {"status": "success", "duplicate": True, "idempotent": True, "file": file_payload(previous_upload), "file_id": str(previous_upload.id), "version": previous_upload.version_number, "message": "Upload operation was already applied."}
    # Lock the authority row in a real transaction so concurrent uploads
    # cannot allocate the same next version. Keep direct service-level calls
    # compatible with the lightweight test doubles used by the router suite.
    if isinstance(db, AsyncSession):
        ss = (await db.execute(
            select(SessionSpeaker).where(SessionSpeaker.id == session_speaker_uuid).with_for_update()
        )).scalar_one_or_none()
    else:
        ss = await db.get(SessionSpeaker, session_speaker_uuid)
    if not ss or ss.speaker_id != speaker_uuid:
        raise HTTPException(status_code=404, detail="Session assignment not found for this speaker")
    # The speaker and the session assignment must belong to the same event.
    # Without this guard, a malformed request could persist a presentation
    # whose denormalized event link points at one event while its room/session
    # routing points at another.
    if isinstance(db, AsyncSession):
        session_event_id = await db.scalar(select(Session.event_id).where(Session.id == ss.session_id))
        if session_event_id != speaker.event_id:
            raise HTTPException(status_code=409, detail="Speaker and session assignment belong to different events.")
    session_room_id = await db.scalar(select(Session.room_id).where(Session.id == ss.session_id))
    if not session_room_id:
        raise HTTPException(status_code=409, detail="Session is not assigned to a room; presentation routing cannot be finalized.")
    existing_files = (
        await db.execute(
            select(PresentationFile)
            .where(PresentationFile.session_speaker_id == session_speaker_uuid)
            .order_by(PresentationFile.version_number.desc())
        )
    ).scalars().all()
    current_version = existing_files[0].version_number if existing_files else 0
    if not isinstance(expected_version, int):
        expected_version = None
    if expected_version is not None and expected_version != current_version:
        raise HTTPException(status_code=409, detail=f"Presentation version changed on Venue Server; expected v{expected_version}, current v{current_version}.")
    for existing in existing_files:
        if existing.is_locked:
            raise HTTPException(status_code=409, detail="Current presentation file is locked")
    version = (existing_files[0].version_number + 1) if existing_files else 1
    submitted_name = file.filename if file.filename else filename
    ext = submitted_name.rsplit(".", 1)[-1].lower() if "." in submitted_name else "pptx"
    if ext not in SUPPORTED_PRESENTATION_EXTENSIONS:
        raise HTTPException(status_code=415, detail=f"Presentation format '.{ext}' is not supported by the Venue Server.")
    if file_size_bytes < 1 or file_size_bytes > settings.VENUE_MAX_PRESENTATION_BYTES:
        raise HTTPException(status_code=413, detail=f"Presentation must be between 1 byte and {settings.VENUE_MAX_PRESENTATION_BYTES // (1024 * 1024)} MB.")
    stored_name = f"{uuid.uuid4()}.{ext}"
    relative_path = f"presentations/{speaker.event_id}/{speaker_uuid}/{stored_name}"
    target, checksum, stored_size = await store_upload_file(file, await content_root(db), relative_path, settings.VENUE_MAX_PRESENTATION_BYTES)
    if stored_size != file_size_bytes:
        target.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Declared file size ({file_size_bytes}) does not match uploaded content ({stored_size}).")
    duplicate = next(
        (existing for existing in existing_files if existing.content_sha256 and existing.content_sha256.lower() == checksum.lower() and existing.file_size_bytes == stored_size),
        None,
    )
    if duplicate:
        try:
            target.unlink(missing_ok=True)
        except OSError:
            logger.warning(f"Unable to remove duplicate staged upload {target}")
        return {"status": "success", "duplicate": True, "file": file_payload(duplicate), "file_id": str(duplicate.id), "version": duplicate.version_number, "message": f"{submitted_name} is already stored as v{duplicate.version_number}"}
    for existing in existing_files:
        existing.is_current_version = False
    new_file = PresentationFile(
        id=uuid.uuid4(),
        speaker_id=speaker_uuid,
        session_speaker_id=session_speaker_uuid,
        session_id=ss.session_id,
        room_id=session_room_id,
        event_id=speaker.event_id,
        original_filename=submitted_name,
        stored_filename=stored_name,
        storage_path=relative_path,
        content_sha256=checksum,
        file_size_bytes=stored_size,
        mime_type=file.content_type or "application/octet-stream",
        file_format=ext,
        upload_source="station" if isinstance(actor, SRRStation) else "api",
        source_node=(
            actor.device_name
            if isinstance(actor, SRRStation)
            else (f"operator:{actor.id}" if isinstance(actor, VenueUser) else None)
        ),
        upload_idempotency_key=operation_id.strip() or None,
        version_number=version,
        is_current_version=True,
        upload_status="valid",
        local_cache_path=str(target),
        local_sync_status="synced",
        local_synced_at=utcnow(),
    )
    db.add(new_file)
    record_runtime_event(db, event_id=speaker.event_id, event_type="presentation.file_uploaded", entity_type="presentation_file", entity_id=str(new_file.id), session_id=ss.session_id, payload={"file_id": str(new_file.id), "session_speaker_id": str(ss.id), "version": version, "sha256": checksum, "size_bytes": stored_size, "filename": submitted_name})
    await add_log(db, event_id=speaker.event_id, speaker_id=speaker_uuid, file_id=new_file.id, action="upload", details={"filename": submitted_name, "version": version, "size_bytes": file_size_bytes})
    await db.commit()
    await db.refresh(new_file)
    await broadcast_srr("srr:file_updated", {"event_id": str(new_file.event_id), "file_id": str(new_file.id), "filename": new_file.original_filename, "speaker_id": str(speaker_uuid), "session_speaker_id": session_speaker_id, "version": version})
    return {"status": "success", "file": file_payload(new_file), "file_id": str(new_file.id), "version": version, "message": f"Uploaded {submitted_name} (v{version})"}


@router.post("/files/{file_id}/finalize")
async def finalize_presentation(file_id: str, req: FinalizeFileRequest, db: AsyncSession = Depends(get_database), actor: VenueUser | SRRStation = Depends(require_srr_operator_or_device)):
    pf = await db.get(PresentationFile, as_uuid(file_id, "file_id"))
    if not pf:
        raise HTTPException(status_code=404, detail="Presentation file not found")
    assert_station_file_scope(actor, pf)
    if pf.is_locked:
        raise HTTPException(status_code=409, detail="Presentation file is locked")
    if not pf.local_cache_path or not Path(pf.local_cache_path).exists():
        raise HTTPException(status_code=409, detail="Presentation binary is missing from local Venue Server storage.")
    pf.upload_status = "approved"
    pf.approved_at = utcnow()
    queue_entry, sync_job = await ensure_delivery_records(db, pf)
    await create_asset_transfer_intents(db, pf, queue_entry.session_id if queue_entry else None)
    record_runtime_event(db, event_id=pf.event_id, event_type="presentation.file_finalized", entity_type="presentation_file", entity_id=str(pf.id), session_id=queue_entry.session_id if queue_entry else None, payload={"file_id": str(pf.id), "version": pf.version_number, "sha256": pf.content_sha256, "filename": pf.original_filename})
    station = (await db.execute(select(SRRStation).where(SRRStation.event_id == pf.event_id, SRRStation.assigned_speaker_id == pf.speaker_id))).scalar_one_or_none()
    if station:
        station.status = "completed"
        station.assigned_speaker_id = None
    await add_log(
        db,
        event_id=pf.event_id,
        speaker_id=pf.speaker_id,
        file_id=pf.id,
        station_id=station.id if station else None,
        action="finalize",
        details={
            "filename": pf.original_filename,
            "notes": req.notes,
            "slides_count": req.slides_count,
            "queue_entry_id": str(queue_entry.id) if queue_entry else None,
            "sync_job_id": str(sync_job.id),
        },
    )
    await db.commit()
    await broadcast_srr(
        "srr:file_finalized",
        {
            "event_id": str(pf.event_id),
            "file_id": str(pf.id),
            "filename": pf.original_filename,
            "speaker_id": str(pf.speaker_id),
            "session_speaker_id": str(pf.session_speaker_id),
            "queue_entry_id": str(queue_entry.id) if queue_entry else None,
            "sync_job_id": str(sync_job.id),
        },
    )
    return {
        "status": "success",
        "file_id": str(pf.id),
        "queue_entry_id": str(queue_entry.id) if queue_entry else None,
        "sync_job_id": str(sync_job.id),
        "message": "Presentation finalized and queued for venue distribution.",
    }


@router.get("/files/{file_id}/download")
async def download_file(file_id: str, db: AsyncSession = Depends(get_database), actor: VenueUser | SRRStation = Depends(require_srr_operator_or_device)):
    pf = await db.get(PresentationFile, as_uuid(file_id, "file_id"))
    if not pf:
        raise HTTPException(status_code=404, detail="Presentation file not found")
    assert_station_file_scope(actor, pf)
    if not pf.local_cache_path:
        raise HTTPException(status_code=404, detail="Presentation file is not cached on this Venue Server.")
    path = Path(pf.local_cache_path).expanduser().resolve()
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Presentation file is missing from local storage.")
    return FileResponse(path, filename=pf.original_filename, media_type=pf.mime_type or "application/octet-stream", headers={"X-File-Id": str(pf.id), "X-File-Version": str(pf.version_number), "X-File-Sha256": pf.content_sha256 or ""})


@router.post("/files/{file_id}/lock")
async def lock_file(file_id: str, db: AsyncSession = Depends(get_database), _: Any = Depends(require_operator)):
    pf = await db.get(PresentationFile, as_uuid(file_id, "file_id"))
    if not pf:
        raise HTTPException(status_code=404, detail="Presentation file not found")
    pf.is_locked = True
    await add_log(db, event_id=pf.event_id, speaker_id=pf.speaker_id, file_id=pf.id, action="lock_file", details={"filename": pf.original_filename})
    await db.commit()
    return {"status": "success", "file_id": str(pf.id), "locked": True}


@router.post("/files/{file_id}/unlock")
async def unlock_file(file_id: str, db: AsyncSession = Depends(get_database), _: Any = Depends(require_operator)):
    pf = await db.get(PresentationFile, as_uuid(file_id, "file_id"))
    if not pf:
        raise HTTPException(status_code=404, detail="Presentation file not found")
    pf.is_locked = False
    await add_log(db, event_id=pf.event_id, speaker_id=pf.speaker_id, file_id=pf.id, action="unlock_file", details={"filename": pf.original_filename})
    await db.commit()
    return {"status": "success", "file_id": str(pf.id), "locked": False}


@router.get("/files")
async def list_all_srr_files(room_id: Optional[str] = None, upload_status: Optional[str] = None, db: AsyncSession = Depends(get_database), _: Any = Depends(require_viewer)):
    stmt = (
        select(PresentationFile)
        .options(
            selectinload(PresentationFile.speaker),
            selectinload(PresentationFile.session_speaker).selectinload(SessionSpeaker.session),
            selectinload(PresentationFile.queue_entries),
            selectinload(PresentationFile.venue_sync_jobs),
        )
        .order_by(PresentationFile.uploaded_at.desc())
    )
    if upload_status:
        stmt = stmt.where(PresentationFile.upload_status == upload_status)
    files = (await db.execute(stmt)).scalars().all()
    out = []
    for file in files:
        session = file.session_speaker.session if file.session_speaker else None
        if room_id and (not session or str(session.room_id) != room_id):
            continue
        item = file_payload(file)
        item.update({
            "speaker_name": file.speaker.full_name if file.speaker else None,
            "speaker_id": str(file.speaker_id),
            "session_title": file.session_speaker.presentation_title if file.session_speaker and file.session_speaker.presentation_title else (session.name if session else None),
        })
        out.append(item)
    return out


@router.get("/activity-logs")
async def list_srr_activity_logs(limit: int = Query(default=50, le=250), db: AsyncSession = Depends(get_database), _: Any = Depends(require_viewer)):
    logs = (
        await db.execute(
            select(SRRActivityLog)
            .options(selectinload(SRRActivityLog.station), selectinload(SRRActivityLog.speaker), selectinload(SRRActivityLog.file))
            .order_by(SRRActivityLog.occurred_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    return [{
        "id": str(log.id),
        "action": log.action,
        "station_number": log.station.station_number if log.station else None,
        "speaker_name": log.speaker.full_name if log.speaker else None,
        "filename": log.file.original_filename if log.file else None,
        "details": log.details,
        "occurred_at": iso(log.occurred_at),
    } for log in logs]


@router.get("/devices")
async def list_devices(db: AsyncSession = Depends(get_database), _: Any = Depends(require_viewer)):
    stations = (await db.execute(select(SRRStation).options(selectinload(SRRStation.assigned_speaker)).order_by(SRRStation.station_number.asc()))).scalars().all()
    now = utcnow()
    return {
        "devices": [
            {
                "id": str(station.id),
                "device_name": station.device_name or f"Station {station.station_number}",
                "station_number": station.station_number,
                "role": station.device_role or "workstation",
                "ip_address": str(station.ip_address) if station.ip_address else None,
                "mac_address": station.mac_address,
                "status": station_payload(station, now)["status"],
                "is_online": station_online(station, now),
                "is_active": station.is_active,
                "last_heartbeat_at": iso(station.last_heartbeat_at),
                "enrollment_token_prefix": station.enrollment_token_prefix,
                "enrollment_revoked_at": iso(station.enrollment_token_revoked_at),
                "assigned_speaker": speaker_payload(station.assigned_speaker),
            }
            for station in stations
        ],
        "discovered": [],
    }


@router.post("/devices/enroll")
async def enroll_device(req: EnrollDeviceRequest, db: AsyncSession = Depends(get_database), _: Any = Depends(require_admin)):
    event = await bound_event(db, req.event_id)
    if not event:
        raise HTTPException(status_code=400, detail="SRR device enrollment is not configured because no event is bound.")
    station = (await db.execute(select(SRRStation).where(
        SRRStation.event_id == event.id,
        SRRStation.station_number == req.station_number,
    ))).scalar_one_or_none()
    if not station:
        station = SRRStation(id=uuid.uuid4(), event_id=event.id, station_number=req.station_number, device_name=req.device_name or f"SRR-WS-{req.station_number:02d}", device_role=req.role, mac_address=req.mac_address, ip_address=req.ip_address, status="idle", is_active=True)
        db.add(station)
    else:
        station.device_name = req.device_name or station.device_name
        station.device_role = req.role or station.device_role
        station.mac_address = req.mac_address or station.mac_address
        station.ip_address = req.ip_address or station.ip_address
        station.is_active = True
        station.enrollment_token_revoked_at = None
        if station.status == "locked":
            station.status = "idle"
    token = generate_device_key()
    station.enrollment_token_hash = hash_device_key(token)
    station.enrollment_token_prefix = token[:14]
    await add_log(db, event_id=event.id, station_id=station.id, action="enroll", details={"station_number": station.station_number, "role": req.role, "token_prefix": token[:14]})
    await db.commit()
    await db.refresh(station)
    # A station may be enrolled after presentations were finalized. Backfill
    # current authoritative versions so its first manifest is actionable.
    current_files = list((await db.execute(select(PresentationFile).where(
        PresentationFile.event_id == event.id,
        PresentationFile.is_current_version.is_(True),
    ))).scalars().all())
    for presentation_file in current_files:
        await create_asset_transfer_intents(db, presentation_file, presentation_file.session_id)
    if current_files:
        await db.commit()
    return {"status": "success", "device": station_payload(station), "enrollment_token": token, "token_prefix": token[:14], "secret_returned_once": True}


@router.post("/devices/{device_id}/revoke")
async def revoke_device(device_id: str, db: AsyncSession = Depends(get_database), _: Any = Depends(require_admin)):
    station = await find_station(db, device_id)
    if not station:
        raise HTTPException(status_code=404, detail="Device not found")
    station.is_active = False
    station.status = "locked"
    station.enrollment_token_revoked_at = utcnow()
    await add_log(db, event_id=station.event_id, station_id=station.id, action="revoke", details={"station_number": station.station_number})
    await db.commit()
    return {"status": "success", "device_id": str(station.id), "revoked": True}


def json_dumps(payload: dict) -> str:
    return __import__("json").dumps(payload, sort_keys=True, separators=(",", ":"))


def build_srr_replica(
    *,
    event: Event,
    stations: list[SRRStation],
    speakers: list[Speaker],
    sessions: list[SessionSpeaker],
    files: list[PresentationFile],
    target_path: Path,
) -> None:
    if target_path.exists():
        target_path.unlink()
    conn = sqlite3.connect(target_path)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(
            """
            CREATE TABLE replica_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE rooms (id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE sessions (id TEXT PRIMARY KEY, room_id TEXT, data TEXT NOT NULL);
            CREATE TABLE session_speakers (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, speaker_id TEXT NOT NULL, data TEXT NOT NULL);
            CREATE TABLE speakers (id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE presentation_files (id TEXT PRIMARY KEY, session_speaker_id TEXT NOT NULL, version_number INTEGER NOT NULL, checksum TEXT, local_path TEXT, status TEXT NOT NULL, data TEXT NOT NULL);
            CREATE TABLE srr_stations (id TEXT PRIMARY KEY, station_number INTEGER NOT NULL UNIQUE, status TEXT NOT NULL, data TEXT NOT NULL);
            CREATE TABLE srr_speakers (id TEXT PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE srr_sessions (id TEXT PRIMARY KEY, speaker_id TEXT NOT NULL, data TEXT NOT NULL);
            CREATE TABLE srr_files (id TEXT PRIMARY KEY, speaker_id TEXT NOT NULL, session_speaker_id TEXT NOT NULL, data TEXT NOT NULL);
            CREATE TABLE delivery_acknowledgements (transfer_id TEXT PRIMARY KEY, file_id TEXT NOT NULL, version_number INTEGER NOT NULL, checksum TEXT NOT NULL, acknowledged_at TEXT, status TEXT NOT NULL, error TEXT);
            CREATE INDEX ix_replica_delivery_file_version ON delivery_acknowledgements(file_id, version_number, status);
            CREATE TABLE incoming_server_events (sequence INTEGER PRIMARY KEY, event_id TEXT NOT NULL, event_type TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, received_at TEXT NOT NULL);
            CREATE INDEX ix_replica_incoming_events_event ON incoming_server_events(event_id, sequence);
            CREATE TABLE replica_conflicts (id TEXT PRIMARY KEY, operation_id TEXT, entity_id TEXT, reason TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL);
            CREATE INDEX ix_replica_conflicts_operation ON replica_conflicts(operation_id, created_at);
            CREATE TABLE node_outbox (operation_id TEXT PRIMARY KEY, action TEXT NOT NULL, payload TEXT NOT NULL, occurred_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', server_error TEXT);
            PRAGMA user_version = 4;
            CREATE INDEX ix_srr_sessions_speaker_id ON srr_sessions(speaker_id);
            CREATE INDEX ix_srr_files_speaker_id ON srr_files(speaker_id);
            CREATE INDEX ix_srr_files_session_speaker_id ON srr_files(session_speaker_id);
            """
        )
        with conn:
            conn.executemany(
                "INSERT INTO replica_meta(key,value) VALUES(?,?)",
                [
                    ("replica_type", "srr_preview"),
                    ("schema_version", "4"),
                    ("local_schema_version", "4"),
                    ("event_id", str(event.id)),
                    ("event_name", event.name),
                    ("generated_at", utcnow().isoformat()),
                ],
            )
            for station in stations:
                conn.execute("INSERT INTO srr_stations(id,station_number,status,data) VALUES(?,?,?,?)", (str(station.id), station.station_number, station.status or "idle", json_dumps(station_payload(station))))
            room_rows = {str(slot.session.room.id): slot.session.room for slot in sessions if slot.session and slot.session.room}
            for room in room_rows.values():
                conn.execute("INSERT INTO rooms(id,data) VALUES(?,?)", (str(room.id), json_dumps({"id": str(room.id), "name": room.name, "room_type": room.room_type, "capacity": room.capacity, "is_active": room.is_active})))
            session_rows = {str(slot.session.id): slot.session for slot in sessions if slot.session}
            for session in session_rows.values():
                conn.execute("INSERT INTO sessions(id,room_id,data) VALUES(?,?,?)", (str(session.id), str(session.room_id) if session.room_id else None, json_dumps({"id": str(session.id), "room_id": str(session.room_id) if session.room_id else None, "session_code": session.session_code, "name": session.name, "session_type": session.session_type, "status": session.status, "start_time": iso(session.start_time), "end_time": iso(session.end_time)})))
            for speaker in speakers:
                payload = speaker_payload(speaker) or {}
                payload["event_id"] = str(speaker.event_id)
                conn.execute("INSERT INTO speakers(id,data) VALUES(?,?)", (str(speaker.id), json_dumps(payload)))
                conn.execute("INSERT INTO srr_speakers(id,data) VALUES(?,?)", (str(speaker.id), json_dumps(payload)))
            for slot in sessions:
                sess = slot.session
                payload = {
                    "session_speaker_id": str(slot.id),
                    "session_id": str(slot.session_id),
                    "speaker_id": str(slot.speaker_id),
                    "title": slot.presentation_title or (sess.name if sess else "Untitled session"),
                    "room_name": sess.room.name if sess and sess.room else "Unassigned room",
                    "start_time": iso(sess.start_time) if sess else None,
                    "end_time": iso(sess.end_time) if sess else None,
                    "talk_order": slot.talk_order,
                }
                conn.execute("INSERT INTO session_speakers(id,session_id,speaker_id,data) VALUES(?,?,?,?)", (str(slot.id), str(slot.session_id), str(slot.speaker_id), json_dumps(payload)))
                conn.execute("INSERT INTO srr_sessions(id,speaker_id,data) VALUES(?,?,?)", (str(slot.id), str(slot.speaker_id), json_dumps(payload)))
            for file in files:
                file_data = file_payload(file)
                conn.execute("INSERT INTO presentation_files(id,session_speaker_id,version_number,checksum,local_path,status,data) VALUES(?,?,?,?,?,?,?)", (str(file.id), str(file.session_speaker_id), file.version_number, file.content_sha256, None, file.local_sync_status or "pending", json_dumps(file_data)))
                conn.execute(
                    "INSERT INTO srr_files(id,speaker_id,session_speaker_id,data) VALUES(?,?,?,?)",
                    (str(file.id), str(file.speaker_id), str(file.session_speaker_id), json_dumps(file_payload(file))),
                )
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    finally:
        conn.close()


@router.get("/replica.sqlite")
async def download_srr_replica(
    db: AsyncSession = Depends(get_database),
    actor: VenueUser | SRRStation = Depends(require_srr_operator_or_device),
):
    event = await bound_event(db, str(actor.event_id) if isinstance(actor, SRRStation) else None)
    if not event:
        raise HTTPException(status_code=404, detail="SRR replica cannot be generated because no event is bound.")
    stations = (
        await db.execute(
            select(SRRStation)
            .options(selectinload(SRRStation.assigned_speaker))
            .where(SRRStation.event_id == event.id)
            .order_by(SRRStation.station_number.asc())
        )
    ).scalars().all()
    speakers = (
        await db.execute(select(Speaker).where(Speaker.event_id == event.id).order_by(Speaker.last_name.asc(), Speaker.first_name.asc()))
    ).scalars().all()
    speaker_ids = [speaker.id for speaker in speakers]
    session_rows = (
        await db.execute(
            select(SessionSpeaker)
            .options(selectinload(SessionSpeaker.session).selectinload(Session.room))
            .where(SessionSpeaker.speaker_id.in_(speaker_ids or [uuid.uuid4()]))
            .order_by(SessionSpeaker.talk_order.asc())
        )
    ).scalars().all()
    files = (
        await db.execute(
            select(PresentationFile)
            .where(PresentationFile.event_id == event.id, PresentationFile.is_current_version.is_(True))
            .order_by(PresentationFile.uploaded_at.desc())
        )
    ).scalars().all()
    temp_dir = Path(tempfile.mkdtemp(prefix="eventos-srr-replica-"))
    target = temp_dir / f"srr-replica-{event.short_code or event.id}.sqlite"
    build_srr_replica(event=event, stations=list(stations), speakers=list(speakers), sessions=list(session_rows), files=list(files), target_path=target)
    replica_checksum = hashlib.sha256(target.read_bytes()).hexdigest()
    return FileResponse(
        target,
        filename=target.name,
        media_type="application/vnd.sqlite3",
        headers={"X-Replica-Sha256": replica_checksum, "X-Replica-Event-Id": str(event.id)},
    )
