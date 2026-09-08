"""Runtime contract for the room Stage and Technical applications.

The room clients are deliberately thin: Venue Server owns the schedule,
current file, queue state, commands, and playback evidence. A room client
never invents a session or presentation when the server has no evidence.
"""

import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_database
from app.models.operational_control import VenueAssetTransfer, VenueAuditEvent, VenueCommand
from app.models.playback_event import PlaybackEvent
from app.models.presentation_file import PresentationFile
from app.models.presentation_queue import PresentationQueue
from app.models.room import Room
from app.models.room_device import RoomDevice
from app.models.room_runtime_state import RoomRuntimeState
from app.models.session import Session
from app.models.session_speaker import SessionSpeaker
from app.models.speaker import Speaker
from app.models.venue_runtime_event import VenueRuntimeEvent
from app.routers.auth import DeviceAuth
from app.runtime_events import record_runtime_event


router = APIRouter(prefix="/api/v1/venue/rooms", tags=["room-runtime"])


class DeviceHeartbeat(BaseModel):
    status: str = Field(default="online", max_length=30)
    app_version: Optional[str] = Field(default=None, max_length=80)
    hostname: Optional[str] = Field(default=None, max_length=100)
    ip_address: Optional[str] = Field(default=None, max_length=80)
    last_server_sequence: Optional[int] = Field(default=None, ge=0)


class RoomCommand(BaseModel):
    command: str = Field(max_length=80)
    device_id: Optional[uuid.UUID] = None
    payload: dict[str, Any] = Field(default_factory=dict)
    reason: str = Field(default="Room application command", max_length=500)
    idempotency_key: Optional[str] = Field(default=None, max_length=160)


class CommandAcknowledgement(BaseModel):
    status: str = Field(pattern="^(acknowledged|executed|failed)$")
    error_message: Optional[str] = Field(default=None, max_length=2000)
    result: dict[str, Any] = Field(default_factory=dict)


class PlaybackEventRequest(BaseModel):
    event_type: str = Field(max_length=50)
    slide_number: Optional[int] = None
    details: dict[str, Any] = Field(default_factory=dict)


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _file_payload(file: PresentationFile | None, delivery: VenueAssetTransfer | None = None) -> dict[str, Any] | None:
    if not file:
        return None
    return {
        "id": str(file.id),
        "filename": file.original_filename,
        "format": file.file_format,
        "mime_type": file.mime_type,
        "version": file.version_number,
        "checksum": file.content_sha256,
        "size_bytes": file.file_size_bytes,
        "status": file.upload_status,
        "local_sync_status": file.local_sync_status,
        "delivery_status": delivery.status if delivery else "not_configured",
        "delivery_id": str(delivery.id) if delivery else None,
        "delivery_target_node": delivery.target_node if delivery else None,
        "delivery_target_type": delivery.target_type if delivery else None,
        "download_url": f"/api/v1/venue/rooms/files/{file.id}/download",
    }


async def _room_or_404(db: AsyncSession, room_id: uuid.UUID) -> Room:
    room = await db.get(Room, room_id)
    if not room or not room.is_active:
        raise HTTPException(status_code=404, detail="Room is not configured or active.")
    return room


async def _assert_room_device(db: AsyncSession, room_id: uuid.UUID, device_id: uuid.UUID | None, room_event_id: uuid.UUID | None = None) -> RoomDevice | None:
    if not device_id:
        return None
    device = await db.get(RoomDevice, device_id)
    if not device or device.room_id != room_id or (room_event_id and device.event_id != room_event_id) or device.enrollment_token_revoked_at:
        raise HTTPException(status_code=403, detail="Device credential is not assigned to this room.")
    return device


STAGE_COMMANDS = {"launch_presentation", "pause", "stop", "reload", "show_timer", "hide_timer", "start_timer", "pause_timer", "reset_timer", "emergency_message"}
TECHNICAL_COMMANDS = STAGE_COMMANDS | {"prepare_now", "switch_session", "emergency_message"}


def _allowed_commands_for_device(device: RoomDevice | None) -> set[str]:
    if not device:
        # Local administrator/bootstrap requests have no enrolled device role.
        return TECHNICAL_COMMANDS
    role = (device.device_type or "").strip().lower()
    if role in {"presentation_pc", "stage_app", "stage"}:
        return STAGE_COMMANDS
    if role in {"technician_tablet", "technical_app", "technician", "technical"}:
        return TECHNICAL_COMMANDS
    return set()


