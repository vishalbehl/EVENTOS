import uuid
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_database
from app.models.session import Session
from app.models.session_speaker import SessionSpeaker
from app.routers.auth import DeviceAuth
from app.device_scope import event_id_for_device

router = APIRouter(prefix="/api/v1/sessions", tags=["sessions"])

@router.get("/")
async def list_sessions(is_auth: DeviceAuth, device_id: uuid.UUID | None = Header(default=None, alias="X-Venue-Device-Id"), event_id: uuid.UUID | None = Query(default=None), db: AsyncSession = Depends(get_database)):
    """
    List all sessions stored locally on the venue server.
    Read-only endpoint for venue apps.
    """
    scoped_event = await event_id_for_device(db, device_id) or event_id
    stmt = select(Session).where(Session.event_id == scoped_event).order_by(Session.start_time) if scoped_event else select(Session).order_by(Session.start_time)
    result = await db.execute(stmt)
    sessions = result.scalars().all()
    return {"sessions": sessions}

@router.get("/{session_id}")
async def get_session(session_id: str, is_auth: DeviceAuth, device_id: uuid.UUID | None = Header(default=None, alias="X-Venue-Device-Id"), db: AsyncSession = Depends(get_database)):
    """
    Get detailed view of a single session, including speakers.
    """
    scoped_event = await event_id_for_device(db, device_id)
    stmt = (
        select(Session)
        .options(selectinload(Session.session_speakers).selectinload(SessionSpeaker.speaker))
        .where(Session.id == session_id, *([Session.event_id == scoped_event] if scoped_event else []))
    )
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    return session
