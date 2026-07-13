# backend/app/routers/rooms_devices.py
from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import DeviceAuth, get_db, get_current_user, get_current_event, CurrentEvent
from app.modules.venue.models.room_device import RoomDevice
from app.modules.identity.models.user import User
from app.modules.events.models.room import Room
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/events/{event_id}/rooms/{room_id}/devices", tags=["room-devices"])


# ── Inline schemas (device-specific, not worth a separate schema file) ──

class DeviceRegisterRequest(BaseModel):
    device_type: str  # presentation_pc | technician_tablet | moderator_tablet | kiosk | signage
    device_name: str
    hostname: Optional[str] = None
    os_version: Optional[str] = None
    app_version: Optional[str] = None


class DeviceResponse(BaseModel):
    id: uuid.UUID
    room_id: uuid.UUID
    event_id: uuid.UUID
    device_type: str
    device_name: str
    hostname: Optional[str] = None
    status: str
    app_version: Optional[str] = None
    last_heartbeat_at: Optional[datetime] = None
    registered_at: datetime

    model_config = {"from_attributes": True}


class DeviceKeyResponse(BaseModel):
    device_id: uuid.UUID
    key_version: int
    expires_at: Optional[datetime] = None
    device_key: str  # plain-text — shown ONCE on registration


# ── Endpoints ─────────────────────────────────────────────────

class DeviceKeyRotateRequest(BaseModel):
    expires_in_days: int = 90


class DeviceKeyRevokeRequest(BaseModel):
    reason: str


@router.get("", response_model=List[DeviceResponse])
async def list_devices(
    room_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> List[DeviceResponse]:
    result = await db.execute(
        select(RoomDevice)
        .where(RoomDevice.room_id == room_id, RoomDevice.event_id == event.id)
        .order_by(RoomDevice.device_type)
    )
    return [DeviceResponse.model_validate(d) for d in result.scalars().all()]


@router.post("/register", response_model=DeviceKeyResponse, status_code=status.HTTP_201_CREATED)
async def register_device(
    room_id: uuid.UUID,
    payload: DeviceRegisterRequest,
    event: CurrentEvent,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DeviceKeyResponse:
    """
    Register a device to this room. Returns a one-time plain-text API key.
    The key is hashed before storage — cannot be recovered later.
    """
    plain_key = secrets.token_urlsafe(48)
    expires_at = datetime.now(timezone.utc) + timedelta(days=90)
    room = await db.scalar(select(Room).where(Room.id == room_id, Room.event_id == event.id))
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found.")

    device = RoomDevice(
        organization_id=event.organization_id,
        event_id=event.id,
        room_id=room_id,
        device_key_hash=hashlib.sha256(plain_key.encode("utf-8")).hexdigest(),
        device_key_expires_at=expires_at,
        device_type=payload.device_type,
        device_name=payload.device_name,
        hostname=payload.hostname,
        os_version=payload.os_version,
        app_version=payload.app_version,
        status="offline",
    )
    db.add(device)
    await db.commit()
    await db.refresh(device)

    return DeviceKeyResponse(
        device_id=device.id,
        device_key=plain_key,
        key_version=device.device_key_version,
        expires_at=expires_at,
    )


@router.post("/{device_id}/rotate-key", response_model=DeviceKeyResponse)
async def rotate_device_key(
    room_id: uuid.UUID,
    device_id: uuid.UUID,
    payload: DeviceKeyRotateRequest,
    event: CurrentEvent,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DeviceKeyResponse:
    if not 1 <= payload.expires_in_days <= 365:
        raise HTTPException(status_code=422, detail="expires_in_days must be between 1 and 365.")
    device = await db.scalar(select(RoomDevice).where(
        RoomDevice.id == device_id,
        RoomDevice.room_id == room_id,
        RoomDevice.event_id == event.id,
        RoomDevice.organization_id == event.organization_id,
    ))
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found.")
    now = datetime.now(timezone.utc)
    plain_key = secrets.token_urlsafe(48)
    device.device_key_hash = hashlib.sha256(plain_key.encode("utf-8")).hexdigest()
    device.device_key_version += 1
    device.device_key_rotated_at = now
    device.device_key_revoked_at = None
    device.device_key_revocation_reason = None
    device.device_key_expires_at = now + timedelta(days=payload.expires_in_days)
    await db.commit()
    return DeviceKeyResponse(
        device_id=device.id,
        device_key=plain_key,
        key_version=device.device_key_version,
        expires_at=device.device_key_expires_at,
    )


@router.post("/{device_id}/revoke-key", response_model=MessageResponse)
async def revoke_device_key(
    room_id: uuid.UUID,
    device_id: uuid.UUID,
    payload: DeviceKeyRevokeRequest,
    event: CurrentEvent,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    device = await db.scalar(select(RoomDevice).where(
        RoomDevice.id == device_id,
        RoomDevice.room_id == room_id,
        RoomDevice.event_id == event.id,
        RoomDevice.organization_id == event.organization_id,
    ))
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found.")
    device.device_key_revoked_at = datetime.now(timezone.utc)
    device.device_key_revocation_reason = payload.reason[:255]
    await db.commit()
    return MessageResponse(message="Device key revoked.")


@router.post("/{device_id}/heartbeat", response_model=MessageResponse)
async def device_heartbeat(
    room_id: uuid.UUID,
    device_id: uuid.UUID,
    device_auth: DeviceAuth,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """
    Called every 30 seconds by Electron/PWA apps to report they are alive.
    No JWT required — secured at network level (device key via nginx).
    """
    if device_auth["device_id"] != device_id or device_auth["room_id"] != room_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found.")

    result = await db.execute(
        select(RoomDevice).where(
            RoomDevice.id == device_id,
            RoomDevice.room_id == room_id,
            RoomDevice.event_id == device_auth["event_id"],
            RoomDevice.organization_id == device_auth["organization_id"],
        )
    )
    device = result.scalar_one_or_none()
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found.")
    device.last_heartbeat_at = datetime.now(timezone.utc)
    device.status = "online"
    await db.commit()
    return MessageResponse(message="ok")


@router.delete("/{device_id}", response_model=MessageResponse)
async def deregister_device(
    room_id: uuid.UUID,
    device_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    result = await db.execute(
        select(RoomDevice).where(
            RoomDevice.id == device_id, RoomDevice.room_id == room_id
        )
    )
    device = result.scalar_one_or_none()
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found.")
    await db.delete(device)
    await db.commit()
    return MessageResponse(message="Device deregistered.")