async def _runtime_state(db: AsyncSession, room: Room, *, create: bool = True) -> RoomRuntimeState:
    state = await db.scalar(
        select(RoomRuntimeState).where(
            RoomRuntimeState.event_id == room.event_id,
            RoomRuntimeState.room_id == room.id,
        )
    )
    if state is None and create:
        state = RoomRuntimeState(event_id=room.event_id, room_id=room.id)
        db.add(state)
        await db.flush()
    return state or RoomRuntimeState(event_id=room.event_id, room_id=room.id)


def _timer_payload(state: RoomRuntimeState, now: datetime) -> dict[str, Any]:
    remaining = state.timer_remaining_seconds
    if state.timer_status == "running" and state.timer_started_at and remaining is not None:
        remaining = max(0, remaining - int((now - state.timer_started_at).total_seconds()))
    effective_status = "expired" if state.timer_status == "running" and remaining == 0 else state.timer_status
    return {
        "status": effective_status,
        "visible": effective_status != "hidden",
        "running": effective_status == "running",
        "duration_seconds": state.timer_duration_seconds,
        "remaining_seconds": remaining,
        "updated_at": _iso(state.updated_at),
    }


@router.get("/{room_id}/commands")
async def get_room_device_commands(
    room_id: uuid.UUID,
    device_id: uuid.UUID | None = Header(default=None, alias="X-Venue-Device-Id"),
    _: bool = Depends(DeviceAuth),
    db: AsyncSession = Depends(get_database),
) -> dict[str, Any]:
    """Return durable commands addressed to this enrolled room device.

    Commands remain visible while acknowledged/executing so a reconnecting
    device can recover the last server state. Only queued commands transition
    to ``delivered`` here; execution is confirmed through the acknowledgement
    endpoint.
    """
    room = await _room_or_404(db, room_id)
    if not device_id:
        raise HTTPException(status_code=401, detail="A room device identity is required to retrieve commands.")
    device = await _assert_room_device(db, room_id, device_id, room.event_id)
    if not device:
        raise HTTPException(status_code=403, detail="Device credential is not assigned to this room.")
    now = datetime.now(timezone.utc)
    rows = list((await db.execute(
        select(VenueCommand)
        .where(
            VenueCommand.room_id == room_id,
            VenueCommand.status.in_(["queued", "delivered", "acknowledged"]),
        )
        .order_by(VenueCommand.created_at.asc())
        .limit(100)
    )).scalars().all())
    commands: list[dict[str, Any]] = []
    changed = False
    for command in rows:
        if command.expires_at and command.expires_at < now:
            command.status = "expired"
            command.error_message = "Command expired before device delivery."
            changed = True
            continue
        target_device_id = (command.payload or {}).get("device_id")
        if target_device_id and target_device_id != str(device.id):
            continue
        if command.status == "queued":
            command.status = "delivered"
            changed = True
            record_runtime_event(
                db,
                event_id=command.event_id,
                room_id=room_id,
                session_id=command.session_id,
                event_type="room.command_delivered",
                entity_type="venue_command",
                entity_id=str(command.id),
                payload={"device_id": str(device.id), "command": command.command},
            )
        commands.append({
            "id": str(command.id),
            "command": command.command,
            "payload": command.payload or {},
            "status": command.status,
            "reason": command.reason,
            "created_at": _iso(command.created_at),
            "expires_at": _iso(command.expires_at),
            "acknowledged_at": _iso(command.acknowledged_at),
            "completed_at": _iso(command.completed_at),
            "error_message": command.error_message,
            "result": command.result or {},
        })
    if changed:
        await db.commit()
    return {"room_id": str(room_id), "device_id": str(device.id), "commands": commands}


