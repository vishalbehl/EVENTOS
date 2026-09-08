import uuid
import hashlib
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.routers.auth import require_admin
from app.database import get_database
from app.models.event import Event
from app.models.room import Room
from app.models.room_device import RoomDevice
from app.runtime_events import record_runtime_event
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/v1/devices", tags=["devices"])


def _new_device_token() -> str:
    return f"venue_device_{secrets.token_urlsafe(36)}"


def _device_payload(device: RoomDevice) -> dict:
    return {
        "id": str(device.id),
        "device_name": device.device_name,
        "device_type": device.device_type,
        "event_id": str(device.event_id),
        "room_id": str(device.room_id),
        "hostname": device.hostname,
        "ip_address": str(device.ip_address) if device.ip_address else None,
        "status": device.status,
        "app_version": device.app_version,
        "last_heartbeat_at": device.last_heartbeat_at.isoformat() if device.last_heartbeat_at else None,
        "enrollment_token_prefix": device.enrollment_token_prefix,
        "enrollment_revoked_at": device.enrollment_token_revoked_at.isoformat() if device.enrollment_token_revoked_at else None,
    }

class ScannerModeConfig(BaseModel):
    device_id: str
    scan_mode: str  # "entry", "workshop", "vip"

@router.get("/online")
async def get_online_devices(db: AsyncSession = Depends(get_database), _: object = Depends(require_admin)):
    """
    Returns a list of online Room Apps and Kiosks.
    Used by the Technician Dashboard to ensure projectors are connected.
    """
    now = datetime.now(timezone.utc)
    rows = list((await db.execute(select(RoomDevice).order_by(RoomDevice.device_name.asc()))).scalars().all())
    devices = [row for row in rows if row.status == "online" and row.last_heartbeat_at and (now - (row.last_heartbeat_at if row.last_heartbeat_at.tzinfo else row.last_heartbeat_at.replace(tzinfo=timezone.utc))).total_seconds() <= 60]
    return {
        "count": len(devices),
        "devices": [
            {
                "device_id": str(device.id),
                "last_seen": device.last_heartbeat_at.isoformat(),
                "status": "online",
                "scan_mode": device.scan_mode
            }
            for device in devices
        ]
    }

@router.post("/config-mode")
async def configure_device_scan_mode(config: ScannerModeConfig, db: AsyncSession = Depends(get_database), _: object = Depends(require_admin)):
    """
    Configure scanner mode for a specific device.
    Options: entry, workshop, vip
    """
    if config.scan_mode not in ["entry", "workshop", "vip"]:
        raise HTTPException(
            status_code=400,
            detail="Invalid scan mode. Must be 'entry', 'workshop', or 'vip'."
        )
    try:
        device = await db.get(RoomDevice, uuid.UUID(config.device_id))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Invalid device ID.") from exc
    if not device:
        raise HTTPException(status_code=404, detail="Device not found.")
    device.scan_mode = config.scan_mode
    await db.commit()
    return {
        "status": "success",
        "device_id": config.device_id,
        "scan_mode": config.scan_mode
    }

@router.get("/config-mode/{device_id}")
async def get_device_scan_mode(device_id: str, db: AsyncSession = Depends(get_database), _: object = Depends(require_admin)):
    """
    Retrieve current scan mode configuration for a specific device.
    """
    try:
        device = await db.get(RoomDevice, uuid.UUID(device_id))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Invalid device ID.") from exc
    if not device:
        raise HTTPException(status_code=404, detail="Device not found.")
    return {
        "device_id": device_id,
        "scan_mode": device.scan_mode
    }

class RegisterDeviceRequest(BaseModel):
    name: str
    mac_address: str
    device_type: str  # kiosk, scanner, display
    event_id: uuid.UUID
    room_id: uuid.UUID

@router.get("/registered")
async def get_registered_devices(db: AsyncSession = Depends(get_database), _: object = Depends(require_admin)):
    result = await db.execute(select(RoomDevice).order_by(RoomDevice.device_name.asc()))
    return [_device_payload(device) for device in result.scalars().all()]

@router.post("/register")
async def register_device(req: RegisterDeviceRequest, db: AsyncSession = Depends(get_database), _: object = Depends(require_admin)):
    if req.device_type not in {"kiosk", "scanner", "display", "presentation_pc", "stage_app", "technician_tablet", "technical_app"}:
        raise HTTPException(status_code=422, detail="Unsupported device type.")
    event = await db.get(Event, req.event_id)
    room = await db.get(Room, req.room_id)
    if not event or not room or room.event_id != req.event_id:
        raise HTTPException(status_code=403, detail="Device event and room scope are invalid.")
    device_token = _new_device_token()
    new_device = RoomDevice(
        event_id=req.event_id,
        room_id=req.room_id,
        device_name=req.name,
        mac_address=req.mac_address,
        device_type=req.device_type,
        status="offline",
        enrollment_token_hash=hashlib.sha256(device_token.encode("utf-8")).hexdigest(),
        enrollment_token_prefix=device_token[:20],
    )
    db.add(new_device)
    await db.commit()
    await db.refresh(new_device)
    # Keep the legacy enrollment_token name for room-app clients while
    # exposing the clearer device_token name for new clients.
    from app.routers.workstations import _backfill_room_delivery_intents
    await _backfill_room_delivery_intents(db, new_device)
    return {
        "status": "success",
        "device_id": str(new_device.id),
        "device": _device_payload(new_device),
        "device_token": device_token,
        "enrollment_token": device_token,
        "secret_returned_once": True,
    }

@router.delete("/registered/{device_id}")
async def delete_device(device_id: str, db: AsyncSession = Depends(get_database), _: object = Depends(require_admin)):
    try:
        parsed_id = uuid.UUID(device_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Invalid device ID.") from exc
    result = await db.execute(select(RoomDevice).where(RoomDevice.id == parsed_id))
    device = result.scalar_one_or_none()
    if device:
        await db.delete(device)
        await db.commit()
    return {"status": "success"}


@router.post("/registered/{device_id}/revoke")
async def revoke_device(device_id: str, db: AsyncSession = Depends(get_database), _: object = Depends(require_admin)):
    """Revoke a room-device credential without destroying operational history."""
    try:
        parsed_id = uuid.UUID(device_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Invalid device ID.") from exc
    device = await db.get(RoomDevice, parsed_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found.")
    device.enrollment_token_revoked_at = datetime.now(timezone.utc)
    device.status = "offline"
    record_runtime_event(
        db,
        event_id=device.event_id,
        room_id=device.room_id,
        event_type="room.device_revoked",
        entity_type="room_device",
        entity_id=str(device.id),
        payload={"device_id": str(device.id), "device_name": device.device_name},
    )
    await db.commit()
    return {"status": "success", "device_id": str(device.id), "revoked": True}
