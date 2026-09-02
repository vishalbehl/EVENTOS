# backend/app/routers/webhooks.py
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import List

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user, get_current_event, CurrentEvent
from app.modules.identity.models.user import User
from app.modules.integrations.models.webhook import Webhook, WebhookMutation, WEBHOOK_EVENT_TYPES
from app.modules.notifications.schemas.webhook import (
    WebhookCreate, WebhookUpdate, WebhookResponse,
    WebhookCreateResponse, WebhookDeliverRequest, WebhookDeliveryResult,
)
from app.schemas.common import MessageResponse
from app.modules.platform.services.metering_service import MeteringService
from app.modules.events.models.event import Event
from app.core.dependencies.feature_gate import require_event_operation
from app.modules.billing.services.usage_reservation_service import UsageReservationService
from app.modules.audit.models.audit_log import AuditLog
from app.modules.notifications.application.commands import WebhookCommandService
from app.modules.notifications.application.queries import WebhookQueryService

router = APIRouter(prefix="/events/{event_id}/webhooks", tags=["webhooks"], dependencies=[require_event_operation("developer.webhooks.manage")])


def _request_hash(operation: str, payload: dict) -> str:
    return hashlib.sha256(
        json.dumps({"operation": operation, "payload": payload}, sort_keys=True, separators=(",", ":"), default=str).encode()
    ).hexdigest()


async def _mutation_replay(
    db: AsyncSession,
    event: CurrentEvent,
    idempotency_key: str,
    request_hash: str,
) -> WebhookMutation | None:
    existing = await db.scalar(
        select(WebhookMutation).where(
            WebhookMutation.organization_id == event.organization_id,
            WebhookMutation.idempotency_key == idempotency_key,
        )
    )
    if existing and existing.request_hash != request_hash:
        raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT"})
    return existing


def _audit(actor: User, event: CurrentEvent, webhook_id: uuid.UUID, action: str, state: dict) -> AuditLog:
    return AuditLog(
        organization_id=event.organization_id,
        actor_user_id=actor.id,
        actor_role=actor.platform_role or actor.role,
        resource_type="webhook",
        resource_id=webhook_id,
        action_type=action,
        new_state=state,
        is_sensitive=True,
    )


# ── CRUD ──────────────────────────────────────────────────────

