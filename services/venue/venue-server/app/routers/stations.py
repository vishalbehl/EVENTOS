from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_database
from app.models.srr_station import SRRStation
from app.routers.auth import DeviceAuth

router = APIRouter(prefix="/api/v1/stations", tags=["stations"])

@router.get("/")
async def list_stations(is_auth: DeviceAuth, db: AsyncSession = Depends(get_database)):
    """
    List all Slide Ready Room (SRR) stations configured for the event.
    Read-only endpoint.
    """
    stmt = select(SRRStation).order_by(SRRStation.name)
    result = await db.execute(stmt)
    stations = result.scalars().all()
    return {"stations": stations}

@router.get("/{station_id}")
async def get_station(station_id: str, is_auth: DeviceAuth, db: AsyncSession = Depends(get_database)):
    stmt = select(SRRStation).where(SRRStation.id == station_id)
    result = await db.execute(stmt)
    station = result.scalar_one_or_none()
    
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
        
    return station
