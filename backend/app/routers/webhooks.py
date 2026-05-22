# backend/app/routers/webhooks.py
from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone
from typing import List

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user, get_current_event, CurrentEvent
from app.models.user import User
from app.models.webhook import Webhook, WEBHOOK_EVENT_TYPES
from app.schemas.webhook import (
    WebhookCreate, WebhookUpdate, WebhookResponse,
    WebhookCreateResponse, WebhookDeliverRequest, WebhookDeliveryResult,
)
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/events/{event_id}/webhooks", tags=["webhooks"])


# ── CRUD ──────────────────────────────────────────────────────

@router.get("", response_model=List[WebhookResponse])
async def list_webhooks(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> List[WebhookResponse]:
    """List all registered webhook endpoints for this event."""
    result = await db.execute(
        select(Webhook)
        .where(Webhook.event_id == event.id)
        .order_by(Webhook.created_at.desc())
    )
    return [WebhookResponse.model_validate(w) for w in result.scalars().all()]


@router.post("", response_model=WebhookCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_webhook(
    payload: WebhookCreate,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> WebhookCreateResponse:
    """
    Register a new webhook. The plain-text secret is returned exactly once
    and then never stored again. Save it securely.
    """
    # Check for duplicate URL on same event
    dup = await db.execute(
        select(Webhook).where(Webhook.event_id == event.id, Webhook.url == payload.url)
    )
    if dup.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A webhook with this URL already exists for this event.",
        )

    plain_secret = payload.secret
    secret_hash = hashlib.sha256(plain_secret.encode()).hexdigest() if plain_secret else None

    wh = Webhook(
        event_id=event.id,
        url=payload.url,
        description=payload.description,
        subscribed_events=payload.subscribed_events,
        secret_hash=secret_hash,
        status="active",
    )
    db.add(wh)
    await db.commit()
    await db.refresh(wh)

    response = WebhookCreateResponse.model_validate(wh)
    response.secret = plain_secret  # One-time reveal
    return response


@router.get("/{webhook_id}", response_model=WebhookResponse)
async def get_webhook(
    webhook_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> WebhookResponse:
    wh = await _get_webhook_or_404(db, webhook_id, event.id)
    return WebhookResponse.model_validate(wh)


@router.patch("/{webhook_id}", response_model=WebhookResponse)
async def update_webhook(
    webhook_id: uuid.UUID,
    payload: WebhookUpdate,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> WebhookResponse:
    """Update URL, subscribed events, or pause/resume a webhook."""
    wh = await _get_webhook_or_404(db, webhook_id, event.id)
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(wh, field, value)
    # If re-activating after failure, reset counter
    if payload.status == "active":
        wh.consecutive_failures = 0
        wh.last_failure_reason = None
    wh.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(wh)
    return WebhookResponse.model_validate(wh)


@router.delete("/{webhook_id}", response_model=MessageResponse)
async def delete_webhook(
    webhook_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    wh = await _get_webhook_or_404(db, webhook_id, event.id)
    await db.delete(wh)
    await db.commit()
    return MessageResponse(message="Webhook deleted.")


# ── Test delivery ─────────────────────────────────────────────

@router.post("/{webhook_id}/test", response_model=WebhookDeliveryResult)
async def test_webhook(
    webhook_id: uuid.UUID,
    payload: WebhookDeliverRequest,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> WebhookDeliveryResult:
    """
    Send a test delivery to verify the endpoint is reachable.
    Does NOT count toward failure tracking.
    """
    wh = await _get_webhook_or_404(db, webhook_id, event.id)
    test_payload = {
        "event_type": payload.event_type,
        "test": True,
        "event_id": str(event.id),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    return await _deliver(wh, payload.event_type, test_payload, is_test=True)


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
    for wh in webhooks:
        try:
            await _deliver(wh, event_type, payload)
        except Exception:
            pass  # Already handled inside _deliver
    await db.commit()


# ── Helper ────────────────────────────────────────────────────

async def _get_webhook_or_404(
    db: AsyncSession, webhook_id: uuid.UUID, event_id: uuid.UUID
) -> Webhook:
    result = await db.execute(
        select(Webhook).where(Webhook.id == webhook_id, Webhook.event_id == event_id)
    )
    wh = result.scalar_one_or_none()
    if wh is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Webhook not found.")
    return wh
