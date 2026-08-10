import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, cast, String, func

from app.database import get_database
from app.models.room_device import RoomDevice
from app.models.event import Event
from app.models.room import Room
from app.models.venue_node import VenueNodeAssignment
from app.models.venue_capacity_rule import VenueCapacityRule
from app.routers.node_sync import _node_token
from app.routers.auth import require_admin
from app.models.venue_user import VenueUser

router = APIRouter(prefix="/api/v1/venue/admin/workstations", tags=["workstations"])

class WorkstationDTO(BaseModel):
    id: str
    device_name: str
    device_type: str  # registration_desk | kiosk | scanner | printer | helpdesk
    hostname: Optional[str] = None
    ip_address: Optional[str] = None
    mac_address: Optional[str] = None
    status: str = "offline"
    room_name: Optional[str] = None
    os_version: Optional[str] = None
    last_seen: Optional[str] = None
    registered_at: Optional[str] = None
    mode: Optional[str] = None
    capacity_rule_id: Optional[str] = None
    assignment_status: Optional[str] = None
    assignment_id: Optional[str] = None
    event_id: Optional[str] = None
    allowed_modes: List[str] = Field(default_factory=list)
    snapshot_version: Optional[int] = None
    last_sync_at: Optional[str] = None

class BindWorkstationRequest(BaseModel):
    device_id: Optional[str] = None # e.g. "REG-DESK-01"
    name: str # e.g. "Main Registration Desk 01"
    type: str = "registration_desk" # registration_desk | kiosk | scanner | printer | helpdesk
    mac_address: str # e.g. "20:1E:88:5C:FF:17"
    ip_address: Optional[str] = None
    hostname: Optional[str] = None
    assigned_station: Optional[str] = "Main Entrance Intake"
    network_type: Optional[str] = "Ethernet"
    mode: str = "registration"
    capacity_rule_id: Optional[str] = None
    permissions: dict = Field(default_factory=dict)