@router.get("/{room_id}/runtime")
async def get_room_runtime(room_id: uuid.UUID, device_id: uuid.UUID | None = Header(default=None, alias="X-Venue-Device-Id"), _: bool = Depends(DeviceAuth), db: AsyncSession = Depends(get_database)) -> dict[str, Any]:
    room = await _room_or_404(db, room_id)
    await _assert_room_device(db, room_id, device_id, room.event_id)
    now = datetime.now(timezone.utc)
    runtime_state = await _runtime_state(db, room, create=False)
    sessions = list((await db.execute(
        select(Session).where(Session.room_id == room.id).order_by(Session.start_time.asc())
    )).scalars().all())
    session_ids = [session.id for session in sessions]
    queue_rows = list((await db.execute(
        select(PresentationQueue, PresentationFile, SessionSpeaker, Speaker)
        .join(PresentationFile, PresentationFile.id == PresentationQueue.file_id)
        .join(SessionSpeaker, SessionSpeaker.id == PresentationQueue.session_speaker_id)
        .join(Speaker, Speaker.id == SessionSpeaker.speaker_id)
        .where(
            PresentationQueue.session_id.in_(session_ids),
            PresentationFile.is_current_version.is_(True),
            PresentationFile.event_id == room.event_id,
            PresentationFile.session_id == PresentationQueue.session_id,
            PresentationFile.room_id == room.id,
        )
        .order_by(PresentationQueue.session_id, PresentationQueue.queue_order)
    )).all()) if session_ids else []
    devices = list((await db.execute(select(RoomDevice).where(RoomDevice.room_id == room.id))).scalars().all())
    file_ids = [file.id for _, file, _, _ in queue_rows]
    transfers = list((await db.execute(select(VenueAssetTransfer).where(VenueAssetTransfer.file_id.in_(file_ids)))).scalars().all()) if file_ids else []
    target_device = next((device for device in devices if device.id == device_id), None) if device_id else None
    transfer_by_file = {row.file_id: row for row in transfers if target_device and (row.target_id == target_device.id or row.target_node == target_device.device_name)}
    # A technical session switch is authoritative and may intentionally move
    # execution outside the planned clock window. Only fall back to the clock
    # when no session has been explicitly activated.
    active = next((item for item in sessions if item.status == "in_progress"), None)
    active = active or next((item for item in sessions if item.start_time <= now <= item.end_time), None)
    upcoming = next((item for item in sessions if item.id != (active.id if active else None) and item.start_time > now), None)
    latest_sequence = await db.scalar(select(VenueRuntimeEvent.sequence).where(VenueRuntimeEvent.event_id == room.event_id).order_by(VenueRuntimeEvent.sequence.desc()).limit(1))

    def session_payload(session: Session) -> dict[str, Any]:
        return {
            "id": str(session.id), "code": session.session_code, "title": session.name,
            "type": session.session_type, "status": session.status,
            "start": _iso(session.start_time), "end": _iso(session.end_time),
            "is_active": session.id == active.id if active else False,
        }

    queue = [{
        "id": str(entry.id), "session_id": str(entry.session_id),
        "session": session_payload(next(s for s in sessions if s.id == entry.session_id)),
        "speaker": {"id": str(speaker.id), "name": speaker.full_name, "affiliation": speaker.affiliation},
        "status": entry.status, "queue_order": entry.queue_order,
        "file": _file_payload(file, transfer_by_file.get(file.id)),
    } for entry, file, _, speaker in queue_rows]
    return {
        "room": {"id": str(room.id), "name": room.name, "type": room.room_type},
        "server_time": now.isoformat(),
        "server_sequence": int(latest_sequence or 0),
        "current_session": session_payload(active) if active else None,
        "next_session": session_payload(upcoming) if upcoming else None,
        "timer": _timer_payload(runtime_state, now),
        "emergency_message": runtime_state.emergency_message,
        "sessions": [session_payload(session) for session in sessions],
        "queue": queue,
        "devices": [{
            "id": str(device.id), "name": device.device_name, "type": device.device_type,
            "status": device.status, "app_version": device.app_version,
            "last_heartbeat_at": _iso(device.last_heartbeat_at),
        } for device in devices],
    }


@router.post("/{room_id}/devices/{device_id}/heartbeat")
async def room_device_heartbeat(room_id: uuid.UUID, device_id: uuid.UUID, payload: DeviceHeartbeat, authenticated_device_id: uuid.UUID | None = Header(default=None, alias="X-Venue-Device-Id"), _: bool = Depends(DeviceAuth), db: AsyncSession = Depends(get_database)) -> dict[str, Any]:
    if authenticated_device_id and authenticated_device_id != device_id:
        raise HTTPException(status_code=403, detail="Device credential does not match heartbeat target.")
    room = await _room_or_404(db, room_id)
    device = await db.get(RoomDevice, device_id)
    if not device or device.room_id != room_id or device.event_id != room.event_id:
        raise HTTPException(status_code=404, detail="Room device is not assigned to this room.")
    device.status = payload.status if payload.status in {"online", "offline", "error", "maintenance"} else "error"
    device.app_version = payload.app_version or device.app_version
    device.hostname = payload.hostname or device.hostname
    device.ip_address = payload.ip_address or device.ip_address
    if payload.last_server_sequence is not None:
        device.last_server_sequence = payload.last_server_sequence
    device.last_heartbeat_at = datetime.now(timezone.utc)
    record_runtime_event(db, event_id=device.event_id, room_id=device.room_id, event_type="room.device_heartbeat", entity_type="room_device", entity_id=str(device.id), payload={"status": device.status, "app_version": device.app_version})
    await db.commit()
    return {"accepted": True, "device_id": str(device.id), "last_heartbeat_at": _iso(device.last_heartbeat_at), "last_server_sequence": device.last_server_sequence}


