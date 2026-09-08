import uuid
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_database
from app.models.srr_station import SRRStation
from app.routers.auth import DeviceAuth
from app.device_scope import event_id_for_device

router = APIRouter(prefix="/api/v1/stations", tags=["stations"])

@router.get("/")
async def list_stations(is_auth: DeviceAuth, device_id: uuid.UUID | None = Header(default=None, alias="X-Venue-Device-Id"), event_id: uuid.UUID | None = Query(default=None), db: AsyncSession = Depends(get_database)):
    """
    List all Slide Ready Room (SRR) stations configured for the event.
    Read-only endpoint.
    """
    scoped_event = await event_id_for_device(db, device_id) or event_id
    stmt = select(SRRStation).where(SRRStation.event_id == scoped_event).order_by(SRRStation.station_number) if scoped_event else select(SRRStation).order_by(SRRStation.station_number)
    result = await db.execute(stmt)
    stations = result.scalars().all()
    return {"stations": stations}

@router.get("/{station_id}")
async def get_station(station_id: str, is_auth: DeviceAuth, device_id: uuid.UUID | None = Header(default=None, alias="X-Venue-Device-Id"), db: AsyncSession = Depends(get_database)):
    scoped_event = await event_id_for_device(db, device_id)
    stmt = select(SRRStation).where(SRRStation.id == station_id, *([SRRStation.event_id == scoped_event] if scoped_event else []))
    result = await db.execute(stmt)
    station = result.scalar_one_or_none()
    
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
        
    return station