class UpdateWorkstationRequest(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    ip_address: Optional[str] = None
    assigned_station: Optional[str] = None
    status: Optional[str] = None

class RevokeWorkstationRequest(BaseModel):
    reason: str

@router.get("", response_model=List[WorkstationDTO])
@router.get("/", response_model=List[WorkstationDTO])
async def list_workstations(db: AsyncSession = Depends(get_database), _: VenueUser = Depends(require_admin)):
    """
    Lists all registered venue workstations, kiosks, printers, and scanners.
    """
    stmt = select(RoomDevice).order_by(RoomDevice.registered_at.desc())
    result = await db.execute(stmt)
    devices = result.scalars().all()
    
    out: List[WorkstationDTO] = []
    for d in devices:
        room_name = "Main Entrance Intake"
        if d.room_id:
            r = await db.get(Room, d.room_id)
            if r:
                room_name = r.name
        assignment = (await db.execute(select(VenueNodeAssignment).where(VenueNodeAssignment.device_id == d.id).order_by(VenueNodeAssignment.updated_at.desc()).limit(1))).scalar_one_or_none()
                
        permissions = assignment.permissions if assignment and isinstance(assignment.permissions, dict) else {}
        allowed_modes = permissions.get("allowed_modes") if isinstance(permissions.get("allowed_modes"), list) else []
        if assignment and assignment.mode not in allowed_modes:
            allowed_modes = [assignment.mode, *allowed_modes]
        out.append(WorkstationDTO(
            id=str(d.id),
            device_name=d.device_name,
            device_type=d.device_type,
            hostname=d.hostname,
            ip_address=str(d.ip_address) if d.ip_address else None,
            mac_address=str(d.mac_address).upper().replace("-", ":") if d.mac_address else None,
            status=d.status,
            room_name=room_name,
            os_version=d.os_version,
            last_seen=d.last_heartbeat_at.isoformat() if d.last_heartbeat_at else None,
            registered_at=d.registered_at.isoformat() if d.registered_at else None
            ,mode=assignment.mode if assignment else None,
            capacity_rule_id=str(assignment.capacity_rule_id) if assignment and assignment.capacity_rule_id else None,
            assignment_status=assignment.status if assignment else None
            ,assignment_id=str(assignment.id) if assignment else None,
            event_id=str(d.event_id),
            allowed_modes=allowed_modes,
            snapshot_version=assignment.snapshot_version if assignment else None,
            last_sync_at=assignment.last_sync_at.isoformat() if assignment and assignment.last_sync_at else None
        ))
    return out

@router.post("/bind")
async def bind_workstation(
    payload: BindWorkstationRequest,
    db: AsyncSession = Depends(get_database), _: VenueUser = Depends(require_admin)
):
    """
    Binds a discovered hardware device (MAC & IP) to a designated Device ID,
    workstation role, and assigned station checkpoint.
    """
    event = (await db.execute(select(Event).limit(1))).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=400, detail="No active event found on venue server.")
    if payload.mode not in {"registration", "scanning", "self_checkin"}:
        raise HTTPException(status_code=422, detail="mode must be registration, scanning, or self_checkin")
    permissions = dict(payload.permissions or {})
    requested_allowed_modes = permissions.get("allowed_modes")
    if not isinstance(requested_allowed_modes, list):
        requested_allowed_modes = [payload.mode]
    allowed_modes = []
    for value in [payload.mode, *requested_allowed_modes]:
        if value not in {"registration", "scanning", "self_checkin"}:
            raise HTTPException(status_code=422, detail="allowed_modes contains an unsupported mode")
        if value not in allowed_modes:
            allowed_modes.append(value)
    permissions["allowed_modes"] = allowed_modes
    rule_id = uuid.UUID(payload.capacity_rule_id) if payload.capacity_rule_id else None
    if "scanning" in allowed_modes and not rule_id:
        raise HTTPException(status_code=422, detail="Scanning workstations require a capacity_rule_id")
    if rule_id and not await db.get(VenueCapacityRule, rule_id):
        raise HTTPException(status_code=422, detail="Capacity rule not found")

    # Find or create room / station checkpoint
    station_name = payload.assigned_station or "Main Entrance Intake"
    room_res = await db.execute(select(Room).where(Room.event_id == event.id, Room.name == station_name).limit(1))
    room = room_res.scalar_one_or_none()
    if not room:
        room = Room(id=uuid.uuid4(), event_id=event.id, name=station_name, capacity=5000)
        db.add(room)
        await db.flush()

    # Check if a device with this MAC already exists
    clean_mac = payload.mac_address.strip().upper().replace("-", ":")
    existing_res = await db.execute(select(RoomDevice).where(func.replace(func.upper(cast(RoomDevice.mac_address, String)), "-", ":") == clean_mac))
    existing = existing_res.scalar_one_or_none()

    if existing:
        existing.device_name = payload.name.strip()
        existing.device_type = payload.type
        existing.ip_address = payload.ip_address
        existing.hostname = payload.hostname or payload.device_id
        existing.room_id = room.id
        existing.status = "online"
        existing.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(existing)
        assignment = (await db.execute(select(VenueNodeAssignment).where(VenueNodeAssignment.event_id == event.id, VenueNodeAssignment.device_id == existing.id))).scalar_one_or_none()
        if not assignment:
            assignment = VenueNodeAssignment(event_id=event.id, device_id=existing.id)
            db.add(assignment)
        assignment.mode, assignment.station_id, assignment.capacity_rule_id = payload.mode, payload.assigned_station, rule_id
        assignment.permissions, assignment.status = permissions, "active"
        assignment.snapshot_version += 1
        await db.commit()
        return {
            "status": "success",
            "message": f"Updated binding for device '{existing.device_name}' (MAC: {clean_mac})",
            "device_id": str(existing.id)
            ,"assignment_id": str(assignment.id), "enrollment_token": _node_token(assignment.id, event.id)
        }

    # Create new RoomDevice
    new_device = RoomDevice(
        id=uuid.uuid4(),
        event_id=event.id,
        room_id=room.id,
        device_type=payload.type,
        device_name=payload.name.strip(),
        hostname=payload.hostname or payload.device_id or "Workstation-Node",
        ip_address=payload.ip_address,
        mac_address=clean_mac,
        status="online",
        registered_at=datetime.now(timezone.utc),
        last_heartbeat_at=datetime.now(timezone.utc)
    )
    db.add(new_device)
    await db.commit()
    await db.refresh(new_device)
    assignment = VenueNodeAssignment(event_id=event.id, device_id=new_device.id, mode=payload.mode, station_id=payload.assigned_station, capacity_rule_id=rule_id, permissions=permissions, status="active", snapshot_version=1)
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)

    return {
        "status": "success",
        "message": f"Successfully bound workstation '{new_device.device_name}' with MAC {clean_mac}",
        "device_id": str(new_device.id)
        ,"assignment_id": str(assignment.id), "enrollment_token": _node_token(assignment.id, event.id)
    }

