# tests/test_events_api.py
from __future__ import annotations

import uuid
from datetime import date
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from tests.conftest import activate_event_for_test, auth_headers as _auth_headers


BASE_URL = "/events"
DETAIL_URL = "/events/{event_id}"


@pytest_asyncio.fixture(autouse=True)
async def _licensed_event(db: AsyncSession, event: Event):
    await activate_event_for_test(db, event)
    yield


def auth_headers(user: User) -> dict[str, str]:
    return {
        **_auth_headers(user),
        "Idempotency-Key": f"event-api-{uuid.uuid4()}",
    }


class TestEventsAPICreation:
    @pytest.mark.asyncio
    async def test_create_event_both_modes_disabled_fails(
        self, client: AsyncClient, super_admin: User
    ):
        payload = {
            "name": "Invalid Event Modes",
            "short_code": "INVMODES",
            "start_date": str(date(2026, 9, 1)),
            "end_date": str(date(2026, 9, 3)),
            "timezone": "UTC",
            "speaker_settings": {"enabled": False},
            "registration_settings": {"enabled": False},
        }
        resp = await client.post(
            BASE_URL,
            json=payload,
            headers=auth_headers(super_admin),
        )
        assert resp.status_code == 422
        assert "At least one mode" in resp.text

    @pytest.mark.asyncio
    async def test_create_event_one_mode_enabled_succeeds(
        self, client: AsyncClient, super_admin: User
    ):
        payload = {
            "name": "Speaker Only Event",
            "short_code": "SPKONLY",
            "start_date": str(date(2026, 9, 1)),
            "end_date": str(date(2026, 9, 3)),
            "timezone": "UTC",
            "speaker_settings": {"enabled": True},
            "registration_settings": {"enabled": False},
        }
        resp = await client.post(
            BASE_URL,
            json=payload,
            headers=auth_headers(super_admin),
        )
        assert resp.status_code == 201 or resp.status_code == 200
        data = resp.json()
        assert data["speaker_settings"]["enabled"] is True
        assert data["registration_settings"]["enabled"] is False


class TestEventsAPIUpdates:
    @pytest.mark.asyncio
    async def test_patch_event_one_mode_disabled_succeeds(
        self, client: AsyncClient, event: Event, super_admin: User
    ):
        # Disable registration mode (speaker mode is True by default)
        resp = await client.patch(
            DETAIL_URL.format(event_id=event.id),
            json={"registration_settings": {"enabled": False}},
            headers=auth_headers(super_admin),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["speaker_settings"]["enabled"] is True
        assert data["registration_settings"]["enabled"] is False

    @pytest.mark.asyncio
    async def test_patch_event_both_modes_disabled_fails(
        self, client: AsyncClient, event: Event, super_admin: User
    ):
        # Trying to disable both modes in a single payload
        resp = await client.patch(
            DETAIL_URL.format(event_id=event.id),
            json={
                "speaker_settings": {"enabled": False},
                "registration_settings": {"enabled": False},
            },
            headers=auth_headers(super_admin),
        )
        assert resp.status_code == 422
        assert "At least one mode" in resp.text

    @pytest.mark.asyncio
    async def test_patch_event_disable_remaining_mode_fails(
        self, client: AsyncClient, event: Event, super_admin: User
    ):
        # 1. Disable registration mode (speaker remains True)
        resp1 = await client.patch(
            DETAIL_URL.format(event_id=event.id),
            json={"registration_settings": {"enabled": False}},
            headers=auth_headers(super_admin),
        )
        assert resp1.status_code == 200
        assert resp1.json()["speaker_settings"]["enabled"] is True
        assert resp1.json()["registration_settings"]["enabled"] is False

        # 2. Try to disable speaker mode (which would make both False)
        resp2 = await client.patch(
            DETAIL_URL.format(event_id=event.id),
            json={"speaker_settings": {"enabled": False}},
            headers=auth_headers(super_admin),
        )
        assert resp2.status_code == 422
        assert "At least one mode" in resp2.text


class TestEventsAPIMetadata:
    @pytest.mark.asyncio
    async def test_create_event_with_metadata_succeeds(
        self, client: AsyncClient, super_admin: User
    ):
        payload = {
            "name": "Metadata Tech Summit",
            "short_code": "METATECH",
            "start_date": str(date(2026, 9, 1)),
            "end_date": str(date(2026, 9, 3)),
            "timezone": "UTC",
            "country": "India",
            "state": "Maharashtra",
            "location": "5th Avenue, Mumbai",
            "venue_name": "Grand Convention Center",
            "organizer_details": {
                "name": "Metatech Org",
                "email": "contact@metatech.org",
                "phone": "+91 9999999999",
                "website": "https://metatech.org"
            }
        }
        resp = await client.post(
            BASE_URL,
            json=payload,
            headers=auth_headers(super_admin),
        )
        assert resp.status_code == 201 or resp.status_code == 200
        data = resp.json()
        assert data["country"] == "India"
        assert data["state"] == "Maharashtra"
        assert data["venue_name"] == "Grand Convention Center"
        assert data["organizer_details"]["name"] == "Metatech Org"
        assert data["organizer_details"]["email"] == "contact@metatech.org"
        assert data["organizer_details"]["phone"] == "+91 9999999999"
        assert data["organizer_details"]["website"] == "https://metatech.org"

    @pytest.mark.asyncio
    async def test_patch_event_metadata_succeeds(
        self, client: AsyncClient, event: Event, super_admin: User
    ):
        payload = {
            "country": "United States",
            "state": "California",
            "organizer_details": {
                "name": "Updated Org",
                "email": "update@updated.org",
                "phone": "+1 555 1234",
                "website": "https://updated.org"
            }
        }
        resp = await client.patch(
            DETAIL_URL.format(event_id=event.id),
            json=payload,
            headers=auth_headers(super_admin),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["country"] == "United States"
        assert data["state"] == "California"
        assert data["organizer_details"]["name"] == "Updated Org"
        assert data["organizer_details"]["email"] == "update@updated.org"


class TestEventsAPIBranding:
    @pytest.mark.asyncio
    async def test_create_event_with_branding_succeeds(
        self, client: AsyncClient, super_admin: User
    ):
        payload = {
            "name": "Branded Event",
            "short_code": "BRANDED1",
            "start_date": str(date(2026, 9, 1)),
            "end_date": str(date(2026, 9, 3)),
            "timezone": "UTC",
            "branding_settings": {
                "theme_color": "#FF5733",
                "logo_url": "https://example.com/logo.png",
                "banner_url": None,
            }
        }
        resp = await client.post(
            BASE_URL,
            json=payload,
            headers=auth_headers(super_admin),
        )
        assert resp.status_code in (200, 201)
        data = resp.json()
        assert data["branding_settings"]["theme_color"] == "#FF5733"
        assert data["branding_settings"]["logo_url"] == "https://example.com/logo.png"
