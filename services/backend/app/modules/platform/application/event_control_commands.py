"""Transaction-owning event operational-control commands."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.cache import invalidate_event
from app.core.concurrency import raise_version_conflict
from app.core.dependencies.feature_gate import enforce_event_operation
from app.modules.audit.models.audit_log import AuditLog
from app.modules.events.models.event import Event


class EventOperationalControlCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def update(self, *, organization_id, event_id, actor, is_maintenance: bool | None,
                     is_read_only: bool | None, reason: str, case_reference: str,
                     expected_version: int | None = None) -> dict:
        try:
            await enforce_event_operation(
                self.db, organization_id, event_id, "events.planning.manage",
                user_id=actor.id,
            )
            event = await self.db.scalar(select(Event).options(
                selectinload(Event.portal_theme_setting)
            ).where(
                Event.id == event_id,
                Event.organization_id == organization_id,
            ).with_for_update())
            if event is None:
                raise HTTPException(status_code=404, detail="Event not found")
            current_version = int(event.version or 1)
            if expected_version is not None and current_version != expected_version:
                raise_version_conflict(current_version)

            old_state = {
                "is_maintenance": event.is_maintenance,
                "is_read_only": event.is_read_only,
                "version": current_version,
            }
            if is_maintenance is not None:
                event.is_maintenance = is_maintenance
            if is_read_only is not None:
                event.is_read_only = is_read_only
            event.version = current_version + 1
            new_state = {
                "is_maintenance": event.is_maintenance,
                "is_read_only": event.is_read_only,
                "version": event.version,
                "reason": reason,
                "case_reference": case_reference,
            }
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="event",
                resource_id=event.id, action_type="EVENT_OPERATIONAL_CONTROLS_UPDATED",
                old_state=old_state, new_state=new_state, is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(event)
            await invalidate_event(organization_id, event_id)
            return {"id": event.id, **new_state}
        except Exception:
            await self.db.rollback()
            raise