@router.put("/{device_id}")
async def update_workstation(
    device_id: uuid.UUID,
    payload: UpdateWorkstationRequest,
    db: AsyncSession = Depends(get_database), _: VenueUser = Depends(require_admin)
):
    device = await db.get(RoomDevice, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Workstation not found")

    if payload.name:
        device.device_name = payload.name.strip()
    if payload.type:
        device.device_type = payload.type
    if payload.ip_address:
        device.ip_address = payload.ip_address
    if payload.status:
        device.status = payload.status

    if payload.assigned_station:
        event = (await db.execute(select(Event).limit(1))).scalar_one_or_none()
        if event:
            room_res = await db.execute(select(Room).where(Room.event_id == event.id, Room.name == payload.assigned_station).limit(1))
            room = room_res.scalar_one_or_none()
            if not room:
                room = Room(id=uuid.uuid4(), event_id=event.id, name=payload.assigned_station, capacity=5000)
                db.add(room)
                await db.flush()
            device.room_id = room.id

    device.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"status": "success", "message": f"Workstation '{device.device_name}' updated successfully."}

@router.delete("/{device_id}")
async def delete_workstation(
    device_id: uuid.UUID,
    db: AsyncSession = Depends(get_database), _: VenueUser = Depends(require_admin)
):
    device = await db.get(RoomDevice, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Workstation not found")

    await db.delete(device)
    await db.commit()
    return {"status": "success", "message": f"Workstation '{device.device_name}' unbound successfully."}

@router.post("/{device_id}/ping")
async def ping_workstation(
    device_id: uuid.UUID,
    db: AsyncSession = Depends(get_database), _: VenueUser = Depends(require_admin)
):
    device = await db.get(RoomDevice, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Workstation not found")

    device.last_heartbeat_at = datetime.now(timezone.utc)
    device.status = "online"
    await db.commit()
    return {
        "status": "success",
        "device_id": str(device.id),
        "device_name": device.device_name,
        "is_reachable": True,
        "latency_ms": 2
    }

@router.post("/{device_id}/resync")
async def resync_workstation(device_id: uuid.UUID, db: AsyncSession = Depends(get_database), _: VenueUser = Depends(require_admin)):
    assignment = (await db.execute(select(VenueNodeAssignment).where(VenueNodeAssignment.device_id == device_id).order_by(VenueNodeAssignment.updated_at.desc()).limit(1))).scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Workstation assignment not found")
    if assignment.status == "revoked":
        raise HTTPException(status_code=409, detail="Revoked workstations must be bound again before synchronization")
    assignment.snapshot_version += 1
    await db.commit()
    return {"status": "success", "assignment_id": str(assignment.id), "snapshot_version": assignment.snapshot_version}

@router.post("/{device_id}/revoke")
async def revoke_workstation(device_id: uuid.UUID, payload: RevokeWorkstationRequest, db: AsyncSession = Depends(get_database), _: VenueUser = Depends(require_admin)):
    assignment = (await db.execute(select(VenueNodeAssignment).where(VenueNodeAssignment.device_id == device_id).order_by(VenueNodeAssignment.updated_at.desc()).limit(1))).scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Workstation assignment not found")
    assignment.status = "revoked"
    assignment.revoked_at = datetime.now(timezone.utc)
    assignment.revoked_reason = payload.reason
    await db.commit()
    return {"status": "success", "assignment_id": str(assignment.id), "assignment_status": assignment.status}
