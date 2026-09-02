# backend/app/routers/rooms_devices.py
from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import DeviceAuth, StepUpAuth, get_db, get_current_user, get_current_event, CurrentEvent
from app.modules.audit.models.audit_log import AuditLog
from app.modules.operations_control.models import VenueCredentialOperation
from app.modules.venue.models.room_device import RoomDevice
from app.modules.identity.models.user import User
from app.modules.agenda.models import Room
from app.schemas.common import MessageResponse
from app.core.dependencies.feature_gate import require_event_operation
from app.modules.billing.services.usage_reservation_service import UsageReservationService
from app.modules.venue.application.queries import RoomDeviceQueryService

router = APIRouter(prefix="/events/{event_id}/rooms/{room_id}/devices", tags=["room-devices"], dependencies=[require_event_operation("venue.devices.manage")])


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
    device_key: Optional[str] = None
    replayed: bool = False


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
    devices = await RoomDeviceQueryService(db).list_for_room(
        organization_id=event.organization_id,
        event_id=event.id,
        room_id=room_id,
    )
    return [DeviceResponse.model_validate(device) for device in devices]


@router.post("/register", response_model=DeviceKeyResponse, status_code=status.HTTP_201_CREATED)
async def register_device(
    room_id: uuid.UUID,
    payload: DeviceRegisterRequest,
    event: CurrentEvent,
    actor: User = Depends(get_current_user),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
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
    reservation = await UsageReservationService.reserve(
        db,
        organization_id=event.organization_id,
        event_id=event.id,
        limit_key="max_devices_per_event",
        quantity=1,
        unit="device",
        idempotency_key=f"device-register:{idempotency_key}",
        metadata={"room_id": str(room_id), "device_type": payload.device_type},
    )

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
    await db.flush()
    await UsageReservationService.consume(
        db,
        reservation.id,
        source="organizer_portal.devices.register",
        actor_user_id=actor.id,
    )
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
    step_up: StepUpAuth,
    actor: User = Depends(get_current_user),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128),
    reason: str = Header(..., alias="X-Admin-Reason", min_length=12, max_length=1000),
    db: AsyncSession = Depends(get_db),
) -> DeviceKeyResponse:
    del step_up
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
    request_hash = hashlib.sha256(f"ROTATE:{device_id}:{payload.expires_in_days}:{reason}".encode()).hexdigest()
    existing = await db.scalar(select(VenueCredentialOperation).where(
        VenueCredentialOperation.organization_id == event.organization_id,
        VenueCredentialOperation.operation_type == "ROTATE",
        VenueCredentialOperation.idempotency_key == idempotency_key,
    ))
    if existing:
        if existing.request_hash != request_hash:
            raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT", "message": "Idempotency key was reused with different rotation parameters."})
        return DeviceKeyResponse(device_id=device.id, key_version=existing.result_key_version, expires_at=existing.result_expires_at, replayed=True)
    now = datetime.now(timezone.utc)
    plain_key = secrets.token_urlsafe(48)
    device.device_key_hash = hashlib.sha256(plain_key.encode("utf-8")).hexdigest()
    device.device_key_version += 1
    device.device_key_rotated_at = now
    device.device_key_revoked_at = None
    device.device_key_revocation_reason = None
    device.device_key_expires_at = now + timedelta(days=payload.expires_in_days)
    db.add(VenueCredentialOperation(organization_id=event.organization_id, event_id=event.id, device_id=device.id, operation_type="ROTATE", idempotency_key=idempotency_key, request_hash=request_hash, result_key_version=device.device_key_version, result_expires_at=device.device_key_expires_at, requested_by=actor.id, reason=reason))
    db.add(AuditLog(organization_id=event.organization_id, actor_user_id=actor.id, actor_role=actor.platform_role or actor.role, resource_type="venue_device", resource_id=device.id, action_type="VENUE_CREDENTIAL_ROTATED", new_state={"reason": reason, "key_version": device.device_key_version, "expires_at": device.device_key_expires_at.isoformat()}, is_sensitive=True))
    await db.commit()
    return DeviceKeyResponse(
        device_id=device.id,
        device_key=plain_key,
        key_version=device.device_key_version,
        expires_at=device.device_key_expires_at,
        replayed=False,
    )


@router.post("/{device_id}/revoke-key", response_model=MessageResponse)
async def revoke_device_key(
    room_id: uuid.UUID,
    device_id: uuid.UUID,
    payload: DeviceKeyRevokeRequest,
    event: CurrentEvent,
    step_up: StepUpAuth,
    actor: User = Depends(get_current_user),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=128),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    del step_up
    device = await db.scalar(select(RoomDevice).where(
        RoomDevice.id == device_id,
        RoomDevice.room_id == room_id,
        RoomDevice.event_id == event.id,
        RoomDevice.organization_id == event.organization_id,
    ))
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found.")
    request_hash = hashlib.sha256(f"REVOKE:{device_id}:{payload.reason}".encode()).hexdigest()
    existing = await db.scalar(select(VenueCredentialOperation).where(
        VenueCredentialOperation.organization_id == event.organization_id,
        VenueCredentialOperation.operation_type == "REVOKE",
        VenueCredentialOperation.idempotency_key == idempotency_key,
    ))
    if existing:
        if existing.request_hash != request_hash:
            raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT", "message": "Idempotency key was reused with a different revocation request."})
        return MessageResponse(message="Device key already revoked.")
    device.device_key_revoked_at = datetime.now(timezone.utc)
    device.device_key_revocation_reason = payload.reason[:255]
    db.add(VenueCredentialOperation(organization_id=event.organization_id, event_id=event.id, device_id=device.id, operation_type="REVOKE", idempotency_key=idempotency_key, request_hash=request_hash, result_key_version=device.device_key_version, result_expires_at=device.device_key_expires_at, requested_by=actor.id, reason=payload.reason))
    db.add(AuditLog(organization_id=event.organization_id, actor_user_id=actor.id, actor_role=actor.platform_role or actor.role, resource_type="venue_device", resource_id=device.id, action_type="VENUE_CREDENTIAL_REVOKED", new_state={"reason": payload.reason, "key_version": device.device_key_version}, is_sensitive=True))
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
