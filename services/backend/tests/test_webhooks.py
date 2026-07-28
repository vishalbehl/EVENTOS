# tests/test_webhooks.py
from __future__ import annotations

import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.events.models.event import Event
from app.modules.platform.models.organization import Organization
from app.modules.identity.models.user import User
from app.modules.integrations.models.webhook import Webhook
from tests.conftest import activate_event_for_test, auth_headers


BASE = "/events/{event_id}/webhooks"


def governed_headers(user: User, *, version: int | None = None) -> dict:
    headers = {**auth_headers(user), "Idempotency-Key": str(uuid.uuid4())}
    if version is not None:
        headers["If-Match"] = str(version)
    return headers


@pytest.fixture(autouse=True)
async def licensed_event(db: AsyncSession, event: Event) -> None:
    await activate_event_for_test(db, event)


class TestWebhookCRUD:
    async def test_create_webhook_success(
        self, client: AsyncClient, event: Event, organizer: User
    ):
        resp = await client.post(
            BASE.format(event_id=event.id),
            json={
                "url": "https://example.com/hook",
                "subscribed_events": ["file.approved", "speaker.checked_in"],
                "description": "Test hook",
                "secret": "mysupersecret",
            },
            headers=governed_headers(organizer),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["url"] == "https://example.com/hook"
        assert data["status"] == "active"
        assert "secret" in data and data["secret"] == "mysupersecret"
        # ID must be a valid UUID
        import uuid
        uuid.UUID(data["id"])

    async def test_create_webhook_invalid_event_type(
        self, client: AsyncClient, event: Event, organizer: User
    ):
        resp = await client.post(
            BASE.format(event_id=event.id),
            json={
                "url": "https://example.com/hook",
                "subscribed_events": ["invalid.event"],
            },
            headers=governed_headers(organizer),
        )
        assert resp.status_code == 422

    async def test_create_webhook_invalid_url(
        self, client: AsyncClient, event: Event, organizer: User
    ):
        resp = await client.post(
            BASE.format(event_id=event.id),
            json={
                "url": "not-a-url",
                "subscribed_events": ["file.approved"],
            },
            headers=governed_headers(organizer),
        )
        assert resp.status_code == 422

    async def test_create_webhook_empty_events(
        self, client: AsyncClient, event: Event, organizer: User
    ):
        resp = await client.post(
            BASE.format(event_id=event.id),
            json={
                "url": "https://example.com/hook",
                "subscribed_events": [],
            },
            headers=governed_headers(organizer),
        )
        assert resp.status_code == 422

    async def test_list_webhooks_empty(
        self, client: AsyncClient, event: Event, organizer: User
    ):
        resp = await client.get(
            BASE.format(event_id=event.id),
            headers=governed_headers(organizer),
        )
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_list_webhooks_returns_created(
        self, client: AsyncClient, event: Event, organizer: User
    ):
        await client.post(
            BASE.format(event_id=event.id),
            json={"url": "https://hook1.com", "subscribed_events": ["file.uploaded"]},
            headers=governed_headers(organizer),
        )
        resp = await client.get(
            BASE.format(event_id=event.id), headers=auth_headers(organizer)
        )
        assert resp.status_code == 200
        hooks = resp.json()
        assert len(hooks) >= 1
        assert hooks[0]["url"] == "https://hook1.com"

    async def test_get_webhook_by_id(
        self, client: AsyncClient, event: Event, organizer: User
    ):
        create_resp = await client.post(
            BASE.format(event_id=event.id),
            json={"url": "https://hook2.com", "subscribed_events": ["file.approved"]},
            headers=governed_headers(organizer),
        )
        hook_id = create_resp.json()["id"]
        get_resp = await client.get(
            f"{BASE.format(event_id=event.id)}/{hook_id}",
            headers=auth_headers(organizer),
        )
        assert get_resp.status_code == 200
        assert get_resp.json()["id"] == hook_id

    async def test_get_webhook_not_found(
        self, client: AsyncClient, event: Event, organizer: User
    ):
        import uuid
        resp = await client.get(
            f"{BASE.format(event_id=event.id)}/{uuid.uuid4()}",
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 404

    async def test_update_webhook_pause(
        self, client: AsyncClient, event: Event, organizer: User
    ):
        create = await client.post(
            BASE.format(event_id=event.id),
            json={"url": "https://hook3.com", "subscribed_events": ["file.approved"]},
            headers=governed_headers(organizer),
        )
        hook_id = create.json()["id"]
        hook_version = create.json()["version"]
        patch = await client.patch(
            f"{BASE.format(event_id=event.id)}/{hook_id}",
            json={"status": "paused"},
            headers=governed_headers(organizer, version=hook_version),
        )
        assert patch.status_code == 200
        assert patch.json()["status"] == "paused"

    async def test_delete_webhook(
        self, client: AsyncClient, event: Event, organizer: User
    ):
        create = await client.post(
            BASE.format(event_id=event.id),
            json={"url": "https://hook4.com", "subscribed_events": ["import.completed"]},
            headers=governed_headers(organizer),
        )
        hook_id = create.json()["id"]
        hook_version = create.json()["version"]
        delete = await client.delete(
            f"{BASE.format(event_id=event.id)}/{hook_id}",
            headers=governed_headers(organizer, version=hook_version),
        )
        assert delete.status_code == 200
        # Confirm it's gone
        get = await client.get(
            f"{BASE.format(event_id=event.id)}/{hook_id}",
            headers=auth_headers(organizer),
        )
        assert get.status_code == 404

    async def test_duplicate_url_rejected(
        self, client: AsyncClient, event: Event, organizer: User
    ):
        payload = {"url": "https://unique.com/hook", "subscribed_events": ["file.approved"]}
        r1 = await client.post(BASE.format(event_id=event.id), json=payload, headers=governed_headers(organizer))
        assert r1.status_code == 201
        r2 = await client.post(BASE.format(event_id=event.id), json=payload, headers=governed_headers(organizer))
        assert r2.status_code == 409

    async def test_unauthenticated_request_rejected(
        self, client: AsyncClient, event: Event
    ):
        resp = await client.get(BASE.format(event_id=event.id))
        assert resp.status_code == 401