@router.post("/{room_id}/commands")
async def create_room_command(room_id: uuid.UUID, payload: RoomCommand, authenticated_device_id: uuid.UUID | None = Header(default=None, alias="X-Venue-Device-Id"), _: bool = Depends(DeviceAuth), db: AsyncSession = Depends(get_database)) -> dict[str, Any]:
    room = await _room_or_404(db, room_id)
    source_device = await _assert_room_device(db, room_id, authenticated_device_id, room.event_id)
    source_role = (source_device.device_type or "").strip().lower() if source_device else ""
    source_is_technical = source_role in {"technician_tablet", "technical_app", "technician", "technical"}
    if authenticated_device_id and payload.device_id and authenticated_device_id != payload.device_id and not source_is_technical:
        raise HTTPException(status_code=403, detail="Only an enrolled Technical App may target another room device.")
    allowed = {"prepare_now", "launch_presentation", "pause", "stop", "reload", "switch_session", "show_timer", "hide_timer", "start_timer", "pause_timer", "reset_timer", "emergency_message"}
    if payload.command not in allowed:
        raise HTTPException(status_code=422, detail=f"Unsupported room command '{payload.command}'.")
    if payload.command not in _allowed_commands_for_device(source_device):
        raise HTTPException(status_code=403, detail="This room device role cannot issue that command.")
    if payload.device_id:
        device = await db.get(RoomDevice, payload.device_id)
        if not device or device.room_id != room_id:
            raise HTTPException(status_code=404, detail="Target device is not assigned to this room.")
        if payload.command not in _allowed_commands_for_device(device):
            raise HTTPException(status_code=403, detail="The target room device role cannot execute that command.")
    if payload.idempotency_key:
        existing = (await db.execute(select(VenueCommand).where(VenueCommand.idempotency_key == payload.idempotency_key))).scalar_one_or_none()
        if existing:
            if existing.event_id != room.event_id or existing.room_id != room_id:
                raise HTTPException(status_code=409, detail="Idempotency key belongs to another room or event.")
            return {"accepted": True, "command_id": str(existing.id), "status": existing.status, "duplicate": True}
    command_status = "queued"
    command_result: dict[str, Any] = {}
    command_session_id: uuid.UUID | None = None
    if payload.command == "switch_session" and payload.payload.get("queue_entry_id"):
        try:
            queue_entry_id = uuid.UUID(str(payload.payload["queue_entry_id"]))
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=422, detail="switch_session requires a valid queue_entry_id.") from exc
        queue_entry = await db.get(PresentationQueue, queue_entry_id)
        if not queue_entry:
            raise HTTPException(status_code=404, detail="Presentation queue entry not found.")
        target_session = await db.get(Session, queue_entry.session_id)
        if not target_session or target_session.room_id != room_id or target_session.event_id != room.event_id:
            raise HTTPException(status_code=403, detail="The requested session is outside this room and event.")
        room_sessions = list((await db.execute(select(Session).where(Session.room_id == room_id))).scalars().all())
        now = datetime.now(timezone.utc)
        for session in room_sessions:
            if session.id == target_session.id:
                session.status = "in_progress"
                session.updated_at = now
            elif session.status == "in_progress":
                session.status = "completed"
                session.updated_at = now
        command_session_id = target_session.id
        command_status = "executed"
        command_result = {"session_id": str(target_session.id), "queue_entry_id": str(queue_entry.id), "source": "venue_server"}
        record_runtime_event(
            db,
            event_id=room.event_id,
            room_id=room_id,
            session_id=target_session.id,
            event_type="session.switched",
            entity_type="session",
            entity_id=str(target_session.id),
            payload={"queue_entry_id": str(queue_entry.id), "source": "technical_app"},
        )
    runtime_state = await _runtime_state(db, room)
    now = datetime.now(timezone.utc)
    if payload.command == "start_timer":
        duration = payload.payload.get("duration_seconds", runtime_state.timer_duration_seconds or 1200)
        try:
            duration = int(duration)
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=422, detail="start_timer requires a positive duration_seconds value.") from exc
        if duration <= 0 or duration > 24 * 60 * 60:
            raise HTTPException(status_code=422, detail="Timer duration must be between 1 second and 24 hours.")
        runtime_state.timer_duration_seconds = duration
        runtime_state.timer_remaining_seconds = duration
        runtime_state.timer_started_at = now
        runtime_state.timer_status = "running"
    elif payload.command == "pause_timer":
        current = _timer_payload(runtime_state, now)
        runtime_state.timer_remaining_seconds = current["remaining_seconds"]
        runtime_state.timer_started_at = None
        runtime_state.timer_status = "paused" if current["remaining_seconds"] is not None else "hidden"
    elif payload.command == "reset_timer":
        runtime_state.timer_remaining_seconds = 0
        runtime_state.timer_started_at = None
        runtime_state.timer_status = "hidden"
    elif payload.command == "show_timer":
        if runtime_state.timer_remaining_seconds is None:
            runtime_state.timer_remaining_seconds = runtime_state.timer_duration_seconds or 0
        runtime_state.timer_status = "paused"
    elif payload.command == "hide_timer":
        runtime_state.timer_status = "hidden"
    elif payload.command == "emergency_message":
        message = str(payload.payload.get("message") or "").strip()
        runtime_state.emergency_message = message or None
    if command_status == "executed":
        command_result = {**command_result, "timer": _timer_payload(runtime_state, now), "emergency_message": runtime_state.emergency_message}
    command = VenueCommand(target_type="room", target_id=str(room_id), event_id=room.event_id, room_id=room_id, session_id=command_session_id, command=payload.command, payload={**payload.payload, "device_id": str(payload.device_id) if payload.device_id else None}, requested_by=None, reason=payload.reason, status=command_status, result=command_result, expires_at=datetime.now(timezone.utc) + timedelta(minutes=5), idempotency_key=payload.idempotency_key)
    db.add(command)
    record_runtime_event(
        db,
        event_id=room.event_id,
        room_id=room_id,
        session_id=command_session_id,
        event_type="room.command_executed" if command_status == "executed" else "room.command_queued",
        entity_type="venue_command",
        entity_id=str(command.id),
        payload={"command": payload.command, "device_id": str(payload.device_id) if payload.device_id else None, "result": command_result},
    )
    await db.commit()
    await db.refresh(command)
    db.add(VenueAuditEvent(category="room_runtime", action="command_requested", object_type="venue_command", object_id=str(command.id), result=command.status, reason=payload.reason, correlation_id=str(command.id), details={"room_id": str(room_id), "command": payload.command, "device_id": str(payload.device_id) if payload.device_id else None, "result": command_result}))
    await db.commit()
    return {"accepted": True, "command_id": str(command.id), "status": command.status}


