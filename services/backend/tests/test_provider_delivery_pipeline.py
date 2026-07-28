from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from app.modules.communications.models.channel_delivery import (
    CommunicationDelivery,
    CommunicationDeliveryBatch,
)
from app.modules.notifications.services.channel_delivery_service import (
    ChannelDeliveryService,
)
from app.modules.platform.models.organization_console import (
    OrganizationNotificationChannelConfig,
    UsageLedgerEntry,
)
from tests.conftest import activate_event_for_test, auth_headers


pytestmark = pytest.mark.asyncio


def _denial_code(response) -> str | None:
    payload = response.json()
    return payload.get("code") or (payload.get("detail") or {}).get("code")


async def test_provider_capability_fails_closed_until_verified_configuration(
    client,
    db,
    event,
    organizer,
):
    await activate_event_for_test(db, event)

    unavailable = await client.post(
        f"/api/v1/events/{event.id}/notifications/channels/SMS/deliveries",
        json={
            "recipients": ["+919876543210"],
            "body": "Registration desk opens at eight.",
            "reason": "Send an approved operational update",
        },
        headers={
            **auth_headers(organizer),
            "Idempotency-Key": f"sms-unavailable-{uuid.uuid4()}",
        },
    )
    assert unavailable.status_code == 403
    assert _denial_code(unavailable) == "PROVIDER_UNAVAILABLE"


async def test_command_center_verifies_provider_before_activation(
    client,
    db,
    organization,
    super_admin,
    monkeypatch,
):
    monkeypatch.setenv(
        "EVENTOS_TEST_CHANNEL_SECRET",
        '{"test_token":"do-not-expose"}',
    )
    base = (
        f"/api/v1/platform/organizations/{organization.id}"
        "/console/notification-channels"
    )
    headers = auth_headers(super_admin)
    active_attempt = await client.post(
        base,
        json={
            "channel": "SMS",
            "provider": "TEST",
            "state": "ACTIVE",
            "configuration": {},
            "reason": "Attempt activation without provider verification.",
        },
        headers=headers,
    )
    assert active_attempt.status_code == 422
    assert _denial_code(active_attempt) == "PROVIDER_VERIFICATION_REQUIRED"

    configured = await client.post(
        base,
        json={
            "channel": "SMS",
            "provider": "TEST",
            "state": "CONFIGURED",
            "secret_reference": "env://EVENTOS_TEST_CHANNEL_SECRET",
            "configuration": {},
            "reason": "Configure the approved test provider for verification.",
        },
        headers=headers,
    )
    assert configured.status_code == 201, configured.text
    assert configured.json()["state"] == "CONFIGURED"
    assert "secret_reference" not in configured.json()
    assert configured.json()["secret_reference_present"] is True

    verified = await client.post(
        f"{base}/{configured.json()['id']}/verify",
        json={
            "reason": "Verify and activate the approved provider connection.",
            "case_reference": "PROVIDER-TEST-1",
        },
        headers={**headers, "If-Match": "1"},
    )
    assert verified.status_code == 200, verified.text
    assert verified.json()["state"] == "ACTIVE"
    assert verified.json()["version"] == 2
    assert verified.json()["last_verified_at"] is not None

    paused = await client.patch(
        f"{base}/{configured.json()['id']}",
        json={
            "channel": "SMS",
            "provider": "TEST",
            "state": "PAUSED",
            "configuration": {},
            "reason": "Pause delivery without rotating provider credentials.",
        },
        headers={**headers, "If-Match": "2"},
    )
    assert paused.status_code == 200, paused.text
    assert paused.json()["secret_reference_present"] is True
    stored = await db.scalar(
        select(OrganizationNotificationChannelConfig).where(
            OrganizationNotificationChannelConfig.id
            == uuid.UUID(configured.json()["id"])
        )
    )
    assert stored is not None
    assert stored.secret_reference == "env://EVENTOS_TEST_CHANNEL_SECRET"


