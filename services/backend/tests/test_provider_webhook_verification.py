import hashlib
import hmac
import json
import time
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.modules.billing.services import provider_webhook_service as module
from app.modules.billing.services.provider_webhook_service import ProviderWebhookService


ORG_ID = uuid.uuid4()
INVOICE_ID = uuid.uuid4()


def _gateway(provider: str):
    return SimpleNamespace(
        id=uuid.uuid4(),
        provider=provider,
        is_active=True,
        webhook_secret_encrypted="v1:test",
    )


def _stripe_body(event_id: str = "evt_123") -> bytes:
    return json.dumps({
        "id": event_id,
        "type": "payment_intent.succeeded",
        "created": 1_750_000_000,
        "data": {"object": {
            "id": "pi_123",
            "amount_received": 12500,
            "currency": "inr",
            "metadata": {"Event_organization_id": str(ORG_ID), "Event_invoice_id": str(INVOICE_ID)},
        }},
    }, separators=(",", ":")).encode()


def test_stripe_signature_and_signed_tenant_metadata(monkeypatch):
    monkeypatch.setattr(module, "decrypt", lambda _: "whsec_test")
    body = _stripe_body()
    timestamp = 1_750_000_100
    signature = hmac.new(b"whsec_test", str(timestamp).encode() + b"." + body, hashlib.sha256).hexdigest()

    event = ProviderWebhookService.verify_and_normalize(
        _gateway("STRIPE"), body, {"stripe-signature": f"t={timestamp},v1={signature}"}, now_epoch=timestamp
    )

    assert event.organization_id == ORG_ID
    assert event.invoice_id == INVOICE_ID
    assert event.amount == 125
    assert event.currency == "INR"
    assert event.payment_status == "SUCCEEDED"


@pytest.mark.parametrize("signature,timestamp,code", [
    ("bad", 1_750_000_100, "WEBHOOK_SIGNATURE_INVALID"),
    (None, 1_750_001_000, "WEBHOOK_REPLAY_WINDOW_EXCEEDED"),
])
def test_stripe_rejects_invalid_signature_and_old_replay(monkeypatch, signature, timestamp, code):
    monkeypatch.setattr(module, "decrypt", lambda _: "whsec_test")
    body = _stripe_body()
    signed_at = 1_750_000_100
    actual = hmac.new(b"whsec_test", str(signed_at).encode() + b"." + body, hashlib.sha256).hexdigest()
    with pytest.raises(HTTPException) as exc:
        ProviderWebhookService.verify_and_normalize(
            _gateway("STRIPE"), body,
            {"stripe-signature": f"t={signed_at},v1={signature or actual}"},
            now_epoch=timestamp,
        )
    assert exc.value.detail["code"] == code


def test_razorpay_verifies_raw_body_and_normalizes(monkeypatch):
    monkeypatch.setattr(module, "decrypt", lambda _: "razor_secret")
    body = json.dumps({
        "id": "evt_rzp_1",
        "event": "payment.captured",
        "payload": {"payment": {"entity": {
            "id": "pay_123", "amount": 9900, "currency": "INR", "created_at": int(time.time()),
            "notes": {"Event_organization_id": str(ORG_ID), "Event_invoice_id": str(INVOICE_ID)},
        }}},
    }, separators=(",", ":")).encode()
    signature = hmac.new(b"razor_secret", body, hashlib.sha256).hexdigest()
    event = ProviderWebhookService.verify_and_normalize(
        _gateway("RAZORPAY"), body, {"x-razorpay-signature": signature}
    )
    assert event.transaction_reference == "pay_123"
    assert event.amount == 99


def test_unsigned_or_unsupported_provider_fails_closed(monkeypatch):
    monkeypatch.setattr(module, "decrypt", lambda _: "secret")
    with pytest.raises(HTTPException) as exc:
        ProviderWebhookService.verify_and_normalize(_gateway("PAYU"), _stripe_body(), {})
    assert exc.value.detail["code"] == "WEBHOOK_PROVIDER_UNSUPPORTED"


def test_disabled_gateway_degrades_without_accepting_event(monkeypatch):
    monkeypatch.setattr(module, "decrypt", lambda _: "secret")
    gateway = _gateway("STRIPE")
    gateway.is_active = False
    with pytest.raises(HTTPException) as exc:
        ProviderWebhookService.verify_and_normalize(gateway, _stripe_body(), {})
    assert exc.value.status_code == 503
    assert exc.value.detail["code"] == "WEBHOOK_GATEWAY_UNAVAILABLE"
