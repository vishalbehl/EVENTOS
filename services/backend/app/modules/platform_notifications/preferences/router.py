from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from .dependencies import get_db
from .service import PreferencesService
import uuid

router = APIRouter(prefix="/preferences", tags=["preferences"])

@router.get("/{user_id}/{event_id}")
async def get_preferences(user_id: uuid.UUID, event_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    srv = PreferencesService(db)
    return await srv.get_user_preferences(user_id, event_id)

@router.patch("/{user_id}/{event_id}")
async def update_preferences(user_id: uuid.UUID, event_id: uuid.UUID, updates: dict, db: AsyncSession = Depends(get_db)):
    srv = PreferencesService(db)
    pref = await srv.update_preferences(user_id, event_id, updates)
    await db.commit()
    return pref