@router.get("", response_model=List[WebhookResponse])
async def list_webhooks(
    event: CurrentEvent,
    limit: int = Query(100, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> List[WebhookResponse]:
    """List all registered webhook endpoints for this event."""
    return await WebhookQueryService(db).list_for_event(event.id, limit=limit)


@router.post("", response_model=WebhookCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_webhook(
    payload: WebhookCreate,
    event: CurrentEvent,
    actor: User = Depends(get_current_user),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db),
) -> WebhookCreateResponse:
    """
    Register a new webhook. The plain-text secret is returned exactly once
    and then never stored again. Save it securely.
    """
    return await WebhookCommandService.create(
        db, event=event, actor=actor, payload=payload, idempotency_key=idempotency_key
    )


@router.get("/{webhook_id}", response_model=WebhookResponse)
async def get_webhook(
    webhook_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> WebhookResponse:
    webhook = await WebhookQueryService(db).get_for_event(event.id, webhook_id)
    if webhook is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found.")
    return webhook


@router.patch("/{webhook_id}", response_model=WebhookResponse)
async def update_webhook(
    webhook_id: uuid.UUID,
    payload: WebhookUpdate,
    event: CurrentEvent,
    actor: User = Depends(get_current_user),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    if_match: int = Header(..., alias="If-Match", ge=1),
    db: AsyncSession = Depends(get_db),
) -> WebhookResponse:
    """Update URL, subscribed events, or pause/resume a webhook."""
    return await WebhookCommandService.update(
        db,
        event=event,
        actor=actor,
        webhook_id=webhook_id,
        payload=payload,
        idempotency_key=idempotency_key,
        expected_version=if_match,
    )


@router.delete("/{webhook_id}", response_model=MessageResponse)
async def delete_webhook(
    webhook_id: uuid.UUID,
    event: CurrentEvent,
    actor: User = Depends(get_current_user),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    if_match: int = Header(..., alias="If-Match", ge=1),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    return await WebhookCommandService.archive(
        db,
        event=event,
        actor=actor,
        webhook_id=webhook_id,
        idempotency_key=idempotency_key,
        expected_version=if_match,
    )


# ── Test delivery ─────────────────────────────────────────────

@router.post("/{webhook_id}/test", response_model=WebhookDeliveryResult)
async def test_webhook(
    webhook_id: uuid.UUID,
    payload: WebhookDeliverRequest,
    event: CurrentEvent,
    actor: User = Depends(get_current_user),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    if_match: int = Header(..., alias="If-Match", ge=1),
    db: AsyncSession = Depends(get_db),
) -> WebhookDeliveryResult:
    """
    Send a test delivery to verify the endpoint is reachable.
    Does NOT count toward failure tracking.
    """
    fingerprint = _request_hash("TEST", {"webhook_id": str(webhook_id), "version": if_match, "event_type": payload.event_type})
    replay = await _mutation_replay(db, event, idempotency_key, fingerprint)
    if replay:
        return WebhookDeliveryResult.model_validate(replay.response_json)
    wh = await db.scalar(select(Webhook).where(Webhook.id == webhook_id, Webhook.event_id == event.id).with_for_update())
    if wh is None:
        raise HTTPException(status_code=404, detail="Webhook not found.")
    if wh.version != if_match:
        raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "current_version": wh.version})
    test_payload = {
        "event_type": payload.event_type,
        "test": True,
        "event_id": str(event.id),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    response = await _deliver(wh, payload.event_type, test_payload, is_test=True)
    db.add(WebhookMutation(
        organization_id=event.organization_id, event_id=event.id, webhook_id=wh.id,
        operation_type="TEST", idempotency_key=idempotency_key, request_hash=fingerprint,
        response_json=response.model_dump(mode="json"), requested_by=actor.id,
    ))
    db.add(_audit(actor, event, wh.id, "WEBHOOK_TESTED", {
        "event_type": payload.event_type, "success": response.success, "status_code": response.status_code,
    }))
    await db.commit()
    return response


# ── Internal delivery utility ─────────────────────────────────

async def _deliver(
    wh: Webhook,
    event_type: str,
    body: dict,
    is_test: bool = False,
) -> WebhookDeliveryResult:
    import json
    body_json = json.dumps(body)

    headers = {
        "Content-Type": "application/json",
        "X-Conference-Event": event_type,
        "X-Conference-Delivery": str(uuid.uuid4()),
    }
    if wh.secret_hash:
        import hmac as _hmac
        sig = _hmac.new(
            wh.secret_hash.encode(),
            body_json.encode(),
            "sha256",
        ).hexdigest()
        headers["X-Conference-Signature"] = f"sha256={sig}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(wh.url, content=body_json, headers=headers)
        if resp.is_success:
            if not is_test:
                wh.record_success()
            return WebhookDeliveryResult(
                webhook_id=wh.id, event_type=event_type,
                success=True, status_code=resp.status_code,
            )
        else:
            reason = f"HTTP {resp.status_code}: {resp.text[:200]}"
            if not is_test:
                wh.record_failure(reason)
            return WebhookDeliveryResult(
                webhook_id=wh.id, event_type=event_type,
                success=False, status_code=resp.status_code, error=reason,
            )
    except Exception as exc:
        reason = str(exc)[:300]
        if not is_test:
            wh.record_failure(reason)
        return WebhookDeliveryResult(
            webhook_id=wh.id, event_type=event_type,
            success=False, error=reason,
        )


# ── Internal helper: dispatch to all matching webhooks ────────

async def dispatch_webhook_event(
    db: AsyncSession,
    event_id: uuid.UUID,
    event_type: str,
    payload: dict,
) -> None:
    """
    Called from other services (file approved, speaker checked in, etc.)
    Finds all active webhooks subscribed to `event_type` and delivers.
    Fire-and-forget pattern: failures are logged but never raised.
    """
    result = await db.execute(
        select(Webhook).where(
            Webhook.event_id == event_id,
            Webhook.status == "active",
            Webhook.subscribed_events.any(event_type),  # PostgreSQL array containment
        )
    )
    webhooks = result.scalars().all()
    event = await db.scalar(select(Event).where(Event.id == event_id))
    if not event:
        return
    for wh in webhooks:
        delivery_id = uuid.uuid4()
        reservation = None
        try:
            reservation = await UsageReservationService.reserve(
                db,
                organization_id=event.organization_id,
                event_id=event_id,
                limit_key="max_webhook_deliveries_per_month",
                quantity=1,
                unit="delivery",
                idempotency_key=f"webhook-delivery:{delivery_id}",
                metadata={"webhook_id": str(wh.id), "event_type": event_type},
            )
            outcome = await _deliver(wh, event_type, payload)
            counter = wh.total_deliveries if outcome.success else wh.total_failures
            await UsageReservationService.consume(
                db, reservation.id, source="notifications.webhook_dispatch"
            )
            if not outcome.success:
                await MeteringService.record(db, organization_id=event.organization_id, event_id=event_id, metric_key="webhook_failures", quantity=1, unit="delivery", source="notifications.webhook_dispatch", idempotency_key=f"webhook-failure:{wh.id}:{counter}", metadata={"webhook_id": str(wh.id), "event_type": event_type, "status_code": outcome.status_code})
        except Exception:
            if reservation and reservation.status == "RESERVED":
                await UsageReservationService.release(db, reservation.id)
    await db.commit()


# ── Helper ────────────────────────────────────────────────────

async def _get_webhook_or_404(
    db: AsyncSession, webhook_id: uuid.UUID, event_id: uuid.UUID
) -> Webhook:
    result = await db.execute(
        select(Webhook).where(Webhook.id == webhook_id, Webhook.event_id == event_id, Webhook.status != "paused")
    )
    wh = result.scalar_one_or_none()
    if wh is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found.")
    return wh
