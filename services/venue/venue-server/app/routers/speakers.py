import uuid
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_database
from app.models.speaker import Speaker
from app.routers.auth import DeviceAuth
from app.device_scope import event_id_for_device

router = APIRouter(prefix="/api/v1/speakers", tags=["speakers"])

@router.get("/")
async def list_speakers(is_auth: DeviceAuth, device_id: uuid.UUID | None = Header(default=None, alias="X-Venue-Device-Id"), event_id: uuid.UUID | None = Query(default=None), db: AsyncSession = Depends(get_database)):
    """
    List all speakers stored locally on the venue server.
    Read-only endpoint.
    """
    scoped_event = await event_id_for_device(db, device_id) or event_id
    stmt = select(Speaker).where(Speaker.event_id == scoped_event).order_by(Speaker.last_name) if scoped_event else select(Speaker).order_by(Speaker.last_name)
    result = await db.execute(stmt)
    speakers = result.scalars().all()
    return {"speakers": speakers}

@router.get("/{speaker_id}")
async def get_speaker(speaker_id: str, is_auth: DeviceAuth, device_id: uuid.UUID | None = Header(default=None, alias="X-Venue-Device-Id"), db: AsyncSession = Depends(get_database)):
    scoped_event = await event_id_for_device(db, device_id)
    stmt = select(Speaker).where(Speaker.id == speaker_id, *([Speaker.event_id == scoped_event] if scoped_event else []))
    result = await db.execute(stmt)
    speaker = result.scalar_one_or_none()
    
    if not speaker:
        raise HTTPException(status_code=404, detail="Speaker not found")
        
    return speaker
