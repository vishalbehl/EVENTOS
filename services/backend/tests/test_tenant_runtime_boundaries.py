from __future__ import annotations

import time
import uuid
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from unittest.mock import AsyncMock

from app.core.storage_security import (
    StorageCapabilityError,
    create_local_storage_capability,
    verify_local_storage_capability,
)
from app.database import tenant_org_id
from app.modules.presentations.services import upload_service
from app.core.tenant_context import TenantContextGuard
from app.modules.venue.routers.sync import (
    _require_device_event,
    _require_event_badge,
    _require_participant_and_session,
)
from app.core.cache_keys import TenantCacheKey, TenantCacheKeyError
from app.modules.venue.models.printer import Printer


def test_storage_paths_fail_closed_without_tenant_context():
    token = tenant_org_id.set(None)
    try:
        with pytest.raises(RuntimeError, match="Verified tenant context"):
            upload_service.build_import_path(uuid.uuid4(), "schedule.xlsx")
    finally:
        tenant_org_id.reset(token)


def test_local_storage_capability_is_tenant_and_path_bound():
    organization_id = uuid.uuid4()
    other_organization_id = uuid.uuid4()
    key = f"{organization_id}/presentations/event/file.pptx"
    expires_at = int(time.time()) + 60
    signature = create_local_storage_capability(
        method="GET",
        bucket="presentations",
        key=key,
        organization_id=organization_id,
        expires_at=expires_at,
    )

    verify_local_storage_capability(
        method="GET",
        bucket="presentations",
        key=key,
        organization_id=organization_id,
        expires_at=expires_at,
        signature=signature,
    )
    with pytest.raises(StorageCapabilityError):
        verify_local_storage_capability(
            method="GET",
            bucket="presentations",
            key=key,
            organization_id=other_organization_id,
            expires_at=expires_at,
            signature=signature,
        )
    with pytest.raises(StorageCapabilityError):
        verify_local_storage_capability(
            method="GET",
            bucket="presentations",
            key=key.replace("file.pptx", "other.pptx"),
            organization_id=organization_id,
            expires_at=expires_at,
            signature=signature,
        )


def test_local_presigned_download_contains_bound_capability(monkeypatch):
    organization_id = uuid.uuid4()
    key = f"{organization_id}/presentations/event/file.pptx"
    context_token = tenant_org_id.set(organization_id)
    monkeypatch.setattr(upload_service.settings, "STORAGE_MODE", "local")
    try:
        url = upload_service.create_presigned_download(
            bucket="presentations", storage_path=key, expiry_seconds=60
        )
    finally:
        tenant_org_id.reset(context_token)

    query = parse_qs(urlparse(url).query)
    assert query["organization_id"] == [str(organization_id)]
    assert query["signature"][0]
    assert int(query["expires_at"][0]) > int(time.time())


def test_platform_email_assets_require_explicit_verified_storage_scope(monkeypatch, tmp_path):
    monkeypatch.setattr(upload_service.settings, "STORAGE_MODE", "local")
    monkeypatch.setattr(upload_service, "LOCAL_STORAGE_ROOT", tmp_path)
    storage_path = "platform/email_assets/icon.png"

    with pytest.raises(RuntimeError, match="tenant context"):
        upload_service.upload_bytes(
            bucket="assets",
            storage_path=storage_path,
            data=b"icon",
            content_type="image/png",
        )

    upload_service.upload_bytes(
        bucket="assets",
        storage_path=storage_path,
        data=b"icon",
        content_type="image/png",
        allow_platform=True,
    )
    assert upload_service.get_object_bytes(
        "assets",
        storage_path,
        allow_platform=True,
    ) == b"icon"


def test_worker_tasks_require_explicit_organization_payload():
    from app.modules.notifications.tasks.email_tasks import process_email_campaign
    from app.modules.presentations.tasks.file_tasks import validate_poster, validate_presentation
    from app.tasks.tasks import run_excel_import
    from app.tasks.operations_jobs import (
        calculate_all_readiness_scores,
        detect_all_resource_conflicts,
        generate_upcoming_deployment_checklists,
    )
    from app.tasks.platform_commercial_tasks import calculate_forecasts
    from app.tasks.workflow_jobs import check_escalations, check_expired_approvals, send_reminders

    assert "organization_id_str" in process_email_campaign.run.__code__.co_varnames
    assert "organization_id_str" in validate_presentation.run.__code__.co_varnames
    assert "organization_id_str" in validate_poster.run.__code__.co_varnames
    assert "organization_id_str" in run_excel_import.run.__code__.co_varnames
    assert "organization_id_str" in calculate_all_readiness_scores.run.__code__.co_varnames
    assert "organization_id_str" in detect_all_resource_conflicts.run.__code__.co_varnames
    assert "organization_id_str" in generate_upcoming_deployment_checklists.run.__code__.co_varnames
    assert "organization_id_str" in calculate_forecasts.run.__code__.co_varnames
    assert "organization_id_str" in check_expired_approvals.run.__code__.co_varnames
    assert "organization_id_str" in check_escalations.run.__code__.co_varnames
    assert "organization_id_str" in send_reminders.run.__code__.co_varnames


