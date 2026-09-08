"""Device-scoped bootstrap and monotonic runtime delta synchronization."""

import hmac
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_database
from app.models.event import Event
from app.models.room import Room
from app.models.room_device import RoomDevice
from app.models.session import Session
from app.models.srr_station import SRRStation
from app.models.venue_runtime_event import VenueRuntimeEvent
from app.routers.auth import resolve_srr_device_credential, validate_room_device_credential
from app.routers.node_sync import _authorize_node


router = APIRouter(prefix="/api/v1/venue/runtime", tags=["runtime-sync"])


async def runtime_identity(
    device_id: uuid.UUID | None = Header(default=None, alias="X-Venue-Device-Id"),
    device_token: str | None = Header(default=None, alias="X-Device-Token"),
    device_key: str | None = Header(default=None, alias="X-Device-Key"),
    venue_key: str | None = Header(default=None, alias="X-Venue-Key"),
    node_token: str | None = Header(default=None, alias="X-Venue-Node-Token"),
    db: AsyncSession = Depends(get_database),
) -> dict[str, Any]:
    if isinstance(device_id, uuid.UUID) and isinstance(device_token, str) and device_token:
        device = await validate_room_device_credential(db, device_id, device_token)
        if not device:
            raise HTTPException(status_code=401, detail="Invalid or revoked room-device credential.")
        return {"kind": "room_device", "id": device.id, "event_id": device.event_id, "room_id": device.room_id}
    if isinstance(device_key, str) and device_key:
        station = await resolve_srr_device_credential(
            db, device_key, allow_enrollment_token=settings.DEPLOYMENT_PROFILE == "local"
        )
        if station:
            return {"kind": "srr_station", "id": station.id, "event_id": station.event_id, "room_id": None}
    if isinstance(node_token, str) and node_token:
        # Workstation node assignments are separate from SRR station identity,
        # but may consume the same event stream for replica reconciliation.
        assignment = await _authorize_node(node_token, db)
        return {"kind": "venue_node", "id": assignment.device_id, "event_id": assignment.event_id, "room_id": None}
    if settings.DEPLOYMENT_PROFILE == "local" and isinstance(venue_key, str) and venue_key and hmac.compare_digest(venue_key, settings.VENUE_AUTH_KEY):
        return {"kind": "local", "id": None, "event_id": None, "room_id": None}
    raise HTTPException(status_code=401, detail="An enrolled runtime-device credential is required.")


def _event_payload(row: VenueRuntimeEvent) -> dict[str, Any]:
    return {
        "sequence": row.sequence,
        "event_id": str(row.event_id),
        "room_id": str(row.room_id) if row.room_id else None,
        "session_id": str(row.session_id) if row.session_id else None,
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "event_type": row.event_type,
        "payload": row.payload or {},
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


async def _authorize_event(identity: dict[str, Any], event_id: uuid.UUID) -> None:
    if identity["event_id"] and identity["event_id"] != event_id:
        raise HTTPException(status_code=403, detail="Device is outside this event scope.")


@router.get("/{event_id}/bootstrap")
async def runtime_bootstrap(
    event_id: uuid.UUID,
    identity: dict[str, Any] = Depends(runtime_identity),
    db: AsyncSession = Depends(get_database),
) -> dict[str, Any]:
    await _authorize_event(identity, event_id)
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    rooms = list((await db.execute(select(Room).where(Room.event_id == event_id, Room.is_active.is_(True)).order_by(Room.name))).scalars().all())
    sessions = list((await db.execute(select(Session).where(Session.event_id == event_id).order_by(Session.start_time))).scalars().all())
    latest = await db.scalar(select(VenueRuntimeEvent.sequence).where(VenueRuntimeEvent.event_id == event_id).order_by(VenueRuntimeEvent.sequence.desc()).limit(1))
    return {
        "server_time": datetime.now(timezone.utc).isoformat(),
        "cursor": int(latest or 0),
        "event": {"id": str(event.id), "name": event.name},
        "rooms": [{"id": str(room.id), "name": room.name, "type": room.room_type} for room in rooms],
        "sessions": [{"id": str(session.id), "room_id": str(session.room_id) if session.room_id else None, "code": session.session_code, "title": session.name, "start": session.start_time.isoformat(), "end": session.end_time.isoformat(), "status": session.status} for session in sessions],
    }


@router.get("/{event_id}/events")
async def runtime_events(
    event_id: uuid.UUID,
    after: int = Query(default=0, ge=0),
    limit: int = Query(default=500, ge=1, le=1000),
    identity: dict[str, Any] = Depends(runtime_identity),
    db: AsyncSession = Depends(get_database),
) -> dict[str, Any]:
    await _authorize_event(identity, event_id)
    rows = list((await db.execute(select(VenueRuntimeEvent).where(VenueRuntimeEvent.event_id == event_id, VenueRuntimeEvent.sequence > after).order_by(VenueRuntimeEvent.sequence).limit(limit))).scalars().all())
    latest = await db.scalar(select(VenueRuntimeEvent.sequence).where(VenueRuntimeEvent.event_id == event_id).order_by(VenueRuntimeEvent.sequence.desc()).limit(1))
    cursor = rows[-1].sequence if rows else int(latest or after)
    return {"server_time": datetime.now(timezone.utc).isoformat(), "after": after, "cursor": cursor, "has_more": len(rows) == limit, "events": [_event_payload(row) for row in rows]}
