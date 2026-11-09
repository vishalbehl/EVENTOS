from __future__ import annotations

import hashlib
import hmac
import json
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Mapping

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.encryption import decrypt
from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_log import AuditLog
from app.modules.billing.models.billing_domain_tables import Invoice
from app.modules.billing.models.payment_gateway import PaymentGateway
from app.modules.billing.models.provider_webhook_event import ProviderWebhookEvent
from app.modules.billing.services.commercial_contract_service import CommercialContractService


@dataclass(frozen=True)
class NormalizedProviderEvent:
    provider_event_id: str
    event_type: str
    organization_id: uuid.UUID
    invoice_id: uuid.UUID
    transaction_reference: str
    amount: Decimal
    currency: str
    payment_status: str
    provider_created_at: datetime | None
    payload: dict[str, Any]


class ProviderWebhookService:
    MAX_BODY_BYTES = 1_000_000
    REPLAY_WINDOW_SECONDS = 300

    @staticmethod
    def _reject(code: str, message: str, http_status: int = status.HTTP_400_BAD_REQUEST) -> None:
        raise HTTPException(status_code=http_status, detail={"code": code, "message": message})

    @staticmethod
    def _parse_uuid(metadata: Mapping[str, Any], key: str) -> uuid.UUID:
        value = metadata.get(f"Event_{key}") or metadata.get(key)
        try:
            return uuid.UUID(str(value))
        except (TypeError, ValueError):
            ProviderWebhookService._reject("WEBHOOK_TENANT_METADATA_REQUIRED", f"Signed {key} metadata is required.")

    @classmethod
    def verify_and_normalize(
        cls,
        gateway: PaymentGateway,
        body: bytes,
        headers: Mapping[str, str],
        *,
        now_epoch: int | None = None,
    ) -> NormalizedProviderEvent:
        if not body or len(body) > cls.MAX_BODY_BYTES:
            cls._reject("WEBHOOK_PAYLOAD_INVALID", "Webhook payload is empty or exceeds the accepted size.", 413)
        if not gateway.is_active or not gateway.webhook_secret_encrypted:
            cls._reject("WEBHOOK_GATEWAY_UNAVAILABLE", "Payment gateway webhook processing is unavailable.", 503)
        try:
            secret = decrypt(gateway.webhook_secret_encrypted)
        except ValueError:
            cls._reject("WEBHOOK_GATEWAY_UNAVAILABLE", "Payment gateway webhook processing is unavailable.", 503)

        provider = gateway.provider.upper()
        if provider == "STRIPE":
            cls._verify_stripe(body, headers, secret, now_epoch=now_epoch)
        elif provider == "RAZORPAY":
            cls._verify_razorpay(body, headers, secret)
        else:
            cls._reject("WEBHOOK_PROVIDER_UNSUPPORTED", f"Verified webhook ingestion is not implemented for {provider}.", 422)

        try:
            payload = json.loads(body)
        except (UnicodeDecodeError, json.JSONDecodeError):
            cls._reject("WEBHOOK_PAYLOAD_INVALID", "Webhook payload must be valid JSON.")
        if not isinstance(payload, dict):
            cls._reject("WEBHOOK_PAYLOAD_INVALID", "Webhook payload must be a JSON object.")
        return cls._normalize(provider, payload)

    @classmethod
    def _verify_stripe(cls, body: bytes, headers: Mapping[str, str], secret: str, *, now_epoch: int | None) -> None:
        signature_header = headers.get("stripe-signature", "")
        parts: dict[str, list[str]] = {}
        for item in signature_header.split(","):
            key, _, value = item.partition("=")
            if key and value:
                parts.setdefault(key, []).append(value)
        try:
            timestamp = int(parts["t"][0])
        except (KeyError, ValueError):
            cls._reject("WEBHOOK_SIGNATURE_INVALID", "Stripe signature timestamp is missing or invalid.", 401)
        current = int(time.time()) if now_epoch is None else now_epoch
        if abs(current - timestamp) > cls.REPLAY_WINDOW_SECONDS:
            cls._reject("WEBHOOK_REPLAY_WINDOW_EXCEEDED", "Stripe webhook timestamp is outside the replay window.", 401)
        signed = str(timestamp).encode("ascii") + b"." + body
        expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
        if not any(hmac.compare_digest(expected, candidate) for candidate in parts.get("v1", [])):
            cls._reject("WEBHOOK_SIGNATURE_INVALID", "Stripe webhook signature is invalid.", 401)

    @classmethod
    def _verify_razorpay(cls, body: bytes, headers: Mapping[str, str], secret: str) -> None:
        supplied = headers.get("x-razorpay-signature", "")
        expected = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
        if not supplied or not hmac.compare_digest(expected, supplied):
            cls._reject("WEBHOOK_SIGNATURE_INVALID", "Razorpay webhook signature is invalid.", 401)

    @classmethod
    def _normalize(cls, provider: str, payload: dict[str, Any]) -> NormalizedProviderEvent:
        if provider == "STRIPE":
            event_id = str(payload.get("id") or "")
            event_type = str(payload.get("type") or "")
            obj = ((payload.get("data") or {}).get("object") or {})
            metadata = obj.get("metadata") or {}
            amount_minor = obj.get("amount_received") or obj.get("amount_total") or obj.get("amount", 0)
            transaction_reference = str(obj.get("id") or "")
            created = payload.get("created")
            payment_status = "SUCCEEDED" if (
                event_type == "payment_intent.succeeded"
                or (
                    event_type == "checkout.session.completed"
                    and str(obj.get("payment_status") or "").lower() == "paid"
                )
            ) else "FAILED"
        else:
            event_id = str(payload.get("id") or payload.get("event_id") or "")
            event_type = str(payload.get("event") or "")
            entity = ((((payload.get("payload") or {}).get("payment") or {}).get("entity")) or {})
            metadata = entity.get("notes") or {}
            amount_minor = entity.get("amount", 0)
            transaction_reference = str(entity.get("id") or "")
            created = entity.get("created_at")
            payment_status = "SUCCEEDED" if event_type in {"payment.captured", "order.paid"} else "FAILED"

        if not event_id or not event_type or not transaction_reference:
            cls._reject("WEBHOOK_PAYLOAD_INVALID", "Provider event identifiers are incomplete.")
        supported = {
            "STRIPE": {"payment_intent.succeeded", "payment_intent.payment_failed", "checkout.session.completed"},
            "RAZORPAY": {"payment.captured", "payment.failed", "order.paid"},
        }
        if event_type not in supported[provider]:
            cls._reject("WEBHOOK_EVENT_UNSUPPORTED", f"Provider event type {event_type} is not accepted.", 422)
        try:
            amount = (Decimal(str(amount_minor)) / Decimal("100")).quantize(Decimal("0.01"))
        except Exception:
            cls._reject("WEBHOOK_PAYLOAD_INVALID", "Provider amount is invalid.")
        if amount <= 0:
            cls._reject("WEBHOOK_PAYLOAD_INVALID", "Provider amount must be positive.")
        try:
            created_at = datetime.fromtimestamp(int(created), tz=timezone.utc) if created is not None else None
        except (TypeError, ValueError, OverflowError, OSError):
            cls._reject("WEBHOOK_PAYLOAD_INVALID", "Provider event timestamp is invalid.")
        return NormalizedProviderEvent(
            provider_event_id=event_id,
            event_type=event_type,
            organization_id=cls._parse_uuid(metadata, "organization_id"),
            invoice_id=cls._parse_uuid(metadata, "invoice_id"),
            transaction_reference=transaction_reference,
            amount=amount,
            currency=str((obj if provider == "STRIPE" else entity).get("currency") or "INR").upper(),
            payment_status=payment_status,
            provider_created_at=created_at,
            payload=payload,
        )

    @classmethod
    async def ingest(cls, db: AsyncSession, gateway: PaymentGateway, event: NormalizedProviderEvent, body: bytes) -> ProviderWebhookEvent:
        async with TenantContextGuard.scoped(db, event.organization_id):
            existing = await db.scalar(select(ProviderWebhookEvent).where(
                ProviderWebhookEvent.provider == gateway.provider.upper(),
                ProviderWebhookEvent.provider_event_id == event.provider_event_id,
            ))
            payload_hash = hashlib.sha256(body).hexdigest()
            if existing:
                if existing.payload_hash != payload_hash:
                    cls._reject("WEBHOOK_REPLAY_CONFLICT", "Provider event ID was reused with a different payload.", 409)
                return existing

            invoice = await db.scalar(select(Invoice).where(
                Invoice.id == event.invoice_id,
                Invoice.organization_id == event.organization_id,
            ).with_for_update())
            if not invoice:
                cls._reject("WEBHOOK_RESOURCE_NOT_FOUND", "Referenced billing resource was not found.", 404)
            existing = await db.scalar(select(ProviderWebhookEvent).where(
                ProviderWebhookEvent.provider == gateway.provider.upper(),
                ProviderWebhookEvent.provider_event_id == event.provider_event_id,
            ))
            if existing:
                if existing.payload_hash != payload_hash:
                    cls._reject("WEBHOOK_REPLAY_CONFLICT", "Provider event ID was reused with a different payload.", 409)
                return existing
            receipt = ProviderWebhookEvent(
                gateway_id=gateway.id,
                organization_id=event.organization_id,
                invoice_id=invoice.id,
                provider=gateway.provider.upper(),
                provider_event_id=event.provider_event_id,
                event_type=event.event_type,
                provider_created_at=event.provider_created_at,
                payload_hash=payload_hash,
                payload_json=event.payload,
                status="RECEIVED",
                attempt_count=1,
            )
            db.add(receipt)
            await db.flush()

            expected_total = Decimal(str(invoice.total_amount_inr or invoice.amount or 0))
            matched = event.payment_status == "SUCCEEDED" and event.currency == invoice.currency.upper() and event.amount == expected_total
            receipt.status = "PROCESSED" if matched else "REVIEW_REQUIRED"
            receipt.processed_at = datetime.now(timezone.utc)

            if matched:
                invoice.status = "PAID"
                invoice.paid_at = datetime.now(timezone.utc)
                invoice.status_reason = "Settled by verified provider webhook"
                invoice.version += 1
                await CommercialContractService(db).activate_paid_contract(invoice.id)

            db.add(AuditLog(
                organization_id=event.organization_id,
                actor_user_id=None,
                resource_type="PROVIDER_WEBHOOK",
                resource_id=receipt.id,
                action_type="PROVIDER_WEBHOOK_RECONCILED" if matched else "PROVIDER_WEBHOOK_REVIEW_REQUIRED",
                actor_role="PAYMENT_PROVIDER",
                new_state={
                    "provider": receipt.provider,
                    "provider_event_id": receipt.provider_event_id,
                    "event_type": receipt.event_type,
                    "invoice_id": str(invoice.id),
                    "reconciliation_status": "RECONCILED" if matched else "MISMATCH",
                },
                is_sensitive=True,
            ))
            return receipt

    @classmethod
    async def execute_command(
        cls,
        db: AsyncSession,
        gateway: PaymentGateway,
        event: NormalizedProviderEvent,
        body: bytes,
    ) -> ProviderWebhookEvent:
        """Run the webhook mutation and own its single transaction boundary."""
        receipt = await cls.ingest(db, gateway, event, body)
        await db.commit()
        return receipt
