"""Resolve the event scope associated with an authenticated venue device."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.room_device import RoomDevice
from app.models.srr_station import SRRStation


async def event_id_for_device(db: AsyncSession, device_id: uuid.UUID | None) -> uuid.UUID | None:
    if not device_id:
        return None
    room_device = await db.get(RoomDevice, device_id)
    if room_device:
        return room_device.event_id
    station = await db.get(SRRStation, device_id)
    return station.event_id if station else None
