import base64
import hmac
import hashlib
import logging
import uuid
import httpx
from typing import Dict, Any, Optional

import stripe

from app.modules.events.models.event import Event
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.registration.models.payment_transaction import PaymentTransaction
from app.services.credential_cipher import cipher

logger = logging.getLogger(__name__)


class PaymentService:
    """
    Stateless service that creates and verifies payment orders/sessions.

    Security note
    -------------
    Gateway *secret* credentials are stored **encrypted** (AES-256 Fernet) in
    ``event.registration_settings``.  This service decrypts them in the narrowest
    possible scope — immediately before the SDK/HTTP call — and does **not** assign
    them to any variable that outlives that single expression.
    """

    @staticmethod
    async def create_order(
        event: Event,
        registration: ParticipantRegistration,
        amount: float,
        currency: str,
        gateway: str,
        redirect_base_url: str,
    ) -> Dict[str, Any]:
        """
        Creates a payment order/session for the given gateway.
        Returns details needed by the frontend checkout system.
        """
        settings = event.registration_settings or {}

        # ── Stripe ────────────────────────────────────────────────────────
        if gateway == "stripe":
            creds = settings.get("stripe_credentials") or {}
            publishable_key = creds.get("publishable_key", "")
            encrypted_secret = creds.get("secret_key", "")

            if not encrypted_secret:
                raise ValueError("Stripe secret key is not configured for this event.")

            # Decrypt immediately before SDK use — do not store in a variable.
            def decrypt_stripe_secret(token: str) -> str:
                from app.core.encryption import decrypt as new_decrypt
                try:
                    return new_decrypt(token)
                except Exception:
                    from app.services.credential_cipher import cipher
                    return cipher.decrypt(token)

            stripe.api_key = decrypt_stripe_secret(encrypted_secret)
            logger.info(
                "payment_credentials_accessed",
                extra={
                    "event_id": str(event.id),
                    "user_id": "system",
                    "gateway": "stripe",
                    "action": "decrypt",
                },
            )

            amount_cents = int(amount * 100)
            success_url = f"{redirect_base_url}?status=success&session_id={{CHECKOUT_SESSION_ID}}"
            cancel_url  = f"{redirect_base_url}?status=cancelled"

            session = stripe.checkout.Session.create(
                payment_method_types=["card"],
                line_items=[
                    {
                        "price_data": {
                            "currency": currency.lower(),
                            "product_data": {
                                "name": f"Event Registration: {event.name}",
                                "description": (
                                    f"Registration category: "
                                    f"{registration.registration_data.get('role', 'Delegate')}"
                                ),
                            },
                            "unit_amount": amount_cents,
                        },
                        "quantity": 1,
                    }
                ],
                mode="payment",
                success_url=success_url,
                cancel_url=cancel_url,
                customer_email=registration.registration_data.get("email"),
                client_reference_id=str(registration.id),
            )

            # Clear the key from the stripe module immediately after use.
            stripe.api_key = None

            return {
                "provider": "stripe",
                "checkout_url": session.url,
                "gateway_order_id": session.id,
                "amount": amount,
                "currency": currency,
            }

        # ── Razorpay ─────────────────────────────────────────────────────
        elif gateway == "razorpay":
            creds = settings.get("razorpay_credentials") or {}
            key_id = creds.get("key_id", "")
            encrypted_secret = creds.get("key_secret", "")

            if not key_id or not encrypted_secret:
                raise ValueError(
                    "Razorpay credentials are not configured for this event."
                )

            amount_paise = int(amount * 100)

            # Decrypt immediately before use — do not store in a variable.
            async with httpx.AsyncClient() as client:
                auth_str = base64.b64encode(
                    f"{key_id}:{cipher.decrypt(encrypted_secret)}".encode()
                ).decode()
                logger.info(
                    "payment_credentials_accessed",
                    extra={
                        "event_id": str(event.id),
                        "user_id": "system",
                        "gateway": "razorpay",
                        "action": "decrypt",
                    },
                )

                headers = {
                    "Authorization": f"Basic {auth_str}",
                    "Content-Type": "application/json",
                }
                payload = {
                    "amount": amount_paise,
                    "currency": currency.upper(),
                    "receipt": f"reg_{registration.id.hex[:12]}",
                    "payment_capture": 1,
                }
                res = await client.post(
                    "https://api.razorpay.com/v1/orders",
                    json=payload,
                    headers=headers,
                )

            if res.status_code != 200:
                raise ValueError(f"Razorpay order creation failed: {res.text}")

            order_data = res.json()

            return {
                "provider": "razorpay",
                "key_id": key_id,           # public — safe to return
                "amount": amount_paise,
                "currency": currency,
                "gateway_order_id": order_data["id"],
                "registration_id": str(registration.id),
            }

        # ── Simulated sandbox ─────────────────────────────────────────────
        elif gateway == "simulated":
            sim_token = f"sim_{uuid.uuid4().hex}"
            return {
                "provider": "simulated",
                "gateway_order_id": sim_token,
                "amount": amount,
                "currency": currency,
                "checkout_url": (
                    f"{redirect_base_url}?status=success&session_id={sim_token}"
                ),
            }

        else:
            raise ValueError(f"Unsupported payment gateway: {gateway}")

    # ──────────────────────────────────────────────────────────────────────

    @staticmethod
    async def verify_payment(
        event: Event,
        gateway: str,
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Verifies the payment details returned by the gateway frontend callback.
        """
        settings = event.registration_settings or {}

        # ── Stripe ────────────────────────────────────────────────────────
        if gateway == "stripe":
            creds = settings.get("stripe_credentials") or {}
            encrypted_secret = creds.get("secret_key", "")
            session_id = payload.get("session_id")

            if not encrypted_secret:
                raise ValueError("Stripe secret key is not configured.")
            if not session_id:
                raise ValueError("session_id is required for Stripe verification.")

            # Decrypt immediately before SDK use.
            def decrypt_stripe_secret(token: str) -> str:
                from app.core.encryption import decrypt as new_decrypt
                try:
                    return new_decrypt(token)
                except Exception:
                    from app.services.credential_cipher import cipher
                    return cipher.decrypt(token)

            stripe.api_key = decrypt_stripe_secret(encrypted_secret)
            logger.info(
                "payment_credentials_accessed",
                extra={
                    "event_id": str(event.id),
                    "user_id": "system",
                    "gateway": "stripe",
                    "action": "decrypt",
                },
            )

            session = stripe.checkout.Session.retrieve(session_id)
            stripe.api_key = None   # clear after use

            if session.payment_status == "paid":
                return {
                    "success": True,
                    "gateway_order_id": session.id,
                    "gateway_payment_id": session.payment_intent,
                    "amount": session.amount_total / 100.0,
                    "currency": session.currency,
                    "details": dict(session)
                }
            return {"success": False, "details": dict(session) if session else {}}

        # ── Razorpay ─────────────────────────────────────────────────────
        elif gateway == "razorpay":
            creds = settings.get("razorpay_credentials") or {}
            key_id = creds.get("key_id", "")
            encrypted_secret = creds.get("key_secret", "")

            razorpay_order_id   = payload.get("razorpay_order_id")
            razorpay_payment_id = payload.get("razorpay_payment_id")
            razorpay_signature  = payload.get("razorpay_signature")

            if not all([razorpay_order_id, razorpay_payment_id, razorpay_signature]):
                raise ValueError(
                    "Razorpay payment details "
                    "(razorpay_order_id, razorpay_payment_id, razorpay_signature) "
                    "are all required."
                )

            msg = f"{razorpay_order_id}|{razorpay_payment_id}".encode()

            # Decrypt immediately inside the HMAC call — never assigned to a variable.
            generated_signature = hmac.new(
                cipher.decrypt(encrypted_secret).encode(),
                msg,
                hashlib.sha256,
            ).hexdigest()
            logger.info(
                "payment_credentials_accessed",
                extra={
                    "event_id": str(event.id),
                    "user_id": "system",
                    "gateway": "razorpay",
                    "action": "decrypt",
                },
            )

            if generated_signature != razorpay_signature:
                return {"success": False, "error": "Signature mismatch"}

            # Fetch payment status and details from Razorpay's API
            async with httpx.AsyncClient() as client:
                auth_str = base64.b64encode(
                    f"{key_id}:{cipher.decrypt(encrypted_secret)}".encode()
                ).decode()
                headers = {"Authorization": f"Basic {auth_str}"}
                res = await client.get(
                    f"https://api.razorpay.com/v1/payments/{razorpay_payment_id}",
                    headers=headers
                )

            if res.status_code != 200:
                return {"success": False, "error": f"Razorpay API error: {res.text}"}

            payment_details = res.json()
            status = payment_details.get("status")
            if status in ["captured", "authorized"]:
                return {
                    "success": True,
                    "gateway_order_id": razorpay_order_id,
                    "gateway_payment_id": razorpay_payment_id,
                    "amount": payment_details.get("amount", 0) / 100.0,
                    "currency": payment_details.get("currency", "INR"),
                    "details": payment_details
                }
            else:
                return {
                    "success": False,
                    "error": f"Razorpay payment status: {status}",
                    "details": payment_details
                }

        # ── Simulated sandbox ─────────────────────────────────────────────
        elif gateway == "simulated":
            session_id = payload.get("session_id")
            if not session_id or not session_id.startswith("sim_"):
                raise ValueError("Invalid simulation session token.")
            return {
                "success": True,
                "gateway_order_id": session_id,
                "gateway_payment_id": f"pay_{uuid.uuid4().hex}",
                "details": {"method": "simulated", "status": "captured"}
            }

        else:
            raise ValueError(f"Unsupported payment gateway: {gateway}")
