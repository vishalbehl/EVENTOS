from sqlalchemy.ext.asyncio import AsyncSession
from .repository import EventsRepository
from .models import NotificationEvent
import uuid

class EventsService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = EventsRepository(db)

    async def register_event(self, event_key: str, name: str, description: str, module: str, is_system: bool = False) -> NotificationEvent:
        existing = await self.repo.get_by_key(event_key)
        if existing:
            return existing
        evt = NotificationEvent(
            event_key=event_key,
            name=name,
            description=description,
            module=module,
            is_system=is_system
        )
        return await self.repo.create(evt)

    async def get_event(self, id: uuid.UUID) -> NotificationEvent:
        return await self.repo.get_by_id(id)

    async def get_event_by_key(self, event_key: str) -> NotificationEvent:
        return await self.repo.get_by_key(event_key)

    async def list_events(self) -> list[NotificationEvent]:
        return await self.repo.list_all()
