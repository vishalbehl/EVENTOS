from __future__ import annotations

import uuid
from urllib.parse import parse_qs, urlparse

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.communications.models.email_asset import EmailAsset
from app.modules.communications.models.email_component import EmailComponent
from app.modules.communications.models.email_template import EmailTemplate
from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.platform.models.organization_console import UsageLedgerEntry
from tests.conftest import activate_event_for_test, auth_headers


PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"email-designer-image"


@pytest.mark.asyncio
async def test_email_asset_upload_is_validated_metered_and_token_served(
    client: AsyncClient,
    db: AsyncSession,
    event: Event,
    organizer: User,
    monkeypatch: pytest.MonkeyPatch,
):
    await activate_event_for_test(db, event)
    stored: dict[str, object] = {}

    def fake_upload_bytes(*, bucket, storage_path, data, content_type):
        stored.update(
            bucket=bucket,
            storage_path=storage_path,
            data=data,
            content_type=content_type,
        )

    def fake_get_object_bytes(bucket, storage_path):
        assert bucket == stored["bucket"]
        assert storage_path == stored["storage_path"]
        return stored["data"]

    monkeypatch.setattr(
        "app.modules.notifications.routers.notifications.upload_service.upload_bytes",
        fake_upload_bytes,
    )
    monkeypatch.setattr(
        "app.modules.notifications.routers.notifications.upload_service.get_object_bytes",
        fake_get_object_bytes,
    )

    response = await client.post(
        f"/api/v1/events/{event.id}/emails/assets/upload",
        files={"file": ("header.png", PNG_BYTES, "image/png")},
        headers={
            **auth_headers(organizer),
            "Idempotency-Key": f"email-asset-{uuid.uuid4()}",
        },
    )
    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["name"] == "header.png"
    assert payload["file_type"] == "image/png"
    assert payload["size_bytes"] == len(PNG_BYTES)
    assert str(event.organization_id) in str(stored["storage_path"])
    assert str(event.id) in str(stored["storage_path"])

    asset = await db.scalar(
        select(EmailAsset).where(EmailAsset.id == uuid.UUID(payload["id"]))
    )
    assert asset is not None
    assert asset.access_token_hash not in payload["url"]
    usage = await db.scalar(
        select(UsageLedgerEntry).where(
            UsageLedgerEntry.organization_id == event.organization_id,
            UsageLedgerEntry.event_id == event.id,
            UsageLedgerEntry.metric_key == "storage_bytes",
        )
    )
    assert usage is not None
    assert usage.quantity == len(PNG_BYTES)

    image_url = urlparse(payload["url"])
    token = parse_qs(image_url.query)["token"][0]
    download = await client.get(
        f"/api/v1/events/{event.id}/emails/assets/{payload['id']}/download",
        params={"token": token},
    )
    assert download.status_code == 200
    assert download.content == PNG_BYTES
    assert download.headers["content-type"] == "image/png"
    assert download.headers["x-content-type-options"] == "nosniff"

    invalid_token = await client.get(
        f"/api/v1/events/{event.id}/emails/assets/{payload['id']}/download",
        params={"token": "x" * 40},
    )
    assert invalid_token.status_code == 404
    wrong_event = await client.get(
        f"/api/v1/events/{uuid.uuid4()}/emails/assets/{payload['id']}/download",
        params={"token": token},
    )
    assert wrong_event.status_code == 404


@pytest.mark.asyncio
async def test_email_asset_upload_rejects_untrusted_or_unbounded_input(
    client: AsyncClient,
    db: AsyncSession,
    event: Event,
    organizer: User,
):
    await activate_event_for_test(db, event)
    headers = {
        **auth_headers(organizer),
        "Idempotency-Key": f"email-asset-{uuid.uuid4()}",
    }

    disguised = await client.post(
        f"/api/v1/events/{event.id}/emails/assets/upload",
        files={"file": ("attack.png", b"<script>alert(1)</script>", "image/png")},
        headers=headers,
    )
    assert disguised.status_code == 415
    assert disguised.json()["detail"]["code"] == "INVALID_EMAIL_ASSET_CONTENT"

    svg = await client.post(
        f"/api/v1/events/{event.id}/emails/assets/upload",
        files={"file": ("vector.svg", b"<svg/>", "image/svg+xml")},
        headers={**headers, "Idempotency-Key": f"email-asset-{uuid.uuid4()}"},
    )
    assert svg.status_code == 415
    assert svg.json()["detail"]["code"] == "UNSUPPORTED_EMAIL_ASSET_TYPE"

    too_large = await client.post(
        f"/api/v1/events/{event.id}/emails/assets/upload",
        files={
            "file": (
                "large.png",
                b"\x89PNG\r\n\x1a\n" + b"0" * (5 * 1024 * 1024),
                "image/png",
            )
        },
        headers={**headers, "Idempotency-Key": f"email-asset-{uuid.uuid4()}"},
    )
    assert too_large.status_code == 413
    assert too_large.json()["detail"]["code"] == "EMAIL_ASSET_TOO_LARGE"