@router.post("/{room_id}/commands/{command_id}/acknowledge")
async def acknowledge_room_command(
    room_id: uuid.UUID,
    command_id: uuid.UUID,
    payload: CommandAcknowledgement,
    authenticated_device_id: uuid.UUID | None = Header(default=None, alias="X-Venue-Device-Id"),
    _: bool = Depends(DeviceAuth),
    db: AsyncSession = Depends(get_database),
) -> dict[str, Any]:
    await _room_or_404(db, room_id)
    if not authenticated_device_id:
        raise HTTPException(status_code=401, detail="A room device identity is required to acknowledge a command.")
    command = await db.get(VenueCommand, command_id)
    if not command or command.room_id != room_id:
        raise HTTPException(status_code=404, detail="Room command not found.")
    target_device = (command.payload or {}).get("device_id")
    if target_device and target_device != str(authenticated_device_id):
        raise HTTPException(status_code=403, detail="Device is not the command target.")
    now = datetime.now(timezone.utc)
    if (
        command.status == payload.status
        and command.error_message == payload.error_message
        and (command.result or {}) == (payload.result or {})
    ):
        return {"accepted": True, "command_id": str(command.id), "status": command.status, "error_message": command.error_message, "duplicate": True}
    if command.status in {"executed", "failed", "expired"}:
        raise HTTPException(status_code=409, detail="Command is already in a terminal state.")
    if command.expires_at and command.expires_at < now and payload.status != "failed":
        command.status = "expired"
        command.error_message = "Command acknowledgement arrived after expiry."
        await db.commit()
        raise HTTPException(status_code=409, detail="Command has expired.")
    command.status = payload.status
    command.error_message = payload.error_message
    command.result = payload.result
    if payload.status == "acknowledged":
        command.acknowledged_at = command.acknowledged_at or now
    if payload.status in {"executed", "failed"}:
        command.completed_at = command.completed_at or now
    db.add(VenueAuditEvent(category="room_runtime", action="command_acknowledged", object_type="venue_command", object_id=str(command.id), result=payload.status, reason=payload.error_message, correlation_id=str(command.id), details={"room_id": str(room_id), "device_id": str(authenticated_device_id), "result": payload.result}))
    record_runtime_event(db, event_id=command.event_id, room_id=room_id, session_id=command.session_id, event_type="room.command_acknowledged", entity_type="venue_command", entity_id=str(command.id), payload={"status": payload.status, "error_message": payload.error_message, "result": payload.result})
    await db.commit()
    return {"accepted": True, "command_id": str(command.id), "status": command.status, "error_message": command.error_message}


