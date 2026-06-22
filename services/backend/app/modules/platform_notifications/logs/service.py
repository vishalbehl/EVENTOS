from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
from .models import NotificationLog

class LogsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def log_delivery(self, notif_id: uuid.UUID, channel: str, status: str, provider: str, payload: dict, response: dict = None) -> NotificationLog:
        log = NotificationLog(
            notification_id=notif_id,
            channel=channel,
            status=status,
            provider=provider,
            payload=payload,
            response=response
        )
        self.db.add(log)
        await self.db.flush()
        return log

    async def list_logs(self, limit: int = 100) -> list[NotificationLog]:
        res = await self.db.execute(select(NotificationLog).order_by(NotificationLog.created_at.desc()).limit(limit))
        return list(res.scalars().all())
