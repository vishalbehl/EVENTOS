from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
from datetime import datetime
from .models import SystemAnnouncement

class AnnouncementsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_announcement(self, org_id: uuid.UUID | None, title: str, message: str, type: str = "INFO", target_roles: list = None, target_departments: list = None, expires_at: datetime = None) -> SystemAnnouncement:
        ann = SystemAnnouncement(
            organization_id=org_id,
            title=title,
            message=message,
            type=type,
            target_roles=target_roles or [],
            target_departments=target_departments or [],
            expires_at=expires_at
        )
        self.db.add(ann)
        await self.db.flush()
        return ann

    async def get_active_announcements(self, org_id: uuid.UUID | None) -> list[SystemAnnouncement]:
        now = datetime.utcnow()
        query = select(SystemAnnouncement).where(SystemAnnouncement.starts_at <= now)
        if org_id:
            query = query.where((SystemAnnouncement.organization_id == org_id) | (SystemAnnouncement.organization_id.is_(None)))
        else:
            query = query.where(SystemAnnouncement.organization_id.is_(None))
        res = await self.db.execute(query)
        active = []
        for ann in res.scalars().all():
            if not ann.expires_at or ann.expires_at > now:
                active.append(ann)
        return active