def test_celery_beat_only_schedules_tenant_safe_jobs():
    from app.worker import celery_app

    schedule = celery_app.conf.beat_schedule
    assert set(schedule) == {
        "flush-api-usage-every-5-minutes",
        "reconcile-organizer-usage-nightly",
        "expire-capability-controls-every-5-minutes",
        "compare-organizer-entitlements-nightly",
        "recover-email-campaign-dispatches",
        "recover-import-dispatches",
    }
    assert schedule["flush-api-usage-every-5-minutes"]["task"] == "app.tasks.platform_tasks.flush_api_usage"
    assert schedule["reconcile-organizer-usage-nightly"]["task"] == (
        "app.tasks.organization_console_tasks.fanout_nightly_usage_reconciliation"
    )
    assert schedule["expire-capability-controls-every-5-minutes"]["task"] == (
        "app.tasks.organization_console_tasks.fanout_capability_control_expiry"
    )
    assert schedule["compare-organizer-entitlements-nightly"]["task"] == (
        "app.tasks.organization_console_rollout_tasks.fanout_shadow_comparisons"
    )
    assert schedule["recover-email-campaign-dispatches"]["task"] == (
        "app.tasks.recover_email_campaign_dispatches"
    )
    assert schedule["recover-import-dispatches"]["task"] == (
        "app.tasks.recover_import_dispatches"
    )


def test_global_platform_job_stubs_fail_closed():
    from app.tasks.platform_tasks import calculate_all_organizations_health
    from app.tasks.platform_tasks import generate_daily_usage_snapshots
    from app.tasks.tenant_job_scope import TenantJobScopeRequired

    with pytest.raises(TenantJobScopeRequired):
        import asyncio
        asyncio.run(calculate_all_organizations_health())
    with pytest.raises(TenantJobScopeRequired):
        import asyncio
        asyncio.run(generate_daily_usage_snapshots())


def test_tenant_cache_keys_are_namespaced_and_fail_closed():
    organization_id = uuid.uuid4()
    event_id = uuid.uuid4()
    context_token = tenant_org_id.set(organization_id)
    try:
        key = TenantCacheKey.event(event_id, "analytics", "snapshot")
    finally:
        tenant_org_id.reset(context_token)

    assert key == f"cache:v1:tenant:{organization_id}:event:{event_id}:analytics:snapshot"
    missing_token = tenant_org_id.set(None)
    try:
        with pytest.raises(TenantCacheKeyError):
            TenantCacheKey.event(event_id, "analytics", "snapshot")
    finally:
        tenant_org_id.reset(missing_token)


def test_tenant_cache_key_rejects_namespace_injection():
    with pytest.raises(TenantCacheKeyError):
        TenantCacheKey.build("analytics:other", organization_id=uuid.uuid4())


def test_venue_machine_identity_cannot_cross_event_scope():
    event_id = uuid.uuid4()
    _require_device_event({"event_id": event_id}, event_id)
    with pytest.raises(HTTPException) as exc_info:
        _require_device_event({"event_id": uuid.uuid4()}, event_id)
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_tenant_context_is_reapplied_after_commit(db: AsyncSession):
    organization_id = uuid.uuid4()
    context_token = tenant_org_id.set(organization_id)
    try:
        await TenantContextGuard.apply(db, organization_id)
        before = await db.scalar(text("SELECT current_setting('app.current_organization_id', true)"))
        await db.commit()
        after = await db.scalar(text("SELECT current_setting('app.current_organization_id', true)"))
    finally:
        tenant_org_id.reset(context_token)
    assert before == str(organization_id)
    assert after == str(organization_id)


@pytest.mark.asyncio
async def test_venue_sync_rejects_cross_event_nested_entities():
    db = AsyncMock(spec=AsyncSession)
    db.scalar.side_effect = [uuid.uuid4(), None]
    with pytest.raises(ValueError, match="OUTSIDE_DEVICE_EVENT"):
        await _require_participant_and_session(
            db, uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        )

    db.scalar.reset_mock(side_effect=True)
    db.scalar.return_value = None
    with pytest.raises(ValueError, match="OUTSIDE_DEVICE_EVENT"):
        await _require_event_badge(db, uuid.uuid4(), uuid.uuid4())


def test_outsourced_printer_endpoints_require_event_tenant_scope():
    table = Printer.__table__
    assert table.c.organization_id.nullable is False
    assert table.c.event_id.nullable is False
    assert table.c.vendor_id.nullable is True
    assert table.c.room_id.nullable is True
    assert "external_reference" in table.c
    assert "deployment_starts_at" in table.c
    assert "deployment_ends_at" in table.c
    assert "retired_at" in table.c
