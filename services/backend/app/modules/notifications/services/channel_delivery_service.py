from __future__ import annotations

import hashlib
import hmac
import json
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.billing.services.usage_reservation_service import (
    UsageReservationService,
)
from app.modules.communications.models.channel_delivery import (
    CommunicationDelivery,
    CommunicationDeliveryBatch,
)
from app.modules.platform.models.organization_console import (
    OrganizationNotificationChannelConfig,
    UsageReservation,
)
from app.modules.notifications.services.channel_provider_service import (
    ChannelProviderError,
    ChannelProviderService,
)
from app.services.credential_cipher import cipher


_E164 = re.compile(r"^\+[1-9]\d{7,14}$")
_EXPO_TOKEN = re.compile(r"^(ExponentPushToken|ExpoPushToken)\[[^\]]{8,200}\]$")
_DELIVERY_CLAIM_LEASE = timedelta(minutes=5)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _recipient_hash(value: str) -> str:
    return hmac.new(
        settings.JWT_SECRET_KEY.encode("utf-8"),
        value.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _mask_recipient(channel: str, value: str) -> str:
    if channel in {"SMS", "WHATSAPP"}:
        return f"{value[:3]}{'*' * max(len(value) - 7, 3)}{value[-4:]}"
    if len(value) <= 12:
        return "********"
    return f"{value[:6]}…{value[-6:]}"


def normalize_recipients(channel: str, values: Iterable[str]) -> list[str]:
    channel = channel.upper()
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in values:
        value = str(raw).strip()
        if channel in {"SMS", "WHATSAPP"}:
            value = "".join(
                character
                for character in value
                if character.isdigit() or character == "+"
            )
            if not value.startswith("+"):
                value = f"+{value}"
            if not _E164.fullmatch(value):
                raise HTTPException(
                    status_code=422,
                    detail={
                        "code": "INVALID_RECIPIENT",
                        "channel": channel,
                        "recipient": _mask_recipient(channel, value),
                    },
                )
        elif channel == "PUSH":
            if not _EXPO_TOKEN.fullmatch(value):
                raise HTTPException(
                    status_code=422,
                    detail={
                        "code": "INVALID_RECIPIENT",
                        "channel": channel,
                        "recipient": _mask_recipient(channel, value),
                    },
                )
        else:
            raise HTTPException(
                status_code=422,
                detail={"code": "CHANNEL_NOT_SUPPORTED", "channel": channel},
            )
        if value not in seen:
            seen.add(value)
            normalized.append(value)
    if not normalized:
        raise HTTPException(
            status_code=422, detail={"code": "RECIPIENTS_REQUIRED"}
        )
    return normalized


def batch_response(
    batch: CommunicationDeliveryBatch,
    deliveries: list[CommunicationDelivery] | None = None,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "id": batch.id,
        "organization_id": batch.organization_id,
        "event_id": batch.event_id,
        "channel": batch.channel,
        "provider": batch.provider,
        "status": batch.status,
        "requested_count": batch.requested_count,
        "accepted_count": batch.accepted_count,
        "failed_count": batch.failed_count,
        "reason": batch.reason,
        "case_reference": batch.case_reference,
        "error_code": batch.error_code,
        "created_at": batch.created_at,
        "started_at": batch.started_at,
        "completed_at": batch.completed_at,
    }
    if deliveries is not None:
        result["deliveries"] = [
            {
                "id": row.id,
                "recipient": row.recipient_masked,
                "status": row.status,
                "provider_message_id": row.provider_message_id,
                "error_code": row.error_code,
                "error_message": row.error_message,
                "attempt_count": row.attempt_count,
                "accepted_at": row.accepted_at,
                "failed_at": row.failed_at,
            }
            for row in deliveries
        ]
    return result


class ChannelDeliveryService:
    @staticmethod
    async def create_batch(
        db: AsyncSession,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        channel: str,
        recipients: list[str],
        title: str | None,
        body: str,
        data: dict[str, Any],
        reason: str,
        case_reference: str | None,
        idempotency_key: str,
        actor_user_id: uuid.UUID,
    ) -> tuple[CommunicationDeliveryBatch, bool]:
        channel = channel.upper()
        normalized = normalize_recipients(channel, recipients)
        request_document = {
            "event_id": str(event_id),
            "channel": channel,
            "recipients": normalized,
            "title": title,
            "body": body,
            "data": data,
        }
        request_hash = hashlib.sha256(
            json.dumps(
                request_document, sort_keys=True, separators=(",", ":")
            ).encode("utf-8")
        ).hexdigest()
        existing = await db.scalar(
            select(CommunicationDeliveryBatch).where(
                CommunicationDeliveryBatch.organization_id == organization_id,
                CommunicationDeliveryBatch.idempotency_key == idempotency_key,
            )
        )
        if existing:
            if existing.request_hash != request_hash:
                raise HTTPException(
                    status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT"}
                )
            return existing, True

        config = await db.scalar(
            select(OrganizationNotificationChannelConfig).where(
                OrganizationNotificationChannelConfig.organization_id
                == organization_id,
                OrganizationNotificationChannelConfig.channel == channel,
                OrganizationNotificationChannelConfig.state == "ACTIVE",
                OrganizationNotificationChannelConfig.last_verified_at.is_not(
                    None
                ),
                OrganizationNotificationChannelConfig.deleted_at.is_(None),
            )
        )
        if config is None:
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "PROVIDER_UNAVAILABLE",
                    "channel": channel,
                    "message": (
                        "Command Center has not activated a verified provider "
                        "for this organization."
                    ),
                },
            )
        try:
            ChannelProviderService.validate_configuration(config)
        except ChannelProviderError as exc:
            raise HTTPException(
                status_code=503,
                detail={"code": exc.code, "message": str(exc)},
            ) from exc

        reservation_arguments = {
            "organization_id": organization_id,
            "event_id": event_id,
            "quantity": len(normalized),
            "unit": "recipient",
            "idempotency_key": f"channel-delivery:{idempotency_key}",
            "ttl_seconds": 3600,
            "metadata": {
                "channel": channel,
                "requested_count": len(normalized),
            },
        }
        if channel == "SMS":
            reservation = await UsageReservationService.reserve(
                db,
                limit_key="max_sms_per_event",
                **reservation_arguments,
            )
        elif channel == "WHATSAPP":
            reservation = await UsageReservationService.reserve(
                db,
                limit_key="max_whatsapp_per_event",
                **reservation_arguments,
            )
        else:
            reservation = await UsageReservationService.reserve(
                db,
                limit_key="max_push_per_event",
                **reservation_arguments,
            )
        content = cipher.encrypt(
            json.dumps(
                {"title": title, "body": body, "data": data},
                sort_keys=True,
                separators=(",", ":"),
            )
        )
        batch = CommunicationDeliveryBatch(
            organization_id=organization_id,
            event_id=event_id,
            channel_config_id=config.id,
            channel=channel,
            provider=config.provider.upper(),
            requested_count=len(normalized),
            content_ciphertext=content,
            idempotency_key=idempotency_key,
            request_hash=request_hash,
            reservation_id=reservation.id,
            created_by=actor_user_id,
            reason=reason,
            case_reference=case_reference,
        )
        db.add(batch)
        await db.flush()
        for recipient in normalized:
            db.add(
                CommunicationDelivery(
                    batch_id=batch.id,
                    organization_id=organization_id,
                    event_id=event_id,
                    channel=channel,
                    recipient_ciphertext=cipher.encrypt(recipient),
                    recipient_hash=_recipient_hash(recipient),
                    recipient_masked=_mask_recipient(channel, recipient),
                )
            )
        await db.flush()
        return batch, False

    @staticmethod
    async def process_batch(
        db: AsyncSession,
        *,
        batch_id: uuid.UUID,
        organization_id: uuid.UUID,
        worker_id: str | None = None,
    ) -> CommunicationDeliveryBatch:
        batch = await db.scalar(
            select(CommunicationDeliveryBatch)
            .where(
                CommunicationDeliveryBatch.id == batch_id,
                CommunicationDeliveryBatch.organization_id == organization_id,
            )
            .with_for_update()
        )
        if batch is None:
            raise RuntimeError("Communication delivery batch was not found.")
        if batch.status in {"SENT", "PARTIAL", "FAILED"}:
            return batch
        config = await db.scalar(
            select(OrganizationNotificationChannelConfig).where(
                OrganizationNotificationChannelConfig.id
                == batch.channel_config_id,
                OrganizationNotificationChannelConfig.organization_id
                == organization_id,
                OrganizationNotificationChannelConfig.channel == batch.channel,
                OrganizationNotificationChannelConfig.state == "ACTIVE",
                OrganizationNotificationChannelConfig.last_verified_at.is_not(
                    None
                ),
                OrganizationNotificationChannelConfig.deleted_at.is_(None),
            )
        )
        reservation = (
            await db.scalar(
                select(UsageReservation)
                .where(
                    UsageReservation.id == batch.reservation_id,
                    UsageReservation.organization_id == organization_id,
                )
                .with_for_update()
            )
            if batch.reservation_id
            else None
        )
        if config is None:
            await ChannelDeliveryService._fail_batch(
                db,
                batch=batch,
                reservation=reservation,
                code="PROVIDER_UNAVAILABLE",
            )
            return batch

        deliveries = (
            await db.scalars(
                select(CommunicationDelivery)
                .where(
                    CommunicationDelivery.batch_id == batch.id,
                    CommunicationDelivery.organization_id == organization_id,
                )
                .order_by(CommunicationDelivery.created_at)
            )
        ).all()
        content = json.loads(cipher.decrypt(batch.content_ciphertext))
        now = _now()
        claim_owner = (worker_id or f"inline-{uuid.uuid4()}")[:80]
        claimed: list[CommunicationDelivery] = []
        active_claim = False
        for delivery in deliveries:
            if delivery.status in {"ACCEPTED", "FAILED"}:
                continue
            if delivery.status == "PROCESSING":
                lease_expired = not delivery.processing_started_at or (
                    delivery.processing_started_at + _DELIVERY_CLAIM_LEASE <= now
                )
                same_worker = bool(worker_id and delivery.processing_owner == worker_id)
                if not lease_expired and not same_worker:
                    active_claim = True
                    continue
            delivery.status = "PROCESSING"
            delivery.processing_owner = claim_owner
            delivery.processing_started_at = now
            delivery.attempt_count += 1
            claimed.append(delivery)

        batch.status = "PROCESSING"
        batch.started_at = batch.started_at or now
        # Commit the claim before any provider call. The external request never
        # runs while a database transaction or row lock is held.
        await db.commit()

        for delivery in claimed:
            try:
                outcome = await ChannelProviderService.deliver(
                    config,
                    recipient=cipher.decrypt(delivery.recipient_ciphertext),
                    title=content.get("title"),
                    body=content["body"],
                    data=content.get("data") or {},
                )
            except Exception as exc:
                # Persist a retryable state before allowing the Celery policy to
                # retry. This also makes an unexpected provider error recoverable
                # without waiting for the claim lease to expire.
                delivery.status = "RETRYABLE"
                delivery.processing_owner = None
                delivery.processing_started_at = None
                delivery.error_code = type(exc).__name__[:80]
                delivery.error_message = "Provider delivery failed before an outcome was recorded."
                delivery.failed_at = _now()
                await db.commit()
                raise

            delivery.provider_response = outcome.response_metadata
            delivery.processing_owner = None
            delivery.processing_started_at = None
            if outcome.accepted:
                delivery.status = "ACCEPTED"
                delivery.provider_message_id = outcome.provider_message_id
                delivery.error_code = None
                delivery.error_message = None
                delivery.accepted_at = _now()
            else:
                can_retry = outcome.retryable and delivery.attempt_count < 3
                delivery.status = "RETRYABLE" if can_retry else "FAILED"
                delivery.error_code = outcome.error_code
                delivery.error_message = outcome.error_message
                delivery.failed_at = _now()
            await db.commit()

        # Re-read after provider calls so counts and reservation accounting are
        # based on committed durable states, not stale ORM instances.
        await db.refresh(batch)
        deliveries = (
            await db.scalars(
                select(CommunicationDelivery)
                .where(
                    CommunicationDelivery.batch_id == batch.id,
                    CommunicationDelivery.organization_id == organization_id,
                )
                .order_by(CommunicationDelivery.created_at)
            )
        ).all()
        accepted = sum(1 for row in deliveries if row.status == "ACCEPTED")
        failed = sum(1 for row in deliveries if row.status == "FAILED")
        retryable = sum(1 for row in deliveries if row.status == "RETRYABLE")
        processing = sum(1 for row in deliveries if row.status == "PROCESSING")

        batch.accepted_count = accepted
        batch.failed_count = failed
        if retryable or processing:
            batch.status = "RETRY_PENDING"
            batch.completed_at = None
            await db.flush()
            return batch
        if active_claim:
            # Another worker owns an unexpired claim. Do not turn that healthy
            # in-flight work into a retryable batch that a duplicate task could
            # eventually mark failed.
            batch.status = "PROCESSING"
            batch.completed_at = None
            await db.flush()
            return batch
        batch.completed_at = _now()
        batch.status = (
            "SENT"
            if accepted == batch.requested_count
            else "PARTIAL"
            if accepted
            else "FAILED"
        )
        if reservation and reservation.status == "RESERVED":
            if accepted:
                reservation.metadata_json = {
                    **(reservation.metadata_json or {}),
                    "consumption_quantity": accepted,
                }
                await UsageReservationService.consume(
                    db,
                    reservation.id,
                    source=f"communications.{batch.channel.lower()}.delivery",
                    actor_user_id=batch.created_by,
                )
            else:
                await UsageReservationService.release(db, reservation.id)
        await db.flush()
        return batch

    @staticmethod
    async def _fail_batch(
        db: AsyncSession,
        *,
        batch: CommunicationDeliveryBatch,
        reservation: UsageReservation | None,
        code: str,
    ) -> None:
        batch.status = "FAILED"
        batch.failed_count = batch.requested_count
        batch.error_code = code
        batch.completed_at = _now()
        if reservation and reservation.status == "RESERVED":
            await UsageReservationService.release(db, reservation.id)
        await db.flush()

    @staticmethod
    async def mark_system_failure(
        db: AsyncSession,
        *,
        batch_id: uuid.UUID,
        organization_id: uuid.UUID,
        code: str,
    ) -> None:
        batch = await db.scalar(
            select(CommunicationDeliveryBatch)
            .where(
                CommunicationDeliveryBatch.id == batch_id,
                CommunicationDeliveryBatch.organization_id == organization_id,
            )
            .with_for_update()
        )
        if batch is None or batch.status in {"SENT", "PARTIAL", "FAILED"}:
            return
        reservation = (
            await db.scalar(
                select(UsageReservation)
                .where(
                    UsageReservation.id == batch.reservation_id,
                    UsageReservation.organization_id == organization_id,
                )
                .with_for_update()
            )
            if batch.reservation_id
            else None
        )
        rows = (
            await db.scalars(
                select(CommunicationDelivery).where(
                    CommunicationDelivery.batch_id == batch.id,
                    CommunicationDelivery.organization_id == organization_id,
                    CommunicationDelivery.status.in_(["QUEUED", "RETRYABLE"]),
                )
            )
        ).all()
        for row in rows:
            row.status = "FAILED"
            row.processing_owner = None
            row.processing_started_at = None
            row.error_code = code
            row.error_message = "Delivery stopped after the worker exhausted retries."
            row.failed_at = _now()
        await ChannelDeliveryService._fail_batch(
            db,
            batch=batch,
            reservation=reservation,
            code=code,
        )
