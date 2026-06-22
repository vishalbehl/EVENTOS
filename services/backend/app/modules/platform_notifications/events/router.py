from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from .dependencies import get_db
from .service import EventsService
import uuid

router = APIRouter(prefix="/events", tags=["events"])

@router.post("")
async def register_event(event_key: str, name: str, description: str, module: str, is_system: bool = False, db: AsyncSession = Depends(get_db)):
    srv = EventsService(db)
    evt = await srv.register_event(event_key, name, description, module, is_system)
    await db.commit()
    return evt

@router.get("")
async def list_events(db: AsyncSession = Depends(get_db)):
    srv = EventsService(db)
    return await srv.list_events()

@router.get("/{event_id}")
async def get_event(event_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    srv = EventsService(db)
    evt = await srv.get_event(event_id)
    if not evt:
        raise HTTPException(status_code=404, detail="Event not found")
    return evt
