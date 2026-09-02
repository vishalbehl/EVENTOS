"""Shared transaction boundary for platform governance mutations."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_event, invalidate_organization


class GovernedMutationCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def commit(self, *, organization_id, event_id=None) -> None:
        try:
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        if event_id is not None:
            await invalidate_event(organization_id, event_id)
        else:
            await invalidate_organization(organization_id)


async def commit_transaction(db: AsyncSession, *, organization_id=None, event_id=None) -> None:
    """Commit a domain command without exposing session ownership to routers."""
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    if organization_id is not None:
        if event_id is not None:
            await invalidate_event(organization_id, event_id)
        else:
            await invalidate_organization(organization_id)
