"""Transaction-owned commands for organizer webhook configuration."""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_log import AuditLog
from app.modules.events.models.event import Event
from app.modules.integrations.models.webhook import Webhook, WebhookMutation
from app.modules.notifications.schemas.webhook import (
    WebhookCreate,
    WebhookCreateResponse,
    WebhookResponse,
    WebhookUpdate,
)


class WebhookCommandService:
    """Own webhook configuration transactions without HTTP routing concerns."""

    @staticmethod
    def _request_hash(operation: str, payload: dict) -> str:
        return hashlib.sha256(
            json.dumps(
                {"operation": operation, "payload": payload},
                sort_keys=True,
                separators=(",", ":"),
                default=str,
            ).encode("utf-8")
        ).hexdigest()

    @staticmethod
    def _audit(actor, event, webhook_id: uuid.UUID, action: str, state: dict) -> AuditLog:
        return AuditLog(
            organization_id=event.organization_id,
            actor_user_id=actor.id,
            actor_role=getattr(actor, "platform_role", None) or actor.role,
            resource_type="webhook",
            resource_id=webhook_id,
            action_type=action,
            new_state=state,
            is_sensitive=True,
        )

    @staticmethod
    async def _replay(db: AsyncSession, organization_id, key: str, request_hash: str):
        existing = await db.scalar(
            select(WebhookMutation)
            .where(
                WebhookMutation.organization_id == organization_id,
                WebhookMutation.idempotency_key == key,
            )
            .with_for_update()
        )
        if existing and existing.request_hash != request_hash:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "IDEMPOTENCY_CONFLICT"},
            )
        return existing

    @staticmethod
    def _webhook_response(row: Webhook) -> WebhookResponse:
        return WebhookResponse.model_validate(row)

    @classmethod
    async def create(cls, db: AsyncSession, *, event, actor, payload: WebhookCreate, idempotency_key: str):
        fingerprint = cls._request_hash("CREATE", payload.model_dump(mode="json"))
        try:
            async with TenantContextGuard.scoped(db, event.organization_id):
                replay = await cls._replay(db, event.organization_id, idempotency_key, fingerprint)
                if replay:
                    return WebhookCreateResponse.model_validate(replay.response_json)
                await db.scalar(select(Event.id).where(Event.id == event.id).with_for_update())
                duplicate = await db.scalar(
                    select(Webhook.id).where(
                        Webhook.event_id == event.id,
                        Webhook.url == payload.url,
                        Webhook.status != "paused",
                    )
                )
                if duplicate:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="A webhook with this URL already exists for this event.",
                    )
                plain_secret = payload.secret
                row = Webhook(
                    event_id=event.id,
                    url=payload.url,
                    description=payload.description,
                    subscribed_events=payload.subscribed_events,
                    secret_hash=hashlib.sha256(plain_secret.encode()).hexdigest() if plain_secret else None,
                    status="active",
                )
                db.add(row)
                await db.flush()
                response = WebhookCreateResponse.model_validate(row)
                response.secret = plain_secret
                replay_response = response.model_copy(update={"secret": None})
                db.add(WebhookMutation(
                    organization_id=event.organization_id,
                    event_id=event.id,
                    webhook_id=row.id,
                    operation_type="CREATE",
                    idempotency_key=idempotency_key,
                    request_hash=fingerprint,
                    response_json=replay_response.model_dump(mode="json"),
                    requested_by=actor.id,
                ))
                db.add(cls._audit(actor, event, row.id, "WEBHOOK_CREATED", {
                    "url": row.url,
                    "subscribed_events": row.subscribed_events,
                    "secret_configured": bool(row.secret_hash),
                    "version": row.version,
                }))
                await db.commit()
                return response
        except Exception:
            await db.rollback()
            raise

    @classmethod
    async def update(cls, db: AsyncSession, *, event, actor, webhook_id: uuid.UUID, payload: WebhookUpdate, idempotency_key: str, expected_version: int):
        fingerprint = cls._request_hash(
            "UPDATE",
            {"webhook_id": str(webhook_id), "version": expected_version, **payload.model_dump(mode="json", exclude_unset=True)},
        )
        try:
            async with TenantContextGuard.scoped(db, event.organization_id):
                replay = await cls._replay(db, event.organization_id, idempotency_key, fingerprint)
                if replay:
                    return WebhookResponse.model_validate(replay.response_json)
                row = await db.scalar(
                    select(Webhook).where(
                        Webhook.id == webhook_id,
                        Webhook.event_id == event.id,
                    ).with_for_update()
                )
                if row is None:
                    raise HTTPException(status_code=404, detail="Webhook not found.")
                if row.version != expected_version:
                    raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "current_version": row.version})
                old_state = {"url": row.url, "status": row.status, "subscribed_events": row.subscribed_events, "version": row.version}
                updates = payload.model_dump(exclude_unset=True)
                for field, value in updates.items():
                    setattr(row, field, value)
                if payload.status == "active":
                    row.consecutive_failures = 0
                    row.last_failure_reason = None
                row.updated_at = datetime.now(timezone.utc)
                row.version += 1
                await db.flush()
                response = cls._webhook_response(row)
                db.add(WebhookMutation(
                    organization_id=event.organization_id, event_id=event.id, webhook_id=row.id,
                    operation_type="UPDATE", idempotency_key=idempotency_key, request_hash=fingerprint,
                    response_json=response.model_dump(mode="json"), requested_by=actor.id,
                ))
                audit = cls._audit(actor, event, row.id, "WEBHOOK_UPDATED", {
                    "changed_fields": sorted(updates), "status": row.status, "version": row.version,
                })
                audit.old_state = old_state
                db.add(audit)
                await db.commit()
                return response
        except Exception:
            await db.rollback()
            raise

    @classmethod
    async def archive(cls, db: AsyncSession, *, event, actor, webhook_id: uuid.UUID, idempotency_key: str, expected_version: int):
        fingerprint = cls._request_hash("ARCHIVE", {"webhook_id": str(webhook_id), "version": expected_version})
        try:
            async with TenantContextGuard.scoped(db, event.organization_id):
                replay = await cls._replay(db, event.organization_id, idempotency_key, fingerprint)
                if replay:
                    from app.schemas.common import MessageResponse
                    return MessageResponse.model_validate(replay.response_json)
                row = await db.scalar(
                    select(Webhook).where(
                        Webhook.id == webhook_id,
                        Webhook.event_id == event.id,
                    ).with_for_update()
                )
                if row is None:
                    raise HTTPException(status_code=404, detail="Webhook not found.")
                if row.version != expected_version:
                    raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "current_version": row.version})
                row.status = "paused"
                row.updated_at = datetime.now(timezone.utc)
                row.version += 1
                from app.schemas.common import MessageResponse
                response = MessageResponse(message="Webhook paused and remains recoverable.")
                db.add(WebhookMutation(
                    organization_id=event.organization_id, event_id=event.id, webhook_id=row.id,
                    operation_type="ARCHIVE", idempotency_key=idempotency_key, request_hash=fingerprint,
                    response_json=response.model_dump(mode="json"), requested_by=actor.id,
                ))
                db.add(cls._audit(actor, event, row.id, "WEBHOOK_ARCHIVED", {"status": row.status, "version": row.version}))
                await db.commit()
                return response
        except Exception:
            await db.rollback()
            raise
