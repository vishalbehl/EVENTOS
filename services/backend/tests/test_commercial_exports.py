import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_domain_tables import DataExport
from app.modules.audit.models.audit_log import AuditLog
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from tests.conftest import auth_headers


def export_payload(organization_id: uuid.UUID, report_type: str = "hardware_catalog") -> dict:
    return {
        "organization_id": str(organization_id),
        "report_type": report_type,
        "reason": "Quarterly commercial catalogue review",
    }


@pytest.mark.asyncio
async def test_commercial_export_is_idempotent_and_audited(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organization: Organization,
    monkeypatch: pytest.MonkeyPatch,
):
    dispatched: list[tuple[str, dict]] = []
    monkeypatch.setattr(
        "app.modules.platform.reports_router.celery_app.send_task",
        lambda task, kwargs: dispatched.append((task, kwargs)),
    )
    key = f"commercial-export-{uuid.uuid4()}"
    headers = {**auth_headers(super_admin), "Idempotency-Key": key}
    payload = export_payload(organization.id)

    created = await client.post("/superadmin/reports/exports", json=payload, headers=headers)
    assert created.status_code == 202, created.text
    result = created.json()
    assert result["organization_id"] == str(organization.id)
    assert result["report_type"] == "hardware_catalog"
    assert result["file_format"] == "xlsx"
    assert result["status"] == "QUEUED"
    assert dispatched[0][0] == "workers.tasks.report_tasks.generate_commercial_report_export"

    replay = await client.post("/superadmin/reports/exports", json=payload, headers=headers)
    assert replay.status_code == 202
    assert replay.json()["export_id"] == result["export_id"]
    assert len(dispatched) == 1

    conflict = await client.post(
        "/superadmin/reports/exports",
        json={**payload, "reason": "A different export purpose"},
        headers=headers,
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"] == "IDEMPOTENCY_CONFLICT"

    async with TenantContextGuard.scoped(db, organization.id):
        export = await db.get(DataExport, uuid.UUID(result["export_id"]))
        assert export is not None
        assert export.request_metadata["reason"] == payload["reason"]
        requested = await db.scalar(select(AuditLog).where(
            AuditLog.resource_id == export.id,
            AuditLog.action_type == "COMMERCIAL_EXPORT_REQUESTED",
        ))
        assert requested is not None


@pytest.mark.asyncio
async def test_commercial_export_requires_super_admin(
    client: AsyncClient,
    organizer: User,
    organization: Organization,
):
    response = await client.post(
        "/superadmin/reports/exports",
        json=export_payload(organization.id),
        headers={**auth_headers(organizer), "Idempotency-Key": f"export-{uuid.uuid4()}"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_commercial_export_download_is_scope_checked_and_audited(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organization: Organization,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr("app.modules.platform.reports_router.celery_app.send_task", lambda *_args, **_kwargs: None)
    response = await client.post(
        "/superadmin/reports/exports",
        json=export_payload(organization.id, "pricing_simulations"),
        headers={**auth_headers(super_admin), "Idempotency-Key": f"export-{uuid.uuid4()}"},
    )
    assert response.status_code == 202, response.text
    export_id = uuid.UUID(response.json()["export_id"])

    not_ready = await client.get(
        f"/superadmin/reports/exports/{export_id}/download?organization_id={organization.id}",
        headers=auth_headers(super_admin),
    )
    assert not_ready.status_code == 409
    assert not_ready.json()["detail"]["code"] == "EXPORT_NOT_READY"

    other_org = Organization(name="Other Org", slug=f"other-{uuid.uuid4().hex[:8]}", plan="pro")
    db.add(other_org)
    await db.flush()
    hidden = await client.get(
        f"/superadmin/reports/exports/{export_id}?organization_id={other_org.id}",
        headers=auth_headers(super_admin),
    )
    assert hidden.status_code == 404

    async with TenantContextGuard.scoped(db, organization.id):
        export = await db.get(DataExport, export_id)
        assert export is not None
        export.status = "COMPLETED"
        export.storage_key = f"{organization.id}/platform-exports/pricing_simulations.csv"
        export.expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        await db.commit()

    monkeypatch.setattr(
        "app.modules.platform.reports_router.create_presigned_download",
        lambda **_kwargs: "https://storage.example.test/signed-export",
    )
    downloaded = await client.get(
        f"/superadmin/reports/exports/{export_id}/download?organization_id={organization.id}",
        headers=auth_headers(super_admin),
    )
    assert downloaded.status_code == 200, downloaded.text
    assert downloaded.json()["download_url"] == "https://storage.example.test/signed-export"
    assert downloaded.json()["filename"] == "pricing_simulations.csv"

    async with TenantContextGuard.scoped(db, organization.id):
        audit = await db.scalar(select(AuditLog).where(
            AuditLog.resource_id == export_id,
            AuditLog.action_type == "COMMERCIAL_EXPORT_DOWNLOADED",
        ))
        assert audit is not None