async def test_sms_delivery_is_tenant_scoped_idempotent_reserved_and_metered(
    client,
    db,
    event,
    organizer,
    monkeypatch,
):
    await activate_event_for_test(db, event)
    config = OrganizationNotificationChannelConfig(
        organization_id=event.organization_id,
        channel="SMS",
        provider="TEST",
        state="ACTIVE",
        configuration={},
        last_verified_at=datetime.now(timezone.utc),
    )
    db.add(config)
    await db.commit()

    scheduled: list[tuple[str, str]] = []

    def capture_delay(batch_id: str, organization_id: str) -> None:
        scheduled.append((batch_id, organization_id))

    monkeypatch.setattr(
        "app.modules.notifications.routers.notifications."
        "dispatch_communication_batch.delay",
        capture_delay,
    )
    key = f"sms-batch-{uuid.uuid4()}"
    request = {
        "recipients": ["+919876543234", "+919876540000"],
        "body": "Registration desk opens at eight.",
        "reason": "Send an approved operational update",
        "case_reference": "OPS-SMS-1",
    }
    queued = await client.post(
        f"/api/v1/events/{event.id}/notifications/channels/SMS/deliveries",
        json=request,
        headers={
            **auth_headers(organizer),
            "Idempotency-Key": key,
        },
    )
    assert queued.status_code == 202, queued.text
    assert queued.json()["status"] == "QUEUED"
    assert queued.json()["requested_count"] == 2
    assert scheduled == [
        (queued.json()["id"], str(event.organization_id))
    ]

    batch = await ChannelDeliveryService.process_batch(
        db,
        batch_id=uuid.UUID(queued.json()["id"]),
        organization_id=event.organization_id,
    )
    await db.commit()
    assert batch.status == "PARTIAL"
    assert batch.accepted_count == 1
    assert batch.failed_count == 1

    stored = (
        await db.scalars(
            select(CommunicationDelivery).where(
                CommunicationDelivery.batch_id == batch.id
            )
        )
    ).all()
    assert len(stored) == 2
    assert all(row.recipient_ciphertext.startswith("v1:") for row in stored)
    assert all("+919876" not in row.recipient_ciphertext for row in stored)
    assert {row.status for row in stored} == {"ACCEPTED", "FAILED"}

    usage = await db.scalar(
        select(UsageLedgerEntry).where(
            UsageLedgerEntry.organization_id == event.organization_id,
            UsageLedgerEntry.event_id == event.id,
            UsageLedgerEntry.metric_key == "sms_sent",
        )
    )
    assert usage is not None
    assert usage.quantity == 1

    replay = await client.post(
        f"/api/v1/events/{event.id}/notifications/channels/SMS/deliveries",
        json=request,
        headers={
            **auth_headers(organizer),
            "Idempotency-Key": key,
        },
    )
    assert replay.status_code == 202, replay.text
    assert replay.json()["replayed"] is True
    assert replay.json()["id"] == str(batch.id)
    assert replay.json()["status"] == "PARTIAL"
    assert len(scheduled) == 1

    history = await client.get(
        f"/api/v1/events/{event.id}/notifications/channels/SMS/deliveries",
        headers=auth_headers(organizer),
    )
    assert history.status_code == 200, history.text
    assert history.json()["items"][0]["id"] == str(batch.id)
    assert "content_ciphertext" not in history.json()["items"][0]


async def test_delivery_idempotency_rejects_changed_payload(
    client,
    db,
    event,
    organizer,
    monkeypatch,
):
    await activate_event_for_test(db, event)
    db.add(
        OrganizationNotificationChannelConfig(
            organization_id=event.organization_id,
            channel="SMS",
            provider="TEST",
            state="ACTIVE",
            configuration={},
            last_verified_at=datetime.now(timezone.utc),
        )
    )
    await db.commit()
    monkeypatch.setattr(
        "app.modules.notifications.routers.notifications."
        "dispatch_communication_batch.delay",
        lambda *_args: None,
    )
    key = f"sms-conflict-{uuid.uuid4()}"
    headers = {
        **auth_headers(organizer),
        "Idempotency-Key": key,
    }
    first = await client.post(
        f"/api/v1/events/{event.id}/notifications/channels/SMS/deliveries",
        json={
            "recipients": ["+919876543210"],
            "body": "First approved message.",
            "reason": "Send the first approved message",
        },
        headers=headers,
    )
    assert first.status_code == 202, first.text
    conflict = await client.post(
        f"/api/v1/events/{event.id}/notifications/channels/SMS/deliveries",
        json={
            "recipients": ["+919876543210"],
            "body": "Changed message under the same key.",
            "reason": "Attempt a conflicting message",
        },
        headers=headers,
    )
    assert conflict.status_code == 409
    assert _denial_code(conflict) == "IDEMPOTENCY_CONFLICT"