@pytest.mark.asyncio
async def test_email_asset_management_requires_auth_and_idempotency(
    client: AsyncClient,
    db: AsyncSession,
    event: Event,
    organizer: User,
):
    await activate_event_for_test(db, event)
    files = {"file": ("header.png", PNG_BYTES, "image/png")}

    unauthenticated = await client.post(
        f"/api/v1/events/{event.id}/emails/assets/upload",
        files=files,
        headers={"Idempotency-Key": f"email-asset-{uuid.uuid4()}"},
    )
    assert unauthenticated.status_code == 401

    missing_idempotency = await client.post(
        f"/api/v1/events/{event.id}/emails/assets/upload",
        files=files,
        headers=auth_headers(organizer),
    )
    assert missing_idempotency.status_code == 422


@pytest.mark.asyncio
async def test_email_designer_document_persists_through_canonical_template_service(
    client: AsyncClient,
    db: AsyncSession,
    event: Event,
    organizer: User,
):
    await activate_event_for_test(db, event)
    designer_document = {"editor": "eventos-html", "version": 1, "blocks": []}
    created = await client.post(
        f"/api/v1/events/{event.id}/notifications/templates",
        headers=auth_headers(organizer),
        json={
            "name": "Designer persistence",
            "template_type": "custom",
            "target_type": "speaker",
            "subject": "{{EventName}} update",
            "body_html": "<p>Hello {{SpeakerName}}</p>",
            "designer_json": designer_document,
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["designer_json"] == designer_document

    template_id = uuid.UUID(created.json()["id"])
    row = await db.get(EmailTemplate, template_id)
    assert row is not None
    assert row.event_id == event.id
    assert row.designer_json == designer_document

    updated_document = {**designer_document, "version": 2}
    updated = await client.patch(
        f"/api/v1/events/{event.id}/notifications/templates/{template_id}",
        headers=auth_headers(organizer),
        json={
            "body_html": "<p>Updated {{SpeakerName}}</p>",
            "designer_json": updated_document,
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["designer_json"] == updated_document


@pytest.mark.asyncio
async def test_email_components_are_event_scoped_gated_and_recoverable(
    client: AsyncClient,
    db: AsyncSession,
    event: Event,
    organizer: User,
):
    await activate_event_for_test(db, event)
    headers = {
        **auth_headers(organizer),
        "Idempotency-Key": f"email-component-{uuid.uuid4()}",
    }
    global_attempt = await client.post(
        f"/api/v1/events/{event.id}/notifications/components",
        headers=headers,
        json={
            "name": "Global footer",
            "component_type": "footer",
            "default_config": {"text": "Global"},
            "is_global": True,
        },
    )
    assert global_attempt.status_code == 403
    assert (
        global_attempt.json()["detail"]["code"]
        == "COMMAND_CENTER_GLOBAL_COMPONENT_REQUIRED"
    )

    created = await client.post(
        f"/api/v1/events/{event.id}/notifications/components",
        headers={**headers, "Idempotency-Key": f"email-component-{uuid.uuid4()}"},
        json={
            "name": "Event footer",
            "component_type": "footer",
            "default_config": {"text": "Event only"},
            "is_global": False,
        },
    )
    assert created.status_code == 201, created.text
    component_id = uuid.UUID(created.json()["id"])
    assert created.json()["event_id"] == str(event.id)
    assert created.json()["is_global"] is False

    listed = await client.get(
        f"/api/v1/events/{event.id}/notifications/components",
        headers=auth_headers(organizer),
    )
    assert listed.status_code == 200, listed.text
    assert str(component_id) in {item["id"] for item in listed.json()}

    archived = await client.delete(
        f"/api/v1/events/{event.id}/notifications/components/{component_id}",
        headers=auth_headers(organizer),
    )
    assert archived.status_code == 204, archived.text
    row = await db.get(EmailComponent, component_id)
    assert row is not None
    assert row.deleted_at is not None
    assert row.deleted_by == organizer.id
