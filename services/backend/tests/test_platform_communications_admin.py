from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models.audit_log import AuditLog
from app.modules.identity.models.user import User
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_announcement_and_maintenance_mutations_are_reasoned_and_audited(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
):
    announcement = await client.post(
        "/api/v1/platform/communications/announcements",
        headers=auth_headers(super_admin),
        json={
            "title": "Scheduled platform notice",
            "content": "A verified operational announcement.",
            "is_active": True,
            "reason": "Publishing approved platform communication change",
        },
    )
    assert announcement.status_code == 201, announcement.text
    announcement_id = announcement.json()["id"]
    updated = await client.patch(
        f"/api/v1/platform/communications/announcements/{announcement_id}",
        headers=auth_headers(super_admin),
        json={"is_active": False, "reason": "Disabling completed platform communication notice"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["is_active"] is False

    starts_at = datetime.now(timezone.utc) + timedelta(days=1)
    maintenance = await client.post(
        "/api/v1/platform/communications/maintenance-windows",
        headers=auth_headers(super_admin),
        json={
            "title": "Database maintenance",
            "starts_at": starts_at.isoformat(),
            "ends_at": (starts_at + timedelta(hours=2)).isoformat(),
            "affected_services": ["registration"],
            "status": "SCHEDULED",
            "reason": "Scheduling approved database maintenance window",
        },
    )
    assert maintenance.status_code == 201, maintenance.text
    window_id = maintenance.json()["id"]
    completed = await client.patch(
        f"/api/v1/platform/communications/maintenance-windows/{window_id}",
        headers=auth_headers(super_admin),
        json={"status": "COMPLETED", "reason": "Recording completion of approved maintenance window"},
    )
    assert completed.status_code == 200, completed.text
    assert completed.json()["status"] == "COMPLETED"

    actions = set((await db.scalars(select(AuditLog.action_type).where(AuditLog.action_type.in_([
        "GLOBAL_ANNOUNCEMENT_CREATED", "GLOBAL_ANNOUNCEMENT_UPDATED",
        "MAINTENANCE_WINDOW_CREATED", "MAINTENANCE_WINDOW_UPDATED",
    ])))).all())
    assert actions == {
        "GLOBAL_ANNOUNCEMENT_CREATED", "GLOBAL_ANNOUNCEMENT_UPDATED",
        "MAINTENANCE_WINDOW_CREATED", "MAINTENANCE_WINDOW_UPDATED",
    }
