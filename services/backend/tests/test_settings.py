# tests/test_settings.py
from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from tests.conftest import auth_headers


BASE = "/events/{event_id}/settings"


class TestSettingsGet:
    async def test_get_settings_defaults(
        self, client: AsyncClient, event: Event, organizer: User
    ):
        resp = await client.get(BASE.format(event_id=event.id), headers=auth_headers(organizer))
        assert resp.status_code == 200
        data = resp.json()
        assert data["event_id"] == str(event.id)
        assert "max_file_size_mb" in data
        assert "allowed_formats" in data
        assert "feature_toggles" in data
        assert "license_tier" in data

    async def test_unauthenticated_rejected(self, client: AsyncClient, event: Event):
        resp = await client.get(BASE.format(event_id=event.id))
        assert resp.status_code == 401


class TestSettingsUpdate:
    async def test_update_max_file_size(
        self, client: AsyncClient, event: Event, organizer: User
    ):
        resp = await client.patch(
            BASE.format(event_id=event.id),
            json={"max_file_size_mb": 200},
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 200
        assert resp.json()["max_file_size_mb"] == 200

    async def test_invalid_file_size_rejected(
        self, client: AsyncClient, event: Event, organizer: User
    ):
        resp = await client.patch(
            BASE.format(event_id=event.id),
            json={"max_file_size_mb": 9999},
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 422

    async def test_update_theme_color(
        self, client: AsyncClient, event: Event, organizer: User
    ):
        resp = await client.patch(
            BASE.format(event_id=event.id),
            json={"theme_color": "#FF5733"},
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 200
        # Returned in both the flat field and the branding_settings sub-document
        assert resp.json()["theme_color"] == "#FF5733"
        assert resp.json()["branding_settings"]["theme_color"] == "#FF5733"

    async def test_invalid_color_rejected(
        self, client: AsyncClient, event: Event, organizer: User
    ):
        resp = await client.patch(
            BASE.format(event_id=event.id),
            json={"theme_color": "not-a-color"},
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 422

    async def test_custom_formats_are_allowed(
        self, client: AsyncClient, event: Event, organizer: User
    ):
        resp = await client.patch(
            BASE.format(event_id=event.id),
            json={"allowed_formats": ["zip", "folder", "fig"]},
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 200
        assert resp.json()["allowed_formats"] == ["zip", "folder", "fig"]

    async def test_update_feature_toggles_partial(
        self, client: AsyncClient, event: Event, organizer: User
    ):
        resp = await client.patch(
            BASE.format(event_id=event.id),
            json={"feature_toggles": {"enable_whatsapp": True}},
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 200
        toggles = resp.json()["feature_toggles"]
        assert toggles["enable_whatsapp"] is True
        # Other keys should still be present
        assert "enable_posters" in toggles

    async def test_license_tier_requires_super_admin(
        self, client: AsyncClient, event: Event, organizer: User
    ):
        resp = await client.patch(
            BASE.format(event_id=event.id),
            json={"license_tier": "enterprise"},
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 403

    async def test_license_tier_updated_by_super_admin(
        self, client: AsyncClient, event: Event, super_admin: User
    ):
        resp = await client.patch(
            BASE.format(event_id=event.id),
            json={"license_tier": "enterprise"},
            headers=auth_headers(super_admin),
        )
        assert resp.status_code == 200
        assert resp.json()["license_tier"] == "enterprise"

    async def test_live_event_mode_locks_organizer_settings(
        self, client: AsyncClient, event: Event, organizer: User, super_admin: User
    ):
        enabled = await client.patch(
            BASE.format(event_id=event.id),
            json={"event_mode": True},
            headers=auth_headers(super_admin),
        )
        assert enabled.status_code == 200
        assert enabled.json()["event_mode"] is True

        resp = await client.patch(
            BASE.format(event_id=event.id),
            json={"max_file_size_mb": 200},
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 403
        assert "live mode" in resp.json()["detail"]

    async def test_invalid_license_tier_rejected(
        self, client: AsyncClient, event: Event, super_admin: User
    ):
        resp = await client.patch(
            BASE.format(event_id=event.id),
            json={"license_tier": "unicorn"},
            headers=auth_headers(super_admin),
        )
        assert resp.status_code == 422


class TestLicenseInfo:
    async def test_license_info_basic(
        self, client: AsyncClient, event: Event, organizer: User
    ):
        resp = await client.get(
            f"{BASE.format(event_id=event.id)}/license",
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["tier"] in ("basic", "pro", "enterprise")
        assert "max_events" in data
        assert "webhooks_enabled" in data


class TestResetToggles:
    async def test_reset_feature_toggles(
        self, client: AsyncClient, event: Event, organizer: User
    ):
        # First set a toggle
        await client.patch(
            BASE.format(event_id=event.id),
            json={"feature_toggles": {"enable_whatsapp": True}},
            headers=auth_headers(organizer),
        )
        # Reset
        resp = await client.post(
            f"{BASE.format(event_id=event.id)}/reset-toggles",
            headers=auth_headers(organizer),
        )
        assert resp.status_code == 200
        assert resp.json()["feature_toggles"]["enable_whatsapp"] is False
