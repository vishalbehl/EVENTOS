# tests/test_global_settings.py
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.modules.audit.models.audit_log import AuditLog
from app.modules.identity.models.user import User
from app.modules.platform.models.system_setting import SystemSetting
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_get_global_settings(client: AsyncClient, super_admin: User):
    resp = await client.get(
        "/api/v1/global-settings",
        headers=auth_headers(super_admin),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "timezone" in data
    # Default is Asia/Kolkata
    assert data["timezone"] == "Asia/Kolkata"
    assert "smtp_password" not in data
    assert "slack_webhook_url" not in data
    assert isinstance(data["smtp_password_configured"], bool)
    assert isinstance(data["slack_webhook_configured"], bool)


@pytest.mark.asyncio
async def test_get_global_settings_requires_super_admin(
    client: AsyncClient, organizer: User
):
    unauthenticated = await client.get("/api/v1/global-settings")
    unauthorized = await client.get(
        "/api/v1/global-settings",
        headers=auth_headers(organizer),
    )
    assert unauthenticated.status_code == 401
    assert unauthorized.status_code == 403


@pytest.mark.asyncio
async def test_update_global_settings_requires_super_admin(
    client: AsyncClient, organizer: User
):
    resp = await client.patch(
        "/api/v1/global-settings",
        json={"timezone": "UTC", "reason": "Testing denied policy update"},
        headers=auth_headers(organizer)
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_update_global_settings_super_admin_success(
    client: AsyncClient, super_admin: User, db
):
    # Set to Europe/London
    resp = await client.patch(
        "/api/v1/global-settings",
        json={"timezone": "Europe/London", "reason": "Update platform timezone for test"},
        headers=auth_headers(super_admin)
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["timezone"] == "Europe/London"

    # Verify cache / GET updates
    resp_get = await client.get(
        "/api/v1/global-settings",
        headers=auth_headers(super_admin),
    )
    assert resp_get.status_code == 200
    assert resp_get.json()["timezone"] == "Europe/London"

    # Reset back to default for other tests
    resp_reset = await client.patch(
        "/api/v1/global-settings",
        json={"timezone": "Asia/Kolkata", "reason": "Restore platform timezone after test"},
        headers=auth_headers(super_admin)
    )
    assert resp_reset.status_code == 200

    audit_result = await db.execute(
        select(AuditLog)
        .where(AuditLog.action_type == "GLOBAL_SETTINGS_UPDATED")
        .order_by(AuditLog.occurred_at.asc())
    )
    audits = list(audit_result.scalars().all())
    assert len(audits) == 2
    assert audits[0].change_diff["reason"] == "Update platform timezone for test"
    assert audits[0].change_diff["changed_keys"] == ["timezone"]


@pytest.mark.asyncio
async def test_update_global_settings_invalid_timezone(
    client: AsyncClient, super_admin: User
):
    resp = await client.patch(
        "/api/v1/global-settings",
        json={"timezone": "Invalid/Timezone", "reason": "Validate invalid timezone rejection"},
        headers=auth_headers(super_admin)
    )
    assert resp.status_code == 422
    assert "Invalid timezone" in resp.json()["detail"][0]["msg"]


@pytest.mark.asyncio
async def test_global_settings_secret_values_are_write_only_and_updates_are_blocked(
    client: AsyncClient, super_admin: User, db
):
    db.add(SystemSetting(key="smtp_password", value="must-not-leak"))
    db.add(SystemSetting(key="slack_webhook_url", value="https://hooks.example.invalid/secret"))
    await db.commit()

    read_response = await client.get(
        "/api/v1/global-settings",
        headers=auth_headers(super_admin),
    )
    assert read_response.status_code == 200
    data = read_response.json()
    assert data["smtp_password_configured"] is True
    assert data["slack_webhook_configured"] is True
    assert "must-not-leak" not in read_response.text
    assert "hooks.example.invalid" not in read_response.text

    update_response = await client.patch(
        "/api/v1/global-settings",
        json={
            "smtp_password": "replacement-secret",
            "reason": "Rotate SMTP password through settings",
        },
        headers=auth_headers(super_admin),
    )
    assert update_response.status_code == 501
    assert update_response.json()["detail"] == (
        "Secret settings must be managed through the platform secret-management workflow"
    )
