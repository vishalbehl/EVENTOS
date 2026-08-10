from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_database
from app.models.speaker import Speaker
from app.routers.auth import DeviceAuth

router = APIRouter(prefix="/api/v1/speakers", tags=["speakers"])

@router.get("/")
async def list_speakers(is_auth: DeviceAuth, db: AsyncSession = Depends(get_database)):
    """
    List all speakers stored locally on the venue server.
    Read-only endpoint.
    """
    stmt = select(Speaker).order_by(Speaker.last_name)
    result = await db.execute(stmt)
    speakers = result.scalars().all()
    return {"speakers": speakers}

@router.get("/{speaker_id}")
async def get_speaker(speaker_id: str, is_auth: DeviceAuth, db: AsyncSession = Depends(get_database)):
    stmt = select(Speaker).where(Speaker.id == speaker_id)
    result = await db.execute(stmt)
    speaker = result.scalar_one_or_none()
    
    if not speaker:
        raise HTTPException(status_code=404, detail="Speaker not found")
        
    return speaker
