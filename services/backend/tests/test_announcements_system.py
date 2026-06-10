# tests/test_announcements_system.py
from __future__ import annotations

import uuid
import pytest
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.communications.models.announcement import Announcement


from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_announcements_crud_and_permissions(
    client: AsyncClient,
    db: AsyncSession,
    event: Event,
    organizer: User,
):
    headers = auth_headers(organizer)
    # 1. Create an announcement as organizer / admin
    ann_data = {
        "title": "Welcome Announcement",
        "body": "This is the **markdown** body of the welcome announcement.",
        "audience": "all",
        "priority": "critical",
        "is_pinned": True,
        "scheduled_at": None,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
        "attachments": [
            {"type": "link", "name": "Google", "url": "https://google.com"}
        ]
    }

    # Authenticated request
    resp = await client.post(
        f"/api/v1/events/{event.id}/announcements",
        json=ann_data,
        headers=headers
    )
    assert resp.status_code == 201
    created = resp.json()
    assert created["title"] == "Welcome Announcement"
    assert created["priority"] == "critical"
    assert created["is_pinned"] is True
    assert len(created["attachments"]) == 1
    assert created["attachments"][0]["name"] == "Google"

    announcement_id = created["id"]

    # 2. Get announcements list as organizer
    resp_list = await client.get(
        f"/api/v1/events/{event.id}/announcements",
        headers=headers
    )
    assert resp_list.status_code == 200
    anns = resp_list.json()
    assert len(anns) >= 1
    assert anns[0]["id"] == announcement_id

    # 3. Try to create announcement without permissions
    bad_headers = {} # unauthenticated
    resp_bad = await client.post(
        f"/api/v1/events/{event.id}/announcements",
        json=ann_data,
        headers=bad_headers
    )
    assert resp_bad.status_code == 401

    # 4. Delete the announcement
    resp_del = await client.delete(
        f"/api/v1/events/{event.id}/announcements/{announcement_id}",
        headers=headers
    )
    assert resp_del.status_code == 200
    assert resp_del.json()["message"] == "Announcement deleted successfully."

    # Check db
    deleted_ann = (await db.execute(
        select(Announcement).where(Announcement.id == uuid.UUID(announcement_id))
    )).scalar_one_or_none()
    assert deleted_ann is None


@pytest.mark.asyncio
async def test_announcements_upload_attachment(
    client: AsyncClient,
    db: AsyncSession,
    event: Event,
    organizer: User,
):
    headers = auth_headers(organizer)
    # Test upload endpoint
    ann_id = str(uuid.uuid4())
    files = {"file": ("guidelines.pdf", b"%PDF-1.4 dummy", "application/pdf")}
    data = {"announcement_id": ann_id}

    resp = await client.post(
        f"/api/v1/events/{event.id}/announcements/upload",
        files=files,
        data=data,
        headers=headers
    )

    assert resp.status_code == 200
    uploaded = resp.json()
    assert uploaded["type"] == "file"
    assert uploaded["name"] == "guidelines.pdf"
    assert uploaded["size"] == len(b"%PDF-1.4 dummy")
    assert "guidelines.pdf" in uploaded["url"]
    assert "storage_path" in uploaded


@pytest.mark.asyncio
async def test_announcements_verify_link(
    client: AsyncClient,
    db: AsyncSession,
    event: Event,
    organizer: User,
    mocker,
):
    headers = auth_headers(organizer)
    # Mock httpx response for URL verification
    class MockResponse:
        status_code = 200
        text = "<html><head><title>Test Event Program</title></head></html>"

    async def mock_get(*args, **kwargs):
        return MockResponse()

    mocker.patch("httpx.AsyncClient.get", side_effect=mock_get)

    payload = {"url": "https://example.com/program"}
    resp = await client.post(
        f"/api/v1/events/{event.id}/announcements/verify-link",
        json=payload,
        headers=headers
    )

    assert resp.status_code == 200
    res_data = resp.json()
    assert res_data["reachable"] is True
    assert res_data["title"] == "Test Event Program"


@pytest.mark.asyncio
async def test_announcements_signed_url(
    client: AsyncClient,
    db: AsyncSession,
):
    # Test getting presigned download URL
    storage_path = "some-event-id/announcements/ann-id/test.pdf"
    resp = await client.get(f"/api/v1/portal/announcements/signed-url?storage_path={storage_path}")

    assert resp.status_code == 200
    data = resp.json()
    assert "url" in data
    # For local storage mode, should return a local API storage url
    assert "storage" in data["url"]
    assert "test.pdf" in data["url"]
