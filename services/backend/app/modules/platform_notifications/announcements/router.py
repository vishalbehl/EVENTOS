from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from .dependencies import get_db
from .service import AnnouncementsService
import uuid

router = APIRouter(prefix="/announcements", tags=["announcements"])

@router.post("")
async def create_announcement(title: str, message: str, org_id: uuid.UUID = None, type: str = "INFO", target_roles: list = None, target_departments: list = None, db: AsyncSession = Depends(get_db)):
    srv = AnnouncementsService(db)
    ann = await srv.create_announcement(org_id, title, message, type, target_roles, target_departments)
    await db.commit()
    return ann

@router.get("")
async def list_active_announcements(org_id: uuid.UUID = None, db: AsyncSession = Depends(get_db)):
    srv = AnnouncementsService(db)
    return await srv.get_active_announcements(org_id)
