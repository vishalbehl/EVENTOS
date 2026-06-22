from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
from .models import NotificationGroup, NotificationGroupMember, NotificationSubscription

class SubscriptionsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_group(self, org_id: uuid.UUID, name: str, description: str = None) -> NotificationGroup:
        grp = NotificationGroup(organization_id=org_id, name=name, description=description)
        self.db.add(grp)
        await self.db.flush()
        return grp

    async def add_member(self, group_id: uuid.UUID, user_id: uuid.UUID) -> NotificationGroupMember:
        member = NotificationGroupMember(group_id=group_id, user_id=user_id)
        self.db.add(member)
        await self.db.flush()
        return member

    async def subscribe(self, org_id: uuid.UUID, user_id: uuid.UUID, event_id: uuid.UUID) -> NotificationSubscription:
        sub = NotificationSubscription(organization_id=org_id, user_id=user_id, event_id=event_id, is_enabled=True)
        self.db.add(sub)
        await self.db.flush()
        return sub
