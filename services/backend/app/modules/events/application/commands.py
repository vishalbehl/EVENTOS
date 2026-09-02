from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache_service
from app.core.idempotency_service import (
    begin_idempotent,
    complete_idempotent,
    replay_response,
)
from app.modules.events.models.event import Event
from app.modules.events.services.event_mutation_service import EventMutationService
from app.modules.rbac.schemas.event import EventCreate, EventResponse, EventUpdate
from app.modules.audit.models.audit_log import AuditLog


class EventCommandService:
    """Own event command transactions and post-commit cache invalidation."""

    @staticmethod
    async def publish(
        db: AsyncSession,
        *,
        event: Event,
        actor_user_id: uuid.UUID,
        idempotency_key: str | None = None,
    ) -> Event:
        """Publish a draft event with one application-owned transaction."""
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(
                    db,
                    organization_id=event.organization_id,
                    actor_id=actor_user_id,
                    operation="events.publish",
                    key=idempotency_key,
                    payload={"event_id": str(event.id)},
                )
                replay = replay_response(idem)
                if replay is not None:
                    existing = await db.scalar(
                        select(Event).where(
                            Event.id == event.id,
                            Event.organization_id == event.organization_id,
                        )
                    )
                    if existing is None:
                        raise RuntimeError("Completed event idempotency resource is missing.")
                    await db.commit()
                    return existing
            if event.status != "draft":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Event is '{event.status}', not 'draft'.",
                )
            event.status = "active"
            event.updated_by = actor_user_id
            event.version = int(event.version or 1) + 1
            if idem is not None:
                response = EventResponse.model_validate(event)
                await complete_idempotent(
                    db,
                    idem,
                    response_status=200,
                    response_body=response.model_dump(mode="json"),
                    resource_id=event.id,
                )
            await db.commit()
            await db.refresh(event)
            await cache_service.invalidate_event(event.organization_id, event.id)
            return event
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def archive(
        db: AsyncSession,
        *,
        event: Event,
        actor_user_id: uuid.UUID,
        actor_role: str | None = None,
        reason: str,
        idempotency_key: str,
    ) -> Event:
        """Archive an event and deactivate any live commercial activation atomically."""
        try:
            idem = await begin_idempotent(
                db,
                organization_id=event.organization_id,
                actor_id=actor_user_id,
                operation="events.archive",
                key=idempotency_key,
                payload={
                    "event_id": str(event.id),
                    "reason": reason,
                },
            )
            replay = replay_response(idem)
            if replay is not None:
                existing = await db.scalar(
                    select(Event).where(
                        Event.id == event.id,
                        Event.organization_id == event.organization_id,
                    )
                )
                if existing is None:
                    raise RuntimeError("Completed event idempotency resource is missing.")
                await db.commit()
                return existing

            if event.deleted_at is not None:
                await complete_idempotent(
                    db,
                    idem,
                    response_status=200,
                    response_body={
                        "message": "Event is already archived for recovery."
                    },
                    resource_id=event.id,
                )
                await db.commit()
                return event

            from app.modules.billing.models.event_activation import EventActivation
            from app.modules.billing.services.activation_service import ActivationService

            activation = await db.scalar(
                select(EventActivation).where(
                    EventActivation.event_id == event.id,
                    EventActivation.organization_id == event.organization_id,
                    EventActivation.status.in_(ActivationService.LIVE_STATUSES),
                )
            )
            if activation:
                await ActivationService.deactivate_event(
                    db,
                    organization_id=event.organization_id,
                    event_id=event.id,
                    idempotency_key=f"soft-delete:{idempotency_key}",
                    actor_id=actor_user_id,
                )

            now = datetime.now(timezone.utc)
            previous_status = event.status
            event.status = "archived"
            event.deleted_at = now
            event.deleted_by = actor_user_id
            event.updated_by = actor_user_id
            event.version = int(event.version or 1) + 1
            db.add(
                AuditLog(
                    organization_id=event.organization_id,
                    actor_user_id=actor_user_id,
                    actor_role=actor_role,
                    action_type="EVENT_SOFT_DELETED",
                    resource_type="event",
                    resource_id=event.id,
                    old_state={"status": previous_status, "deleted_at": None},
                    new_state={
                        "status": event.status,
                        "deleted_at": now.isoformat(),
                        "idempotency_key": idempotency_key,
                        "reason": reason,
                    },
                    is_sensitive=True,
                )
            )
            await complete_idempotent(
                db,
                idem,
                response_status=200,
                response_body={
                    "message": "Event archived. It remains recoverable until its retention window expires."
                },
                resource_id=event.id,
            )
            await db.commit()
            await db.refresh(event)
            await cache_service.invalidate_event(event.organization_id, event.id)
            return event
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def create(
        db: AsyncSession,
        *,
        organization_id: uuid.UUID,
        payload: EventCreate,
        actor_user_id: uuid.UUID,
        idempotency_key: str,
        source: str,
    ) -> Event:
        try:
            idem = await begin_idempotent(
                db,
                organization_id=organization_id,
                actor_id=actor_user_id,
                operation="events.create",
                key=idempotency_key,
                payload=payload.model_dump(mode="json"),
            )
            replay = replay_response(idem)
            if replay is not None:
                if idem.resource_id is None:
                    raise RuntimeError("Completed event idempotency record has no resource.")
                existing = await db.scalar(
                    select(Event).where(
                        Event.id == idem.resource_id,
                        Event.organization_id == organization_id,
                    )
                )
                if existing is None:
                    raise RuntimeError("Completed event idempotency resource is missing.")
                return existing

            event = await EventMutationService.create(
                db,
                organization_id=organization_id,
                actor_user_id=actor_user_id,
                payload=payload,
                idempotency_key=idempotency_key,
                source=source,
            )
            response = EventResponse.model_validate(event)
            await complete_idempotent(
                db,
                idem,
                response_status=201,
                response_body=response.model_dump(mode="json"),
                resource_id=event.id,
            )
            await db.commit()
            await db.refresh(event)
            await cache_service.invalidate_event(event.organization_id, event.id)
            return event
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    async def update(
        db: AsyncSession,
        *,
        event: Event,
        payload: EventUpdate,
        actor_user_id: uuid.UUID,
        expected_version: int | None = None,
        idempotency_key: str | None = None,
    ) -> tuple[Event, dict[str, Any], list[str]]:
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(
                    db,
                    organization_id=event.organization_id,
                    actor_id=actor_user_id,
                    operation="events.update",
                    key=idempotency_key,
                    payload={
                        "event_id": str(event.id),
                        "payload": payload.model_dump(mode="json"),
                        "expected_version": expected_version,
                    },
                )
                replay = replay_response(idem)
                if replay is not None:
                    if idem.resource_id is None:
                        raise RuntimeError("Completed event idempotency record has no resource.")
                    existing = await db.scalar(
                        select(Event).where(
                            Event.id == idem.resource_id,
                            Event.organization_id == event.organization_id,
                        )
                    )
                    if existing is None:
                        raise RuntimeError("Completed event idempotency resource is missing.")
                    await db.commit()
                    await db.refresh(existing)
                    return existing, {}, []

            updated, old_state, changed_fields = await EventMutationService.update(
                db,
                event=event,
                payload=payload,
                actor_user_id=actor_user_id,
                expected_version=expected_version,
            )
            if idem is not None:
                response = EventResponse.model_validate(updated)
                await complete_idempotent(
                    db,
                    idem,
                    response_status=200,
                    response_body=response.model_dump(mode="json"),
                    resource_id=updated.id,
                )
            await db.commit()
            await db.refresh(updated)
            await cache_service.invalidate_event(updated.organization_id, updated.id)
            return updated, old_state, changed_fields
        except Exception:
            await db.rollback()
            raise
