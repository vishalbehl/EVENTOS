from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
from datetime import datetime
from .models import NotificationQueue

class QueueService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def push_to_queue(self, org_id: uuid.UUID, event_id: uuid.UUID, recipient_id: uuid.UUID, channel: str, payload: dict, template_id: uuid.UUID = None, scheduled_at: datetime = None, priority: int = 0) -> NotificationQueue:
        q_item = NotificationQueue(
            organization_id=org_id,
            notification_event_id=event_id,
            recipient_id=recipient_id,
            channel=channel,
            payload=payload,
            template_id=template_id,
            scheduled_at=scheduled_at,
            priority=priority,
            status="PENDING"
        )
        self.db.add(q_item)
        await self.db.flush()
        return q_item

    async def get_pending(self, limit: int = 100) -> list[NotificationQueue]:
        res = await self.db.execute(
            select(NotificationQueue)
            .where(NotificationQueue.status == "PENDING")
            .order_by(NotificationQueue.priority.desc(), NotificationQueue.created_at.asc())
            .limit(limit)
        )
        return list(res.scalars().all())
