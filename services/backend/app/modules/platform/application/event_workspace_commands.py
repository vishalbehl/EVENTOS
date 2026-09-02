"""Transaction boundary for organization-console event workspace mutations."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_event


class EventWorkspaceCommandService:
    """Own the commit boundary for the event workspace command family.

    Resource-specific mutation services prepare changes and audits in the
    caller's session.  This service keeps the final persistence and cache
    invalidation behavior consistent while the routes are migrated gradually.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def commit(self, *, organization_id, event_id) -> None:
        try:
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        await invalidate_event(organization_id, event_id)

    async def rollback(self) -> None:
        await self.db.rollback()
