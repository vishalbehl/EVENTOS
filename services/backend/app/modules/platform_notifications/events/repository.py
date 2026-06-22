from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
from .models import NotificationEvent

class EventsRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, id: uuid.UUID) -> NotificationEvent:
        res = await self.db.execute(select(NotificationEvent).where(NotificationEvent.id == id))
        return res.scalar_one_or_none()

    async def get_by_key(self, event_key: str) -> NotificationEvent:
        res = await self.db.execute(select(NotificationEvent).where(NotificationEvent.event_key == event_key))
        return res.scalar_one_or_none()

    async def list_all(self) -> list[NotificationEvent]:
        res = await self.db.execute(select(NotificationEvent))
        return list(res.scalars().all())

    async def create(self, event: NotificationEvent) -> NotificationEvent:
        self.db.add(event)
        await self.db.flush()
        return event
