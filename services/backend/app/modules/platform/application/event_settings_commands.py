"""Transaction-owning event settings commands."""

from __future__ import annotations

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.cache import invalidate_event
from app.core.concurrency import raise_version_conflict
from app.modules.audit.models.audit_log import AuditLog
from app.modules.events.models.event import Event
from app.modules.events.services.event_mutation_service import EventMutationService
from app.modules.rbac.schemas.event import EventUpdate


class EventSettingsCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def update(self, *, organization_id, event_id, actor, payload: EventUpdate,
                     reason: str, case_reference: str,
                     expected_version: int | None = None) -> dict:
        try:
            event = await self.db.scalar(select(Event).options(
                selectinload(Event.portal_theme_setting)
            ).where(
                Event.id == event_id,
                Event.organization_id == organization_id,
            ).with_for_update())
            if event is None:
                raise HTTPException(status_code=404, detail={"code": "EVENT_NOT_FOUND"})
            current_version = int(event.version or 1)
            if expected_version is not None and current_version != expected_version:
                raise_version_conflict(current_version)

            event, old_state, changed_fields = await EventMutationService.update(
                self.db, event=event, payload=payload,
                actor_user_id=actor.id, expected_version=None,
            )
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="event", resource_id=event.id,
                action_type="EVENT_SETTINGS_UPDATED",
                new_state=jsonable_encoder({"changed_fields": changed_fields, "reason": reason,
                           "case_reference": case_reference,
                           "version": event.version}),
                old_state=jsonable_encoder(old_state), is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(event)
            await invalidate_event(organization_id, event_id)
            return {
                "id": event.id, "event_id": event.id,
                "updated": changed_fields, "updated_at": event.updated_at,
                "version": event.version,
            }
        except Exception:
            await self.db.rollback()
            raise
