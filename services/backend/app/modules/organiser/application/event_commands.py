"""Transaction-owning organizer event commands."""

from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.modules.audit.models.audit_log import AuditLog
from app.modules.events.models.event import Event
from app.modules.events.services.event_mutation_service import EventMutationService
from app.modules.rbac.schemas.event import EventCreate


class OrganizerEventCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def duplicate(self, *, organization_id, event_id: uuid.UUID, actor, name: str | None,
                        short_code: str | None, idempotency_key: str) -> dict:
        try:
            source = await self.db.scalar(select(Event).where(
                Event.id == event_id,
                Event.organization_id == organization_id,
                Event.deleted_at.is_(None),
            ).with_for_update(of=Event))
            if source is None:
                raise HTTPException(status_code=404, detail="Event not found")
            replay = await self.db.scalar(select(AuditLog).where(
                AuditLog.organization_id == organization_id,
                AuditLog.action_type == "EVENT_DUPLICATED",
                AuditLog.new_state["idempotency_key"].astext == idempotency_key,
            ))
            if replay:
                row = await self.db.get(Event, replay.resource_id)
                if row:
                    return self._view(row)
            code = short_code or f"{source.short_code[:13]}-{uuid.uuid4().hex[:6].upper()}"
            payload = EventCreate(
                name=name or f"{source.name} Copy", short_code=code, status="draft",
                location=source.location, venue_name=source.venue_name, country=source.country,
                state=source.state, organizer_name=source.organizer_name,
                organizer_details=source.organizer_details, start_date=source.start_date,
                end_date=source.end_date, timezone=source.timezone,
                upload_deadline=source.upload_deadline, max_file_size_mb=source.max_file_size_mb,
                allowed_formats=source.allowed_formats, currency=source.currency,
                tagline=source.tagline, description=source.description, map_link=source.map_link,
                venue_images=source.venue_images, venue_details=source.venue_details,
                speaker_settings=source.speaker_settings,
                registration_settings=source.registration_settings,
                branding_settings=source.branding_settings,
            )
            row = await EventMutationService.create(
                self.db, organization_id=organization_id, actor_user_id=actor.id,
                payload=payload, idempotency_key=idempotency_key,
                source="organizer_portal_duplicate",
            )
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id, actor_role=actor.role,
                resource_type="event", resource_id=row.id, action_type="EVENT_DUPLICATED",
                old_state={"source_event_id": str(source.id)},
                new_state={"name": row.name, "short_code": row.short_code,
                           "idempotency_key": idempotency_key},
                is_sensitive=False,
            ))
            await self.db.commit()
            await invalidate_organization(organization_id)
            return self._view(row)
        except Exception:
            await self.db.rollback()
            raise

    async def restore(self, *, organization_id, event_id: uuid.UUID, actor, reason: str,
                      idempotency_key: str) -> dict:
        try:
            event = await self.db.scalar(select(Event).where(
                Event.id == event_id,
                Event.organization_id == organization_id,
            ).execution_options(include_deleted=True).with_for_update(of=Event))
            if event is None:
                raise HTTPException(status_code=404, detail="Event not found")
            replay = await self.db.scalar(select(AuditLog).where(
                AuditLog.organization_id == organization_id,
                AuditLog.resource_type == "event",
                AuditLog.resource_id == event.id,
                AuditLog.action_type == "EVENT_RESTORED",
                AuditLog.new_state["idempotency_key"].astext == idempotency_key,
            ))
            if replay:
                return {"id": str(event.id), "status": event.status, "restored": event.deleted_at is None}
            if event.deleted_at is None and event.status != "archived":
                raise HTTPException(status_code=409, detail={
                    "code": "EVENT_NOT_ARCHIVED",
                    "message": "Only archived events can be restored.",
                })
            previous = {"status": event.status, "deleted_at": event.deleted_at.isoformat() if event.deleted_at else None}
            event.deleted_at = None
            event.deleted_by = None
            event.status = "draft"
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id, actor_role=actor.role,
                resource_type="event", resource_id=event.id, action_type="EVENT_RESTORED",
                old_state=previous,
                new_state={"status": "draft", "deleted_at": None, "reason": reason,
                           "idempotency_key": idempotency_key},
                is_sensitive=True,
            ))
            await self.db.commit()
            await invalidate_organization(organization_id)
            return {"id": str(event.id), "status": event.status, "restored": True}
        except Exception:
            await self.db.rollback()
            raise

    @staticmethod
    def _view(row: Event) -> dict:
        return {"id": str(row.id), "name": row.name, "short_code": row.short_code, "status": row.status}
