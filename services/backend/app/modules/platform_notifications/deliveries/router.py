from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from .dependencies import get_db
from .service import DeliveriesService
import uuid

router = APIRouter(prefix="/inbox", tags=["inbox"])

@router.get("/{user_id}")
async def get_user_inbox(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    srv = DeliveriesService(db)
    return await srv.get_user_in_app(user_id)

@router.patch("/{notification_id}/read")
async def mark_as_read(notification_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    from .models import InAppNotification
    from sqlalchemy import update
    from datetime import datetime
    await db.execute(
        update(InAppNotification)
        .where(InAppNotification.id == notification_id)
        .values(is_read=True, read_at=datetime.utcnow())
    )
    await db.commit()
    return {"status": "success"}
