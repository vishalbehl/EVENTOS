# tests/test_global_settings.py
from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.modules.auth.models.user import User
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_get_global_settings(client: AsyncClient):
    resp = await client.get("/api/v1/global-settings")
    assert resp.status_code == 200
    data = resp.json()
    assert "timezone" in data
    # Default is Asia/Kolkata
    assert data["timezone"] == "Asia/Kolkata"


@pytest.mark.asyncio
async def test_update_global_settings_requires_super_admin(
    client: AsyncClient, organizer: User
):
    resp = await client.patch(
        "/api/v1/global-settings",
        json={"timezone": "UTC"},
        headers=auth_headers(organizer)
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_update_global_settings_super_admin_success(
    client: AsyncClient, super_admin: User
):
    # Set to Europe/London
    resp = await client.patch(
        "/api/v1/global-settings",
        json={"timezone": "Europe/London"},
        headers=auth_headers(super_admin)
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["timezone"] == "Europe/London"

    # Verify cache / GET updates
    resp_get = await client.get("/api/v1/global-settings")
    assert resp_get.status_code == 200
    assert resp_get.json()["timezone"] == "Europe/London"

    # Reset back to default for other tests
    resp_reset = await client.patch(
        "/api/v1/global-settings",
        json={"timezone": "Asia/Kolkata"},
        headers=auth_headers(super_admin)
    )
    assert resp_reset.status_code == 200


@pytest.mark.asyncio
async def test_update_global_settings_invalid_timezone(
    client: AsyncClient, super_admin: User
):
    resp = await client.patch(
        "/api/v1/global-settings",
        json={"timezone": "Invalid/Timezone"},
        headers=auth_headers(super_admin)
    )
    assert resp.status_code == 422
    assert "Invalid timezone" in resp.json()["detail"][0]["msg"]
