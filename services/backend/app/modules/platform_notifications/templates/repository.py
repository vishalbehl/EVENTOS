from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
from .models import NotificationTemplate

class TemplatesRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, id: uuid.UUID) -> NotificationTemplate:
        res = await self.db.execute(select(NotificationTemplate).where(NotificationTemplate.id == id))
        return res.scalar_one_or_none()

    async def list_for_event(self, event_id: uuid.UUID) -> list[NotificationTemplate]:
        res = await self.db.execute(select(NotificationTemplate).where(NotificationTemplate.event_id == event_id))
        return list(res.scalars().all())

    async def list_all(self, org_id: uuid.UUID = None) -> list[NotificationTemplate]:
        query = select(NotificationTemplate)
        if org_id is not None:
            query = query.where(NotificationTemplate.organization_id == org_id)
        res = await self.db.execute(query)
        return list(res.scalars().all())

    async def create(self, template: NotificationTemplate) -> NotificationTemplate:
        self.db.add(template)
        await self.db.flush()
        return template

    async def delete(self, template: NotificationTemplate) -> None:
        await self.db.delete(template)
        await self.db.flush()
