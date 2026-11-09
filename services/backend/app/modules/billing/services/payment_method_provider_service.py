"""Provider-hosted payment-method setup and verified finalisation."""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

import httpx
from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.encryption import decrypt
from app.core.idempotency import request_hash
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.modules.audit.models.audit_log import AuditLog
from app.modules.billing.models.billing_domain_tables import PaymentMethod, PaymentMethodSetup
from app.modules.billing.models.payment_gateway import PaymentGateway
from app.modules.billing.models.provider_webhook_event import ProviderWebhookEvent
from app.modules.billing.services.provider_webhook_service import ProviderWebhookService
from app.modules.platform.models.idempotency import IdempotencyRecord


class PaymentMethodProviderService:
    STRIPE_API = "https://api.stripe.com/v1"

    @staticmethod
    def _credential(gateway: PaymentGateway, *names: str) -> str:
        source = gateway.credentials_encrypted or {}
        value = next((source.get(name) for name in names if source.get(name)), None)
        if not isinstance(value, str):
            raise HTTPException(503, detail={"code": "PAYMENT_GATEWAY_CREDENTIALS_UNAVAILABLE"})
        try:
            return decrypt(value)
        except ValueError as exc:
            raise HTTPException(503, detail={"code": "PAYMENT_GATEWAY_CREDENTIALS_UNAVAILABLE"}) from exc

    @staticmethod
    def _trusted_return_url(value: str) -> str:
        parsed = urlsplit(value)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or origin not in settings.CORS_ORIGINS:
            raise HTTPException(422, detail={"code": "PAYMENT_RETURN_ORIGIN_NOT_ALLOWED"})
        return value

    @staticmethod
    async def _stripe_post(path: str, secret: str, data: list[tuple[str, str]], *, idempotency_key: str) -> dict:
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=4.0)) as client:
                response = await client.post(
                    f"{PaymentMethodProviderService.STRIPE_API}{path}", data=data,
                    headers={"Authorization": f"Bearer {secret}", "Idempotency-Key": idempotency_key},
                )
            if response.status_code >= 400:
                raise HTTPException(503, detail={"code": "PAYMENT_GATEWAY_SETUP_UNAVAILABLE"})
            value = response.json()
            if not isinstance(value, dict):
                raise ValueError("provider response is not an object")
            return value
        except HTTPException:
            raise
        except (httpx.HTTPError, ValueError) as exc:
            raise HTTPException(503, detail={"code": "PAYMENT_GATEWAY_SETUP_UNAVAILABLE"}) from exc

    @classmethod
    async def create_setup_session(
        cls, db: AsyncSession, *, organization, actor, provider: str | None,
        return_url: str, idempotency_key: str,
    ) -> dict:
        trusted_return = cls._trusted_return_url(return_url)
        provider_name = (provider or "STRIPE").upper()
        organization_id = organization.id
        organization_name = organization.name
        billing_email = organization.billing_email or actor.email
        actor_id = actor.id
        gateway = await db.scalar(select(PaymentGateway).where(
            func.upper(PaymentGateway.provider) == provider_name,
            PaymentGateway.is_active.is_(True),
        ).order_by(PaymentGateway.is_default.desc(), PaymentGateway.id).limit(1))
        if gateway is None:
            raise HTTPException(503, detail={"code": "PAYMENT_GATEWAY_UNAVAILABLE"})
        if provider_name == "RAZORPAY":
            # Razorpay saved-card tokenisation is an explicitly enabled account
            # capability. Never emulate setup by charging a synthetic payment.
            raise HTTPException(409, detail={
                "code": "RAZORPAY_TOKENISATION_NOT_ENABLED",
                "message": "Razorpay saved-card tokenisation must be enabled and configured before adding a method.",
            })
        if provider_name != "STRIPE":
            raise HTTPException(422, detail={"code": "PAYMENT_METHOD_PROVIDER_UNSUPPORTED"})

        operation = "organiser.billing.payment_method.setup"
        command_payload = {"provider": provider_name, "return_url": trusted_return}
        digest = request_hash(command_payload)
        existing = await db.scalar(select(IdempotencyRecord).where(
            IdempotencyRecord.organization_id == organization_id,
            IdempotencyRecord.operation == operation,
            IdempotencyRecord.idempotency_key == idempotency_key,
        ))
        if existing is not None and existing.expires_at > datetime.now(timezone.utc):
            if existing.actor_id != actor_id or existing.request_hash != digest:
                raise HTTPException(409, detail={"code": "IDEMPOTENCY_CONFLICT"})
            replay = replay_response(existing)
            if replay is not None:
                await db.commit()
                return replay[1]
            raise HTTPException(409, detail={"code": "IDEMPOTENCY_IN_PROGRESS"})

        setup_id = uuid.uuid5(organization_id, f"{operation}:{idempotency_key}")
        if await db.scalar(select(PaymentMethodSetup.id).where(PaymentMethodSetup.id == setup_id)) is not None:
            raise HTTPException(409, detail={
                "code": "IDEMPOTENCY_KEY_RETIRED",
                "message": "Use a new idempotency key for a new payment-method setup.",
            })

        # Resolve credentials before releasing the read transaction. Provider
        # calls then run without holding tenant or idempotency database locks.
        secret = cls._credential(gateway, "secret_key", "api_secret", "stripe_secret_key")
        gateway_id = gateway.id
        existing_customer_id = await db.scalar(select(PaymentMethod.provider_customer_id).where(
            PaymentMethod.organization_id == organization_id,
            func.upper(PaymentMethod.provider) == "STRIPE",
            PaymentMethod.provider_customer_id.is_not(None),
        ).order_by(PaymentMethod.retired_at.asc().nullsfirst(), PaymentMethod.created_at.desc()).limit(1))
        await db.commit()

        customer_id = str(existing_customer_id or "")
        if not customer_id.startswith("cus_"):
            customer = await cls._stripe_post("/customers", secret, [
                ("email", billing_email),
                ("name", organization_name),
                ("metadata[organization_id]", str(organization_id)),
            ], idempotency_key=f"{idempotency_key}:customer")
            customer_id = str(customer.get("id") or "")
        if not customer_id.startswith("cus_"):
            raise HTTPException(503, detail={"code": "PAYMENT_GATEWAY_SETUP_UNAVAILABLE"})
        separator = "&" if "?" in trusted_return else "?"
        session = await cls._stripe_post("/checkout/sessions", secret, [
            ("mode", "setup"),
            ("customer", customer_id),
            ("payment_method_types[]", "card"),
            ("success_url", f"{trusted_return}{separator}payment_method=complete&session_id={{CHECKOUT_SESSION_ID}}"),
            ("cancel_url", f"{trusted_return}{separator}payment_method=cancelled"),
            ("client_reference_id", str(setup_id)),
            ("metadata[setup_id]", str(setup_id)),
            ("metadata[organization_id]", str(organization_id)),
            ("setup_intent_data[metadata][setup_id]", str(setup_id)),
            ("setup_intent_data[metadata][organization_id]", str(organization_id)),
        ], idempotency_key=f"{idempotency_key}:session")
        session_id = str(session.get("id") or "")
        checkout_url = str(session.get("url") or "")
        if not session_id.startswith("cs_") or not checkout_url.startswith("https://"):
            raise HTTPException(503, detail={"code": "PAYMENT_GATEWAY_SETUP_UNAVAILABLE"})

        try:
            idem = await begin_idempotent(
                db, organization_id=organization_id, actor_id=actor_id,
                operation=operation, key=idempotency_key, payload=command_payload,
            )
            replay = replay_response(idem)
            if replay is not None:
                await db.commit()
                return replay[1]
            row = PaymentMethodSetup(
                id=setup_id, organization_id=organization_id, actor_user_id=actor_id,
                gateway_id=gateway_id, provider="STRIPE", provider_session_id=session_id,
                provider_customer_id=customer_id, status="PENDING",
                expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
            )
            db.add(row)
            response = {"provider": "STRIPE", "mode": "redirect", "url": checkout_url,
                        "setup_id": str(setup_id), "expires_at": row.expires_at.isoformat()}
            await complete_idempotent(db, idem, response_status=201, response_body=response, resource_id=setup_id)
            await db.commit()
            return response
        except Exception:
            await db.rollback()
            raise

    @staticmethod
    def is_setup_event(gateway: PaymentGateway, body: bytes) -> bool:
        if gateway.provider.upper() != "STRIPE":
            return False
        try:
            payload = json.loads(body)
            obj = ((payload.get("data") or {}).get("object") or {})
            return payload.get("type") == "checkout.session.completed" and obj.get("mode") == "setup"
        except (UnicodeDecodeError, json.JSONDecodeError, AttributeError):
            return False

    @classmethod
    async def execute_setup_webhook(cls, db: AsyncSession, gateway: PaymentGateway, body: bytes, headers) -> ProviderWebhookEvent:
        try:
            webhook_secret = decrypt(gateway.webhook_secret_encrypted or "")
        except ValueError as exc:
            raise HTTPException(503, detail={"code": "PAYMENT_GATEWAY_WEBHOOK_SECRET_UNAVAILABLE"}) from exc
        if not webhook_secret:
            raise HTTPException(503, detail={"code": "PAYMENT_GATEWAY_WEBHOOK_SECRET_UNAVAILABLE"})
        ProviderWebhookService._verify_stripe(body, headers, webhook_secret, now_epoch=None)
        payload = json.loads(body)
        event_id = str(payload.get("id") or "")
        obj = ((payload.get("data") or {}).get("object") or {})
        metadata = obj.get("metadata") or {}
        try:
            setup_id = uuid.UUID(str(metadata.get("setup_id") or obj.get("client_reference_id")))
            organization_id = uuid.UUID(str(metadata.get("organization_id")))
        except (TypeError, ValueError) as exc:
            raise HTTPException(400, detail={"code": "PAYMENT_SETUP_METADATA_INVALID"}) from exc
        provider_session_id = str(obj.get("id") or "")
        setup_intent_id = str(obj.get("setup_intent") or "")
        if not event_id or not provider_session_id.startswith("cs_") or not setup_intent_id.startswith("seti_"):
            raise HTTPException(400, detail={"code": "PAYMENT_SETUP_EVENT_INVALID"})
        payload_hash = hashlib.sha256(body).hexdigest()
        existing_receipt = await db.scalar(select(ProviderWebhookEvent).where(
            ProviderWebhookEvent.provider == "STRIPE",
            ProviderWebhookEvent.provider_event_id == event_id,
        ))
        if existing_receipt is not None:
            if existing_receipt.payload_hash != payload_hash:
                raise HTTPException(409, detail={"code": "WEBHOOK_REPLAY_CONFLICT"})
            await db.commit()
            return existing_receipt
        setup_preview = await db.scalar(select(PaymentMethodSetup).where(
            PaymentMethodSetup.id == setup_id,
            PaymentMethodSetup.organization_id == organization_id,
            PaymentMethodSetup.gateway_id == gateway.id,
            PaymentMethodSetup.provider_session_id == provider_session_id,
        ))
        if setup_preview is None:
            raise HTTPException(404, detail={"code": "PAYMENT_METHOD_SETUP_NOT_FOUND"})
        try:
            provider_created_at = datetime.fromtimestamp(int(payload.get("created")), tz=timezone.utc)
        except (TypeError, ValueError, OSError) as exc:
            raise HTTPException(400, detail={"code": "PAYMENT_SETUP_EVENT_INVALID"}) from exc
        if setup_preview.status not in {"PENDING", "COMPLETED"} or provider_created_at > setup_preview.expires_at:
            raise HTTPException(409, detail={"code": "PAYMENT_METHOD_SETUP_EXPIRED"})
        secret = cls._credential(gateway, "secret_key", "api_secret", "stripe_secret_key")
        await db.commit()
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=4.0)) as client:
                response = await client.get(
                    f"{cls.STRIPE_API}/setup_intents/{setup_intent_id}",
                    params={"expand[]": "payment_method"},
                    headers={"Authorization": f"Bearer {secret}"},
                )
            if response.status_code >= 400:
                raise HTTPException(503, detail={"code": "PAYMENT_GATEWAY_VERIFICATION_UNAVAILABLE"})
            intent = response.json()
        except HTTPException:
            raise
        except (httpx.HTTPError, ValueError) as exc:
            raise HTTPException(503, detail={"code": "PAYMENT_GATEWAY_VERIFICATION_UNAVAILABLE"}) from exc
        payment = intent.get("payment_method") or {}
        card = payment.get("card") or {}
        payment_id = str(payment.get("id") or "")
        if intent.get("status") != "succeeded" or not payment_id.startswith("pm_"):
            raise HTTPException(409, detail={"code": "PAYMENT_METHOD_SETUP_INCOMPLETE"})
        intent_metadata = intent.get("metadata") or {}
        if str(intent_metadata.get("setup_id")) != str(setup_id) or str(intent_metadata.get("organization_id")) != str(organization_id):
            raise HTTPException(409, detail={"code": "PAYMENT_SETUP_METADATA_CONFLICT"})
        try:
            await db.execute(text(
                "SELECT pg_advisory_xact_lock(hashtextextended(:lock_key, 3680))"
            ), {"lock_key": f"stripe-payment-method-setup:{gateway.id}:{event_id}"})
            setup = await db.scalar(select(PaymentMethodSetup).where(
                PaymentMethodSetup.id == setup_id,
                PaymentMethodSetup.organization_id == organization_id,
                PaymentMethodSetup.gateway_id == gateway.id,
                PaymentMethodSetup.provider_session_id == provider_session_id,
            ).with_for_update())
            if setup is None:
                raise HTTPException(404, detail={"code": "PAYMENT_METHOD_SETUP_NOT_FOUND"})
            if setup.status not in {"PENDING", "COMPLETED"} or provider_created_at > setup.expires_at:
                raise HTTPException(409, detail={"code": "PAYMENT_METHOD_SETUP_EXPIRED"})
            existing_receipt = await db.scalar(select(ProviderWebhookEvent).where(
                ProviderWebhookEvent.provider == "STRIPE",
                ProviderWebhookEvent.provider_event_id == event_id,
            ).with_for_update())
            if existing_receipt is not None:
                if existing_receipt.payload_hash != payload_hash:
                    raise HTTPException(409, detail={"code": "WEBHOOK_REPLAY_CONFLICT"})
                await db.commit()
                return existing_receipt
            method = await db.scalar(select(PaymentMethod).where(
                func.upper(PaymentMethod.provider) == "STRIPE",
                PaymentMethod.provider_payment_method_id == payment_id,
            ).with_for_update())
            if method is not None and method.organization_id != organization_id:
                raise HTTPException(409, detail={"code": "PAYMENT_METHOD_OWNERSHIP_CONFLICT"})
            active_method_predicates = [
                PaymentMethod.organization_id == organization_id,
                PaymentMethod.retired_at.is_(None),
            ]
            if method is not None:
                active_method_predicates.append(PaymentMethod.id != method.id)
            has_method = await db.scalar(select(PaymentMethod.id).where(
                *active_method_predicates,
            ).limit(1))
            audit_action = (
                "ORGANIZATION_PAYMENT_METHOD_ADDED" if method is None
                else "ORGANIZATION_PAYMENT_METHOD_SETUP_CONFIRMED"
            )
            if method is None:
                method = PaymentMethod(
                    organization_id=organization_id, provider="STRIPE",
                    provider_payment_method_id=payment_id,
                    provider_customer_id=setup.provider_customer_id,
                    card_brand=str(card.get("brand") or "card")[:50],
                    card_last4=str(card.get("last4") or "")[-4:] or None,
                    expires_month=card.get("exp_month"), expires_year=card.get("exp_year"),
                    is_default=has_method is None,
                )
                db.add(method)
                await db.flush([method])
            else:
                next_metadata = {
                    "provider": "STRIPE",
                    "provider_customer_id": setup.provider_customer_id,
                    "card_brand": str(card.get("brand") or "card")[:50],
                    "card_last4": str(card.get("last4") or "")[-4:] or None,
                    "expires_month": card.get("exp_month"),
                    "expires_year": card.get("exp_year"),
                }
                changed = any(getattr(method, key) != value for key, value in next_metadata.items())
                reactivating = method.retired_at is not None
                for key, value in next_metadata.items():
                    setattr(method, key, value)
                if reactivating:
                    method.retired_at = None
                    method.is_default = has_method is None
                    audit_action = "ORGANIZATION_PAYMENT_METHOD_REACTIVATED"
                elif changed:
                    audit_action = "ORGANIZATION_PAYMENT_METHOD_METADATA_REFRESHED"
                if changed or reactivating:
                    method.version = int(method.version or 0) + 1
                    method.updated_at = datetime.now(timezone.utc)
            setup.status = "COMPLETED"
            setup.completed_at = datetime.now(timezone.utc)
            receipt = ProviderWebhookEvent(
                gateway_id=gateway.id, organization_id=organization_id, invoice_id=None,
                provider="STRIPE", provider_event_id=event_id,
                event_type="checkout.session.completed", payload_hash=payload_hash,
                payload_json=payload, status="PROCESSED", attempt_count=1,
                provider_created_at=provider_created_at,
                processed_at=datetime.now(timezone.utc),
            )
            db.add(receipt)
            db.add(AuditLog(
                organization_id=organization_id, actor_user_id=setup.actor_user_id,
                actor_role="ORGANIZATION_BILLING", resource_type="payment_method",
                resource_id=method.id, action_type=audit_action,
                new_state={"provider": "STRIPE", "card_brand": method.card_brand,
                           "card_last4": method.card_last4}, is_sensitive=True,
            ))
            await db.commit()
            return receipt
        except Exception:
            await db.rollback()
            raise
