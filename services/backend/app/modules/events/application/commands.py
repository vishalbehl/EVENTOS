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
        """Publish an event only after its paid Event plan has activated."""
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
            from app.modules.billing.models.event_activation import EventActivation

            activation_id = await db.scalar(
                select(EventActivation.id)
                .where(
                    EventActivation.organization_id == event.organization_id,
                    EventActivation.event_id == event.id,
                    EventActivation.status == "ACTIVE",
                )
                .limit(1)
            )
            if activation_id is None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={"code": "EVENT_PLAN_ACTIVATION_REQUIRED"},
                )
            if event.status not in {"draft", "active"}:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Event is '{event.status}', not 'draft'.",
                )
            if event.status == "draft":
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
        expected_version: int,
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
                    "expected_version": expected_version,
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

            locked_event = await db.scalar(select(Event).where(
                Event.id == event.id,
                Event.organization_id == event.organization_id,
            ).with_for_update())
            if locked_event is None:
                raise HTTPException(status_code=404, detail={"code": "EVENT_NOT_FOUND"})
            event = locked_event
            if event.version != expected_version:
                raise HTTPException(status_code=412, detail={
                    "code": "STALE_VERSION", "current_version": event.version,
                    "message": "This event changed. Reload before archiving it.",
                })

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
            # Re-authorise before a retry receipt can return an existing event.
            await EventMutationService.authorize_creation(db, organization_id=organization_id,
                payload=payload, actor_user_id=actor_user_id)
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
    ) -> tuple[EventResponse, dict[str, Any], list[str]]:
        # Enforce at the command boundary too; internal callers cannot opt out.
        from app.core.concurrency import require_if_match
        expected_version = require_if_match(expected_version)
        if not idempotency_key:
            raise HTTPException(428, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
        if not 16 <= len(idempotency_key.strip()) <= 160:
            raise HTTPException(400, detail={"code": "INVALID_IDEMPOTENCY_KEY"})
        try:
            # Authorise before reading any receipt: an old key is not authority.
            await EventMutationService.authorize_update(db, event=event, payload=payload,
                actor_user_id=actor_user_id)
            organization_id, event_id = event.organization_id, event.id
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
                        "payload": payload.model_dump(mode="json", exclude_unset=True),
                        "expected_version": expected_version,
                    },
                )
                replay = replay_response(idem)
                if replay is not None:
                    response = EventResponse.model_validate(replay[1])
                    if response.id != event_id or response.organization_id != organization_id:
                        raise RuntimeError("Event receipt does not match the requested resource.")
                    await db.commit()
                    return response, {}, []

            updated, old_state, changed_fields = await EventMutationService.update(
                db,
                event=event,
                payload=payload,
                actor_user_id=actor_user_id,
                expected_version=expected_version,
            )
            selector = db.info.get("customer_request_selector")
            db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor_user_id,
                resource_type="event", resource_id=event_id,
                action_type="EVENT_SETTINGS_UPDATED", is_sensitive=True,
                old_state={"version": int(updated.version) - 1},
                new_state={"changed_fields": changed_fields, "version": int(updated.version),
                    "workspace_id": str(updated.operational_workspace_id),
                    "target_organization_id": str(organization_id),
                    "acting_organization_id": str(getattr(selector, "acting_organization_id", None) or organization_id),
                    "access_mode": getattr(selector, "access_mode", "DIRECT")},
            ))
            response = EventResponse.model_validate(updated)
            if idem is not None:
                await complete_idempotent(
                    db,
                    idem,
                    response_status=200,
                    response_body=response.model_dump(mode="json"),
                    resource_id=updated.id,
                )
            await db.commit()
        except Exception:
            await db.rollback()
            raise
        await cache_service.invalidate_event(organization_id, event_id)
        return response, old_state, changed_fields
