"""Focused admission assertions; not a substitute for PostgreSQL/worker acceptance."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
import uuid

import pytest
from fastapi import HTTPException

from app.modules.platform.application.lifecycle_commands import OrganizationLifecycleCommandService
from app.modules.platform.services.lifecycle_service import OrganizationLifecycleService


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["MERGE", "PURGE", "DELETE"])
async def test_destructive_manifest_and_queued_execution_fail_before_database_access(operation):
    db = AsyncMock()
    organization_id = uuid.uuid4()
    with pytest.raises(HTTPException) as manifest_error:
        await OrganizationLifecycleService.build_manifest(db, organization_id, operation, None)
    assert manifest_error.value.status_code == 409
    assert manifest_error.value.detail["code"] == "DESTRUCTIVE_LIFECYCLE_UNAVAILABLE"
    with pytest.raises(HTTPException) as worker_error:
        await OrganizationLifecycleService.execute(db, SimpleNamespace(job_type=operation))
    assert worker_error.value.status_code == 409
    assert worker_error.value.detail["code"] == "DESTRUCTIVE_LIFECYCLE_UNAVAILABLE"
    assert db.mock_calls == []


@pytest.mark.asyncio
@pytest.mark.parametrize("changed", ["actor", "reason", "operation", "target"])
async def test_lifecycle_receipt_cannot_be_reused_for_changed_request(changed):
    actor_id = uuid.uuid4()
    target_id = uuid.uuid4()
    db = AsyncMock()
    db.scalar.return_value = SimpleNamespace(
        requested_by=uuid.uuid4() if changed == "actor" else actor_id,
        job_type="ARCHIVE" if changed == "operation" else "EXPORT",
        target_organization_id=uuid.uuid4() if changed == "target" else target_id,
        reason="Different approved reason" if changed == "reason" else "Approved manifest export",
        dry_run_manifest={"organization_version": 4},
    )
    with patch("app.modules.platform.application.lifecycle_commands.lock_lifecycle_authority", new_callable=AsyncMock,
               return_value=(uuid.uuid4(), {})), pytest.raises(HTTPException) as error:
        await OrganizationLifecycleCommandService(db).create(
            organization_id=uuid.uuid4(), actor=SimpleNamespace(id=actor_id, auth_revision=1),
            target_organization_id=target_id, job_type="EXPORT", manifest={},
            manifest_checksum="fingerprint", reason="Approved manifest export",
            idempotency_key="manifest-export-request", requires_approval=False, expected_version=4,
        )
    assert error.value.status_code == 409
    assert error.value.detail["code"] == "IDEMPOTENCY_PAYLOAD_CONFLICT"
    db.commit.assert_not_awaited()
    db.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_execution_rechecks_requester_before_resource_access():
    db = AsyncMock()
    job = SimpleNamespace(job_type="ARCHIVE", organization_id=uuid.uuid4(),
                          requested_by=uuid.uuid4(), target_organization_id=None)
    with patch("app.modules.platform.services.lifecycle_service.lock_lifecycle_authority",
               new_callable=AsyncMock, side_effect=HTTPException(403, detail={"code": "PLATFORM_PERMISSION_DENIED"})), pytest.raises(HTTPException) as error:
        await OrganizationLifecycleService.execute(db, job)
    assert error.value.status_code == 403
    assert db.mock_calls == []


def test_operational_lifecycle_distinguishes_archive_from_suspension():
    from datetime import datetime, timezone
    from app.modules.platform.models.organization import Organization
    active = Organization(is_active=True, archived_at=None, suspended_at=None)
    suspended = Organization(is_active=False, archived_at=None, suspended_at=datetime.now(timezone.utc))
    archived = Organization(is_active=False, archived_at=datetime.now(timezone.utc), suspended_at=None)
    assert active.lifecycle_state == "ACTIVE"
    assert suspended.lifecycle_state == "SUSPENDED"
    assert archived.lifecycle_state == "ARCHIVED"
