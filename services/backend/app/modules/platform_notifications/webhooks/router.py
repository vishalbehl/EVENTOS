from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from .dependencies import get_db
from .service import WebhooksService
import uuid

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

@router.post("")
async def register_webhook(org_id: uuid.UUID, name: str, url: str, secret: str, events: list[str], db: AsyncSession = Depends(get_db)):
    srv = WebhooksService(db)
    wh = await srv.register_webhook(org_id, name, url, secret, events)
    await db.commit()
    return wh

@router.get("")
async def list_active_webhooks(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    srv = WebhooksService(db)
    return await srv.get_active_webhooks(org_id)