@router.post("/{room_id}/queue/{entry_id}/events")
async def record_playback_event(room_id: uuid.UUID, entry_id: uuid.UUID, payload: PlaybackEventRequest, device_id: uuid.UUID, authenticated_device_id: uuid.UUID | None = Header(default=None, alias="X-Venue-Device-Id"), _: bool = Depends(DeviceAuth), db: AsyncSession = Depends(get_database)) -> dict[str, Any]:
    await _room_or_404(db, room_id)
    if authenticated_device_id and authenticated_device_id != device_id:
        raise HTTPException(status_code=403, detail="Playback target does not match device credential.")
    entry = await db.get(PresentationQueue, entry_id)
    device = await db.get(RoomDevice, device_id)
    room = await _room_or_404(db, room_id)
    if not entry or not device or device.room_id != room_id or device.event_id != room.event_id:
        raise HTTPException(status_code=404, detail="Queue entry or room device not found.")
    if payload.event_type == "presentation_start":
        entry.status, entry.started_at = "active", datetime.now(timezone.utc)
    elif payload.event_type == "presentation_end":
        entry.status, entry.ended_at = "completed", datetime.now(timezone.utc)
    db.add(PlaybackEvent(queue_entry_id=entry.id, device_id=device.id, event_type=payload.event_type, slide_number=payload.slide_number, details=payload.details))
    record_runtime_event(db, event_id=device.event_id, room_id=room_id, event_type=f"room.playback.{payload.event_type}", entity_type="presentation_queue", entity_id=str(entry.id), payload={"device_id": str(device.id), "slide_number": payload.slide_number, "details": payload.details})
    await db.commit()
    return {"accepted": True, "entry_id": str(entry.id), "status": entry.status}


@router.get("/files/{file_id}/download")
async def download_room_file(file_id: uuid.UUID, device_id: uuid.UUID | None = Header(default=None, alias="X-Venue-Device-Id"), _: bool = Depends(DeviceAuth), db: AsyncSession = Depends(get_database)) -> FileResponse:
    file = await db.get(PresentationFile, file_id)
    if not file or not file.local_cache_path:
        raise HTTPException(status_code=404, detail="Presentation file is not available on Venue Server.")
    if not device_id:
        raise HTTPException(status_code=401, detail="A room device identity is required to download a presentation.")
    device = await db.get(RoomDevice, device_id)
    if not device or device.event_id != file.event_id:
        raise HTTPException(status_code=403, detail="Device is outside the presentation event scope.")
    delivery = (await db.execute(select(VenueAssetTransfer).where(
        VenueAssetTransfer.file_id == file.id,
        VenueAssetTransfer.version_number == file.version_number,
        VenueAssetTransfer.target_id == device.id,
        VenueAssetTransfer.target_type == device.device_type,
        VenueAssetTransfer.status.in_(["pending", "transferring", "received", "verified"]),
    ).limit(1))).scalar_one_or_none()
    if not delivery:
        raise HTTPException(status_code=403, detail="This device is not an authorized presentation target.")
    path = Path(file.local_cache_path).expanduser().resolve()
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Presentation binary is missing from Venue Server storage.")
    return FileResponse(path, filename=file.original_filename, media_type=file.mime_type or "application/octet-stream", headers={"X-File-Id": str(file.id), "X-File-Version": str(file.version_number), "X-File-Sha256": file.content_sha256 or ""})
