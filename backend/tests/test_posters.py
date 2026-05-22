# tests/test_posters.py
from __future__ import annotations

import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import Event
from app.models.poster import Poster
from app.models.user import User
from tests.conftest import auth_headers


BASE = "/events/{event_id}/posters"


@pytest.fixture
async def poster(db: AsyncSession, event: Event) -> Poster:
    """Create a submitted poster for testing."""
    p = Poster(
        event_id=event.id,
        title="AI in Medical Imaging",
        authors="Dr. Jane Doe, Prof. John Smith",
        category="Technology",
        abstract="This poster explores AI applications in radiology.",
        status="submitted",
    )
    db.add(p)
    await db.flush()
    return p


class TestPosterCRUD:
    async def test_create_poster(
        self, client: AsyncClient, event: Event, organizer: User
    ):
        resp = await client.post(
            BASE.format(event_id=event.id),
            json={
                "title": "Genomics in 2026",
                "authors": "Dr. Alice",
                "category": "Biology",
                "abstract": "Abstract text here.",
            },
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "Genomics in 2026"
        assert data["status"] == "submitted"

    async def test_create_poster_short_title_rejected(
        self, client: AsyncClient, event: Event, organizer: User
    ):
        resp = await client.post(
            BASE.format(event_id=event.id),
            json={"title": "Hi", "authors": "Someone"},
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 422

    async def test_list_posters_empty(
        self, client: AsyncClient, event: Event, organizer: User
    ):
        resp = await client.get(BASE.format(event_id=event.id), headers=auth_headers(organizer))
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_list_posters_status_filter(
        self, client: AsyncClient, event: Event, organizer: User, poster: Poster
    ):
        resp = await client.get(
            BASE.format(event_id=event.id),
            params={"status": "submitted"},
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 200
        for p in resp.json():
            assert p["status"] == "submitted"

    async def test_get_poster(
        self, client: AsyncClient, event: Event, organizer: User, poster: Poster
    ):
        resp = await client.get(
            f"{BASE.format(event_id=event.id)}/{poster.id}",
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 200
        assert resp.json()["id"] == str(poster.id)

    async def test_get_poster_not_found(
        self, client: AsyncClient, event: Event, organizer: User
    ):
        resp = await client.get(
            f"{BASE.format(event_id=event.id)}/{uuid.uuid4()}",
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 404

    async def test_update_poster(
        self, client: AsyncClient, event: Event, organizer: User, poster: Poster
    ):
        resp = await client.patch(
            f"{BASE.format(event_id=event.id)}/{poster.id}",
            json={"category": "Updated Category"},
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 200
        assert resp.json()["category"] == "Updated Category"

    async def test_delete_poster(
        self, client: AsyncClient, event: Event, organizer: User, poster: Poster
    ):
        resp = await client.delete(
            f"{BASE.format(event_id=event.id)}/{poster.id}",
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 200
        get = await client.get(
            f"{BASE.format(event_id=event.id)}/{poster.id}",
            headers=auth_headers(organizer),
        )
        assert get.status_code == 404


class TestPosterReviewWorkflow:
    async def test_mark_under_review(
        self, client: AsyncClient, event: Event, organizer: User, poster: Poster
    ):
        resp = await client.post(
            f"{BASE.format(event_id=event.id)}/{poster.id}/mark-under-review",
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "under_review"

    async def test_approve_poster(
        self, client: AsyncClient, event: Event, organizer: User, poster: Poster
    ):
        resp = await client.post(
            f"{BASE.format(event_id=event.id)}/{poster.id}/review",
            json={"decision": "approved"},
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "approved"
        assert data["reviewed_by"] == str(organizer.id)
        assert data["reviewed_at"] is not None

    async def test_reject_poster_with_reason(
        self, client: AsyncClient, event: Event, organizer: User, poster: Poster
    ):
        resp = await client.post(
            f"{BASE.format(event_id=event.id)}/{poster.id}/review",
            json={"decision": "rejected", "rejection_reason": "Poor quality image"},
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "rejected"
        assert data["rejection_reason"] == "Poor quality image"

    async def test_cannot_approve_already_approved(
        self, client: AsyncClient, event: Event, organizer: User, poster: Poster
    ):
        # Approve first
        await client.post(
            f"{BASE.format(event_id=event.id)}/{poster.id}/review",
            json={"decision": "approved"},
            headers=auth_headers(organizer),
        )
        # Try again
        resp = await client.post(
            f"{BASE.format(event_id=event.id)}/{poster.id}/review",
            json={"decision": "rejected", "rejection_reason": "Too late"},
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 409

    async def test_cannot_delete_approved_poster(
        self, client: AsyncClient, event: Event, organizer: User, poster: Poster
    ):
        await client.post(
            f"{BASE.format(event_id=event.id)}/{poster.id}/review",
            json={"decision": "approved"},
            headers=auth_headers(organizer),
        )
        resp = await client.delete(
            f"{BASE.format(event_id=event.id)}/{poster.id}",
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 409

    async def test_withdraw_poster(
        self, client: AsyncClient, event: Event, organizer: User, poster: Poster
    ):
        resp = await client.post(
            f"{BASE.format(event_id=event.id)}/{poster.id}/withdraw",
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "withdrawn"


class TestPosterScheduling:
    async def test_schedule_approved_poster(
        self, client: AsyncClient, event: Event, organizer: User, poster: Poster
    ):
        # Approve first
        await client.post(
            f"{BASE.format(event_id=event.id)}/{poster.id}/review",
            json={"decision": "approved"},
            headers=auth_headers(organizer),
        )
        # Schedule it
        resp = await client.post(
            f"{BASE.format(event_id=event.id)}/{poster.id}/schedule",
            json={"display_screen": "lobby-left", "display_order": 1, "is_featured": True},
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["display_screen"] == "lobby-left"
        assert data["display_order"] == 1
        assert data["is_featured"] is True

    async def test_cannot_schedule_unapproved_poster(
        self, client: AsyncClient, event: Event, organizer: User, poster: Poster
    ):
        resp = await client.post(
            f"{BASE.format(event_id=event.id)}/{poster.id}/schedule",
            json={"display_screen": "screen-1"},
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 409

    async def test_get_screen_posters(
        self, client: AsyncClient, event: Event, organizer: User, poster: Poster
    ):
        # Approve and schedule
        await client.post(
            f"{BASE.format(event_id=event.id)}/{poster.id}/review",
            json={"decision": "approved"},
            headers=auth_headers(organizer),
        )
        await client.post(
            f"{BASE.format(event_id=event.id)}/{poster.id}/schedule",
            json={"display_screen": "screen-kiosk-1"},
            headers=auth_headers(organizer),
        )
        # Get screen posters (public endpoint)
        resp = await client.get(
            f"{BASE.format(event_id=event.id)}/screens/screen-kiosk-1",
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) >= 1
        assert all(p["status"] == "approved" for p in items)

    async def test_unschedule_poster(
        self, client: AsyncClient, event: Event, organizer: User, poster: Poster
    ):
        await client.post(
            f"{BASE.format(event_id=event.id)}/{poster.id}/review",
            json={"decision": "approved"},
            headers=auth_headers(organizer),
        )
        await client.post(
            f"{BASE.format(event_id=event.id)}/{poster.id}/schedule",
            json={"display_screen": "screen-2"},
            headers=auth_headers(organizer),
        )
        resp = await client.delete(
            f"{BASE.format(event_id=event.id)}/{poster.id}/schedule",
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 200
        assert resp.json()["display_screen"] is None
