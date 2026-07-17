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


REASON = "Producing approved tenant audit evidence for case AUD-2026-17"


def headers(user: User, key: str | None = None) -> dict[str, str]:
    result = {**auth_headers(user), "X-Support-Reason": REASON}
    if key:
        result["Idempotency-Key"] = key
    return result


@pytest.mark.asyncio
async def test_audit_export_is_scoped_idempotent_and_audited(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organization: Organization,
    monkeypatch: pytest.MonkeyPatch,
):
    dispatched: list[tuple[str, dict]] = []
    monkeypatch.setattr(
        "app.modules.audit.routers.audit_exports.celery_app.send_task",
        lambda task, kwargs: dispatched.append((task, kwargs)),
    )
    key = f"audit-export-{uuid.uuid4()}"
    payload = {"reason": REASON, "sensitive_only": True}
    url = f"/superadmin/audit-exports?organization_id={organization.id}"

    created = await client.post(url, json=payload, headers=headers(super_admin, key))
    assert created.status_code == 202, created.text
    export_id = uuid.UUID(created.json()["export_id"])
    assert dispatched[0][0] == "workers.tasks.report_tasks.generate_audit_log_export"

    replay = await client.post(url, json=payload, headers=headers(super_admin, key))
    assert replay.status_code == 202
    assert replay.json()["export_id"] == str(export_id)
    assert len(dispatched) == 1

    conflict = await client.post(
        url,
        json={**payload, "reason": "Different approved audit evidence purpose and scope"},
        headers=headers(super_admin, key),
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "IDEMPOTENCY_CONFLICT"

    async with TenantContextGuard.scoped(db, organization.id):
        export = await db.get(DataExport, export_id)
        assert export is not None
        audit = await db.scalar(select(AuditLog).where(
            AuditLog.resource_id == export_id,
            AuditLog.action_type == "AUDIT_EXPORT_REQUESTED",
        ))
        assert audit is not None


@pytest.mark.asyncio
async def test_audit_export_download_conceals_other_tenant_and_is_audited(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organization: Organization,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr("app.modules.audit.routers.audit_exports.celery_app.send_task", lambda *_args, **_kwargs: None)
    created = await client.post(
        f"/superadmin/audit-exports?organization_id={organization.id}",
        json={"reason": REASON},
        headers=headers(super_admin, f"audit-export-{uuid.uuid4()}"),
    )
    assert created.status_code == 202, created.text
    export_id = uuid.UUID(created.json()["export_id"])

    other = Organization(name="Other audit tenant", slug=f"audit-other-{uuid.uuid4().hex[:8]}", plan="pro")
    db.add(other)
    await db.commit()
    hidden = await client.get(
        f"/superadmin/audit-exports/{export_id}?organization_id={other.id}",
        headers=headers(super_admin),
    )
    assert hidden.status_code == 404

    async with TenantContextGuard.scoped(db, organization.id):
        export = await db.get(DataExport, export_id)
        assert export is not None
        export.status = "COMPLETED"
        export.storage_key = f"{organization.id}/audit-exports/evidence.csv"
        export.expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        await db.commit()

    monkeypatch.setattr(
        "app.modules.audit.routers.audit_exports.create_presigned_download",
        lambda **_kwargs: "https://storage.example.test/audit-evidence",
    )
    downloaded = await client.get(
        f"/superadmin/audit-exports/{export_id}/download?organization_id={organization.id}",
        headers=headers(super_admin),
    )
    assert downloaded.status_code == 200, downloaded.text
    assert downloaded.json()["download_url"] == "https://storage.example.test/audit-evidence"

    async with TenantContextGuard.scoped(db, organization.id):
        audit = await db.scalar(select(AuditLog).where(
            AuditLog.resource_id == export_id,
            AuditLog.action_type == "AUDIT_EXPORT_DOWNLOADED",
        ))
        assert audit is not None


@pytest.mark.asyncio
async def test_audit_export_dispatch_failure_is_durable_and_retry_safe(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organization: Organization,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(
        "app.modules.audit.routers.audit_exports.celery_app.send_task",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("broker unavailable")),
    )
    key = f"audit-outage-{uuid.uuid4()}"
    url = f"/superadmin/audit-exports?organization_id={organization.id}"
    response = await client.post(
        url,
        json={"reason": REASON},
        headers=headers(super_admin, key),
    )
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "EXPORT_DISPATCH_FAILED"

    async with TenantContextGuard.scoped(db, organization.id):
        export = await db.scalar(select(DataExport).where(
            DataExport.organization_id == organization.id,
            DataExport.idempotency_key == key,
        ))
        assert export is not None
        assert export.status == "FAILED"
        assert export.storage_key is None
        audit = await db.scalar(select(AuditLog).where(
            AuditLog.resource_id == export.id,
            AuditLog.action_type == "AUDIT_EXPORT_DISPATCH_FAILED",
        ))
        assert audit is not None

    replay = await client.post(
        url,
        json={"reason": REASON},
        headers=headers(super_admin, key),
    )
    assert replay.status_code == 202
    assert replay.json()["status"] == "FAILED"
