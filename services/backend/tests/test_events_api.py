# tests/test_events_api.py
from __future__ import annotations

import uuid
from datetime import date
import pytest
from httpx import AsyncClient

from app.modules.rbac.models.event import Event
from app.modules.auth.models.user import User
from tests.conftest import auth_headers


BASE_URL = "/events"
DETAIL_URL = "/events/{event_id}"


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
            "speaker_mode_enabled": False,
            "registration_mode_enabled": False,
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
            "speaker_mode_enabled": True,
            "registration_mode_enabled": False,
        }
        resp = await client.post(
            BASE_URL,
            json=payload,
            headers=auth_headers(super_admin),
        )
        assert resp.status_code == 201 or resp.status_code == 200
        data = resp.json()
        assert data["speaker_mode_enabled"] is True
        assert data["registration_mode_enabled"] is False


class TestEventsAPIUpdates:
    @pytest.mark.asyncio
    async def test_patch_event_one_mode_disabled_succeeds(
        self, client: AsyncClient, event: Event, super_admin: User
    ):
        # Disable registration mode (speaker mode is True by default)
        resp = await client.patch(
            DETAIL_URL.format(event_id=event.id),
            json={"registration_mode_enabled": False},
            headers=auth_headers(super_admin),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["speaker_mode_enabled"] is True
        assert data["registration_mode_enabled"] is False

    @pytest.mark.asyncio
    async def test_patch_event_both_modes_disabled_fails(
        self, client: AsyncClient, event: Event, super_admin: User
    ):
        # Trying to disable both modes in a single payload
        resp = await client.patch(
            DETAIL_URL.format(event_id=event.id),
            json={"speaker_mode_enabled": False, "registration_mode_enabled": False},
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
            json={"registration_mode_enabled": False},
            headers=auth_headers(super_admin),
        )
        assert resp1.status_code == 200
        assert resp1.json()["speaker_mode_enabled"] is True
        assert resp1.json()["registration_mode_enabled"] is False

        # 2. Try to disable speaker mode (which would make both False)
        resp2 = await client.patch(
            DETAIL_URL.format(event_id=event.id),
            json={"speaker_mode_enabled": False},
            headers=auth_headers(super_admin),
        )
        assert resp2.status_code == 422
        assert "At least one mode" in resp2.text
